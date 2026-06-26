// -------------------- BLE callbacks --------------------

class ServerCallbacks : public BLEServerCallbacks {
  void onConnect(BLEServer *server) override {
    bleConnected = true;
    updateStatusCharacteristic(true);
  }

  void onDisconnect(BLEServer *server) override {
    bleConnected = false;
    server->getAdvertising()->start();
  }
};

class CommandCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    String command = characteristic->getValue().c_str();
    command.trim();
    noteBleDataReceived();
    handleCommand(command);
  }
};

class TimeCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    String payload = characteristic->getValue().c_str();
    payload.trim();
    noteBleDataReceived();
    handleTimeSync(payload);
  }
};

class StatusCallbacks : public BLECharacteristicCallbacks {
  void onRead(BLECharacteristic *characteristic) override {
    noteBleDataSent();
  }
};

class SettingsCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    String payload = characteristic->getValue().c_str();
    payload.trim();
    noteBleDataReceived();
    handleSettingsWrite(payload);
  }

  void onRead(BLECharacteristic *characteristic) override {
    noteBleDataSent();
  }
};

class AckCallbacks : public BLECharacteristicCallbacks {
  void onWrite(BLECharacteristic *characteristic) override {
    String payload = characteristic->getValue().c_str();
    payload.trim();
    noteBleDataReceived();
    handleAckWrite(payload);
  }
};

