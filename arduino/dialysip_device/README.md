# DialySip Arduino Firmware

Firmware prototype for the DialySip smart bottle device.

Target board:

- ESP32-C3 Super Mini development board.

Connected modules:

- GY-BMI160 accelerometer for low-power movement wake.
- Physical button for manual wake and BLE sync mode.
- Load cell + HX711 for weight measurement.
- JMD0.96 OLED, assumed SSD1306-compatible 128x64 I2C.
- RTC module, assumed DS1302-compatible.
- microSD module over SPI.

## Folder

Open this folder in Arduino IDE:

```text
arduino/dialysip_device/
```

The sketch file is:

```text
dialysip_device.ino
```

The main sketch keeps pins, constants, and explicit includes. The implementation is split into numbered `.h` tabs so Arduino compiles them in a controlled order:

```text
01_ds1302.h
02_globals.h
03_forward_declarations.h
04_utility.h
05_hx711.h
06_bmi160.h
07_ble_callbacks.h
08_settings_storage.h
09_display.h
10_storage_records.h
11_weight_calibration.h
12_ble.h
13_button_sleep.h
14_setup_loop.h
```

## Required Arduino Libraries

Install these through Arduino Library Manager:

- Adafruit GFX Library
- Adafruit SSD1306
- RTClib by Adafruit

The sketch directly implements:

- Basic HX711 reading.
- Basic BMI160 I2C register setup for any-motion wake.

The sketch uses ESP32 Arduino built-in libraries for:

- BLEDevice
- SD
- SPI
- Wire
- Preferences

## Board Settings

Recommended Arduino IDE settings:

```text
Board package: esp32 by Espressif Systems
Board: ESP32C3 Dev Module or the matching ESP32-C3 Super Mini option
USB CDC On Boot: Enabled if you want Serial Monitor over USB
CPU Frequency: 80 MHz or 160 MHz
Flash size: match your board
```

## Wiring

Verify the exact ESP32-C3 Super Mini silkscreen before wiring.

```text
I2C:
GPIO0 = SDA
GPIO1 = SCL
OLED and GY-BMI160 share this bus

Wake:
GPIO3 = BMI160 active-low motion wake
GPIO2 = external active-low button wake
BMI160 INT1 -> GPIO3
External button -> GPIO2 to GND
External pull-up for GPIO3 -> 3.3V through 10k-100k
External pull-up for GPIO2 -> 3.3V through 10k-100k

DS1302 RTC:
GPIO9 = DAT
GPIO8 = CLK
GPIO21 = RST

microSD SPI:
GPIO4 = SCK
GPIO5 = MISO
GPIO6 = MOSI
GPIO7 = CS

HX711:
GPIO10 = DOUT
GPIO20 = SCK
```

`GPIO2`, `GPIO8`, and `GPIO9` are ESP32-C3 strapping pins. This pin plan does not use the built-in BOOT button in firmware. Avoid holding the external button LOW during reset or power-up, and make sure the DS1302 DAT line does not pull `GPIO9` LOW during reset.

## I2C Addresses

Expected:

```text
OLED   = 0x3C
BMI160 = 0x69
```

Set the BMI160 module address to `0x69` as configured in the firmware.

## Wake Behavior

- Short button press: wake and show status briefly.
- Press once while awake: show today's intake total; press again to step backward through today's intake records, newest first, then return to main display.
- Fast press 3 times, with no more than 400 ms between presses: start BLE sync mode.
- Fast press 5 times, with no more than 400 ms between presses: start calibration mode.
- Fast press 7 times, with no more than 400 ms between presses: reset today's intake total for testing.
- In calibration mode, hold the button for about 2 seconds to exit.
- Intake history screens return to the main display after 5 seconds without a button press.
- Bottle movement: BMI160 any-motion interrupt wakes the ESP32-C3, then HX711 measures bottle weight.
- Main display shows only the remaining bottle amount in mL.
- Deep sleep: BLE and OLED are off; BMI160 remains in low-power accelerometer mode.

## BLE Service

Device name:

```text
DialySip
```

Service UUID:

```text
3f4f1000-9d9a-4a5f-8f13-102a2d4d1000
```

Characteristics:

```text
status    = 3f4f1001-9d9a-4a5f-8f13-102a2d4d1000
settings  = 3f4f1002-9d9a-4a5f-8f13-102a2d4d1000
time_sync = 3f4f1003-9d9a-4a5f-8f13-102a2d4d1000
command   = 3f4f1004-9d9a-4a5f-8f13-102a2d4d1000
log       = 3f4f1005-9d9a-4a5f-8f13-102a2d4d1000
ack       = 3f4f1006-9d9a-4a5f-8f13-102a2d4d1000
```

## BLE Commands

Write these strings to the `command` characteristic:

```text
tare
calibrate:250
sync
sync:1024
status
sleep
```

Write Unix timestamp text to `time_sync`:

```text
1780000000
```

After time sync, the display shows `dd-mm-yyyy hh:mm` for 2 seconds, then returns to the main remaining-mL display.

Write simple `key:value` settings to `settings`:

```text
limit:1000
warning:80
oled:15
ble:60
drink_threshold:10
refill_threshold:50
```

Write the last saved record id to `ack`:

```text
1024
```

## Log Format

Records are appended to:

```text
/dialysip.jsonl
```

Example record:

```json
{"record_id":1024,"timestamp_utc":1780000000,"type":"drink_auto","amount_ml":85,"weight_before_g":420.0,"weight_after_g":335.0,"confidence":"normal","flags":"","battery_mv":0,"device_id":"dialysip-001","firmware_version":"0.1.0"}
```

## Calibration Flow

1. Put the empty bottle on the load cell.
2. Fast press the button 5 times to enter calibration mode.
3. Press once to tare the empty bottle; the firmware waits 1 second, then waits for the scale to become stable before saving tare.
4. Add a 250 g known weight.
5. Press once to confirm the 250 g weight; the firmware waits 1 second, then waits for the scale to become stable before saving calibration.
6. Watch the live weight sensor value.
7. Hold the button for about 2 seconds to exit calibration mode.

## Power Notes

For 1 week or more battery life, measure the real current of the full device.

Check these current states:

- Deep sleep.
- Deep sleep with BMI160 powered.
- OLED on.
- HX711 active.
- microSD write.
- BLE advertising.
- BLE connected.

Remove or disable module power LEDs if they draw too much current.

The current firmware leaves battery voltage reporting disabled because the simple GPIOs are reserved for wake and peripherals. Use an I2C fuel gauge later if accurate battery reporting is required.

## Important Limitations

- This is prototype firmware.
- It is not medical-device certified software.
- BMI160 settings may need sensitivity tuning on the real bottle.
- HX711 calibration factor must be measured on the real mechanical build.
- Spills or pouring water out can look like drinking. The Android app must allow editing or ignoring automatic records.
- The RTC code assumes a DS1302-compatible module.
- The OLED code assumes an SSD1306-compatible display.
