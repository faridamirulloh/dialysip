# DialySip Dialysis Water Intake Tracker Plan

## 1. Project Goal

Build a smart bottle system for a dialysis patient to track daily fluid intake.

The system has two main parts:

- An ESP32-C3 Super Mini bottle device that measures bottle weight, detects drinking/refill events, stores local logs, shows status on OLED, and syncs through BLE.
- A React Native Android app that connects over Bluetooth, monitors current intake, stores history locally, allows manual fluid entries, and shows warnings near or over the configured daily fluid limit.

Important medical boundary: this system is a tracking aid only. It must not give medical treatment decisions. Daily fluid limits should be configured based on doctor or clinic guidance.

## 2. Confirmed Hardware

### Main Controller

- ESP32-C3 Super Mini development board.
- BLE capable.
- Compact, but limited GPIO availability.
- Needs careful pin planning because some pins are boot strapping pins.

### Sensors And Modules

- Load cell + HX711 for bottle weight measurement.
- GY-BMI160 / BMI160 accelerometer module for low-power movement wake.
- Physical button for manual wake, status view, and BLE sync/pairing.
- microSD module for local device log storage.
- RTC module for timekeeping.
- JMD0.96 OLED display for device status.
- Rechargeable battery power system.

## 3. Recommended Wiring Plan

This pin plan is a starting point and must be verified against the exact ESP32-C3 Super Mini board silkscreen before wiring.

```text
I2C bus:
GPIO0 = SDA
GPIO1 = SCL
Devices on I2C: OLED, RTC, GY-BMI160

Wake:
GPIO3 = shared wake line from BMI160 INT1 + button

microSD SPI:
GPIO4 = SCK
GPIO5 = MISO
GPIO6 = MOSI
GPIO7 = CS

HX711:
GPIO10 = DOUT
GPIO20 = SCK
```

Avoid using these pins for external modules unless the exact board behavior has been verified:

- `GPIO2`
- `GPIO8`
- `GPIO9`

Reason: ESP32-C3 uses `GPIO2`, `GPIO8`, and `GPIO9` as strapping pins. Many ESP32-C3 Super Mini boards also use `GPIO8` or `GPIO9` for onboard LED / BOOT behavior.

## 4. I2C Address Plan

Expected addresses:

```text
RTC    = usually 0x68
OLED   = usually 0x3C
BMI160 = set to 0x69 if possible
```

The BMI160 must not conflict with the RTC. If the RTC uses `0x68`, configure the GY-BMI160 address pin so BMI160 uses `0x69`.

## 5. Wake And Power-Saving Design

Target battery life: 1 week or more.

The device should spend most of its time sleeping.

### Wake Sources

- BMI160 movement interrupt wakes the ESP32-C3 when the bottle is moved.
- Physical button wakes the device manually.
- Optional RTC/timer wake can be used for periodic health checks.

### Recommended Wake Wiring

Use one shared active-low wake line:

```text
ESP32-C3 GPIO3  <-- BMI160 INT1
ESP32-C3 GPIO3  <-- Button to GND
GPIO3 pull-up   <-- 3.3V through 10k-100k resistor
```

Configure BMI160 `INT1` as:

- Output enabled.
- Open-drain.
- Active-low.
- Latched interrupt.
- Any-motion interrupt mapped to `INT1`.

This lets either the BMI160 or the button pull `GPIO3` low and wake the ESP32-C3.

After wake:

- If the button is still pressed, treat the wake reason as button wake.
- If BMI160 interrupt status is set, treat it as movement wake.
- Clear the BMI160 interrupt latch before sleeping again.

### Deep Sleep State

In deep sleep:

- ESP32-C3 is sleeping.
- BLE is off.
- OLED is off.
- HX711 is off or idle.
- microSD is off or idle.
- BMI160 stays powered in low-power accelerometer mode.
- RTC remains powered.
- Button and BMI160 interrupt can wake the ESP32-C3.

### Active State

After waking:

- ESP32-C3 reads the wake reason.
- BMI160 interrupt is checked and cleared.
- HX711/load cell is powered/read.
- Firmware waits for stable weight.
- Drink/refill/no-change/suspicious event is detected.
- Event is saved to microSD.
- OLED turns on briefly.
- BLE advertising starts only if needed.
- Device returns to sleep after timeout.

### OLED Power Saving

- OLED is normally off.
- OLED turns on after wake, drink event, warning, or button press.
- OLED timeout should be around 10-20 seconds.

### BLE Power Saving

- BLE should not advertise all day at full speed.
- Fast advertise for 30-60 seconds after button wake or important event.
- Use slower advertising briefly after that.
- Stop BLE before deep sleep.
- Android app reconnects later and syncs missed records.

### Important Power Warning

The ESP32-C3 chip can sleep at low current, but development boards often consume much more because of:

- Power LEDs.
- USB-UART chips.
- Inefficient voltage regulators.
- Pull-up resistors.
- Sensor module LEDs.

For 1 week or more battery life, measure actual current of the full device.

If the GY-BMI160 module has a power LED, remove or disable it.

## 6. Why BMI160 Is Used For Wake

The load cell should not be the main wake indicator.

Reason:

- A load cell is passive and cannot wake the ESP32 by itself.
- HX711 `DOUT` indicates ADC data ready, not real bottle movement.
- If HX711 data-ready is used as wake, it can wake the ESP repeatedly even when nothing meaningful happened.

Better design:

- BMI160 detects movement at low power.
- ESP32 wakes.
- Load cell confirms the actual amount of weight change.
- Firmware decides whether the event was drinking, refill, no change, or suspicious change.

## 7. Firmware Architecture

### Main Firmware Modules

```text
PowerManager
MotionManager
WeightManager
DrinkDetector
StorageManager
RtcManager
BleManager
DisplayManager
SettingsManager
DiagnosticsManager
```

### PowerManager

Responsibilities:

- Configure wake sources.
- Enter deep sleep.
- Detect wake reason.
- Manage OLED timeout.
- Manage BLE advertising window.
- Track battery state.
- Enter low-battery protection mode.

### MotionManager

Responsibilities:

- Initialize BMI160.
- Configure low-power accelerometer mode.
- Disable/suspend gyroscope.
- Configure any-motion interrupt.
- Read BMI160 interrupt source.
- Clear latched interrupt before sleep.

### WeightManager

Responsibilities:

- Initialize HX711.
- Store calibration factor.
- Store tare offset.
- Read raw weight.
- Filter noisy readings.
- Detect stable weight.

Stable weight rule for v1:

- Sample around 10 Hz.
- Weight is stable when variation stays under about 3 g for about 2 seconds.

### DrinkDetector

Responsibilities:

- Compare previous stable weight with current stable weight.
- Convert grams to milliliters using `1 g = 1 ml` for water.
- Detect drink, refill, no-change, or suspicious change.

Suggested thresholds:

```text
Minimum drink detection: 10 ml decrease
Minimum refill detection: 50 ml increase
Stable variation: about 3 g
Stable duration: about 2 seconds
```

Event logic:

- Stable decrease >= 10 ml: `drink_auto`
- Stable increase >= 50 ml: `refill`
- Small change: `no_change`
- Large unstable change: `suspicious_change`

### StorageManager

Responsibilities:

- Save records to microSD.
- Use append-only log format.
- Support sync resume from `record_id`.
- Flush pending record before sleep.

Recommended file format:

- JSON Lines.
- One record per line.
- Easier to debug than binary for v1.

Example:

```json
{"record_id":1024,"timestamp_utc":1780000000,"type":"drink_auto","amount_ml":85,"weight_before_g":420,"weight_after_g":335,"confidence":"normal","flags":[],"battery_mv":3860,"device_id":"dialysip-001","firmware_version":"0.1.0"}
```

### RtcManager

Responsibilities:

- Read current time.
- Detect invalid RTC time.
- Accept phone time sync from Android app.
- Timestamp records.

If RTC time is invalid:

- Still log events.
- Mark records with `time_invalid` flag.
- Ask app to sync time at next connection.

### BleManager

Responsibilities:

- Advertise device as `DialySip`.
- Pair/connect with Android app.
- Send device status.
- Receive settings.
- Stream logs.
- Receive sync acknowledgement.
- Receive commands such as tare/calibrate.

### DisplayManager

Responsibilities:

- Show today total.
- Show remaining daily allowance.
- Show bottle volume estimate.
- Show battery level.
- Show BLE status.
- Show errors.
- Show warning near/over daily limit.

## 8. Firmware State Machine

```text
BOOT
  |
  v
INIT_HARDWARE
  |
  v
READ_WAKE_REASON
  |
  +--> BUTTON_WAKE
  |       |
  |       +--> short press: SHOW_STATUS
  |       +--> long press: BLE_SYNC_MODE
  |
  +--> MOTION_WAKE
  |       |
  |       v
  |   MEASURE_WEIGHT
  |       |
  |       v
  |   DETECT_EVENT
  |       |
  |       v
  |   SAVE_RECORD
  |       |
  |       v
  |   SHOW_STATUS
  |
  +--> TIMER_WAKE
          |
          v
      HEALTH_CHECK

SHOW_STATUS
  |
  v
IDLE_TIMEOUT
  |
  v
PREPARE_SLEEP
  |
  v
DEEP_SLEEP
```

## 9. Device Record Types

Use these record types:

```text
drink_auto
manual_sync_marker
refill
tare
calibration
no_change
suspicious_change
battery_event
device_error
time_sync
settings_update
```

Main intake records should include:

```text
record_id
timestamp_utc
type
amount_ml
weight_before_g
weight_after_g
confidence
flags
battery_mv
device_id
firmware_version
```

## 10. BLE Interface Plan

ESP32-C3 acts as BLE peripheral / GATT server.

Android app acts as BLE central / GATT client.

### BLE Characteristics

```text
status
settings
time_sync
command
log_stream
ack
```

### status

Read/notify:

```text
current_weight_g
today_total_ml
battery_mv
battery_percent
sd_ok
rtc_ok
sensor_ok
calibrated
firmware_version
last_record_id
```

### settings

Read/write:

```text
daily_limit_ml
warning_threshold_percent
over_limit_threshold_percent
oled_timeout_seconds
ble_advertise_seconds
drink_threshold_ml
refill_threshold_ml
```

### time_sync

Android writes:

```text
timestamp_utc
timezone_offset_minutes
```

### command

Android writes commands:

```text
tare
start_calibration
finish_calibration
request_sync
clear_error
factory_reset
```

### log_stream

ESP32 sends unsynced records in chunks.

Android requests records after last saved `record_id`.

### ack

Android writes the latest successfully saved `record_id`.

The ESP32 keeps older records on microSD, but can mark them as synced.

## 11. Android App Architecture

### Stack

- React Native.
- TypeScript.
- Android-only v1.
- `react-native-ble-plx` for BLE.
- SQLite for local storage.
- No cloud for v1.

### Core App Screens

```text
Pair Device
Calibration Wizard
Dashboard
Add Manual Intake
History
Record Detail
Settings
Diagnostics
```

### Pair Device

Responsibilities:

- Request Android BLE permissions.
- Scan for `DialySip`.
- Connect to bottle.
- Show pairing instructions.
- Sync phone time to RTC.
- Save device identity locally.

### Calibration Wizard

Steps:

1. Empty bottle tare.
2. Add known water amount, such as 250 ml.
3. Confirm measured weight.
4. Save calibration factor.
5. Validate with another amount if needed.

### Dashboard

Show:

- Today intake total.
- Daily fluid limit.
- Remaining allowance.
- Last drink amount/time.
- Manual entries total.
- Bottle connection status.
- Battery level.
- Last sync time.
- Near-limit or over-limit warning.

### Add Manual Intake

Patient can add fluid not consumed from the smart bottle:

- Tea.
- Soup.
- Medicine water.
- Outside drinks.
- Other fluid.

Fields:

```text
amount_ml
category
time
note
```

Manual entries count toward the daily total.

### History

Show:

- Daily totals.
- Weekly chart.
- Monthly overview.
- Auto vs manual records.
- Refill and suspicious event markers.

### Record Detail

Allow:

- Edit manual entry.
- Correct auto amount.
- Ignore false auto event.
- Restore ignored event.
- Add note.

### Settings

Allow:

- Daily fluid limit.
- Warning threshold.
- OLED timeout.
- BLE sync window.
- Device calibration.
- Data reset.

### Diagnostics

Show:

- Firmware version.
- Battery voltage.
- Last sync.
- Last record ID.
- RTC status.
- SD status.
- HX711 status.
- BMI160 status.
- Sleep/wake event history.

## 12. Android Local Data Model

### devices

```text
id
device_id
name
firmware_version
last_seen_at
last_synced_record_id
created_at
```

### intake_records

```text
id
device_id
record_id
source
type
amount_ml
timestamp_utc
local_date
weight_before_g
weight_after_g
confidence
flags_json
note
ignored
created_at
updated_at
```

`source` values:

```text
device_auto
manual_app
edited_auto
```

### device_events

```text
id
device_id
record_id
type
timestamp_utc
payload_json
created_at
```

### daily_summaries

```text
date
total_ml
auto_ml
manual_ml
ignored_ml
limit_ml
warning_state
updated_at
```

### app_settings

```text
daily_limit_ml
warning_threshold_percent
oled_timeout_seconds
ble_sync_window_seconds
timezone
```

## 13. Warning Rules

The app and device should show warnings but not medical advice.

Suggested warning states:

```text
normal
near_limit
over_limit
low_battery
device_error
```

Example app/OLED wording:

```text
Near daily limit
Over today's configured limit
Battery low
Sync needed
Calibration needed
```

Avoid wording like:

```text
You should drink more
You must stop drinking
Change your treatment
```

## 14. Development Milestones

### Milestone 1: Hardware Bench Test

Verify:

- ESP32-C3 Super Mini boots.
- OLED works on I2C.
- RTC works on I2C.
- BMI160 works on I2C.
- BMI160 address does not conflict with RTC.
- HX711 reads load cell values.
- microSD writes a test file.
- Button wakes or is readable.

### Milestone 2: Firmware MVP

Build:

- Button wake.
- HX711 read.
- Stable weight detection.
- OLED status display.
- microSD record write.

### Milestone 3: Movement Wake

Build:

- BMI160 low-power mode.
- BMI160 any-motion interrupt.
- ESP32-C3 deep sleep wake from `GPIO3`.
- Interrupt latch clear.
- Return to sleep after timeout.

### Milestone 4: Drink Detection

Build:

- Last stable weight storage.
- Drink/refill/no-change detection.
- Suspicious change flag.
- JSON Lines records.

### Milestone 5: BLE MVP

Build:

- BLE advertising.
- Android connection.
- Read status.
- Send time sync.
- Request log sync.
- Acknowledge saved records.

### Milestone 6: Android MVP

Build:

- Pair Device screen.
- Dashboard.
- Manual Intake screen.
- History screen.
- Settings screen.
- Local SQLite persistence.

### Milestone 7: Power Validation

Measure:

- Deep sleep current.
- BMI160 low-power current.
- OLED on/off current.
- HX711 active current.
- microSD write current.
- BLE advertising current.
- BLE connected current.

Calculate:

```text
Battery life hours = usable battery mAh / average current mA
```

### Milestone 8: End-To-End Test

Verify:

- Device logs intake while app is disconnected.
- App syncs missed records later.
- Daily total equals auto bottle records plus manual app records.
- Patient can correct false auto events.
- OLED and app show matching daily totals after sync.
- Low-battery behavior works.

## 15. Acceptance Criteria

The v1 system is acceptable when:

- Patient can use the bottle without the app being connected all day.
- Bottle wakes on movement or button.
- Device can detect and log drinking events.
- Device can detect refill events.
- Records survive power loss because they are saved to microSD.
- Android app can sync missed records.
- Android app can add manual fluid intake.
- Android app can edit or ignore incorrect automatic records.
- Daily total includes auto and manual entries.
- App and OLED warn near or over configured daily limit.
- Device can last close to the battery-life target based on measured current.

## 16. Key Risks

### False Intake Detection

Spills or pouring water out can look like drinking.

Mitigation:

- Mark suspicious events.
- Allow edit/ignore in Android app.
- Use BMI160 movement data only as wake trigger, not as intake proof.

### Battery Life Too Short

Development boards and modules may waste current.

Mitigation:

- Measure current early.
- Disable/remove module LEDs.
- Power-gate OLED, HX711, and microSD if needed.
- Keep BLE off during deep sleep.

### I2C Address Conflict

RTC and BMI160 may both use `0x68`.

Mitigation:

- Set BMI160 to `0x69`.
- Scan I2C bus during hardware test.

### microSD Power Use

microSD can draw significant current.

Mitigation:

- Only power/init microSD when writing or syncing.
- Flush records before sleep.

### Water And Electronics Safety

Bottle electronics must be isolated from water.

Mitigation:

- Waterproof enclosure.
- Protected charging design.
- No exposed charging contacts near liquid path.

## 17. References

- Espressif ESP32-C3 GPIO documentation: `GPIO0-5` can be used during deep sleep, and `GPIO2`, `GPIO8`, `GPIO9` are strapping pins.
  - https://docs.espressif.com/projects/esp-idf/en/v4.4/esp32c3/api-reference/peripherals/gpio.html
- Espressif ESP32-C3 sleep modes documentation.
  - https://docs.espressif.com/projects/esp-idf/en/latest/esp32c3/api-reference/system/sleep_modes.html
- Bosch BMI160 datasheet: low-power accelerometer modes and configurable interrupt pins.
  - https://www.bosch-sensortec.com/media/boschsensortec/downloads/datasheets/bst-bmi160-ds000.pdf
- HX711 datasheet behavior: data-ready output and power-down behavior.
  - https://www.digikey.com/htmldatasheets/production/1836471/0/0/1/hx711.html
- React Native BLE library reference.
  - https://github.com/dotintent/react-native-ble-plx
