// -------------------- Display --------------------

void initDisplay() {
  setOptionalPower(PIN_OLED_POWER, true);
  delay(20);
  displayOk = display.begin(SSD1306_SWITCHCAPVCC, OLED_ADDRESS);
  if (!displayOk) {
    return;
  }
  display.clearDisplay();
  display.setTextColor(SSD1306_WHITE);
  display.setTextSize(1);
  display.display();
}

void printCenteredText(const String &text, int16_t y, uint8_t textSize) {
  int16_t x1 = 0;
  int16_t y1 = 0;
  uint16_t w = 0;
  uint16_t h = 0;
  display.setTextSize(textSize);
  display.getTextBounds(text, 0, y, &x1, &y1, &w, &h);
  int16_t x = w >= OLED_WIDTH ? 0 : (OLED_WIDTH - w) / 2;
  display.setCursor(x, y);
  display.print(text);
}

void markSecondaryDisplayVisible() {
  mainDisplayVisible = false;
  bottleRemovedDisplayVisible = false;
  deviceWarningDisplayVisible = false;
  resetSavedDataDisplayShownMs = 0;
  clearSecondaryDisplayReturn();
}

void clearSecondaryDisplayReturn() {
  secondaryDisplayShownMs = 0;
  secondaryDisplayTimeoutMs = 0;
}

void armSecondaryDisplayReturn(uint32_t timeoutMs) {
  secondaryDisplayShownMs = millis();
  secondaryDisplayTimeoutMs = timeoutMs;
}

bool secondaryDisplayReturnActive() {
  return secondaryDisplayTimeoutMs != 0;
}

void serviceSecondaryDisplayTimeout() {
  if (!secondaryDisplayReturnActive() || calibrationMode || bleSyncMode) {
    return;
  }
  if ((uint32_t)(millis() - secondaryDisplayShownMs) < secondaryDisplayTimeoutMs) {
    return;
  }

  clearSecondaryDisplayReturn();
  showMainDisplay();
}

void showBootLoading() {
  markSecondaryDisplayVisible();
  if (!displayOk) {
    return;
  }

  uint8_t step = bootLoadingFrame % 8;
  bootLoadingFrame++;

  display.ssd1306_command(SSD1306_DISPLAYON);
  display.clearDisplay();
  printCenteredText("DialySip", 18, 2);
  display.drawRect(32, 42, 64, 6, SSD1306_WHITE);
  for (uint8_t slot = 0; slot < 6; slot++) {
    bool active = false;
    if (step < 3) {
      active = slot <= step;
    } else if (step < 6) {
      active = slot >= step - 2 && slot <= step;
    } else {
      active = slot >= step - 2;
    }

    if (active) {
      display.fillRect(35 + slot * 10, 44, 7, 2, SSD1306_WHITE);
    }
  }
  display.display();
}

void bootLoadingTask(void *parameter) {
  (void)parameter;

  while (bootLoadingActive) {
    bool locked = i2cBusMutex == nullptr;
    if (i2cBusMutex != nullptr) {
      locked = xSemaphoreTake(i2cBusMutex, pdMS_TO_TICKS(50)) == pdTRUE;
    }

    if (locked) {
      showBootLoading();
      if (i2cBusMutex != nullptr) {
        xSemaphoreGive(i2cBusMutex);
      }
    }

    vTaskDelay(pdMS_TO_TICKS(200));
  }

  bootLoadingTaskRunning = false;
  bootLoadingTaskHandle = nullptr;
  vTaskDelete(nullptr);
}

void startBootLoading() {
  if (!displayOk || bootLoadingTaskRunning || bootLoadingTaskHandle != nullptr) {
    return;
  }

  bootLoadingFrame = 0;
  bootLoadingActive = true;
  bootLoadingTaskRunning = true;
  BaseType_t created = xTaskCreate(bootLoadingTask, "bootLoading", 3072, nullptr, 1, &bootLoadingTaskHandle);
  if (created != pdPASS) {
    bootLoadingActive = false;
    bootLoadingTaskRunning = false;
    bootLoadingTaskHandle = nullptr;
  }
}

void stopBootLoading() {
  if (!bootLoadingTaskRunning) {
    bootLoadingActive = false;
    bootLoadingTaskHandle = nullptr;
    return;
  }

  bootLoadingActive = false;
  while (bootLoadingTaskRunning) {
    delay(10);
  }
}

void showStatus(const String &line1, const String &line2, const String &line3) {
  markSecondaryDisplayVisible();
  armSecondaryDisplayReturn((uint32_t)oledTimeoutSeconds * 1000UL);
  if (!displayOk) {
    return;
  }

  display.ssd1306_command(SSD1306_DISPLAYON);
  display.clearDisplay();
  if (bleSyncMode) {
    drawBleStatusIndicator();
  }
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("DialySip");
  display.println();
  display.println(line1);
  display.println(line2);
  display.println(line3);
  display.println();
  display.print("Hari ini ");
  display.print(todayTotalMl);
  display.print("/");
  display.print(dailyLimitMl);
  display.println(" ml");
  display.display();
}

static constexpr uint8_t STABILITY_ICON_SIZE = 14;
static constexpr uint8_t COUNTDOWN_BAR_HEIGHT = 2;
static constexpr uint16_t COUNTDOWN_BAR_REFRESH_MS = 250;
static constexpr uint8_t BLE_ICON_WIDTH = 8;
static constexpr uint8_t BLE_ICON_HEIGHT = 10;
static constexpr uint8_t BLE_TRANSFER_ICON_WIDTH = 8;
static constexpr uint8_t BLE_TRANSFER_ICON_HEIGHT = 8;
static constexpr uint16_t BLE_TRANSFER_INDICATOR_DURATION_MS = 2000;
static constexpr int16_t BLE_STATUS_AREA_X = 56;
static constexpr uint8_t MODULE_ICON_SIZE = 8;
static constexpr uint8_t STATUS_ICON_GAP = 2;
static constexpr uint8_t BUTTON_ICON_SIZE = 8;
static constexpr uint8_t BUTTON_CLICK_INDICATOR_WIDTH = 24;
static constexpr uint8_t BUTTON_CLICK_INDICATOR_HEIGHT = 13;
static constexpr uint16_t BUTTON_CLICK_BAR_REFRESH_MS = 50;
static constexpr uint8_t HX711_STABILIZING_INDICATOR_WIDTH = 78;
static constexpr uint8_t HX711_STABILIZING_INDICATOR_HEIGHT = 17;
static constexpr uint16_t HX711_STABILIZING_BLINK_MS = 500;
static const uint8_t BLE_CONNECTED_ICON[] PROGMEM = {
  0x18,
  0x14,
  0x12,
  0x54,
  0x38,
  0x18,
  0x34,
  0x52,
  0x14,
  0x18,
};
static const uint8_t BLE_DISCONNECTED_ICON[] PROGMEM = {
  0x18,
  0x15,
  0x12,
  0x54,
  0x08,
  0x10,
  0x24,
  0x42,
  0x94,
  0x18,
};

static const uint8_t BLE_SEND_ICON[] PROGMEM = {
  0x10,
  0x28,
  0x44,
  0x10,
  0x10,
  0x10,
  0x10,
  0x00,
};

static const uint8_t BLE_RECEIVE_ICON[] PROGMEM = {
  0x10,
  0x10,
  0x10,
  0x10,
  0x44,
  0x28,
  0x10,
  0x00,
};

void noteBleTransfer(BleTransferIndicator direction) {
  bleTransferIndicatorStartedMs = millis();
  bleTransferIndicator = direction;
  bleTransferIndicatorRefreshPending = true;
}

void noteBleDataSent() {
  noteBleTransfer(BLE_TRANSFER_SEND);
}

void noteBleDataReceived() {
  noteBleTransfer(BLE_TRANSFER_RECEIVE);
}

bool bleTransferIndicatorActive() {
  return bleTransferIndicator != BLE_TRANSFER_NONE &&
         (uint32_t)(millis() - bleTransferIndicatorStartedMs) < BLE_TRANSFER_INDICATOR_DURATION_MS;
}


static const uint8_t RTC_NOT_READY_ICON[] PROGMEM = {
  0x3C,
  0x52,
  0x91,
  0x91,
  0x9D,
  0x81,
  0x42,
  0x3C,
};
static const uint8_t SD_NOT_READY_ICON[] PROGMEM = {
  0x1E,
  0x22,
  0x42,
  0x42,
  0x42,
  0x42,
  0x42,
  0x7E,
};
static const uint8_t BMI160_NOT_READY_ICON[] PROGMEM = {
  0x00,
  0x0C,
  0x42,
  0x24,
  0x42,
  0x24,
  0x42,
  0x30,
};
static const uint8_t BUTTON_ICON[] PROGMEM = {
  0x00,
  0x3C,
  0x24,
  0x24,
  0x7E,
  0x81,
  0xDB,
  0x00,
};
static const uint8_t STABILITY_WEIGHT_ICON[] PROGMEM = {
  0x00, 0x00,
  0x01, 0x00,
  0x03, 0x00,
  0x37, 0xB0,
  0x23, 0x10,
  0x20, 0x10,
  0x20, 0x70,
  0x11, 0xE0,
  0x1F, 0xE0,
  0x1F, 0xE0,
  0x1F, 0xC0,
  0x1F, 0xC0,
  0x1F, 0xC0,
  0x00, 0x00,
};
static const uint8_t STABILITY_MOTION_ICON[] PROGMEM = {
  0x00, 0x00,
  0x02, 0x00,
  0x07, 0x00,
  0x18, 0xC0,
  0x10, 0x40,
  0x20, 0xE0,
  0x63, 0xF0,
  0x3F, 0xF0,
  0x1F, 0xF0,
  0x1F, 0xF0,
  0x07, 0xC0,
  0x03, 0xC0,
  0x00, 0x00,
  0x00, 0x00,
};
void drawStabilityDebug() {
  String stabilityIndicator = "";
  if (weightUnstableActive) {
    stabilityIndicator += "(~)";
  }
  if (imuMotionActive) {
    stabilityIndicator += "(/)";
  }
  if (stabilityIndicator.length() == 0 && !hasImuDebug) {
    return;
  }

  display.setTextSize(1);
  String debugText = stabilityIndicator;
  if (hasImuDebug) {
    if (debugText.length() > 0) {
      debugText += " ";
    }
    debugText += "D:";
    debugText += imuAccelDeltaMg;
  }
  int16_t x1 = 0;
  int16_t y1 = 0;
  uint16_t w = 0;
  uint16_t h = 0;
  display.getTextBounds(debugText, 0, 0, &x1, &y1, &w, &h);
  int16_t x = w >= OLED_WIDTH ? 0 : OLED_WIDTH - w;
  display.setCursor(x, OLED_HEIGHT - 8);
  display.print(debugText);
}

void drawStabilityProduction() {
  if (buttonClickCount > 0) {
    return;
  }

  if (sensorStartupIndicatorActive) {
    display.setTextSize(1);
    display.setCursor(0, 0);
    display.print("(!)");
    return;
  }

  if (mainDisplayVisible && !hx711Ok) {
    return;
  }

  if (imuMotionActive) {
    display.drawBitmap(0, 1, STABILITY_MOTION_ICON, STABILITY_ICON_SIZE, STABILITY_ICON_SIZE, SSD1306_WHITE);
  } else if (weightUnstableActive) {
    display.drawBitmap(0, 1, STABILITY_WEIGHT_ICON, STABILITY_ICON_SIZE, STABILITY_ICON_SIZE, SSD1306_WHITE);
  }
}

void drawStabilityIndicator() {
  if (STABILITY_DISPLAY_MODE == STABILITY_DISPLAY_DEBUG) {
    drawStabilityDebug();
  } else {
    drawStabilityProduction();
  }
}

bool shouldShowDeviceWarningIndicator() {
  return deviceWarningActive &&
         (deviceWarningCode == "storage_not_ready" ||
          deviceWarningCode == "bottle_removed");
}

void drawModuleStatusIcon(int16_t &nextX, const uint8_t *icon) {
  nextX -= MODULE_ICON_SIZE + STATUS_ICON_GAP;
  display.drawBitmap(nextX, 3, icon, MODULE_ICON_SIZE, MODULE_ICON_SIZE, SSD1306_WHITE);
}

void drawBleStatusIndicator() {
  bool transferActive = bleTransferIndicatorActive();
  int16_t warningX = OLED_WIDTH - 18;
  int16_t transferX = shouldShowDeviceWarningIndicator()
                          ? warningX - STATUS_ICON_GAP - BLE_TRANSFER_ICON_WIDTH
                          : OLED_WIDTH - BLE_TRANSFER_ICON_WIDTH;
  int16_t bleX = transferActive
                     ? transferX - STATUS_ICON_GAP - BLE_ICON_WIDTH
                     : (shouldShowDeviceWarningIndicator() ? warningX - BLE_ICON_WIDTH - STATUS_ICON_GAP : OLED_WIDTH - BLE_ICON_WIDTH);
  display.drawBitmap(bleX, 0, bleConnected ? BLE_CONNECTED_ICON : BLE_DISCONNECTED_ICON, BLE_ICON_WIDTH, BLE_ICON_HEIGHT, SSD1306_WHITE);

  if (transferActive) {
    const uint8_t *transferIcon = bleTransferIndicator == BLE_TRANSFER_SEND ? BLE_SEND_ICON : BLE_RECEIVE_ICON;
    display.drawBitmap(transferX, 1, transferIcon, BLE_TRANSFER_ICON_WIDTH, BLE_TRANSFER_ICON_HEIGHT, SSD1306_WHITE);
  }

  int16_t nextX = bleX;
  if (!rtcOk) {
    drawModuleStatusIcon(nextX, RTC_NOT_READY_ICON);
  }
  if (!storageOk) {
    drawModuleStatusIcon(nextX, SD_NOT_READY_ICON);
  }
  if (!bmiOk) {
    drawModuleStatusIcon(nextX, BMI160_NOT_READY_ICON);
  }
}

void refreshBleStatusIndicator() {
  if (!displayOk || (!mainDisplayVisible && !bleSyncMode)) {
    return;
  }

  display.fillRect(BLE_STATUS_AREA_X, 0, OLED_WIDTH - BLE_STATUS_AREA_X, BLE_ICON_HEIGHT, SSD1306_BLACK);
  drawBleStatusIndicator();
  if (mainDisplayVisible && !bottleRemovedDisplayVisible && shouldShowDeviceWarningIndicator()) {
    display.setTextSize(1);
    display.setCursor(OLED_WIDTH - 18, 0);
    display.print("(!)");
  }
  display.display();
}

void serviceBleTransferIndicator() {
  if (bleTransferIndicator == BLE_TRANSFER_NONE) {
    return;
  }

  bool expired = !bleTransferIndicatorActive();
  if (!bleTransferIndicatorRefreshPending && !expired) {
    return;
  }

  if (expired) {
    bleTransferIndicator = BLE_TRANSFER_NONE;
  }
  bleTransferIndicatorRefreshPending = false;
  refreshBleStatusIndicator();
}

bool buttonClickIndicatorActive() {
  return mainDisplayVisible && buttonClickCount > 0 && lastButtonClickMs != 0;
}

bool hx711StabilizingIndicatorActive() {
  return mainDisplayVisible && !hx711Ok && !buttonClickIndicatorActive();
}

void drawButtonClickIndicator() {
  if (!buttonClickIndicatorActive()) {
    return;
  }

  display.fillRect(0, 0, BUTTON_CLICK_INDICATOR_WIDTH, BUTTON_CLICK_INDICATOR_HEIGHT, SSD1306_BLACK);
  display.drawBitmap(0, 0, BUTTON_ICON, BUTTON_ICON_SIZE, BUTTON_ICON_SIZE, SSD1306_WHITE);
  display.setTextSize(1);
  display.setCursor(BUTTON_ICON_SIZE + 3, 0);
  display.print(buttonClickCount);

  uint32_t elapsedMs = millis() - lastButtonClickMs;
  uint32_t remainingMs = elapsedMs >= BUTTON_FAST_PRESS_INTERVAL_MS ? 0 : BUTTON_FAST_PRESS_INTERVAL_MS - elapsedMs;
  uint8_t width = (uint8_t)((remainingMs * BUTTON_CLICK_INDICATOR_WIDTH + BUTTON_FAST_PRESS_INTERVAL_MS - 1) / BUTTON_FAST_PRESS_INTERVAL_MS);
  if (width > BUTTON_CLICK_INDICATOR_WIDTH) {
    width = BUTTON_CLICK_INDICATOR_WIDTH;
  }
  if (width > 0) {
    display.fillRect(0, BUTTON_ICON_SIZE + 2, width, 2, SSD1306_WHITE);
  }
}

void drawHx711StabilizingIndicator() {
  if (!hx711StabilizingIndicatorActive()) {
    return;
  }

  display.fillRect(0, 0, HX711_STABILIZING_INDICATOR_WIDTH, HX711_STABILIZING_INDICATOR_HEIGHT, SSD1306_BLACK);
  if (((millis() / HX711_STABILIZING_BLINK_MS) % 2U) != 0U) {
    return;
  }

  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("Menstabilkan");
  display.print("sensor...");
}

void clearCountdownBar() {
  display.fillRect(0, OLED_HEIGHT - COUNTDOWN_BAR_HEIGHT, OLED_WIDTH, COUNTDOWN_BAR_HEIGHT, SSD1306_BLACK);
}

void drawCountdownBar(uint32_t startedMs, uint32_t durationMs) {
  clearCountdownBar();
  if (startedMs == 0 || durationMs == 0) {
    return;
  }

  uint32_t elapsedMs = millis() - startedMs;
  uint32_t remainingMs = elapsedMs >= durationMs ? 0 : durationMs - elapsedMs;
  uint16_t width = (uint16_t)((remainingMs * OLED_WIDTH + durationMs - 1) / durationMs);
  if (width > OLED_WIDTH) {
    width = OLED_WIDTH;
  }
  if (width > 0) {
    display.fillRect(0, OLED_HEIGHT - COUNTDOWN_BAR_HEIGHT, width, COUNTDOWN_BAR_HEIGHT, SSD1306_WHITE);
  }
}

bool drawActiveCountdownBar() {
  if (mainDisplayVisible && sleepAfterStableReadArmed) {
    drawCountdownBar(stableSensorReadMs, SLEEP_AFTER_STABLE_READ_MS);
    return true;
  }
  if (deviceWarningDisplayVisible) {
    drawCountdownBar(deviceWarningDisplayShownMs, DEVICE_WARNING_VIEW_TIMEOUT_MS);
    return true;
  }
  if (intakeViewPosition != 0) {
    drawCountdownBar(intakeViewLastActionMs, INTAKE_VIEW_TIMEOUT_MS);
    return true;
  }
  if (confirmationDisplayShownMs != 0) {
    drawCountdownBar(confirmationDisplayShownMs, DRINK_CONFIRMATION_DISPLAY_MS);
    return true;
  }
  if (resetSavedDataDisplayShownMs != 0) {
    drawCountdownBar(resetSavedDataDisplayShownMs, RESET_SAVED_DATA_VIEW_TIMEOUT_MS);
    return true;
  }

  clearCountdownBar();
  return false;
}

void serviceCountdownBar() {
  if (!displayOk) {
    return;
  }

  uint32_t now = millis();
  if (buttonClickIndicatorActive()) {
    if (lastCountdownBarUpdateMs != 0 && (uint32_t)(now - lastCountdownBarUpdateMs) < BUTTON_CLICK_BAR_REFRESH_MS) {
      return;
    }
    drawButtonClickIndicator();
    lastCountdownBarUpdateMs = now;
    display.display();
    return;
  }

  if (hx711StabilizingIndicatorActive()) {
    if (lastCountdownBarUpdateMs != 0 && (uint32_t)(now - lastCountdownBarUpdateMs) < COUNTDOWN_BAR_REFRESH_MS) {
      return;
    }
    drawHx711StabilizingIndicator();
    lastCountdownBarUpdateMs = now;
    display.display();
    return;
  }

  if (lastCountdownBarUpdateMs != 0 && (uint32_t)(now - lastCountdownBarUpdateMs) < COUNTDOWN_BAR_REFRESH_MS) {
    return;
  }

  bool active = drawActiveCountdownBar();
  if (!active && lastCountdownBarUpdateMs == 0) {
    return;
  }

  lastCountdownBarUpdateMs = active ? now : 0;
  display.display();
}

void showMainDisplay() {
  if (!displayOk) {
    return;
  }

  clearSecondaryDisplayReturn();
  mainDisplayVisible = true;
  bottleRemovedDisplayVisible = false;
  deviceWarningDisplayVisible = false;
  resetSavedDataDisplayShownMs = 0;
  display.ssd1306_command(SSD1306_DISPLAYON);
  display.clearDisplay();
  drawBleStatusIndicator();
  if (shouldShowDeviceWarningIndicator()) {
    display.setTextSize(1);
    display.setCursor(OLED_WIDTH - 18, 0);
    display.print("(!)");
  }
  drawButtonClickIndicator();
  String amountText;
  if (hasCurrentWeight || hasLastStableWeight) {
    float remainingG = hasCurrentWeight ? currentWeightG : lastStableWeightG;
    int32_t remainingMl = (int32_t)round(remainingG);
    if (remainingMl < 0) {
      remainingMl = 0;
    }
    amountText = String(remainingMl);
  } else {
    amountText = "--";
  }

  const String unitText = "mL";
  uint8_t amountTextSize = 3;
  uint8_t unitTextSize = 2;
  int16_t amountX1 = 0;
  int16_t amountY1 = 0;
  int16_t unitX1 = 0;
  int16_t unitY1 = 0;
  uint16_t amountW = 0;
  uint16_t amountH = 0;
  uint16_t unitW = 0;
  uint16_t unitH = 0;

  display.setTextSize(unitTextSize);
  display.getTextBounds(unitText, 0, 0, &unitX1, &unitY1, &unitW, &unitH);
  display.setTextSize(amountTextSize);
  display.getTextBounds(amountText, 0, 0, &amountX1, &amountY1, &amountW, &amountH);
  if (amountW + unitW + 4 > OLED_WIDTH) {
    amountTextSize = 2;
    unitTextSize = 1;
    display.setTextSize(unitTextSize);
    display.getTextBounds(unitText, 0, 0, &unitX1, &unitY1, &unitW, &unitH);
    display.setTextSize(amountTextSize);
    display.getTextBounds(amountText, 0, 0, &amountX1, &amountY1, &amountW, &amountH);
  }

  int16_t unitX = OLED_WIDTH - unitW;
  int16_t amountX = unitX - 4 - amountW;
  if (amountX < 0) {
    amountX = 0;
  }
  display.setTextSize(amountTextSize);
  display.setCursor(amountX, 28);
  display.print(amountText);
  display.setTextSize(unitTextSize);
  display.setCursor(unitX, amountTextSize == 3 ? 36 : 40);
  display.print(unitText);
  drawStabilityIndicator();
  drawHx711StabilizingIndicator();
  drawActiveCountdownBar();
  display.display();
}

void showBottleRemovedDisplay() {
  clearSecondaryDisplayReturn();
  mainDisplayVisible = true;
  bottleRemovedDisplayVisible = true;
  deviceWarningDisplayVisible = false;
  if (!displayOk) {
    return;
  }

  display.ssd1306_command(SSD1306_DISPLAYON);
  display.clearDisplay();
  drawBleStatusIndicator();
  display.setTextSize(1);
  printCenteredText("Tidak Ada Botol", 18, 1);
  printCenteredText(String("Hari ini ") + String(todayTotalMl) + " mL", 38, 1);
  drawStabilityIndicator();
  display.display();
}

void showDrinkSavedDisplay(uint16_t amountMl) {
  markSecondaryDisplayVisible();
  confirmationDisplayShownMs = millis();
  if (!displayOk) {
    return;
  }

  display.ssd1306_command(SSD1306_DISPLAYON);
  display.clearDisplay();
  printCenteredText("Minum", 12, 2);
  printCenteredText(String(amountMl) + " mL", 38, 2);
  drawActiveCountdownBar();
  display.display();
}

void showRefillSavedDisplay(uint16_t amountMl) {
  markSecondaryDisplayVisible();
  confirmationDisplayShownMs = millis();
  if (!displayOk) {
    return;
  }

  display.ssd1306_command(SSD1306_DISPLAYON);
  display.clearDisplay();
  printCenteredText("Isi Ulang", 12, 2);
  printCenteredText(String(amountMl) + " mL", 38, 2);
  drawActiveCountdownBar();
  display.display();
}

void showFinalizationStatus(const String &line1, const String &line2) {
  markSecondaryDisplayVisible();
  confirmationDisplayShownMs = millis();
  if (!displayOk) {
    return;
  }

  display.ssd1306_command(SSD1306_DISPLAYON);
  display.clearDisplay();
  printCenteredText(line1, 12, 2);
  printCenteredText(line2, 38, 1);
  drawActiveCountdownBar();
  display.display();
}

void showTodayIntakeDisplay() {
  markSecondaryDisplayVisible();
  if (!displayOk) {
    return;
  }

  display.ssd1306_command(SSD1306_DISPLAYON);
  display.clearDisplay();
  display.setCursor(0, 0);
  display.setTextSize(1);
  display.println("Today intake");
  display.println();
  display.setTextSize(3);
  display.print(todayTotalMl);
  display.setTextSize(2);
  display.println(" mL");
  drawActiveCountdownBar();
  display.display();
}

void showIntakeRecordDisplay(uint16_t ordinal, uint16_t amountMl, uint32_t timestamp, const String &type) {
  markSecondaryDisplayVisible();
  if (!displayOk) {
    return;
  }

  DateTime dt = localDateTimeFromUtcEpoch(timestamp);
  char timeBuf[18];
  snprintf(timeBuf, sizeof(timeBuf), "%02u-%02u %02u:%02u", (unsigned)dt.day(), (unsigned)dt.month(), (unsigned)dt.hour(), (unsigned)dt.minute());

  display.ssd1306_command(SSD1306_DISPLAYON);
  display.clearDisplay();
  display.setCursor(0, 0);
  display.setTextSize(1);
  display.print(type == "refill" ? "Isi Ulang #" : "Minum #");
  display.println(ordinal);
  display.println();
  display.setTextSize(2);
  display.print(amountMl);
  display.println(" mL");
  display.setTextSize(1);
  display.println(timeBuf);
  drawActiveCountdownBar();
  display.display();
}

void showIntakeUnavailableDisplay(const String &reason) {
  markSecondaryDisplayVisible();
  if (!displayOk) {
    return;
  }

  display.ssd1306_command(SSD1306_DISPLAYON);
  display.clearDisplay();
  display.setCursor(0, 0);
  display.setTextSize(1);
  display.println("Today intake");
  display.println();
  display.println(reason);
  drawActiveCountdownBar();
  display.display();
}

void showTimeSyncDisplay(const DateTime &dt) {
  markSecondaryDisplayVisible();
  if (!displayOk) {
    return;
  }

  char dateBuf[11];
  char timeBuf[6];
  snprintf(dateBuf, sizeof(dateBuf), "%02u-%02u-%04u", (unsigned)dt.day(), (unsigned)dt.month(), (unsigned)dt.year());
  snprintf(timeBuf, sizeof(timeBuf), "%02u:%02u", (unsigned)dt.hour(), (unsigned)dt.minute());

  display.ssd1306_command(SSD1306_DISPLAYON);
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("Time synced");
  display.println();
  display.setTextSize(2);
  display.println(dateBuf);
  display.println(timeBuf);
  display.display();
}

void showCalibrationStatus(const String &hint) {
  markSecondaryDisplayVisible();
  if (!displayOk) {
    return;
  }

  bool waitingForPress = hint == "Press once for tare" || hint == "Add 250g, press once";

  display.ssd1306_command(SSD1306_DISPLAYON);
  display.clearDisplay();
  display.setTextSize(1);
  display.setCursor(0, 0);
  display.println("Calibration");
  display.println();
  display.print("Weight ");
  if (hasCurrentWeight) {
    display.print(currentWeightG, 1);
    display.println(" g");
  } else {
    display.println("-- g");
  }
  display.print("Stable ");
  if (hasCurrentWeight) {
    display.print((millis() - scaleStableSinceMs) / 1000.0f, 1);
    display.println(" s");
  } else {
    display.println("-- s");
  }
  if (waitingForPress) {
    display.println("Stable after press");
  } else {
    display.println(scaleStable ? "Scale stable" : "Keep bottle still");
  }
  display.println(hint);
  display.display();
}

void turnDisplayOff() {
  mainDisplayVisible = false;
  deviceWarningDisplayVisible = false;
  if (displayOk) {
    display.ssd1306_command(SSD1306_DISPLAYOFF);
  }
}
