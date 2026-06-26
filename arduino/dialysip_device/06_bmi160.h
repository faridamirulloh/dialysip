// -------------------- BMI160 minimal I2C driver --------------------

class BMI160Motion {
public:
  bool begin(uint8_t address) {
    addr = address;

    writeReg(0x7E, 0xB6); // soft reset
    delay(100);

    uint8_t chip = readReg(0x00);
    if (chip != BMI160_CHIP_ID) {
      return false;
    }

    // Gyro suspend, accelerometer low-power.
    writeReg(0x7E, 0x14);
    delay(80);
    writeReg(0x7E, 0x12);
    delay(80);

    // +/-2g range. Low-power accel config: undersampling, average filter, 25 Hz ODR.
    writeReg(0x41, 0x03);
    writeReg(0x40, 0xA6);

    // INT1 output enabled, open-drain, active-low, level.
    writeReg(0x53, 0x0C);

    // Keep interrupts non-latched while awake; switch to latched only before deep sleep.
    setInterruptLatched(false);

    // Any-motion duration and threshold. Tune these on the real bottle.
    writeReg(0x5F, 0x01);
    writeReg(0x60, BMI160_ANY_MOTION_THRESHOLD);

    // Map any-motion to INT1 and enable x/y/z any-motion.
    writeReg(0x55, 0x04);
    writeReg(0x50, 0x07);

    prepareAwakeInterrupt();
    return true;
  }

  bool readAccelMg(int16_t &xMg, int16_t &yMg, int16_t &zMg) {
    Wire.beginTransmission(addr);
    Wire.write(0x12);
    if (Wire.endTransmission(false) != 0) {
      return false;
    }
    if (Wire.requestFrom((int)addr, 6) != 6) {
      return false;
    }

    int16_t rawX = (int16_t)((uint16_t)Wire.read() | ((uint16_t)Wire.read() << 8));
    int16_t rawY = (int16_t)((uint16_t)Wire.read() | ((uint16_t)Wire.read() << 8));
    int16_t rawZ = (int16_t)((uint16_t)Wire.read() | ((uint16_t)Wire.read() << 8));

    xMg = (int16_t)((int32_t)rawX * 2000L / 32768L);
    yMg = (int16_t)((int32_t)rawY * 2000L / 32768L);
    zMg = (int16_t)((int32_t)rawZ * 2000L / 32768L);
    return true;
  }

  void clearInterrupt() {
    writeReg(0x54, 0x80 | interruptLatchValue);
    delay(2);
    writeReg(0x54, interruptLatchValue);
    (void)readReg(0x1C);
    (void)readReg(0x1E);
  }

  void setInterruptLatched(bool latched) {
    interruptLatchValue = latched ? 0x0F : 0x00;
    clearInterrupt();
  }

  void prepareWakeInterrupt() {
    setInterruptLatched(true);
  }

  void prepareAwakeInterrupt() {
    setInterruptLatched(false);
  }

  bool writeReg(uint8_t reg, uint8_t value) {
    Wire.beginTransmission(addr);
    Wire.write(reg);
    Wire.write(value);
    return Wire.endTransmission() == 0;
  }

  uint8_t readReg(uint8_t reg) {
    Wire.beginTransmission(addr);
    Wire.write(reg);
    if (Wire.endTransmission(false) != 0) {
      return 0xFF;
    }
    if (Wire.requestFrom((int)addr, 1) != 1) {
      return 0xFF;
    }
    return Wire.read();
  }

private:
  uint8_t addr = BMI160_ADDRESS;
  uint8_t interruptLatchValue = 0x00;
};

BMI160Motion motion;

