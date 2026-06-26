// -------------------- HX711 direct reader --------------------

class Hx711Reader {
public:
  void begin(uint8_t doutPin, uint8_t sckPin) {
    dout = doutPin;
    sck = sckPin;
    pinMode(dout, INPUT);
    pinMode(sck, OUTPUT);
    digitalWrite(sck, LOW);
  }

  bool waitReady(uint32_t timeoutMs) {
    uint32_t start = millis();
    while (digitalRead(dout) == HIGH) {
      if (millis() - start > timeoutMs) {
        return false;
      }
      delay(1);
    }
    return true;
  }

  bool readRaw(long &value) {
    if (!waitReady(1000)) {
      return false;
    }

    uint32_t raw = 0;
    noInterrupts();
    for (uint8_t i = 0; i < 24; i++) {
      digitalWrite(sck, HIGH);
      delayMicroseconds(1);
      raw = (raw << 1) | (digitalRead(dout) ? 1UL : 0UL);
      digitalWrite(sck, LOW);
      delayMicroseconds(1);
    }

    // One extra clock pulse selects channel A, gain 128 for the next reading.
    digitalWrite(sck, HIGH);
    delayMicroseconds(1);
    digitalWrite(sck, LOW);
    interrupts();

    if (raw & 0x800000UL) {
      raw |= 0xFF000000UL;
    }
    value = (long)raw;
    return true;
  }

  bool readAverage(long &average, uint8_t samples) {
    int64_t sum = 0;
    uint8_t good = 0;
    for (uint8_t i = 0; i < samples; i++) {
      long raw = 0;
      if (readRaw(raw)) {
        sum += raw;
        good++;
      }
      delay(20);
    }
    if (good == 0) {
      return false;
    }
    average = (long)(sum / good);
    return true;
  }

  bool readWeightG(float &grams) {
    long raw = 0;
    if (!readAverage(raw, 5)) {
      return false;
    }
    grams = ((float)raw - tareOffset) / calibrationFactor;
    return true;
  }

  bool readStableWeightG(float &grams) {
    uint32_t start = millis();
    while (millis() - start < STABLE_TIMEOUT_MS) {
      float minG = 1000000.0f;
      float maxG = -1000000.0f;
      float sumG = 0.0f;
      uint8_t good = 0;

      for (uint8_t i = 0; i < STABLE_WINDOW_SAMPLES; i++) {
        float g = 0.0f;
        if (readWeightG(g)) {
          minG = min(minG, g);
          maxG = max(maxG, g);
          sumG += g;
          good++;
        }
        delay(100);
      }

      if (good >= STABLE_WINDOW_SAMPLES - 1 && (maxG - minG) <= STABLE_VARIATION_G) {
        grams = sumG / good;
        return true;
      }
    }
    return false;
  }

  bool readStableRaw(long &stableRaw) {
    uint32_t start = millis();
    float factor = calibrationFactor < 0.0f ? -calibrationFactor : calibrationFactor;
    float maxVariationRaw = factor * STABLE_VARIATION_G;
    if (maxVariationRaw < 10.0f) {
      maxVariationRaw = 10.0f;
    }
    while (millis() - start < STABLE_TIMEOUT_MS) {
      long minRaw = 2147483647L;
      long maxRaw = -2147483647L;
      int64_t sumRaw = 0;
      uint8_t good = 0;

      for (uint8_t i = 0; i < STABLE_WINDOW_SAMPLES; i++) {
        long raw = 0;
        if (readAverage(raw, 5)) {
          minRaw = min(minRaw, raw);
          maxRaw = max(maxRaw, raw);
          sumRaw += raw;
          good++;
        }
        delay(100);
      }

      if (good >= STABLE_WINDOW_SAMPLES - 1 && (float)(maxRaw - minRaw) <= maxVariationRaw) {
        stableRaw = (long)(sumRaw / good);
        return true;
      }
    }
    return false;
  }

  void powerDown() {
    digitalWrite(sck, LOW);
    delayMicroseconds(1);
    digitalWrite(sck, HIGH);
    delayMicroseconds(80);
  }

  void powerUp() {
    digitalWrite(sck, LOW);
    delay(10);
  }

private:
  uint8_t dout = 0;
  uint8_t sck = 0;
};

Hx711Reader hx711;

