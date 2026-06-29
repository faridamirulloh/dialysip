// -------------------- Utility --------------------

void setOptionalPower(int8_t pin, bool enabled) {
  if (pin < 0) {
    return;
  }
  pinMode(pin, OUTPUT);
  digitalWrite(pin, enabled ? HIGH : LOW);
}

void initBatteryAdc() {
  pinMode(PIN_BATTERY_ADC, INPUT);
  pinMode(PIN_CHARGER_DETECT, INPUT);
  analogSetPinAttenuation(PIN_BATTERY_ADC, ADC_11db);
}

uint16_t readTrimmedAdcPinMv(uint8_t pin, uint8_t samples) {
  if (samples == 0) {
    return 0;
  }

  uint32_t sumMv = 0;
  uint32_t minMv = 65535UL;
  uint32_t maxMv = 0;
  for (uint8_t i = 0; i < samples; i++) {
    uint32_t sampleMv = analogReadMilliVolts(pin);
    sumMv += sampleMv;
    if (sampleMv < minMv) {
      minMv = sampleMv;
    }
    if (sampleMv > maxMv) {
      maxMv = sampleMv;
    }
  }

  uint8_t divisor = samples;
  if (samples > 2) {
    sumMv -= minMv;
    sumMv -= maxMv;
    divisor -= 2;
  }

  uint32_t averagedMv = (sumMv + (divisor / 2)) / divisor;
  return averagedMv > 65535UL ? 65535U : (uint16_t)averagedMv;
}

String makeDeviceId() {
  uint64_t mac = ESP.getEfuseMac();
  char buf[24];
  snprintf(buf, sizeof(buf), "dialysip-%04X%08X", (uint16_t)(mac >> 32), (uint32_t)mac);
  return String(buf);
}

void setDeviceWarning(const String &code, const String &message, uint8_t priority) {
  if (deviceWarningActive && priority < deviceWarningPriority && deviceWarningCode != code) {
    return;
  }

  if (deviceWarningActive && deviceWarningCode == code && deviceWarningMessage == message && deviceWarningPriority == priority) {
    return;
  }

  deviceWarningActive = true;
  deviceWarningCode = code;
  deviceWarningMessage = message;
  deviceWarningPriority = priority;
}

void clearDeviceWarning(const String &code) {
  if (!deviceWarningActive || deviceWarningCode != code) {
    return;
  }

  deviceWarningActive = false;
  deviceWarningCode = "";
  deviceWarningMessage = "";
  deviceWarningPriority = 0;
}

void noteEvent(const String &type, uint16_t amountMl) {
  lastEventType = type;
  lastEventAmountMl = amountMl;
}

int32_t timezoneOffsetSeconds() {
  return (int32_t)timezoneOffsetMinutes * 60L;
}

uint32_t localEpochFromUtcEpoch(uint32_t epoch) {
  int64_t localEpoch = (int64_t)epoch + (int64_t)timezoneOffsetSeconds();
  if (localEpoch <= 0) {
    return 0;
  }
  if (localEpoch > 4294967295LL) {
    return 4294967295UL;
  }
  return (uint32_t)localEpoch;
}

DateTime localDateTimeFromUtcEpoch(uint32_t epoch) {
  return DateTime(localEpochFromUtcEpoch(epoch));
}

uint32_t currentEpoch() {
  if (rtcOk) {
    return rtc.now().unixtime();
  }
  return millis() / 1000;
}

uint32_t currentDayKey() {
  if (!rtcOk) {
    return 0;
  }
  DateTime now = localDateTimeFromUtcEpoch(currentEpoch());
  return (uint32_t)now.year() * 10000UL + (uint32_t)now.month() * 100UL + now.day();
}

void resetDailyTotalIfNeeded() {
  uint32_t key = currentDayKey();
  if (key == 0) {
    return;
  }
  if (todayKey != key) {
    todayKey = key;
    todayTotalMl = 0;
    recordId = 0;
    prefs.putUInt("todayKey", todayKey);
    prefs.putUInt("recordId", recordId);
    refreshTodayTotalFromHistory();
  }
}

float cupWeightG() {
  return (float)cupWeightTenthsG / 10.0f;
}

float cupToleranceG() {
  return (float)cupToleranceTenthsG / 10.0f;
}

uint32_t stableSaveDurationMs() {
  return (uint32_t)stableSaveSeconds * 1000UL;
}

float bottleRemovedThresholdG() {
  float weightG = cupWeightG();
  if (weightG > 15.0f) {
    return -(weightG - 5.0f);
  }

  return BOTTLE_REMOVED_THRESHOLD_G;
}

bool cupGuardDropMatches(float deltaG) {
  if (deltaG >= 0.0f) {
    return false;
  }

  return abs((-deltaG) - cupWeightG()) <= cupToleranceG();
}

void updateCupGuardForDelta(float deltaG) {
  if (!cupGuardActive) {
    return;
  }

  if (deltaG >= 0.0f || abs(deltaG) <= cupToleranceG() || !cupGuardDropMatches(deltaG)) {
    cupGuardActive = false;
  }
}

void updateCupGuardForCurrentWeight() {
  if (!hasLastStableWeight || !hasCurrentWeight) {
    return;
  }

  updateCupGuardForDelta(currentWeightG - lastStableWeightG);
}

void clearAllDeviceWarnings() {
  deviceWarningActive = false;
  deviceWarningCode = "";
  deviceWarningMessage = "";
  deviceWarningPriority = 0;
  prefs.remove("warnActive");
  prefs.remove("warnCode");
  prefs.remove("warnMsg");
  prefs.remove("warnPrio");
  prefs.remove("recordErr");
  prefs.remove("recordErrMsg");
}

void resetSavedDataExceptCalibrationAndSettings() {
  intakeViewPosition = 0;
  intakeViewLastActionMs = 0;

  if (!clearHistoryData()) {
    setDeviceWarning("data_reset_failed", storageOk ? "Cannot clear history" : "Storage not ready", 88);
    showStatus("Reset failed", "Check storage", "");
    updateStatusCharacteristic(true);
    return;
  }

  recordId = 0;
  lastRecordId = "";
  lastSyncId = "";
  todayKey = currentDayKey();
  todayTotalMl = 0;
  lastStableWeightG = 0.0f;
  currentWeightG = 0.0f;
  hasLastStableWeight = false;
  hasCurrentWeight = false;
  scaleStable = false;
  weightUnstableActive = false;
  imuMotionActive = false;
  hasImuDebug = false;
  cupGuardActive = false;
  unstableWeightFailures = 0;
  bottleRemovedStableCycles = 0;
  lastEventType = "data_reset";
  lastEventAmountMl = 0;

  prefs.putUInt("recordId", recordId);
  prefs.putString("lastRecordId", lastRecordId);
  prefs.putString("lastSyncId", lastSyncId);
  prefs.remove("lastAckId");
  prefs.remove("lastAck");
  prefs.putUInt("todayKey", todayKey);
  prefs.remove("todayMl");
  prefs.putFloat("lastWeight", lastStableWeightG);
  prefs.putBool("hasWeight", hasLastStableWeight);
  clearAllDeviceWarnings();

  showStatus("Reset data", "Riwayat dihapus", "");
  resetSavedDataDisplayShownMs = millis();
  updateStatusCharacteristic(true);
}

uint16_t readBatteryMv() {
  static bool filterInitialized = false;
  static uint32_t filteredMv = 0;

  uint32_t adcMv = readTrimmedAdcPinMv(PIN_BATTERY_ADC, BATTERY_ADC_SAMPLES);
  uint32_t rawBatteryMv = adcMv * BATTERY_DIVIDER_RATIO;
  if (!filterInitialized) {
    filteredMv = rawBatteryMv;
    filterInitialized = true;
  } else {
    filteredMv = ((filteredMv * (BATTERY_FILTER_DENOMINATOR - BATTERY_FILTER_NUMERATOR)) +
                  (rawBatteryMv * BATTERY_FILTER_NUMERATOR) +
                  (BATTERY_FILTER_DENOMINATOR / 2)) /
                 BATTERY_FILTER_DENOMINATOR;
  }

  return filteredMv > 65535UL ? 65535U : (uint16_t)filteredMv;
}

uint8_t batteryPercentFromMv(uint16_t batteryMv) {
  if (batteryMv <= BATTERY_EMPTY_MV) {
    return 0;
  }
  if (batteryMv >= BATTERY_FULL_MV) {
    return 100;
  }

  uint16_t span = BATTERY_FULL_MV - BATTERY_EMPTY_MV;
  return (uint8_t)(((uint32_t)(batteryMv - BATTERY_EMPTY_MV) * 100UL + (span / 2)) / span);
}

uint8_t readBatteryPercentForMv(uint16_t batteryMv) {
  static bool percentInitialized = false;
  static uint16_t lastPercentMv = 0;
  static uint8_t lastPercent = 0;
  uint16_t deltaMv = batteryMv >= lastPercentMv ? batteryMv - lastPercentMv : lastPercentMv - batteryMv;

  if (!percentInitialized || deltaMv >= BATTERY_PERCENT_UPDATE_MV) {
    lastPercent = batteryPercentFromMv(batteryMv);
    lastPercentMv = batteryMv;
    percentInitialized = true;
  }

  return lastPercent;
}

uint8_t readBatteryPercent() {
  return readBatteryPercentForMv(readBatteryMv());
}

bool chargerConnected() {
  return digitalRead(PIN_CHARGER_DETECT) == HIGH;
}

String jsonEscape(const String &input) {
  String out;
  out.reserve(input.length() + 8);
  for (uint16_t i = 0; i < input.length(); i++) {
    char c = input[i];
    if (c == '"' || c == '\\') {
      out += '\\';
    }
    out += c;
  }
  return out;
}

bool isJsonPayload(const String &payload) {
  return payload.startsWith("{");
}

bool isJsonWhitespace(char c) {
  return c == ' ' || c == '\n' || c == '\r' || c == '\t';
}

int jsonValueStart(const String &payload, const char *key) {
  String token = String("\"") + key + "\"";
  int keyIdx = payload.indexOf(token);
  if (keyIdx < 0) {
    return -1;
  }

  int colonIdx = payload.indexOf(':', keyIdx + token.length());
  if (colonIdx < 0) {
    return -1;
  }

  int valueIdx = colonIdx + 1;
  while (valueIdx < (int)payload.length() && isJsonWhitespace(payload[valueIdx])) {
    valueIdx++;
  }
  return valueIdx;
}

bool readJsonUInt(const String &payload, const char *key, uint32_t &value) {
  int idx = jsonValueStart(payload, key);
  if (idx < 0) {
    return false;
  }

  if (payload[idx] == '"') {
    idx++;
  }

  if (idx >= (int)payload.length() || !isDigit(payload[idx])) {
    return false;
  }

  uint32_t parsed = 0;
  while (idx < (int)payload.length() && isDigit(payload[idx])) {
    parsed = parsed * 10UL + (uint32_t)(payload[idx] - '0');
    idx++;
  }

  value = parsed;
  return true;
}

bool readJsonInt(const String &payload, const char *key, int32_t &value) {
  int idx = jsonValueStart(payload, key);
  if (idx < 0) {
    return false;
  }

  if (payload[idx] == '"') {
    idx++;
  }

  bool negative = false;
  if (idx < (int)payload.length() && payload[idx] == '-') {
    negative = true;
    idx++;
  }

  if (idx >= (int)payload.length() || !isDigit(payload[idx])) {
    return false;
  }

  int32_t parsed = 0;
  while (idx < (int)payload.length() && isDigit(payload[idx])) {
    parsed = parsed * 10L + (int32_t)(payload[idx] - '0');
    idx++;
  }

  value = negative ? -parsed : parsed;
  return true;
}

bool readJsonString(const String &payload, const char *key, String &value) {
  int idx = jsonValueStart(payload, key);
  if (idx < 0 || idx >= (int)payload.length() || payload[idx] != '"') {
    return false;
  }

  idx++;
  value = "";
  bool escaped = false;
  while (idx < (int)payload.length()) {
    char c = payload[idx++];
    if (escaped) {
      value += c;
      escaped = false;
    } else if (c == '\\') {
      escaped = true;
    } else if (c == '"') {
      return true;
    } else {
      value += c;
    }
  }

  return false;
}

bool readJsonRecordId(const String &payload, const char *key, String &value) {
  if (readJsonString(payload, key, value)) {
    return true;
  }

  uint32_t numericValue = 0;
  if (readJsonUInt(payload, key, numericValue)) {
    value = String(numericValue);
    return true;
  }

  return false;
}
