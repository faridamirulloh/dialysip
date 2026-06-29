// -------------------- Sleep management --------------------

void armSleepAfterStableRead() {
  if (!sleepAfterStableReadArmed) {
    stableSensorReadMs = millis();
  }
  sleepAfterStableReadArmed = true;
}

void disarmSleepAfterStableRead() {
  stableSensorReadMs = 0;
  sleepAfterStableReadArmed = false;
}

bool stableReadFinalizationReady() {
  return sleepAfterStableReadArmed &&
         (mainDisplayVisible || bleSyncMode) &&
         (uint32_t)(millis() - stableSensorReadMs) >= stableSaveDurationMs();
}

bool stableReadSleepReady() {
  return stableReadFinalizationReady() &&
         !bleConnected &&
         !bleSyncMode;
}

bool wakePinsReadyForSleep() {
  if (bmiOk) {
    motion.clearInterrupt();
  }
  delay(50);
  return digitalRead(PIN_MOTION_WAKE) == HIGH &&
         digitalRead(PIN_WAKE_BUTTON) == HIGH;
}

bool motionWakeStillLowAfterClear() {
  if (bmiOk) {
    motion.clearInterrupt();
  }
  delay(30);
  return digitalRead(PIN_MOTION_WAKE) == LOW;
}

bool wakeButtonPressed() {
  return digitalRead(PIN_WAKE_BUTTON) == LOW;
}

bool buttonInteractionActive() {
  uint32_t now = millis();
  return wakeButtonPressed() ||
         buttonStablePressed ||
         buttonClickCount > 0 ||
         (uint32_t)(now - buttonLastRawChangeMs) < BUTTON_DEBOUNCE_MS;
}

void resetWakeButtonState(bool pressed) {
  uint32_t now = millis();
  buttonStablePressed = pressed;
  buttonLastRawPressed = pressed;
  buttonHoldHandled = false;
  buttonClickCount = 0;
  buttonLastRawChangeMs = now;
  buttonPressedSinceMs = pressed ? now : 0;
  lastButtonClickMs = 0;
}

void handleCalibrationButtonClick(uint8_t clickCount) {
  if (clickCount == 0) {
    return;
  }

  if (calibrationStep == CALIBRATION_WAIT_TARE) {
    tareScale();
  } else if (calibrationStep == CALIBRATION_WAIT_WEIGHT) {
    if (calibrationTareSaved) {
      calibrateScale(CALIBRATION_KNOWN_WEIGHT_G);
    } else {
      showCalibrationStatus("Press once for tare");
    }
  } else if (calibrationStep == CALIBRATION_LIVE_WEIGHT) {
    showCalibrationStatus("Hold 2s to exit");
  }
}

void exitIntakeHistoryView() {
  intakeViewPosition = 0;
  intakeViewLastActionMs = 0;
  showMainDisplay();
}

void advanceIntakeHistoryView() {
  if (calibrationMode) {
    return;
  }

  resetDailyTotalIfNeeded();
  intakeViewLastActionMs = millis();

  if (intakeViewPosition == 0) {
    refreshTodayTotalFromHistory();
    intakeViewPosition = 1;
    showTodayIntakeDisplay();
    return;
  }

  uint16_t count = countTodayHistoryRecords();
  if (!storageOk) {
    intakeViewPosition = 1;
    showIntakeUnavailableDisplay("Storage not ready");
    return;
  }
  if (todayKey == 0) {
    intakeViewPosition = 1;
    showIntakeUnavailableDisplay("Time not set");
    return;
  }
  if (count == 0) {
    exitIntakeHistoryView();
    return;
  }

  uint16_t indexFromNewest = intakeViewPosition - 1;
  if (indexFromNewest >= count) {
    exitIntakeHistoryView();
    return;
  }

  uint16_t ordinal = count - indexFromNewest;
  uint16_t amountMl = 0;
  uint32_t timestamp = 0;
  String type;
  if (readTodayHistoryRecordByOrdinal(ordinal, amountMl, timestamp, type)) {
    intakeViewPosition++;
    showIntakeRecordDisplay(ordinal, amountMl, timestamp, type);
  } else {
    exitIntakeHistoryView();
  }
}

void serviceIntakeHistoryTimeout() {
  if (intakeViewPosition == 0) {
    return;
  }
  if ((uint32_t)(millis() - intakeViewLastActionMs) >= INTAKE_VIEW_TIMEOUT_MS) {
    exitIntakeHistoryView();
  }
}

void serviceDeviceWarningTimeout() {
  if (!deviceWarningDisplayVisible) {
    return;
  }
  if ((uint32_t)(millis() - deviceWarningDisplayShownMs) >= DEVICE_WARNING_VIEW_TIMEOUT_MS) {
    showMainDisplay();
  }
}

void serviceResetSavedDataTimeout() {
  if (resetSavedDataDisplayShownMs == 0) {
    return;
  }
  if ((uint32_t)(millis() - resetSavedDataDisplayShownMs) >= RESET_SAVED_DATA_VIEW_TIMEOUT_MS) {
    resetSavedDataDisplayShownMs = 0;
    showMainDisplay();
  }
}

void handleButtonClickSequence(uint8_t clickCount) {
  if (clickCount == 0) {
    return;
  }

  if (calibrationMode) {
    handleCalibrationButtonClick(clickCount);
    return;
  }

  if (clickCount == RESET_DAILY_BUTTON_CLICKS) {
    resetSavedDataExceptCalibrationAndSettings();
  } else if (clickCount >= CALIBRATION_BUTTON_CLICKS && clickCount < RESET_DAILY_BUTTON_CLICKS) {
    startCalibrationMode();
  } else if (clickCount >= SYNC_BUTTON_CLICKS && clickCount < CALIBRATION_BUTTON_CLICKS) {
    startBleWindow();
  } else if (clickCount <= 2) {
    advanceIntakeHistoryView();
  } else {
    showMainDisplay();
  }
}

bool canCountButtonClick() {
  return calibrationMode ||
         (mainDisplayVisible &&
          !deviceWarningDisplayVisible &&
          intakeViewPosition == 0);
}

bool canAdvanceIntakeHistoryByButton() {
  return !calibrationMode &&
         intakeViewPosition != 0 &&
         !deviceWarningDisplayVisible;
}

void registerButtonClick(uint32_t now) {
  if (buttonClickCount > 0 && (uint32_t)(now - lastButtonClickMs) <= BUTTON_FAST_PRESS_INTERVAL_MS) {
    buttonClickCount++;
  } else {
    buttonClickCount = 1;
  }
  lastButtonClickMs = now;
  if (!calibrationMode && mainDisplayVisible) {
    showMainDisplay();
  }
}

void serviceButtonClickWindow(uint32_t now) {
  if (buttonClickCount == 0 || buttonStablePressed || wakeButtonPressed() || (uint32_t)(now - lastButtonClickMs) <= BUTTON_FAST_PRESS_INTERVAL_MS) {
    return;
  }

  uint8_t clickCount = buttonClickCount;
  buttonClickCount = 0;
  lastButtonClickMs = 0;
  handleButtonClickSequence(clickCount);
}

bool serviceWakeButton() {
  uint32_t now = millis();
  bool rawPressed = wakeButtonPressed();

  if (rawPressed != buttonLastRawPressed) {
    buttonLastRawPressed = rawPressed;
    buttonLastRawChangeMs = now;
  }

  if ((uint32_t)(now - buttonLastRawChangeMs) >= BUTTON_DEBOUNCE_MS && rawPressed != buttonStablePressed) {
    buttonStablePressed = rawPressed;
    if (rawPressed) {
      buttonHoldHandled = false;
      buttonPressedSinceMs = now;
      if (canCountButtonClick()) {
        registerButtonClick(now);
      } else if (canAdvanceIntakeHistoryByButton()) {
        advanceIntakeHistoryView();
      } else if (secondaryDisplayReturnActive()) {
        clearSecondaryDisplayReturn();
        showMainDisplay();
      }
    } else {
      buttonPressedSinceMs = 0;
      buttonHoldHandled = false;
    }
  }

  if (calibrationMode && buttonStablePressed && !buttonHoldHandled && (uint32_t)(now - buttonPressedSinceMs) >= BUTTON_HOLD_EXIT_MS) {
    buttonHoldHandled = true;
    buttonClickCount = 0;
    lastButtonClickMs = 0;
    exitCalibrationMode();
    return true;
  }

  if (bleSyncMode && buttonStablePressed && !buttonHoldHandled && (uint32_t)(now - buttonPressedSinceMs) >= BUTTON_HOLD_EXIT_MS) {
    buttonHoldHandled = true;
    buttonClickCount = 0;
    lastButtonClickMs = 0;
    exitBleSyncMode();
    return true;
  }

  serviceButtonClickWindow(now);
  return false;
}

void enterDeepSleep() {
  if (!finalizeStableWeightBeforeSleep()) {
    disarmSleepAfterStableRead();
    showMainDisplay();
    return;
  }

  while (!wakePinsReadyForSleep()) {
    delay(100);
  }

  refreshTodayTotalFromHistory();
  showTodayIntakeDisplay();
  delay(PRE_SLEEP_TOTAL_DISPLAY_MS);

  if (bmiOk) {
    motion.prepareWakeInterrupt();
  }
  while (!wakePinsReadyForSleep()) {
    delay(100);
  }

  updateStatusCharacteristic(false);
  turnDisplayOff();

  hx711.powerDown();
  setOptionalPower(PIN_HX711_POWER, false);

  if (bleStarted) {
    BLEDevice::getAdvertising()->stop();
  }

  pinMode(PIN_MOTION_WAKE, INPUT_PULLUP);
  pinMode(PIN_WAKE_BUTTON, INPUT_PULLUP);
  gpio_pullup_en((gpio_num_t)PIN_MOTION_WAKE);
  gpio_pullup_en((gpio_num_t)PIN_WAKE_BUTTON);
  gpio_pulldown_dis((gpio_num_t)PIN_MOTION_WAKE);
  gpio_pulldown_dis((gpio_num_t)PIN_WAKE_BUTTON);

  esp_deep_sleep_enable_gpio_wakeup((1ULL << PIN_MOTION_WAKE) | (1ULL << PIN_WAKE_BUTTON), ESP_GPIO_WAKEUP_GPIO_LOW);
  esp_sleep_enable_timer_wakeup(6ULL * 60ULL * 60ULL * 1000000ULL); // Safety health wake every 6 hours.
  esp_deep_sleep_start();
}

