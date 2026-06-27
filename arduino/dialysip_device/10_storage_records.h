// -------------------- Storage and records --------------------

bool initStorage() {
  storageOk = LittleFS.begin(false);
  if (!storageOk && !prefs.getBool("fsInit", false)) {
    storageOk = LittleFS.begin(true);
  }
  if (storageOk) {
    prefs.putBool("fsInit", true);
    clearDeviceWarning("storage_not_ready");
    refreshTodayTotalFromHistory();
  }
  return storageOk;
}

bool shouldPersistRecord(const String &type) {
  return type == "drink_auto" || type == "refill";
}

String buildRecordId(uint32_t sequence) {
  char sequenceBuf[12];
  snprintf(sequenceBuf, sizeof(sequenceBuf), "%04lu", (unsigned long)sequence);

  char idBuf[32];
  if (rtcOk) {
    DateTime now = localDateTimeFromUtcEpoch(currentEpoch());
    snprintf(
      idBuf,
      sizeof(idBuf),
      "%04u%02u%02u-%02u%02u%02u-%s",
      (unsigned)now.year(),
      (unsigned)now.month(),
      (unsigned)now.day(),
      (unsigned)now.hour(),
      (unsigned)now.minute(),
      (unsigned)now.second(),
      sequenceBuf
    );
  } else {
    snprintf(idBuf, sizeof(idBuf), "00000000-000000-%s", sequenceBuf);
  }

  return String(idBuf);
}

String buildRecordJson(const String &id, const String &type, uint16_t amountMl, float beforeG, float afterG, const String &confidence, const String &flags) {
  String json;
  json.reserve(260);
  json += "{\"record_id\":\"";
  json += jsonEscape(id);
  json += "\"";
  json += ",\"timestamp_utc\":";
  json += currentEpoch();
  json += ",\"type\":\"";
  json += jsonEscape(type);
  json += "\",\"amount_ml\":";
  json += amountMl;
  json += ",\"weight_before_g\":";
  json += String(beforeG, 1);
  json += ",\"weight_after_g\":";
  json += String(afterG, 1);
  json += ",\"confidence\":\"";
  json += jsonEscape(confidence);
  json += "\",\"flags\":\"";
  json += jsonEscape(flags);
  json += "\",\"battery_mv\":";
  json += readBatteryMv();
  json += ",\"device_id\":\"";
  json += deviceId;
  json += "\",\"firmware_version\":\"";
  json += FIRMWARE_VERSION;
  json += "\"}";
  return json;
}

void notifyLogPayload(const String &json) {
  if (!bleConnected || logCharacteristic == nullptr) {
    return;
  }

  logCharacteristic->setValue(json.c_str());
  logCharacteristic->notify();
  noteBleDataSent();
}

bool appendRecord(const String &type, uint16_t amountMl, float beforeG, float afterG, const String &confidence, const String &flags) {
  lastEventType = type;
  lastEventAmountMl = amountMl;

  if (!shouldPersistRecord(type)) {
    return false;
  }

  if (!storageOk) {
    setDeviceWarning("storage_not_ready", "Storage not ready", 85);
    return false;
  }

  recordId++;
  String generatedRecordId = buildRecordId(recordId);
  String json = buildRecordJson(generatedRecordId, type, amountMl, beforeG, afterG, confidence, flags);

  File file = LittleFS.open(LOG_FILE, FILE_APPEND);
  if (!file) {
    storageOk = false;
    setDeviceWarning("storage_not_ready", "Cannot open history", 85);
    prefs.putUInt("recordId", recordId);
    return false;
  }

  bool saved = file.println(json) > 0;
  file.flush();
  file.close();

  if (!saved) {
    storageOk = false;
    setDeviceWarning("storage_not_ready", "Cannot write history", 85);
    prefs.putUInt("recordId", recordId);
    return false;
  }

  lastRecordId = generatedRecordId;
  prefs.putString("lastRecordId", lastRecordId);
  prefs.putUInt("recordId", recordId);
  clearDeviceWarning("storage_not_ready");
  notifyLogPayload(json);
  updateStatusCharacteristic(true);
  return true;
}

String extractRecordId(const String &line) {
  String value;
  if (readJsonRecordId(line, "record_id", value)) {
    return value;
  }
  return "";
}

uint32_t dayKeyFromEpoch(uint32_t epoch) {
  DateTime dt = localDateTimeFromUtcEpoch(epoch);
  return (uint32_t)dt.year() * 10000UL + (uint32_t)dt.month() * 100UL + dt.day();
}

bool parseTodayHistoryRecord(const String &line, uint16_t &amountMl, uint32_t &timestamp, String &type) {
  uint32_t parsedAmount = 0;
  uint32_t parsedTimestamp = 0;

  if (!readJsonString(line, "type", type) || (type != "drink_auto" && type != "refill")) {
    return false;
  }
  if (!readJsonUInt(line, "timestamp_utc", parsedTimestamp) || !readJsonUInt(line, "amount_ml", parsedAmount)) {
    return false;
  }
  if (todayKey == 0 || dayKeyFromEpoch(parsedTimestamp) != todayKey) {
    return false;
  }

  amountMl = parsedAmount > 65535UL ? 65535U : (uint16_t)parsedAmount;
  timestamp = parsedTimestamp;
  return true;
}

bool parseTodayDrinkRecord(const String &line, uint16_t &amountMl, uint32_t &timestamp) {
  String type;
  if (!parseTodayHistoryRecord(line, amountMl, timestamp, type)) {
    return false;
  }
  return type == "drink_auto";
}

void refreshTodayTotalFromHistory() {
  todayTotalMl = 0;
  if (!storageOk || todayKey == 0) {
    return;
  }

  File file = LittleFS.open(LOG_FILE, FILE_READ);
  if (!file) {
    return;
  }

  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    uint16_t amountMl = 0;
    uint32_t timestamp = 0;
    if (parseTodayDrinkRecord(line, amountMl, timestamp)) {
      todayTotalMl += amountMl;
    }
  }

  file.close();
}

uint16_t countTodayHistoryRecords() {
  if (!storageOk || todayKey == 0) {
    return 0;
  }

  File file = LittleFS.open(LOG_FILE, FILE_READ);
  if (!file) {
    return 0;
  }

  uint16_t count = 0;
  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    uint16_t amountMl = 0;
    uint32_t timestamp = 0;
    String type;
    if (parseTodayHistoryRecord(line, amountMl, timestamp, type) && count < 65535U) {
      count++;
    }
  }

  file.close();
  return count;
}

bool readTodayHistoryRecordByOrdinal(uint16_t targetOrdinal, uint16_t &amountMl, uint32_t &timestamp, String &type) {
  if (!storageOk || todayKey == 0 || targetOrdinal == 0) {
    return false;
  }

  File file = LittleFS.open(LOG_FILE, FILE_READ);
  if (!file) {
    return false;
  }

  uint16_t ordinal = 0;
  bool found = false;
  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    uint16_t parsedAmount = 0;
    uint32_t parsedTimestamp = 0;
    String parsedType;
    if (parseTodayHistoryRecord(line, parsedAmount, parsedTimestamp, parsedType)) {
      ordinal++;
      if (ordinal == targetOrdinal) {
        amountMl = parsedAmount;
        timestamp = parsedTimestamp;
        type = parsedType;
        found = true;
        break;
      }
    }
  }

  file.close();
  return found;
}

bool logContainsRecordId(const String &recordIdToFind) {
  if (recordIdToFind.length() == 0 || !storageOk) {
    return false;
  }

  File file = LittleFS.open(LOG_FILE, FILE_READ);
  if (!file) {
    return false;
  }

  bool found = false;
  while (file.available()) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (extractRecordId(line) == recordIdToFind) {
      found = true;
      break;
    }
  }

  file.close();
  return found;
}

void streamLogsAfter(const String &afterRecordId) {
  if (logCharacteristic == nullptr || !bleConnected) {
    return;
  }

  notifyLogPayload("{\"sync_started\":true}");

  if (!storageOk) {
    setDeviceWarning("storage_not_ready", "Storage not ready", 85);
    notifyLogPayload("{\"sync_complete\":false,\"sync_error\":\"storage_not_ready\"}");
    return;
  }

  bool streamAll = afterRecordId.length() == 0 || !logContainsRecordId(afterRecordId);
  File file = LittleFS.open(LOG_FILE, FILE_READ);
  if (!file) {
    notifyLogPayload("{\"sync_complete\":false,\"sync_error\":\"history_open_failed\"}");
    return;
  }

  bool streamNext = streamAll;
  uint32_t recordsSent = 0;
  while (file.available() && bleConnected) {
    String line = file.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) {
      continue;
    }

    String id = extractRecordId(line);
    if (!streamNext) {
      if (id == afterRecordId) {
        streamNext = true;
      }
      continue;
    }

    notifyLogPayload(line);
    recordsSent++;
    delay(40);
  }

  if (bleConnected) {
    String completed;
    completed.reserve(72);
    completed += "{\"sync_complete\":true,\"records_sent\":";
    completed += recordsSent;
    completed += "}";
    notifyLogPayload(completed);
  }

  delay(100);
  file.close();
}

bool clearHistoryData() {
  if (!storageOk) {
    return false;
  }

  bool logRemoved = !LittleFS.exists(LOG_FILE) || LittleFS.remove(LOG_FILE);
  bool tmpRemoved = !LittleFS.exists(LOG_TMP_FILE) || LittleFS.remove(LOG_TMP_FILE);
  return logRemoved && tmpRemoved;
}

bool isRecordSynced(const String &recordIdToCheck) {
  return lastSyncId.length() > 0 &&
         recordIdToCheck.length() > 0 &&
         recordIdToCheck.compareTo(lastSyncId) <= 0;
}

bool shouldCompactRecord(const String &line, uint32_t cutoffEpoch) {
  String recordIdToCheck = extractRecordId(line);
  uint32_t timestamp = 0;
  if (!readJsonUInt(line, "timestamp_utc", timestamp)) {
    return false;
  }
  return timestamp < cutoffEpoch && isRecordSynced(recordIdToCheck);
}

void compactSyncedHistory() {
  if (!storageOk || !rtcOk || lastSyncId.length() == 0 || !LittleFS.exists(LOG_FILE)) {
    return;
  }

  uint32_t retentionSeconds = (uint32_t)historyRetentionDays * 24UL * 60UL * 60UL;
  uint32_t now = currentEpoch();
  if (now <= retentionSeconds) {
    return;
  }
  uint32_t cutoffEpoch = now - retentionSeconds;

  File source = LittleFS.open(LOG_FILE, FILE_READ);
  if (!source) {
    return;
  }

  (void)LittleFS.remove(LOG_TMP_FILE);
  File target = LittleFS.open(LOG_TMP_FILE, FILE_WRITE);
  if (!target) {
    source.close();
    return;
  }

  bool changed = false;
  bool ok = true;
  while (source.available()) {
    String line = source.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) {
      continue;
    }
    if (shouldCompactRecord(line, cutoffEpoch)) {
      changed = true;
      continue;
    }
    if (target.println(line) == 0) {
      ok = false;
      break;
    }
  }

  source.close();
  target.flush();
  target.close();

  if (!ok) {
    (void)LittleFS.remove(LOG_TMP_FILE);
    return;
  }

  if (changed) {
    (void)LittleFS.remove(LOG_FILE);
    if (!LittleFS.rename(LOG_TMP_FILE, LOG_FILE)) {
      storageOk = false;
      setDeviceWarning("storage_not_ready", "Cannot compact history", 85);
    }
  } else {
    (void)LittleFS.remove(LOG_TMP_FILE);
  }
}
