// -------------------- BLE --------------------

String buildSettingsJson() {
  String json;
  json.reserve(360);
  json += "{\"protocol_version\":";
  json += BLE_PROTOCOL_VERSION;
  json += ",\"daily_limit_ml\":";
  json += dailyLimitMl;
  json += ",\"warning_threshold_percent\":";
  json += warningPercent;
  json += ",\"oled_timeout_seconds\":";
  json += oledTimeoutSeconds;
  json += ",\"ble_advertise_seconds\":";
  json += bleWindowSeconds;
  json += ",\"stable_save_seconds\":";
  json += stableSaveSeconds;
  json += ",\"history_retention_days\":";
  json += historyRetentionDays;
  json += ",\"timezone_offset_minutes\":";
  json += timezoneOffsetMinutes;
  json += ",\"drink_threshold_ml\":";
  json += drinkThresholdMl;
  json += ",\"refill_threshold_ml\":";
  json += refillThresholdMl;
  json += ",\"cup_weight_tenths_g\":";
  json += cupWeightTenthsG;
  json += ",\"cup_tolerance_tenths_g\":";
  json += cupToleranceTenthsG;
  json += "}";
  return json;
}

const char *calibrationStepName() {
  switch (calibrationStep) {
    case CALIBRATION_WAIT_TARE:
      return "wait_tare";
    case CALIBRATION_WAIT_WEIGHT:
      return "wait_weight";
    case CALIBRATION_LIVE_WEIGHT:
      return "live_weight";
    case CALIBRATION_IDLE:
    default:
      return "idle";
  }
}

String buildStatusJson() {
  String json;
  json.reserve(560);
  uint16_t batteryMv = readBatteryMv();
  uint8_t batteryPercent = readBatteryPercentForMv(batteryMv);
  bool isChargerConnected = chargerConnected();
  json += "{\"protocol_version\":";
  json += BLE_PROTOCOL_VERSION;
  json += ",\"device_id\":\"";
  json += deviceId;
  json += "\",\"name\":\"";
  json += DEVICE_NAME;
  json += "\",\"firmware_version\":\"";
  json += FIRMWARE_VERSION;
  json += "\",\"battery_mv\":";
  json += batteryMv;
  json += ",\"battery_percent\":";
  json += batteryPercent;
  json += ",\"charger_connected\":";
  json += isChargerConnected ? "true" : "false";
  json += ",\"current_weight_g\":";
  if (hasCurrentWeight) {
    json += String(currentWeightG, 1);
  } else {
    json += "null";
  }
  json += ",\"stable_for_ms\":";
  json += hasCurrentWeight ? (millis() - scaleStableSinceMs) : 0;
  json += ",\"calibration_active\":";
  json += calibrationMode ? "true" : "false";
  json += ",\"calibration_step\":\"";
  json += calibrationStepName();
  json += "\"";
  json += ",\"last_record_id\":\"";
  json += jsonEscape(lastRecordId);
  json += "\",\"last_sync_id\":\"";
  json += jsonEscape(lastSyncId);
  json += "\"";
  json += ",\"rtc_ok\":";
  json += rtcOk ? "true" : "false";
  json += ",\"storage_ok\":";
  json += storageOk ? "true" : "false";
  json += ",\"sensor_ok\":";
  json += (bmiOk && hx711Ok) ? "true" : "false";
  json += ",\"calibration_factor\":";
  json += String(calibrationFactor, 2);
  json += ",\"calibrated\":";
  json += (abs(calibrationFactor - DEFAULT_CALIBRATION_FACTOR) > 0.01f) ? "true" : "false";
  json += "}";
  return json;
}

void updateStatusCharacteristic(bool notify) {
  if (statusCharacteristic == nullptr) {
    return;
  }
  String status = buildStatusJson();
  statusCharacteristic->setValue(status.c_str());
  if (notify && bleConnected) {
    statusCharacteristic->notify();
    noteBleDataSent();
  }
}

void ensureBleAdvertisingStarted() {
  if (!bleStarted) {
    BLEDevice::init(DEVICE_NAME);
    BLEDevice::setMTU(517);
    BLEServer *server = BLEDevice::createServer();
    server->setCallbacks(new ServerCallbacks());

    BLEService *service = server->createService(BLE_SERVICE_UUID);

    statusCharacteristic = service->createCharacteristic(
        BLE_STATUS_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_NOTIFY);
    statusCharacteristic->setCallbacks(new StatusCallbacks());
    statusCharacteristic->addDescriptor(new BLE2902());

    settingsCharacteristic = service->createCharacteristic(
        BLE_SETTINGS_UUID,
        BLECharacteristic::PROPERTY_READ | BLECharacteristic::PROPERTY_WRITE);
    settingsCharacteristic->setCallbacks(new SettingsCallbacks());

    BLECharacteristic *timeCharacteristic = service->createCharacteristic(
        BLE_TIME_SYNC_UUID,
        BLECharacteristic::PROPERTY_WRITE);
    timeCharacteristic->setCallbacks(new TimeCallbacks());

    BLECharacteristic *commandCharacteristic = service->createCharacteristic(
        BLE_COMMAND_UUID,
        BLECharacteristic::PROPERTY_WRITE);
    commandCharacteristic->setCallbacks(new CommandCallbacks());

    logCharacteristic = service->createCharacteristic(
        BLE_LOG_UUID,
        BLECharacteristic::PROPERTY_NOTIFY);
    logCharacteristic->addDescriptor(new BLE2902());

    BLECharacteristic *ackCharacteristic = service->createCharacteristic(
        BLE_ACK_UUID,
        BLECharacteristic::PROPERTY_WRITE);
    ackCharacteristic->setCallbacks(new AckCallbacks());

    service->start();

    BLEAdvertising *advertising = server->getAdvertising();
    advertising->addServiceUUID(BLE_SERVICE_UUID);
    advertising->setScanResponse(true);
    advertising->start();
    bleStarted = true;
  } else {
    BLEDevice::getAdvertising()->start();
  }

  if (settingsCharacteristic != nullptr) {
    String settings = buildSettingsJson();
    settingsCharacteristic->setValue(settings.c_str());
  }
  updateStatusCharacteristic(false);
}

void startBleAwakeAdvertising() {
  bleSyncMode = false;
  ensureBleAdvertisingStarted();
}

void startBleWindow() {
  intakeViewPosition = 0;
  intakeViewLastActionMs = 0;
  bleSyncMode = true;

  ensureBleAdvertisingStarted();
  showStatus("BLE sync mode", "Buka Android app", "");
  clearSecondaryDisplayReturn();
}

void exitBleSyncMode() {
  if (!bleSyncMode) {
    return;
  }

  bleSyncMode = false;
  if (bleStarted) {
    BLEDevice::getAdvertising()->stop();
  }
  showMainDisplay();
  updateStatusCharacteristic(true);
}

void serviceAppHeartbeatTimeout() {
  if (!bleConnected || lastAppBleActivityMs == 0 ||
      (uint32_t)(millis() - lastAppBleActivityMs) < APP_HEARTBEAT_TIMEOUT_MS) {
    return;
  }

  bleConnected = false;
  lastAppBleActivityMs = 0;

  if (bleSyncMode) {
    exitBleSyncMode();
  } else {
    showMainDisplay();
    refreshBleStatusIndicator();
  }
}

bool handleLegacyCommand(const String &command) {
  if (command == "tare") {
    tareScale();
  } else if (command == "refresh_weight") {
    refreshScaleWeight();
  } else if (command == "reset_calibration_default") {
    resetCalibrationToDefault();
  } else if (command.startsWith("calibrate:")) {
    uint16_t knownMl = (uint16_t)command.substring(10).toInt();
    calibrateScale(knownMl);
  } else if (command == "finish_calibration") {
    exitCalibrationMode();
  } else if (command.startsWith("sync:")) {
    String afterId = command.substring(5);
    streamLogsAfter(afterId);
  } else if (command == "sync") {
    streamLogsAfter(lastSyncId);
  } else if (command == "status") {
    updateStatusCharacteristic(true);
  } else if (command == "sleep") {
    showMainDisplay();
  } else {
    noteEvent("device_error", 0);
  }

  return true;
}

bool handleJsonCommand(const String &payload) {
  String command;
  if (!readJsonString(payload, "command", command)) {
    noteEvent("device_error", 0);
    return true;
  }

  if (command == "heartbeat") {
    return false;
  } else if (command == "tare") {
    tareScale();
  } else if (command == "refresh_weight") {
    refreshScaleWeight();
  } else if (command == "calibrate_known_weight") {
    uint32_t knownMl = 0;
    if (readJsonUInt(payload, "known_amount_ml", knownMl) && knownMl > 0 && knownMl <= 5000) {
      calibrateScale((uint16_t)knownMl);
    } else {
      noteEvent("device_error", 0);
    }
  } else if (command == "reset_calibration_default") {
    resetCalibrationToDefault();
  } else if (command == "finish_calibration") {
    uint32_t knownMl = 0;
    if (readJsonUInt(payload, "known_amount_ml", knownMl)) {
      if (knownMl > 0 && knownMl <= 5000) {
        calibrateScale((uint16_t)knownMl);
      } else {
        noteEvent("device_error", 0);
      }
    } else {
      exitCalibrationMode();
    }
  } else if (command == "request_sync") {
    String historyMode = "after_last_sync";
    (void)readJsonString(payload, "history_mode", historyMode);

    String afterId = lastSyncId;
    if (historyMode == "full") {
      afterId = "";
    } else {
      (void)readJsonRecordId(payload, "after_record_id", afterId);
    }
    streamLogsAfter(afterId);
  } else if (command == "status") {
    updateStatusCharacteristic(true);
  } else if (command == "sleep") {
    showMainDisplay();
  } else if (command == "start_calibration") {
    startCalibrationMode();
  } else if (command == "clear_error") {
    noteEvent("manual_sync_marker", 0);
    clearAllDeviceWarnings();
  } else {
    noteEvent("device_error", 0);
  }

  return true;
}

void handleCommand(const String &command) {
  bool shouldNotifyStatus = false;
  if (isJsonPayload(command)) {
    shouldNotifyStatus = handleJsonCommand(command);
  } else {
    shouldNotifyStatus = handleLegacyCommand(command);
  }
  if (shouldNotifyStatus) {
    updateStatusCharacteristic(true);
  }
}

void handleTimeSync(const String &payload) {
  uint32_t epoch = 0;
  int32_t offsetMinutes = timezoneOffsetMinutes;
  if (isJsonPayload(payload)) {
    (void)readJsonUInt(payload, "timestamp_utc", epoch);
    (void)readJsonInt(payload, "timezone_offset_minutes", offsetMinutes);
  } else {
    epoch = (uint32_t)payload.toInt();
  }

  if (epoch > 1700000000UL) {
    offsetMinutes = constrain(offsetMinutes, -720, 840);
    timezoneOffsetMinutes = (int16_t)offsetMinutes;
    prefs.putShort("tzOffset", timezoneOffsetMinutes);

    DateTime syncedAt(epoch);
    rtc.adjust(syncedAt);
    rtcOk = rtc.isRunning();
    if (rtcOk) {
      clearDeviceWarning("rtc_not_ready");
      resetDailyTotalIfNeeded();
      refreshTodayTotalFromHistory();
      noteEvent("time_sync", 0);
      showTimeSyncDisplay(localDateTimeFromUtcEpoch(epoch));
      delay(2000);
      showMainDisplay();
    } else {
      setDeviceWarning("rtc_not_ready", "Sync time in app", 60);
      noteEvent("device_error", 0);
      showStatus("Time sync gagal", "Check DS1302 wiring", "");
    }
  }
  updateStatusCharacteristic(true);
}

bool applySetting(const String &key, int value) {
  if (key == "limit" || key == "daily_limit_ml") {
    dailyLimitMl = constrain(value, 100, 5000);
    prefs.putUShort("limitMl", dailyLimitMl);
  } else if (key == "warning" || key == "warning_percent" || key == "warning_threshold_percent") {
    warningPercent = constrain(value, 50, 100);
    prefs.putUChar("warnPct", warningPercent);
  } else if (key == "oled" || key == "oled_timeout_seconds") {
    oledTimeoutSeconds = constrain(value, 5, 120);
    prefs.putUShort("oledSec", oledTimeoutSeconds);
  } else if (key == "ble" || key == "ble_window_seconds" || key == "ble_advertise_seconds") {
    bleWindowSeconds = constrain(value, 15, 600);
    prefs.putUShort("bleSec", bleWindowSeconds);
  } else if (key == "stable_save" || key == "stable_save_seconds") {
    stableSaveSeconds = constrain(value, 10, 300);
    prefs.putUShort("stableSec", stableSaveSeconds);
  } else if (key == "history_days" || key == "history_retention_days") {
    historyRetentionDays = constrain(value, 1, 365);
    prefs.putUShort("histDays", historyRetentionDays);
  } else if (key == "drink_threshold" || key == "drink_threshold_ml") {
    drinkThresholdMl = constrain(value, 1, 250);
    prefs.putUShort("drinkTh", drinkThresholdMl);
  } else if (key == "refill_threshold" || key == "refill_threshold_ml") {
    refillThresholdMl = constrain(value, 1, 1000);
    prefs.putUShort("refillTh", refillThresholdMl);
  } else if (key == "cup_weight_tenths_g") {
    cupWeightTenthsG = constrain(value, 10, 5000);
    prefs.putUShort("cupWt10", cupWeightTenthsG);
  } else if (key == "cup_tolerance_tenths_g") {
    cupToleranceTenthsG = constrain(value, 1, 500);
    prefs.putUShort("cupTol10", cupToleranceTenthsG);
  } else {
    return false;
  }

  return true;
}

bool handleJsonSettingsWrite(const String &payload) {
  bool changed = false;
  uint32_t value = 0;

  if (readJsonUInt(payload, "daily_limit_ml", value)) {
    changed = applySetting("daily_limit_ml", (int)value) || changed;
  }
  if (readJsonUInt(payload, "warning_threshold_percent", value)) {
    changed = applySetting("warning_threshold_percent", (int)value) || changed;
  }
  if (readJsonUInt(payload, "warning_percent", value)) {
    changed = applySetting("warning_percent", (int)value) || changed;
  }
  if (readJsonUInt(payload, "oled_timeout_seconds", value)) {
    changed = applySetting("oled_timeout_seconds", (int)value) || changed;
  }
  if (readJsonUInt(payload, "ble_advertise_seconds", value)) {
    changed = applySetting("ble_advertise_seconds", (int)value) || changed;
  }
  if (readJsonUInt(payload, "ble_window_seconds", value)) {
    changed = applySetting("ble_window_seconds", (int)value) || changed;
  }
  if (readJsonUInt(payload, "stable_save_seconds", value)) {
    changed = applySetting("stable_save_seconds", (int)value) || changed;
  }
  if (readJsonUInt(payload, "history_retention_days", value)) {
    changed = applySetting("history_retention_days", (int)value) || changed;
  }
  if (readJsonUInt(payload, "history_days", value)) {
    changed = applySetting("history_days", (int)value) || changed;
  }
  if (readJsonUInt(payload, "drink_threshold_ml", value)) {
    changed = applySetting("drink_threshold_ml", (int)value) || changed;
  }
  if (readJsonUInt(payload, "refill_threshold_ml", value)) {
    changed = applySetting("refill_threshold_ml", (int)value) || changed;
  }
  if (readJsonUInt(payload, "cup_weight_tenths_g", value)) {
    changed = applySetting("cup_weight_tenths_g", (int)value) || changed;
  }
  if (readJsonUInt(payload, "cup_tolerance_tenths_g", value)) {
    changed = applySetting("cup_tolerance_tenths_g", (int)value) || changed;
  }

  return changed;
}

bool handleLegacySettingsWrite(const String &payload, String &changedKey) {
  int sep = payload.indexOf(':');
  if (sep < 0) {
    return false;
  }

  String key = payload.substring(0, sep);
  String value = payload.substring(sep + 1);
  key.trim();
  value.trim();
  changedKey = key;
  return applySetting(key, value.toInt());
}

void handleSettingsWrite(const String &payload) {
  bool changed = false;
  String changedKey = "json";

  if (isJsonPayload(payload)) {
    changed = handleJsonSettingsWrite(payload);
  } else {
    changed = handleLegacySettingsWrite(payload, changedKey);
  }

  if (changed) {
    noteEvent("settings_update", 0);
    compactSyncedHistory();
  }

  if (settingsCharacteristic != nullptr) {
    String settings = buildSettingsJson();
    settingsCharacteristic->setValue(settings.c_str());
  }
  updateStatusCharacteristic(true);
}

void handleAckWrite(const String &payload) {
  String ack = "";
  if (isJsonPayload(payload)) {
    (void)readJsonRecordId(payload, "record_id", ack);
  } else {
    ack = payload;
    ack.trim();
  }

  if (ack.length() > 0 && logContainsRecordId(ack)) {
    lastSyncId = ack;
    prefs.putString("lastSyncId", lastSyncId);
    prefs.remove("lastAckId");
    prefs.remove("lastAck");
    compactSyncedHistory();
  }
  updateStatusCharacteristic(true);
}
