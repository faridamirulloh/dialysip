// -------------------- Weight and event detection --------------------

void initHx711() {
  setOptionalPower(PIN_HX711_POWER, true);
  delay(20);
  hx711.begin(PIN_HX711_DOUT, PIN_HX711_SCK);
  hx711.powerUp();
  long raw = 0;
  hx711Ok = hx711.readAverage(raw, 2);
}

void noteCurrentWeight(float nextWeightG) {
  uint32_t now = millis();
  if (!hasCurrentWeight || abs(nextWeightG - currentWeightG) > STABLE_VARIATION_G) {
    scaleStableSinceMs = now;
    scaleStable = false;
  } else {
    scaleStable = (now - scaleStableSinceMs) >= LIVE_WEIGHT_STABLE_MS;
  }
  weightUnstableActive = !scaleStable;

  currentWeightG = nextWeightG;
  hasCurrentWeight = true;
}

void updateCalibrationLiveWeight(bool notify) {
  if (calibrationStep != CALIBRATION_LIVE_WEIGHT) {
    return;
  }

  if (!hx711Ok) {
    hasCurrentWeight = false;
    scaleStable = false;
    weightUnstableActive = true;
    return;
  }

  float nextWeightG = 0.0f;
  if (hx711.readWeightG(nextWeightG)) {
    noteCurrentWeight(nextWeightG);
  }

  if (notify) {
    updateStatusCharacteristic(true);
  }
}

bool updateImuDebugFromAccel() {
  if (!bmiOk) {
    return false;
  }

  int16_t accelXMg = 0;
  int16_t accelYMg = 0;
  int16_t accelZMg = 0;
  if (!motion.readAccelMg(accelXMg, accelYMg, accelZMg)) {
    return false;
  }

  int32_t magnitudeSq = (int32_t)accelXMg * accelXMg + (int32_t)accelYMg * accelYMg + (int32_t)accelZMg * accelZMg;
  int16_t nextAccelOffsetMg = (int16_t)abs((int32_t)sqrt((double)magnitudeSq) - 1000L);
  int16_t nextAccelDeltaMg = hasImuDebug
                                 ? max(max(abs(accelXMg - lastImuAccelXMg), abs(accelYMg - lastImuAccelYMg)), abs(accelZMg - lastImuAccelZMg))
                                 : 0;

  hasImuDebug = true;
  imuAccelOffsetMg = nextAccelOffsetMg;
  imuAccelDeltaMg = nextAccelDeltaMg;
  lastImuAccelXMg = accelXMg;
  lastImuAccelYMg = accelYMg;
  lastImuAccelZMg = accelZMg;
  imuMotionActive = imuAccelDeltaMg > IMU_STABLE_DELTA_MG;
  return true;
}

void updateMainDisplayLive() {
  if (!mainDisplayVisible || calibrationMode || intakeViewPosition != 0) {
    return;
  }
  if (buttonInteractionActive()) {
    return;
  }

  uint32_t now = millis();
  if ((uint32_t)(now - lastMainDisplayLiveUpdateMs) < MAIN_DISPLAY_LIVE_UPDATE_MS) {
    return;
  }
  lastMainDisplayLiveUpdateMs = now;

  bool changed = false;
  if (hx711Ok) {
    float nextWeightG = 0.0f;
    if (hx711.readWeightG(nextWeightG)) {
      noteCurrentWeight(nextWeightG);
      changed = true;
    } else {
      scaleStable = false;
      weightUnstableActive = true;
      changed = true;
    }
  } else {
    scaleStable = false;
    weightUnstableActive = true;
    changed = true;
  }

  if (bmiOk) {
    bool hadImuDebug = hasImuDebug;
    int16_t previousOffsetMg = imuAccelOffsetMg;
    int16_t previousDeltaMg = imuAccelDeltaMg;
    bool previousMotionActive = imuMotionActive;
    if (updateImuDebugFromAccel() &&
        (!hadImuDebug || previousOffsetMg != imuAccelOffsetMg || previousDeltaMg != imuAccelDeltaMg || previousMotionActive != imuMotionActive)) {
      changed = true;
    }
  }

  if (deviceWarningCode == "bottle_removed") {
    if (hasCurrentWeight && currentWeightG > BOTTLE_REMOVED_THRESHOLD_G) {
      bottleRemovedStableCycles = 0;
      clearDeviceWarning("bottle_removed");
      showMainDisplay();
    } else {
      disarmSleepAfterStableRead();
      showBottleRemovedDisplay();
    }
    return;
  }

  if (hasCurrentWeight && currentWeightG > BOTTLE_REMOVED_THRESHOLD_G) {
    bottleRemovedStableCycles = 0;
  }

  if (scaleStable && !imuMotionActive) {
    armSleepAfterStableRead();
  } else {
    disarmSleepAfterStableRead();
  }

  if (changed) {
    showMainDisplay();
  }
}

void refreshMainDisplayIfWasVisible(bool wasVisible) {
  if (wasVisible) {
    showMainDisplay();
  }
}

void startCalibrationMode() {
  intakeViewPosition = 0;
  intakeViewLastActionMs = 0;
  calibrationMode = true;
  calibrationTareSaved = false;
  calibrationStep = CALIBRATION_WAIT_TARE;
  showCalibrationStatus("Klik untuk tare");
  updateStatusCharacteristic(true);
}

void exitCalibrationMode() {
  calibrationMode = false;
  calibrationTareSaved = false;
  calibrationStep = CALIBRATION_IDLE;
  showStatus("Kalibrasi selesai", "", "");
  updateStatusCharacteristic(true);
}

void tareScale() {
  long raw = 0;
  if (calibrationMode) {
    showCalibrationStatus("Tunggu 3 detik stabil");
  } else {
    showStatus("Tare", "Stabilkan botol", "");
  }
  delay(CALIBRATION_SETTLE_DELAY_MS);

  if (!hx711.readStableRaw(raw)) {
    if (calibrationMode) {
      showCalibrationStatus("Tare gagal, ulangi");
    } else {
      showStatus("Tare gagal", "Sensor tidak stabil", "");
    }
    noteEvent("device_error", 0);
    updateStatusCharacteristic(true);
    return;
  }

  tareOffset = (float)raw;
  prefs.putFloat("tareOffset", tareOffset);
  lastStableWeightG = 0.0f;
  hasLastStableWeight = true;
  currentWeightG = 0.0f;
  hasCurrentWeight = true;
  scaleStableSinceMs = millis() > LIVE_WEIGHT_STABLE_MS ? millis() - LIVE_WEIGHT_STABLE_MS : 0;
  scaleStable = true;
  weightUnstableActive = false;
  saveWeightState();
  noteEvent("tare", 0);
  if (calibrationMode) {
    calibrationTareSaved = true;
    calibrationStep = CALIBRATION_WAIT_WEIGHT;
    showCalibrationStatus("Tambah 250g, tekan sekali");
  } else {
    showStatus("Tare disimpan", "Kalibrasi 0 g", "");
  }
  updateStatusCharacteristic(true);
}

void calibrateScale(uint16_t knownMl) {
  if (knownMl == 0) {
    showStatus("Kalibrasi gagal", "ml diset 0", "");
    updateStatusCharacteristic(true);
    return;
  }

  long raw = 0;
  if (calibrationMode) {
    showCalibrationStatus("Tunggu 3 detik stabil");
  } else {
    showStatus("Sedang kalibrasi", "Tiarkan stabil", "");
  }
  delay(CALIBRATION_SETTLE_DELAY_MS);

  if (!hx711.readStableRaw(raw)) {
    if (calibrationMode) {
      showCalibrationStatus("Kalibrasi gagal, ulangi");
    } else {
      showStatus("Kalibrasi gagal", "Tidak stabil", "");
    }
    noteEvent("device_error", 0);
    updateStatusCharacteristic(true);
    return;
  }

  calibrationFactor = ((float)raw - tareOffset) / (float)knownMl;
  if (abs(calibrationFactor) < 1.0f) {
    calibrationFactor = DEFAULT_CALIBRATION_FACTOR;
    showStatus("Kalibrasi gagal", "Tidak stabil", "");
    updateStatusCharacteristic(true);
    return;
  }

  prefs.putFloat("calFactor", calibrationFactor);
  currentWeightG = (float)knownMl;
  hasCurrentWeight = true;
  scaleStableSinceMs = millis() > LIVE_WEIGHT_STABLE_MS ? millis() - LIVE_WEIGHT_STABLE_MS : 0;
  scaleStable = true;
  weightUnstableActive = false;
  noteEvent("calibration", knownMl);
  if (calibrationMode) {
    calibrationStep = CALIBRATION_LIVE_WEIGHT;
    showCalibrationStatus("Tahan 2 detik, keluar");
  } else {
    showStatus("Kalibrasi disimpan", String("Factor ") + String(calibrationFactor, 2), "");
  }
  updateStatusCharacteristic(true);
}

void processWeightWake(const String &reason) {
  resetDailyTotalIfNeeded();
  disarmSleepAfterStableRead();
  sensorStartupIndicatorActive = false;

  if (!hx711Ok) {
    bool wasMainDisplayVisible = mainDisplayVisible;
    showStatus("HX711 error", "Check wiring", "");
    scaleStable = false;
    weightUnstableActive = true;
    setDeviceWarning("hx711_not_ready", "Scale not ready", 75);
    noteEvent("device_error", 0);
    refreshMainDisplayIfWasVisible(wasMainDisplayVisible);
    return;
  }

  if (!bmiOk) {
    bool wasMainDisplayVisible = mainDisplayVisible;
    showStatus("BMI160 error", "Check wiring", "");
    imuMotionActive = true;
    setDeviceWarning("bmi160_not_ready", "Motion sensor not ready", 70);
    noteEvent("device_error", 0);
    refreshMainDisplayIfWasVisible(wasMainDisplayVisible);
    return;
  }

  clearDeviceWarning("bmi160_not_ready");
  motion.clearInterrupt();
  delay(30);

  float measuredWeightG = 0.0f;
  bool stable = hx711.readStableWeightG(measuredWeightG);
  bool imuReadOk = updateImuDebugFromAccel();
  bool motionDuringWeightRead = !imuReadOk || imuMotionActive;

  if (motionDuringWeightRead) {
    bool wasMainDisplayVisible = mainDisplayVisible;
    showStatus("Bottle bergerak", "Biarkan stabil", reason);
    setDeviceWarning("imu_motion", "Biarkan stabil", 50);
    noteEvent("suspicious_change", 0);
    refreshMainDisplayIfWasVisible(wasMainDisplayVisible);
    return;
  }

  clearDeviceWarning("imu_motion");

  if (!stable) {
    float liveWeightG = 0.0f;
    if (hx711.readWeightG(liveWeightG)) {
      noteCurrentWeight(liveWeightG);
    }
    scaleStable = false;
    weightUnstableActive = true;
    if (unstableWeightFailures < 255) {
      unstableWeightFailures++;
    }
    if (unstableWeightFailures >= UNSTABLE_WEIGHT_WARNING_COUNT) {
      setDeviceWarning("unstable_weight", "Biarkan stabil", 40);
    }
    noteEvent("suspicious_change", 0);
    showMainDisplay();
    return;
  }

  unstableWeightFailures = 0;
  clearDeviceWarning("unstable_weight");
  clearDeviceWarning("hx711_not_ready");
  currentWeightG = measuredWeightG;
  hasCurrentWeight = true;
  scaleStableSinceMs = millis() > LIVE_WEIGHT_STABLE_MS ? millis() - LIVE_WEIGHT_STABLE_MS : 0;
  scaleStable = true;
  weightUnstableActive = false;

  if (currentWeightG <= BOTTLE_REMOVED_THRESHOLD_G) {
    bottleRemovedStableCycles = BOTTLE_REMOVED_STABLE_COUNT_LIMIT;
    setDeviceWarning("bottle_removed", "Pasang botol", 55);
    noteEvent("suspicious_change", 0);
    showBottleRemovedDisplay();
    return;
  }

  bottleRemovedStableCycles = 0;
  clearDeviceWarning("bottle_removed");
  armSleepAfterStableRead();
  showMainDisplay();
}

void waitForConfirmationCountdown() {
  while (confirmationDisplayShownMs != 0 && (uint32_t)(millis() - confirmationDisplayShownMs) < DRINK_CONFIRMATION_DISPLAY_MS) {
    serviceCountdownBar();
    delay(50);
  }
  confirmationDisplayShownMs = 0;
}

bool finalizeStableWeightBeforeSleep() {
  if (!hx711Ok || !bmiOk || !hasCurrentWeight || !scaleStable || imuMotionActive) {
    return false;
  }

  float finalWeightG = 0.0f;
  bool finalWeightStable = hx711.readStableWeightG(finalWeightG);
  bool imuReadOk = updateImuDebugFromAccel();
  if (!finalWeightStable || !imuReadOk || imuMotionActive) {
    scaleStable = false;
    weightUnstableActive = true;
    return false;
  }

  currentWeightG = finalWeightG;
  hasCurrentWeight = true;
  scaleStableSinceMs = millis() > SLEEP_AFTER_STABLE_READ_MS ? millis() - SLEEP_AFTER_STABLE_READ_MS : 0;
  scaleStable = true;
  weightUnstableActive = false;

  if (currentWeightG <= BOTTLE_REMOVED_THRESHOLD_G) {
    if (bottleRemovedStableCycles < 255) {
      bottleRemovedStableCycles++;
    }
    if (bottleRemovedStableCycles >= BOTTLE_REMOVED_STABLE_COUNT_LIMIT) {
      setDeviceWarning("bottle_removed", "Pasang botol", 55);
      noteEvent("suspicious_change", 0);
      showBottleRemovedDisplay();
    }
    return false;
  }

  bottleRemovedStableCycles = 0;
  resetDailyTotalIfNeeded();

  if (!hasLastStableWeight) {
    lastStableWeightG = currentWeightG;
    hasLastStableWeight = true;
    saveWeightState();
    noteEvent("baseline", 0);
    return true;
  }

  float beforeG = lastStableWeightG;
  float deltaG = currentWeightG - beforeG;
  uint16_t amountMl = 0;
  String type = "";
  String confidence = "normal";
  String flags = "";

  if (deltaG <= -((float)drinkThresholdMl)) {
    amountMl = (uint16_t)round(-deltaG);
    type = "drink_auto";
  } else if (deltaG >= (float)refillThresholdMl) {
    amountMl = (uint16_t)round(deltaG);
    type = "refill";
  } else {
    lastStableWeightG = currentWeightG;
    saveWeightState();
    noteEvent("no_change", 0);
    return true;
  }

  if (abs(deltaG) > 500.0f) {
    confidence = "review";
    flags = "large_change";
  }

  lastStableWeightG = currentWeightG;
  saveWeightState();

  bool recordSaved = appendRecord(type, amountMl, beforeG, currentWeightG, confidence, flags);
  if (!recordSaved) {
    showFinalizationStatus("Gagal menyimpan", type == "drink_auto" ? "Minum" : "Isi ulang");
    waitForConfirmationCountdown();
    return true;
  }

  refreshTodayTotalFromHistory();

  if (type == "drink_auto") {
    showDrinkSavedDisplay(amountMl);
  } else {
    showRefillSavedDisplay(amountMl);
  }
  waitForConfirmationCountdown();
  return true;
}
