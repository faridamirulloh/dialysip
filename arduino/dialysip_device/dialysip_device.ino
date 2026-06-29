/*
  DialySip firmware prototype

  Target board: ESP32-C3 Super Mini
  Wake system: GY-BMI160 INT1 on GPIO3 + external active-low button on GPIO2
  Intake sensor: Load cell + HX711
  Display: 128x64 SSD1306-compatible OLED
  RTC: DS1302 module through a 3-wire DAT/CLK/RST interface
  Storage: ESP32 LittleFS internal flash
  BLE: ESP32 Arduino BLEDevice GATT server

  This is a bring-up firmware, not final medical-device software.
  Verify every pin and module voltage before powering the circuit.
*/

#include <Arduino.h>
#include <Wire.h>
#include <LittleFS.h>
#include <Preferences.h>
#include <RTClib.h> // DateTime helper only; DS1302 access is bit-banged below.
#include <Adafruit_GFX.h>
#include <Adafruit_SSD1306.h>
#include <BLEDevice.h>
#include <BLEServer.h>
#include <BLEUtils.h>
#include <BLE2902.h>
#include "esp_sleep.h"
#include "driver/gpio.h"

// -------------------- Pin plan --------------------

static constexpr uint8_t PIN_I2C_SDA = 0;
static constexpr uint8_t PIN_I2C_SCL = 1;
static constexpr uint8_t PIN_MOTION_WAKE = 3;
static constexpr uint8_t PIN_WAKE_BUTTON = 2;

static constexpr uint8_t PIN_BATTERY_ADC = 4;
static constexpr uint8_t PIN_CHARGER_DETECT = 6;

static constexpr uint8_t PIN_HX711_DOUT = 10;
static constexpr uint8_t PIN_HX711_SCK = 20;

static constexpr uint8_t PIN_DS1302_CLK = 8;
static constexpr uint8_t PIN_DS1302_DAT = 9;
static constexpr uint8_t PIN_DS1302_RST = 21;

// Optional power-gate pins. Set to a real GPIO if you add load switches.
static constexpr int8_t PIN_OLED_POWER = -1;
static constexpr int8_t PIN_HX711_POWER = -1;

static constexpr uint8_t BATTERY_ADC_SAMPLES = 16;
static constexpr uint16_t BATTERY_EMPTY_MV = 3300;
static constexpr uint16_t BATTERY_FULL_MV = 4200;
static constexpr uint8_t BATTERY_DIVIDER_RATIO = 2; // Equal-value divider, e.g. 40k/40k or 100k/100k.
static constexpr uint8_t BATTERY_FILTER_NUMERATOR = 1;
static constexpr uint8_t BATTERY_FILTER_DENOMINATOR = 8;
static constexpr uint16_t BATTERY_PERCENT_UPDATE_MV = 20;

// -------------------- Device settings --------------------

static constexpr char DEVICE_NAME[] = "DialySip-003";
static constexpr char FIRMWARE_VERSION[] = "0.1.0";
static constexpr char LOG_FILE[] = "/dialysip.jsonl";
static constexpr char LOG_TMP_FILE[] = "/dialysip.tmp";
static constexpr uint8_t BLE_PROTOCOL_VERSION = 1;

static constexpr uint8_t OLED_WIDTH = 128;
static constexpr uint8_t OLED_HEIGHT = 64;
static constexpr uint8_t OLED_RESET = 255;
static constexpr uint8_t OLED_ADDRESS = 0x3C;

static constexpr uint8_t BMI160_ADDRESS = 0x69;
static constexpr uint8_t BMI160_CHIP_ID = 0xD1;
static constexpr uint8_t BMI160_ANY_MOTION_THRESHOLD = 0x20;
static constexpr int16_t IMU_STABLE_DELTA_MG = 30;
enum StabilityDisplayMode : uint8_t {
  STABILITY_DISPLAY_PRODUCTION,
  STABILITY_DISPLAY_DEBUG
};
static constexpr StabilityDisplayMode STABILITY_DISPLAY_MODE = STABILITY_DISPLAY_PRODUCTION;

static constexpr float DEFAULT_CALIBRATION_FACTOR = 1000.0f; // Raw HX711 units per gram. Must be calibrated.
static constexpr float STABLE_VARIATION_G = 3.0f;
static constexpr uint32_t STABLE_TIMEOUT_MS = 9000;
static constexpr uint8_t STABLE_WINDOW_SAMPLES = 8;
static constexpr uint8_t UNSTABLE_WEIGHT_WARNING_COUNT = 2;
static constexpr float BOTTLE_REMOVED_THRESHOLD_G = -100.0f;
static constexpr uint8_t BOTTLE_REMOVED_STABLE_COUNT_LIMIT = 3;
static constexpr uint32_t DRINK_CONFIRMATION_DISPLAY_MS = 5000;
static constexpr uint32_t LIVE_WEIGHT_STABLE_MS = 2000;
static constexpr uint32_t MAIN_DISPLAY_LIVE_UPDATE_MS = 100;
static constexpr uint32_t CALIBRATION_DISPLAY_INTERVAL_MS = 800;
static constexpr uint16_t PRE_SLEEP_TOTAL_DISPLAY_MS = 2000;
static constexpr uint16_t DEFAULT_DAILY_LIMIT_ML = 1000;
static constexpr uint16_t DEFAULT_DRINK_THRESHOLD_ML = 10;
static constexpr uint16_t DEFAULT_REFILL_THRESHOLD_ML = 10;
static constexpr uint16_t DEFAULT_CUP_WEIGHT_TENTHS_G = 525;
static constexpr uint16_t DEFAULT_CUP_TOLERANCE_TENTHS_G = 30;
static constexpr uint8_t DEFAULT_WARNING_PERCENT = 80;
static constexpr uint16_t DEFAULT_OLED_TIMEOUT_SECONDS = 15;
static constexpr uint16_t DEFAULT_BLE_WINDOW_SECONDS = 60;
static constexpr uint16_t DEFAULT_STABLE_SAVE_SECONDS = 60;
static constexpr uint16_t DEFAULT_HISTORY_RETENTION_DAYS = 10;
static constexpr int16_t DEFAULT_TIMEZONE_OFFSET_MINUTES = 420; // GMT+7 fallback when the app does not send a phone offset.
static constexpr uint16_t BUTTON_DEBOUNCE_MS = 40;
static constexpr uint16_t BUTTON_FAST_PRESS_INTERVAL_MS = 700;
static constexpr uint16_t BUTTON_HOLD_EXIT_MS = 2000;
static constexpr uint16_t INTAKE_VIEW_TIMEOUT_MS = 5000;
static constexpr uint16_t DEVICE_WARNING_VIEW_TIMEOUT_MS = 5000;
static constexpr uint16_t RESET_SAVED_DATA_VIEW_TIMEOUT_MS = 5000;
static constexpr uint8_t SYNC_BUTTON_CLICKS = 3;
static constexpr uint8_t CALIBRATION_BUTTON_CLICKS = 5;
static constexpr uint8_t RESET_DAILY_BUTTON_CLICKS = 7;
static constexpr uint16_t CALIBRATION_KNOWN_WEIGHT_G = 600;
static constexpr uint16_t CALIBRATION_SETTLE_DELAY_MS = 3000;
static constexpr uint32_t APP_HEARTBEAT_INTERVAL_MS = 10000;
static constexpr uint8_t APP_HEARTBEAT_MISSED_LIMIT = 3;
static constexpr uint32_t APP_HEARTBEAT_TIMEOUT_MS = APP_HEARTBEAT_INTERVAL_MS * APP_HEARTBEAT_MISSED_LIMIT;

// BLE UUIDs are custom v1 UUIDs. Keep them stable for the Android app.
static constexpr char BLE_SERVICE_UUID[] = "3f4f1000-9d9a-4a5f-8f13-102a2d4d1000";
static constexpr char BLE_STATUS_UUID[] = "3f4f1001-9d9a-4a5f-8f13-102a2d4d1000";
static constexpr char BLE_SETTINGS_UUID[] = "3f4f1002-9d9a-4a5f-8f13-102a2d4d1000";
static constexpr char BLE_TIME_SYNC_UUID[] = "3f4f1003-9d9a-4a5f-8f13-102a2d4d1000";
static constexpr char BLE_COMMAND_UUID[] = "3f4f1004-9d9a-4a5f-8f13-102a2d4d1000";
static constexpr char BLE_LOG_UUID[] = "3f4f1005-9d9a-4a5f-8f13-102a2d4d1000";
static constexpr char BLE_ACK_UUID[] = "3f4f1006-9d9a-4a5f-8f13-102a2d4d1000";


#include "01_ds1302.h"
#include "02_globals.h"
#include "03_forward_declarations.h"
#include "04_utility.h"
#include "05_hx711.h"
#include "06_bmi160.h"
#include "07_ble_callbacks.h"
#include "08_settings_storage.h"
#include "09_display.h"
#include "10_storage_records.h"
#include "11_weight_calibration.h"
#include "12_ble.h"
#include "13_button_sleep.h"
#include "14_setup_loop.h"
