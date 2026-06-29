// -------------------- Settings storage --------------------

void loadSettings() {
  prefs.begin("dialysip", false);
  calibrationFactor = prefs.getFloat("calFactor", DEFAULT_CALIBRATION_FACTOR);
  tareOffset = prefs.getFloat("tareOffset", 0.0f);
  lastStableWeightG = prefs.getFloat("lastWeight", 0.0f);
  hasLastStableWeight = prefs.getBool("hasWeight", false);
  recordId = prefs.getUInt("recordId", 0);
  lastRecordId = prefs.getString("lastRecordId", "");
  lastSyncId = prefs.getString("lastSyncId", prefs.getString("lastAckId", ""));
  deviceWarningActive = false;
  deviceWarningCode = "";
  deviceWarningMessage = "";
  deviceWarningPriority = 0;
  todayKey = prefs.getUInt("todayKey", 0);
  todayTotalMl = 0;
  dailyLimitMl = prefs.getUShort("limitMl", DEFAULT_DAILY_LIMIT_ML);
  drinkThresholdMl = prefs.getUShort("drinkTh", DEFAULT_DRINK_THRESHOLD_ML);
  refillThresholdMl = prefs.getUShort("refillTh", DEFAULT_REFILL_THRESHOLD_ML);
  cupWeightTenthsG = prefs.getUShort("cupWt10", DEFAULT_CUP_WEIGHT_TENTHS_G);
  cupToleranceTenthsG = prefs.getUShort("cupTol10", DEFAULT_CUP_TOLERANCE_TENTHS_G);
  warningPercent = prefs.getUChar("warnPct", DEFAULT_WARNING_PERCENT);
  oledTimeoutSeconds = prefs.getUShort("oledSec", DEFAULT_OLED_TIMEOUT_SECONDS);
  bleWindowSeconds = prefs.getUShort("bleSec", DEFAULT_BLE_WINDOW_SECONDS);
  stableSaveSeconds = constrain(
      prefs.getUShort("stableSec", DEFAULT_STABLE_SAVE_SECONDS),
      10,
      300);
  historyRetentionDays = prefs.getUShort("histDays", DEFAULT_HISTORY_RETENTION_DAYS);
  timezoneOffsetMinutes = prefs.getShort("tzOffset", DEFAULT_TIMEZONE_OFFSET_MINUTES);
  prefs.remove("warnActive");
  prefs.remove("warnCode");
  prefs.remove("warnMsg");
  prefs.remove("warnPrio");
  prefs.remove("recordErr");
  prefs.remove("recordErrMsg");
  prefs.remove("todayMl");
}

void saveWeightState() {
  prefs.putFloat("lastWeight", lastStableWeightG);
  prefs.putBool("hasWeight", hasLastStableWeight);
}

