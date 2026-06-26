// -------------------- Setup and loop --------------------

void setup() {
  pinMode(PIN_MOTION_WAKE, INPUT_PULLUP);
  pinMode(PIN_WAKE_BUTTON, INPUT_PULLUP);
  bool motionLineLowAtBoot = digitalRead(PIN_MOTION_WAKE) == LOW;
  bool buttonLowAtBoot = wakeButtonPressed();
  resetWakeButtonState(buttonLowAtBoot);
  esp_sleep_wakeup_cause_t wakeCause = esp_sleep_get_wakeup_cause();

  Serial.begin(115200);
  delay(100);

  deviceId = makeDeviceId();
  loadSettings();

  setOptionalPower(PIN_OLED_POWER, true);
  setOptionalPower(PIN_HX711_POWER, true);

  Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL);
  Wire.setClock(400000);
  i2cBusMutex = xSemaphoreCreateMutex();

  initDisplay();
  bool showStartupLoading = wakeCause != ESP_SLEEP_WAKEUP_GPIO && wakeCause != ESP_SLEEP_WAKEUP_TIMER;
  if (showStartupLoading) {
    startBootLoading();
  }
  rtc.begin(PIN_DS1302_DAT, PIN_DS1302_CLK, PIN_DS1302_RST);
  rtcOk = rtc.isRunning();
  if (i2cBusMutex != nullptr) {
    xSemaphoreTake(i2cBusMutex, portMAX_DELAY);
  }
  bmiOk = motion.begin(BMI160_ADDRESS);
  if (i2cBusMutex != nullptr) {
    xSemaphoreGive(i2cBusMutex);
  }
  storageOk = initStorage();
  initHx711();

  if (rtcOk) {
    clearDeviceWarning("rtc_not_ready");
  } else {
    setDeviceWarning("rtc_not_ready", "Sync time in app", 60);
  }
  if (storageOk) {
    clearDeviceWarning("storage_not_ready");
  } else {
    setDeviceWarning("storage_not_ready", "Storage not ready", 85);
  }
  if (bmiOk) {
    clearDeviceWarning("bmi160_not_ready");
  } else {
    setDeviceWarning("bmi160_not_ready", "Motion sensor not ready", 70);
  }
  if (hx711Ok) {
    clearDeviceWarning("hx711_not_ready");
  } else {
    setDeviceWarning("hx711_not_ready", "Scale not ready", 75);
  }

  resetDailyTotalIfNeeded();
  compactSyncedHistory();
  startBleAwakeAdvertising();

  if (i2cBusMutex != nullptr) {
    xSemaphoreTake(i2cBusMutex, portMAX_DELAY);
  }
  bool motionWakeLow = motionWakeStillLowAfterClear();
  if (i2cBusMutex != nullptr) {
    xSemaphoreGive(i2cBusMutex);
  }
  bool motionWake = motionLineLowAtBoot || motionWakeLow;
  bool buttonWake = buttonLowAtBoot || (wakeCause == ESP_SLEEP_WAKEUP_GPIO && !motionWake);
  bool timerWake = wakeCause == ESP_SLEEP_WAKEUP_TIMER;
  if (bmiOk) {
    motion.prepareAwakeInterrupt();
  }
  if (showStartupLoading) {
    stopBootLoading();
  }

  if (buttonWake) {
    showMainDisplay();
    buttonHoldHandled = buttonLowAtBoot;
    serviceWakeButton();
  } else if (motionWake || timerWake) {
    String reason = motionWake ? "Motion wake" : "Timer wake";
    sensorStartupIndicatorActive = true;
    showMainDisplay();
    processWeightWake(reason);
  } else {
    sensorStartupIndicatorActive = true;
    showMainDisplay();
    processWeightWake("Power on");
  }

  updateStatusCharacteristic(false);
}

void loop() {
  serviceWakeButton();
  serviceIntakeHistoryTimeout();
  serviceDeviceWarningTimeout();
  serviceResetSavedDataTimeout();
  serviceSecondaryDisplayTimeout();
  serviceBleTransferIndicator();
  updateMainDisplayLive();
  serviceCountdownBar();

  if (calibrationMode && millis() - lastCalibrationDisplayMs > CALIBRATION_DISPLAY_INTERVAL_MS) {
    lastCalibrationDisplayMs = millis();
    if (calibrationStep == CALIBRATION_WAIT_TARE) {
      showCalibrationStatus("Press once for tare");
    } else if (calibrationStep == CALIBRATION_WAIT_WEIGHT) {
      showCalibrationStatus("Add 250g, press once");
    } else {
      updateCalibrationLiveWeight(bleConnected);
      showCalibrationStatus("Hold 2s to exit");
    }
  }

  if (bleStarted && bleConnected && millis() - lastStatusNotifyMs > 5000) {
    lastStatusNotifyMs = millis();
    updateStatusCharacteristic(true);
    if (!mainDisplayVisible && !bleSyncMode) {
      armSecondaryDisplayReturn(30000);
    }
  }

  if (!calibrationMode && stableReadSleepReady()) {
    enterDeepSleep();
  }

  delay(50);
}
