# DialySip Device Wiring Diagram

Derived from `dialysip_device.ino` and the firmware setup code. Verify the exact ESP32-C3 Super Mini silkscreen before wiring, because clone boards can label pins differently.

## Overview

```mermaid
flowchart LR
  ESP["ESP32-C3 Super Mini"]

  OLED["SSD1306 OLED\nI2C addr 0x3C"]
  BMI["GY-BMI160\nI2C addr 0x69"]
  Button["Wake / action button\nactive low"]
  RTC["DS1302 RTC\n3-wire interface"]
  HX["HX711 load-cell amp"]
  Cell["Load cell"]
  Bat["1S Li-ion/LiPo battery"]
  RTop["40k or 100k resistor"]
  ADC["GPIO4 ADC node"]
  RBottom["matching resistor"]
  Cap["100nF to 1uF capacitor"]
  Charger["5V charger input"]
  CTop["25k resistor"]
  CDetect["GPIO6 charger digital node"]
  CBottom["37k resistor"]
  GND["GND"]

  ESP -- "GPIO0 SDA" --> OLED
  ESP -- "GPIO1 SCL" --> OLED
  ESP -- "GPIO0 SDA" --> BMI
  ESP -- "GPIO1 SCL" --> BMI
  BMI -- "INT1 active-low wake" -->|"GPIO3"| ESP

  Button -- "press pulls LOW" -->|"GPIO2"| ESP

  ESP -- "GPIO9 DAT" <--> RTC
  ESP -- "GPIO8 CLK" --> RTC
  ESP -- "GPIO21 RST/CE" --> RTC

  HX -- "DOUT" -->|"GPIO10"| ESP
  ESP -- "GPIO20 SCK" --> HX
  Cell --> HX

  Bat -- "+" --> RTop
  RTop --> ADC
  ADC -- "divider midpoint" -->|"GPIO4 ADC"| ESP
  ADC --> RBottom
  ADC --> Cap
  Cap --> GND
  RBottom --> GND
  Bat -- "-" --> GND

  Charger -- "+" --> CTop
  CTop --> CDetect
  CDetect -- "divider midpoint" -->|"GPIO6 digital input"| ESP
  CDetect --> CBottom
  CBottom --> GND
  Charger -- "-" --> GND
```

## Connections

| Module | Module pin | ESP32-C3 GPIO | Notes |
| --- | --- | --- | --- |
| SSD1306 OLED | SDA | GPIO0 | Shared I2C bus. |
| SSD1306 OLED | SCL | GPIO1 | Shared I2C bus. |
| SSD1306 OLED | VCC | 3.3V | Use 3.3V unless the exact module is verified as 5V-safe. |
| SSD1306 OLED | GND | GND | Common ground. |
| GY-BMI160 | SDA | GPIO0 | Shared I2C bus. |
| GY-BMI160 | SCL | GPIO1 | Shared I2C bus. |
| GY-BMI160 | INT1 | GPIO3 | Active-low motion wake input. Add external pull-up to 3.3V through 10k-100k. |
| GY-BMI160 | VCC | 3.3V | Keep powered during deep sleep if motion wake is required. |
| GY-BMI160 | GND | GND | Common ground. |
| Wake button | Signal side | GPIO2 | Active-low. Button connects GPIO2 to GND when pressed. |
| Wake button | Other side | GND | Add external pull-up to 3.3V through 10k-100k. |
| DS1302 RTC | DAT / IO | GPIO9 | Bidirectional data line. GPIO9 is a strapping pin. |
| DS1302 RTC | CLK / SCLK | GPIO8 | Clock line. GPIO8 is a strapping pin. |
| DS1302 RTC | RST / CE | GPIO21 | Chip enable / reset line. |
| DS1302 RTC | VCC | 3.3V | Use a module compatible with 3.3V logic. |
| DS1302 RTC | GND | GND | Common ground. |
| HX711 | DOUT / DT | GPIO10 | HX711 data output to ESP32-C3. |
| HX711 | SCK / CLK | GPIO20 | HX711 clock from ESP32-C3. |
| HX711 | VCC | 3.3V | Match load-cell amplifier module requirements. |
| HX711 | GND | GND | Common ground. |
| Load cell | E+, E-, A+, A- | HX711 load-cell terminals | Wire according to the load-cell color code and HX711 board labels. |
| Battery divider | Midpoint | GPIO4 | ADC input. Battery+ -> 40k or 100k -> GPIO4 -> matching 40k or 100k -> GND. |
| Battery ADC filter | Capacitor | GPIO4 to GND | Add 100nF to 1uF near the ESP32-C3 ADC pin. |
| Battery | Positive | Top resistor | 1S Li-ion/LiPo only, 4.2V max. |
| Battery | Negative | GND | Common ground with ESP32-C3. |
| Charger detect divider | Midpoint | GPIO6 | Digital input. 5V charger+ -> 25k -> GPIO6 -> 37k -> GND. |
| Charger input | Positive | 25k top resistor | Detects 5V present only; do not connect 5V directly to GPIO6. |
| Charger input | Negative | GND | Common ground with ESP32-C3. |

## Power And Ground

- Tie all module grounds to the ESP32-C3 GND.
- Prefer 3.3V module power and 3.3V logic levels for all signals.
- The firmware has optional power-gate constants for OLED and HX711, but they are set to `-1`, so no load-switch GPIOs are currently used.
- A 40k/40k battery divider draws about 52.5 uA at 4.2V; a 100k/100k pair draws about 21 uA.
- The charger detect divider draws about 80.6 uA from 5V only while the charger input is present.

## Firmware Notes

- `Wire.begin(PIN_I2C_SDA, PIN_I2C_SCL)` configures GPIO0/GPIO1 for the shared OLED and BMI160 I2C bus.
- Deep sleep wake uses GPIO3 for BMI160 motion wake and GPIO2 for the external button, both active-low.
- GPIO2, GPIO8, and GPIO9 are ESP32-C3 strapping pins. Avoid pulling them low during reset or power-up.
- GPIO4 is configured as the filtered battery ADC input. Current firmware stores records in internal flash through LittleFS; no microSD module is used.
- GPIO6 is configured as the charger-present digital input. With 25k on top and 37k to GND, a 5V charger input puts about 2.98V on GPIO6; the firmware reports only 5V input presence, not charger IC state.
