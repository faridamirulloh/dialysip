// -------------------- Global state --------------------

Preferences prefs;
DS1302Rtc rtc;
Adafruit_SSD1306 display(OLED_WIDTH, OLED_HEIGHT, &Wire, OLED_RESET);

bool rtcOk = false;
bool storageOk = false;
bool displayOk = false;
bool bmiOk = false;
bool hx711Ok = false;
bool bleStarted = false;
bool bleConnected = false;
bool bleSyncMode = false;
enum BleTransferIndicator : uint8_t {
  BLE_TRANSFER_NONE,
  BLE_TRANSFER_SEND,
  BLE_TRANSFER_RECEIVE
};
volatile BleTransferIndicator bleTransferIndicator = BLE_TRANSFER_NONE;

String deviceId;
float calibrationFactor = DEFAULT_CALIBRATION_FACTOR;
float tareOffset = 0.0f;
float lastStableWeightG = 0.0f;
float currentWeightG = 0.0f;
bool hasLastStableWeight = false;
bool hasCurrentWeight = false;
bool scaleStable = false;
bool stableWeightFinalized = false;
bool weightUnstableActive = false;
bool imuMotionActive = false;
bool sensorStartupIndicatorActive = false;
bool hasImuDebug = false;
int16_t imuAccelOffsetMg = 0;
int16_t imuAccelDeltaMg = 0;
int16_t lastImuAccelXMg = 0;
int16_t lastImuAccelYMg = 0;
int16_t lastImuAccelZMg = 0;
bool calibrationMode = false;
bool calibrationTareSaved = false;
bool deviceWarningActive = false;
String deviceWarningCode = "";
String deviceWarningMessage = "";
uint8_t deviceWarningPriority = 0;
bool mainDisplayVisible = false;
bool bottleRemovedDisplayVisible = false;
bool deviceWarningDisplayVisible = false;
volatile bool bootLoadingActive = false;
volatile bool bootLoadingTaskRunning = false;
uint8_t bootLoadingFrame = 0;
TaskHandle_t bootLoadingTaskHandle = nullptr;
SemaphoreHandle_t i2cBusMutex = nullptr;
enum CalibrationStep : uint8_t {
  CALIBRATION_IDLE,
  CALIBRATION_WAIT_TARE,
  CALIBRATION_WAIT_WEIGHT,
  CALIBRATION_LIVE_WEIGHT
};
CalibrationStep calibrationStep = CALIBRATION_IDLE;
uint32_t recordId = 0;
String lastRecordId = "";
String lastSyncId = "";
uint32_t todayKey = 0;
uint32_t todayTotalMl = 0;
uint16_t dailyLimitMl = DEFAULT_DAILY_LIMIT_ML;
uint16_t drinkThresholdMl = DEFAULT_DRINK_THRESHOLD_ML;
uint16_t refillThresholdMl = DEFAULT_REFILL_THRESHOLD_ML;
uint16_t cupWeightTenthsG = DEFAULT_CUP_WEIGHT_TENTHS_G;
uint16_t cupToleranceTenthsG = DEFAULT_CUP_TOLERANCE_TENTHS_G;
uint8_t warningPercent = DEFAULT_WARNING_PERCENT;
uint16_t oledTimeoutSeconds = DEFAULT_OLED_TIMEOUT_SECONDS;
uint16_t bleWindowSeconds = DEFAULT_BLE_WINDOW_SECONDS;
uint16_t stableSaveSeconds = DEFAULT_STABLE_SAVE_SECONDS;
uint16_t historyRetentionDays = DEFAULT_HISTORY_RETENTION_DAYS;
int16_t timezoneOffsetMinutes = DEFAULT_TIMEZONE_OFFSET_MINUTES;

uint32_t lastStatusNotifyMs = 0;
uint32_t lastAppBleActivityMs = 0;
uint32_t scaleStableSinceMs = 0;
uint32_t lastMainDisplayLiveUpdateMs = 0;
uint32_t lastCountdownBarUpdateMs = 0;
uint32_t lastCalibrationDisplayMs = 0;
uint32_t confirmationDisplayShownMs = 0;
uint32_t deviceWarningDisplayShownMs = 0;
uint32_t resetSavedDataDisplayShownMs = 0;
uint32_t secondaryDisplayShownMs = 0;
uint32_t secondaryDisplayTimeoutMs = 0;
volatile uint32_t bleTransferIndicatorStartedMs = 0;
volatile bool bleTransferIndicatorRefreshPending = false;
uint32_t stableSensorReadMs = 0;
bool sleepAfterStableReadArmed = false;
uint8_t unstableWeightFailures = 0;
uint8_t bottleRemovedStableCycles = 0;
bool cupGuardActive = false;
String lastEventType = "boot";
uint16_t lastEventAmountMl = 0;
bool buttonStablePressed = false;
bool buttonLastRawPressed = false;
bool buttonHoldHandled = false;
uint8_t buttonClickCount = 0;
uint32_t buttonLastRawChangeMs = 0;
uint32_t buttonPressedSinceMs = 0;
uint32_t lastButtonClickMs = 0;
uint16_t intakeViewPosition = 0;
uint32_t intakeViewLastActionMs = 0;

BLECharacteristic *statusCharacteristic = nullptr;
BLECharacteristic *settingsCharacteristic = nullptr;
BLECharacteristic *logCharacteristic = nullptr;

