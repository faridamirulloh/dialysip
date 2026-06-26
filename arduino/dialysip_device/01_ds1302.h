// -------------------- DS1302 minimal 3-wire RTC driver --------------------

class DS1302Rtc {
public:
  void begin(uint8_t datPin, uint8_t clkPin, uint8_t rstPin) {
    dat = datPin;
    clk = clkPin;
    rst = rstPin;

    pinMode(rst, OUTPUT);
    pinMode(clk, OUTPUT);
    pinMode(dat, OUTPUT);
    digitalWrite(rst, LOW);
    digitalWrite(clk, LOW);
    digitalWrite(dat, LOW);
  }

  bool isRunning() {
    DateTime now;
    bool halted = false;
    return readDateTime(now, halted) && !halted;
  }

  DateTime now() {
    DateTime now;
    bool halted = false;
    if (readDateTime(now, halted)) {
      return now;
    }
    return DateTime(2000, 1, 1, 0, 0, 0);
  }

  void adjust(const DateTime &dt) {
    writeProtect(false);

    digitalWrite(rst, HIGH);
    writeByte(0xBE); // Clock burst write.
    writeByte(decToBcd(dt.second()) & 0x7F);
    writeByte(decToBcd(dt.minute()));
    writeByte(decToBcd(dt.hour())); // 24-hour mode.
    writeByte(decToBcd(dt.day()));
    writeByte(decToBcd(dt.month()));
    writeByte(decToBcd(dt.dayOfTheWeek() + 1));
    writeByte(decToBcd(dt.year() - 2000));
    writeByte(0x00); // Keep write protect disabled for this burst only.
    digitalWrite(rst, LOW);

    writeProtect(true);
  }

private:
  uint8_t dat = 0;
  uint8_t clk = 0;
  uint8_t rst = 0;

  static uint8_t bcdToDec(uint8_t value) {
    return ((value >> 4) * 10) + (value & 0x0F);
  }

  static uint8_t decToBcd(uint8_t value) {
    return ((value / 10) << 4) | (value % 10);
  }

  void writeByte(uint8_t value) {
    pinMode(dat, OUTPUT);
    for (uint8_t i = 0; i < 8; i++) {
      digitalWrite(dat, (value & 0x01) ? HIGH : LOW);
      delayMicroseconds(1);
      digitalWrite(clk, HIGH);
      delayMicroseconds(1);
      digitalWrite(clk, LOW);
      value >>= 1;
    }
  }

  uint8_t readByte() {
    uint8_t value = 0;
    pinMode(dat, INPUT);
    for (uint8_t i = 0; i < 8; i++) {
      if (digitalRead(dat)) {
        value |= (1U << i);
      }
      digitalWrite(clk, HIGH);
      delayMicroseconds(1);
      digitalWrite(clk, LOW);
      delayMicroseconds(1);
    }
    return value;
  }

  void writeRegister(uint8_t command, uint8_t value) {
    digitalWrite(rst, HIGH);
    writeByte(command);
    writeByte(value);
    digitalWrite(rst, LOW);
  }

  void writeProtect(bool enabled) {
    writeRegister(0x8E, enabled ? 0x80 : 0x00);
  }

  bool readDateTime(DateTime &dt, bool &halted) {
    uint8_t regs[8] = {};

    digitalWrite(rst, HIGH);
    writeByte(0xBF); // Clock burst read.
    for (uint8_t i = 0; i < 8; i++) {
      regs[i] = readByte();
    }
    digitalWrite(rst, LOW);

    halted = (regs[0] & 0x80) != 0;
    uint8_t second = bcdToDec(regs[0] & 0x7F);
    uint8_t minute = bcdToDec(regs[1] & 0x7F);
    uint8_t hour = parseHour(regs[2]);
    uint8_t day = bcdToDec(regs[3] & 0x3F);
    uint8_t month = bcdToDec(regs[4] & 0x1F);
    uint16_t year = 2000 + bcdToDec(regs[6]);

    if (second > 59 || minute > 59 || hour > 23 || day < 1 || day > 31 || month < 1 || month > 12 || year > 2099) {
      return false;
    }

    dt = DateTime(year, month, day, hour, minute, second);
    return true;
  }

  uint8_t parseHour(uint8_t rawHour) {
    if ((rawHour & 0x80) == 0) {
      return bcdToDec(rawHour & 0x3F);
    }

    uint8_t hour = bcdToDec(rawHour & 0x1F);
    bool pm = (rawHour & 0x20) != 0;
    if (hour == 12) {
      return pm ? 12 : 0;
    }
    return pm ? hour + 12 : hour;
  }
};

