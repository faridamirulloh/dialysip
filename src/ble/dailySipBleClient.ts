import { Platform } from "react-native";
import type { BleManager, Device, Subscription } from "react-native-ble-plx";
import type { BleConnectionSnapshot, BleSyncResult, PendingDeviceSettings, SyncedDeviceRecord } from "../data/syncTypes";
import type { BleActivity, BleLogEntry, DiscoveredBottle } from "../data/types";
import { decodeJsonBase64, encodeJsonBase64 } from "./base64";
import { requestBlePermissions } from "./blePermissions";
import {
  dailySipBleContract,
  toCommandPayload,
  toDeviceSettingsPayload,
  toSyncedDeviceRecords,
  toSyncedDeviceStatus,
  toTimeSyncPayload,
  normalizeRecordId,
  type DailySipBleCommand,
  type DailySipBleLogPayload,
  type DailySipBleStatusPayload
} from "./dailySipBleContract";

const SCAN_TIMEOUT_MS = 12000;
const CONNECT_TIMEOUT_MS = 10000;
const ANDROID_MTU = 512;
const LOG_SUBSCRIPTION_SETTLE_MS = 250;
const LEGACY_LOG_NOTIFICATION_IDLE_MS = 600;
const LOG_NOTIFICATION_IDLE_MS = 10000;
const STATUS_READ_ATTEMPTS = 3;
const STATUS_READ_RETRY_MS = 250;
const BLE_LOG_PAYLOAD_MAX_LENGTH = 480;
const APP_HEARTBEAT_INTERVAL_MS = 10000;

export class DailySipBleClient {
  private manager?: BleManager;
  private connectedDevice?: Device;
  private disconnectSubscription?: Subscription;
  private disconnectListener?: (error: unknown) => void;
  private activityListener?: (activity: BleActivity) => void;
  private logListener?: (entry: BleLogEntry) => void;
  private logSequence = 0;
  private collectingHistoryNotifications = false;
  private discoveredDevices = new Map<string, Device>();
  private appActive = false;
  private heartbeatTimer?: ReturnType<typeof setInterval>;

  setDisconnectListener(listener: (error: unknown) => void) {
    this.disconnectListener = listener;
  }

  setActivityListener(listener: (activity: BleActivity) => void) {
    this.activityListener = listener;
  }

  setLogListener(listener: (entry: BleLogEntry) => void) {
    this.logListener = listener;
  }

  setAppActive(isActive: boolean) {
    this.appActive = isActive;
    if (isActive) {
      this.startHeartbeat();
      return;
    }

    this.stopHeartbeat();
  }

  async connectToBottle(expectedDeviceId?: string): Promise<BleConnectionSnapshot> {
    const existingStatus = await this.readConnectedStatus(expectedDeviceId);
    if (existingStatus) {
      await this.watchDeviceDisconnect();
      this.startHeartbeat();
      return { status: existingStatus };
    }

    const bottle = await this.findBottle();
    return this.connectFoundBottle(bottle, expectedDeviceId);
  }

  async scanBottles(): Promise<DiscoveredBottle[]> {
    const manager = await this.getManager();
    const permissionResult = await requestBlePermissions();

    if (!permissionResult.granted) {
      throw new Error(permissionResult.reason ?? "Bluetooth permission was not granted.");
    }

    const found = new Map<string, DiscoveredBottle>();
    const addBottle = (device: Device, isConnected: boolean, force = false) => {
      if (!force && !isDailySipDevice(device)) {
        return;
      }

      this.discoveredDevices.set(device.id, device);
      found.set(device.id, toDiscoveredBottle(device, isConnected));
    };

    const connectedBottles = await this.findConnectedBottles(manager);
    connectedBottles.forEach((device) => addBottle(device, true, true));

    return new Promise<DiscoveredBottle[]>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        manager.stopDeviceScan();
        clearTimeout(timeoutId);
        callback();
      };
      const timeoutId = setTimeout(() => {
        finish(() => resolve(sortDiscoveredBottles([...found.values()])));
      }, SCAN_TIMEOUT_MS);

      manager.startDeviceScan(null, { allowDuplicates: false }, (error, scannedDevice) => {
        if (error) {
          finish(() => reject(error));
          return;
        }

        if (!scannedDevice) {
          return;
        }

        addBottle(scannedDevice, false);
      });
    });
  }

  async connectToScannedBottle(scanId: string): Promise<BleConnectionSnapshot> {
    if (this.connectedDevice && this.connectedDevice.id !== scanId) {
      await this.disconnect();
    }

    const bottle = await this.findBottleByScanId(scanId);
    return this.connectFoundBottle(bottle);
  }

  private async connectFoundBottle(
    bottle: FoundBottle,
    expectedDeviceId?: string
  ): Promise<BleConnectionSnapshot> {
    this.connectedDevice = bottle.isConnected
      ? bottle.device
      : await bottle.device.connect({ timeout: CONNECT_TIMEOUT_MS });
    await this.requestLargeMtu();
    this.connectedDevice = await this.connectedDevice.discoverAllServicesAndCharacteristics();
    await this.watchDeviceDisconnect();

    const status = await this.readStatus();
    if (expectedDeviceId && status.deviceId !== expectedDeviceId) {
      await this.disconnect();
      throw new Error(`Connected DialySip device ${status.deviceId} does not match active device ${expectedDeviceId}.`);
    }

    await this.writeTimeSync();
    this.startHeartbeat();

    return { status };
  }

  async sync(
    afterRecordId: string,
    settings: PendingDeviceSettings,
    historyMode: "full" | "after_last_sync",
    fallbackStatus?: BleSyncResult["status"]
  ): Promise<BleSyncResult> {
    const device = await this.ensureConnected();
    await device.discoverAllServicesAndCharacteristics();
    await this.writeSettings(settings);

    const logCollector = await this.collectLogNotifications();
    let logPayload: DailySipBleLogPayload;

    try {
      await wait(LOG_SUBSCRIPTION_SETTLE_MS);
      await this.writeCommand("request_sync", {
        after_record_id: afterRecordId,
        history_mode: historyMode
      });
      logCollector.startIdleTimer();
      logPayload = await logCollector.result;
    } catch (caught) {
      logCollector.cancel();
      throw caught;
    }

    const records = toSyncedDeviceRecords(logPayload);
    const acknowledgedRecordId = records.length > 0 ? records[records.length - 1].recordId : afterRecordId;
    let status: BleSyncResult["status"];
    let warning = typeof logPayload.sync_warning === "string" ? logPayload.sync_warning : undefined;

    try {
      status = await this.readStatus();
    } catch (caught) {
      if (!fallbackStatus || records.length === 0) {
        throw caught;
      }

      warning = appendWarning(
        warning,
        `Status akhir BLE gagal dibaca setelah riwayat diterima: ${getErrorMessage(caught)}`
      );
      status = {
        ...fallbackStatus,
        connection: "connected",
        lastRecordId: records[records.length - 1]?.recordId ?? fallbackStatus.lastRecordId,
        lastSyncId: acknowledgedRecordId
      };
    }

    if (acknowledgedRecordId && acknowledgedRecordId !== afterRecordId) {
      try {
        await this.writeAck(acknowledgedRecordId);
      } catch (caught) {
        warning = appendWarning(warning, `ACK gagal dikirim: ${getErrorMessage(caught)}`);
      }
    }

    return {
      status,
      records,
      acknowledgedRecordId,
      warning
    };
  }

  async sendCommand(command: DailySipBleCommand, payload: Record<string, unknown> = {}) {
    await this.ensureConnected();
    await this.writeCommand(command, payload);
  }

  async readDeviceStatus() {
    await this.ensureConnected();
    return this.readStatus();
  }

  async syncDeviceTime(expectedDeviceId?: string) {
    const existingStatus = await this.readConnectedStatus(expectedDeviceId);
    if (!existingStatus) {
      const connection = await this.connectToBottle(expectedDeviceId);
      return connection.status;
    }

    await this.watchDeviceDisconnect();
    await this.writeTimeSync();
    this.startHeartbeat();
    return this.readStatus();
  }

  async readConnectedDeviceStatus(expectedDeviceId?: string) {
    return this.readConnectedStatus(expectedDeviceId);
  }

  async writeSettingsIfConnected(settings: PendingDeviceSettings) {
    if (!this.connectedDevice) {
      return false;
    }

    try {
      const isConnected = await this.connectedDevice.isConnected();
      if (!isConnected) {
        this.connectedDevice = undefined;
        this.stopHeartbeat();
        return false;
      }

      this.connectedDevice = await this.connectedDevice.discoverAllServicesAndCharacteristics();
      await this.writeSettings(settings);
      return true;
    } catch {
      this.connectedDevice = undefined;
      this.stopHeartbeat();
      return false;
    }
  }

  async monitorLiveRecords(
    onRecords: (records: SyncedDeviceRecord[]) => void,
    onError?: (error: unknown) => void
  ): Promise<Subscription> {
    const device = await this.ensureConnected();
    return device.monitorCharacteristicForService(
      dailySipBleContract.serviceUuid,
      dailySipBleContract.characteristics.logStream,
      (error, characteristic) => {
        if (error) {
          onError?.(error);
          return;
        }

        if (!characteristic?.value) {
          return;
        }

        try {
          const records: DailySipBleLogRecordPayload[] = [];
          const payload = decodeJsonBase64<unknown>(characteristic.value);
          if (!this.collectingHistoryNotifications) {
            this.emitActivity("receive");
            this.emitLog("receive", dailySipBleContract.characteristics.logStream, payload);
          }
          appendLogNotificationPayload(payload, records);
          const syncedRecords = toSyncedDeviceRecords({ records });
          if (syncedRecords.length > 0) {
            onRecords(syncedRecords);
          }
        } catch (caught) {
          onError?.(caught);
        }
      }
    );
  }

  async acknowledgeRecord(recordId: string) {
    await this.writeAck(recordId);
  }

  async disconnect() {
    this.stopHeartbeat();
    if (!this.connectedDevice) {
      return;
    }

    try {
      this.disconnectSubscription?.remove();
      this.disconnectSubscription = undefined;
      await this.connectedDevice.cancelConnection();
    } finally {
      this.connectedDevice = undefined;
    }
  }

  private async findBottle(): Promise<FoundBottle> {
    const manager = await this.getManager();
    const permissionResult = await requestBlePermissions();

    if (!permissionResult.granted) {
      throw new Error(permissionResult.reason ?? "Bluetooth permission was not granted.");
    }

    const connectedBottle = await this.findConnectedBottle(manager);
    if (connectedBottle) {
      return { device: connectedBottle, isConnected: true };
    }

    return new Promise<FoundBottle>((resolve, reject) => {
      let settled = false;
      const finish = (callback: () => void) => {
        if (settled) {
          return;
        }

        settled = true;
        manager.stopDeviceScan();
        clearTimeout(timeoutId);
        callback();
      };
      const timeoutId = setTimeout(() => {
        finish(() => reject(new Error("DialySip bottle was not found during the BLE scan window.")));
      }, SCAN_TIMEOUT_MS);

      manager.startDeviceScan(null, { allowDuplicates: false }, (error, scannedDevice) => {
        if (error) {
          finish(() => reject(error));
          return;
        }

        if (!scannedDevice || !isDailySipDevice(scannedDevice)) {
          return;
        }

        finish(() => resolve({ device: scannedDevice, isConnected: false }));
      });
    });
  }

  private async findConnectedBottle(manager: BleManager): Promise<Device | undefined> {
    const bottles = await this.findConnectedBottles(manager);
    return bottles[0];
  }

  private async findConnectedBottles(manager: BleManager): Promise<Device[]> {
    try {
      const devices = await manager.connectedDevices([dailySipBleContract.serviceUuid]);
      const dailySipDevices = devices.filter(isDailySipDevice);
      return dailySipDevices.length > 0 ? dailySipDevices : devices;
    } catch {
      return [];
    }
  }

  private async findBottleByScanId(scanId: string): Promise<FoundBottle> {
    const manager = await this.getManager();
    const permissionResult = await requestBlePermissions();

    if (!permissionResult.granted) {
      throw new Error(permissionResult.reason ?? "Bluetooth permission was not granted.");
    }

    if (this.connectedDevice?.id === scanId) {
      const isConnected = await this.connectedDevice.isConnected();
      if (isConnected) {
        return { device: this.connectedDevice, isConnected: true };
      }
    }

    const connectedBottle = (await this.findConnectedBottles(manager)).find((device) => device.id === scanId);
    if (connectedBottle) {
      return { device: connectedBottle, isConnected: true };
    }

    const cachedBottle = this.discoveredDevices.get(scanId);
    if (cachedBottle) {
      return { device: cachedBottle, isConnected: false };
    }

    try {
      const devices = await manager.devices([scanId]);
      const device = devices[0];
      if (device && isDailySipDevice(device)) {
        return { device, isConnected: false };
      }
    } catch {
      // Fall through to the user-facing error below.
    }

    throw new Error("Selected DialySip bottle is no longer available. Scan again.");
  }

  private async ensureConnected(): Promise<Device> {
    if (this.connectedDevice) {
      const isConnected = await this.connectedDevice.isConnected();
      if (isConnected) {
        return this.connectedDevice;
      }
    }

    const connection = await this.connectToBottle();
    if (!this.connectedDevice) {
      throw new Error(`Connected to ${connection.status.name}, but BLE device handle was unavailable.`);
    }

    return this.connectedDevice;
  }

  private async getManager(): Promise<BleManager> {
    if (Platform.OS === "web") {
      throw new Error("BLE is not available in the web preview. Use an Android development build.");
    }

    if (!this.manager) {
      const { BleManager } = await import("react-native-ble-plx");
      this.manager = new BleManager();
    }

    return this.manager;
  }

  private async requestLargeMtu() {
    if (Platform.OS !== "android" || !this.connectedDevice) {
      return;
    }

    try {
      this.connectedDevice = await this.connectedDevice.requestMTU(ANDROID_MTU);
    } catch {
      // The default MTU can still work for small status/settings payloads.
    }
  }

  private async watchDeviceDisconnect() {
    if (!this.connectedDevice) {
      return;
    }

    const manager = await this.getManager();
    const deviceId = this.connectedDevice.id;
    this.disconnectSubscription?.remove();
    this.disconnectSubscription = manager.onDeviceDisconnected(deviceId, (error) => {
      if (this.connectedDevice?.id !== deviceId) {
        return;
      }

      this.connectedDevice = undefined;
      this.disconnectSubscription?.remove();
      this.disconnectSubscription = undefined;
      this.stopHeartbeat();
      this.disconnectListener?.(error);
    });
  }

  private async collectLogNotifications(): Promise<{
    result: Promise<DailySipBleLogPayload>;
    startIdleTimer: () => void;
    cancel: () => void;
  }> {
    const device = await this.ensureDeviceHandle();
    const records: DailySipBleLogRecordPayload[] = [];
    let settled = false;
    let requiresExplicitCompletion = false;
    let subscription: Subscription | undefined;
    let idleTimeoutId: ReturnType<typeof setTimeout> | undefined;
    let resetIdleTimer: (() => void) | undefined;

    this.collectingHistoryNotifications = true;

    const cleanup = () => {
      subscription?.remove();
      this.collectingHistoryNotifications = false;

      if (idleTimeoutId) {
        clearTimeout(idleTimeoutId);
      }

    };

    const result = new Promise<DailySipBleLogPayload>((resolve, reject) => {
      const finish = (syncWarning?: string) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve(syncWarning ? { records, sync_warning: syncWarning } : { records });
      };

      const fail = (error: unknown) => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        reject(error);
      };

      const resetIdleTimeout = () => {
        if (idleTimeoutId) {
          clearTimeout(idleTimeoutId);
        }

        idleTimeoutId = setTimeout(
          () => {
            if (requiresExplicitCompletion) {
              if (records.length > 0) {
                finish(
                  "sync_complete tidak diterima, tetapi catatan riwayat yang sudah diterima tetap disimpan."
                );
                return;
              }

              fail(new Error("DialySip history stream ended before sync_complete."));
              return;
            }

            finish();
          },
          requiresExplicitCompletion ? LOG_NOTIFICATION_IDLE_MS : LEGACY_LOG_NOTIFICATION_IDLE_MS
        );
      };
      resetIdleTimer = resetIdleTimeout;

      subscription = device.monitorCharacteristicForService(
        dailySipBleContract.serviceUuid,
        dailySipBleContract.characteristics.logStream,
        (error, characteristic) => {
          if (error) {
            fail(error);
            return;
          }

          if (!characteristic?.value) {
            resetIdleTimeout();
            return;
          }

          try {
            const payload = decodeJsonBase64<unknown>(characteristic.value);
            this.emitActivity("receive");
            this.emitLog("receive", dailySipBleContract.characteristics.logStream, payload);
            const syncControl = getLogSyncControl(payload);

            if (syncControl.error) {
              fail(new Error(`DialySip history sync failed: ${syncControl.error}`));
              return;
            }

            if (syncControl.started) {
              requiresExplicitCompletion = true;
              records.length = 0;
            }

            appendLogNotificationPayload(payload, records);

            if (syncControl.completed) {
              if (
                typeof syncControl.recordsSent === "number" &&
                syncControl.recordsSent !== records.length
              ) {
                fail(
                  new Error(
                    `DialySip history sync was incomplete: expected ${syncControl.recordsSent} records, received ${records.length}.`
                  )
                );
                return;
              }

              finish();
              return;
            }

            resetIdleTimeout();
          } catch {
            resetIdleTimeout();
          }
        }
      );
    });

    return {
      result,
      startIdleTimer: () => {
        if (!settled) {
          resetIdleTimer?.();
        }
      },
      cancel: cleanup
    };
  }

  private async readStatus() {
    let lastError: unknown;

    for (let attempt = 1; attempt <= STATUS_READ_ATTEMPTS; attempt += 1) {
      try {
        const payload = await this.readJsonCharacteristic<DailySipBleStatusPayload>(
          dailySipBleContract.characteristics.status
        );
        return toSyncedDeviceStatus(payload, this.connectedDevice?.name ?? dailySipBleContract.advertisedName);
      } catch (caught) {
        lastError = caught;
        if (attempt === STATUS_READ_ATTEMPTS) {
          throw caught;
        }

        await wait(STATUS_READ_RETRY_MS);
        if (this.connectedDevice) {
          this.connectedDevice = await this.connectedDevice.discoverAllServicesAndCharacteristics();
        }
      }
    }

    throw lastError;
  }

  private async writeSettings(settings: PendingDeviceSettings) {
    await this.writeJsonCharacteristic(
      dailySipBleContract.characteristics.settings,
      toDeviceSettingsPayload(settings)
    );
  }

  private async writeTimeSync() {
    await this.writeJsonCharacteristic(
      dailySipBleContract.characteristics.timeSync,
      toTimeSyncPayload()
    );
  }

  private async writeCommand(command: DailySipBleCommand, payload: Record<string, unknown>) {
    await this.writeJsonCharacteristic(
      dailySipBleContract.characteristics.command,
      toCommandPayload(command, payload)
    );
  }

  private async writeAck(recordId: string) {
    await this.writeJsonCharacteristic(dailySipBleContract.characteristics.ack, {
      record_id: recordId
    });
  }

  private startHeartbeat() {
    if (!this.appActive || !this.connectedDevice || this.heartbeatTimer) {
      return;
    }

    void this.sendHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      void this.sendHeartbeat();
    }, APP_HEARTBEAT_INTERVAL_MS);
  }

  private stopHeartbeat() {
    if (!this.heartbeatTimer) {
      return;
    }

    clearInterval(this.heartbeatTimer);
    this.heartbeatTimer = undefined;
  }

  private async sendHeartbeat() {
    if (!this.appActive || !this.connectedDevice) {
      this.stopHeartbeat();
      return;
    }

    try {
      await this.writeCommand("heartbeat", {});
    } catch {
      this.stopHeartbeat();
    }
  }

  private async readJsonCharacteristic<T>(characteristicUuid: string): Promise<T> {
    const device = await this.ensureDeviceHandle();
    const characteristic = await device.readCharacteristicForService(
      dailySipBleContract.serviceUuid,
      characteristicUuid
    );

    if (!characteristic.value) {
      throw new Error(`DialySip characteristic ${characteristicUuid} returned no value.`);
    }

    const payload = decodeJsonBase64<T>(characteristic.value);
    this.emitActivity("receive");
    this.emitLog("receive", characteristicUuid, payload);
    return payload;
  }

  private async writeJsonCharacteristic(characteristicUuid: string, payload: unknown) {
    const device = await this.ensureDeviceHandle();
    await device.writeCharacteristicWithResponseForService(
      dailySipBleContract.serviceUuid,
      characteristicUuid,
      encodeJsonBase64(payload)
    );
    this.emitActivity("send");
    this.emitLog("send", characteristicUuid, payload);
  }

  private emitActivity(activity: BleActivity) {
    this.activityListener?.(activity);
  }

  private emitLog(direction: BleActivity, characteristicUuid: string, payload: unknown) {
    this.logSequence += 1;
    this.logListener?.({
      id: this.logSequence,
      direction,
      characteristic: getCharacteristicName(characteristicUuid),
      payload: summarizeBlePayload(payload),
      timestamp: Date.now()
    });
  }

  private async ensureDeviceHandle(): Promise<Device> {
    if (!this.connectedDevice) {
      throw new Error("DialySip bottle is not connected.");
    }

    return this.connectedDevice;
  }

  private async readConnectedStatus(expectedDeviceId?: string) {
    if (!this.connectedDevice) {
      return null;
    }

    try {
      const isConnected = await this.connectedDevice.isConnected();
      if (!isConnected) {
        this.connectedDevice = undefined;
        return null;
      }

      const status = await this.readStatus();
      if (expectedDeviceId && status.deviceId !== expectedDeviceId) {
        await this.disconnect();
        return null;
      }

      return status;
    } catch {
      this.connectedDevice = undefined;
      return null;
    }
  }
}

interface FoundBottle {
  device: Device;
  isConnected: boolean;
}

const toDiscoveredBottle = (device: Device, isConnected: boolean): DiscoveredBottle => ({
  scanId: device.id,
  name: device.name ?? device.localName ?? dailySipBleContract.advertisedName,
  rssi: typeof device.rssi === "number" ? device.rssi : null,
  isConnected
});

const sortDiscoveredBottles = (bottles: DiscoveredBottle[]) =>
  bottles.sort((left, right) => {
    if (left.isConnected !== right.isConnected) {
      return left.isConnected ? -1 : 1;
    }

    return (right.rssi ?? -999) - (left.rssi ?? -999);
  });

const characteristicNames: Record<string, string> = {
  [dailySipBleContract.characteristics.status]: "status",
  [dailySipBleContract.characteristics.settings]: "settings",
  [dailySipBleContract.characteristics.timeSync]: "time",
  [dailySipBleContract.characteristics.command]: "command",
  [dailySipBleContract.characteristics.logStream]: "history",
  [dailySipBleContract.characteristics.ack]: "ack"
};

const getCharacteristicName = (characteristicUuid: string) =>
  characteristicNames[characteristicUuid] ?? "unknown";

const summarizeBlePayload = (payload: unknown) => {
  let value: string;

  if (typeof payload === "string") {
    value = payload;
  } else {
    try {
      value = JSON.stringify(payload);
    } catch {
      value = "[unserializable payload]";
    }
  }

  return value.length > BLE_LOG_PAYLOAD_MAX_LENGTH
    ? `${value.slice(0, BLE_LOG_PAYLOAD_MAX_LENGTH - 3)}...`
    : value;
};

const isDailySipDevice = (device: Device) => {
  const advertisedName = device.name ?? device.localName ?? "";
  const serviceUuids = device.serviceUUIDs ?? [];

  return (
    advertisedName.includes(dailySipBleContract.advertisedName) ||
    serviceUuids.some(
      (uuid) => uuid.toLowerCase() === dailySipBleContract.serviceUuid.toLowerCase()
    )
  );
};

const wait = async (durationMs: number) => {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
};

const getErrorMessage = (error: unknown) =>
  error instanceof Error ? error.message : "Unknown BLE error.";

const appendWarning = (current: string | undefined, next: string) =>
  current ? `${current} ${next}` : next;

type DailySipBleLogRecordPayload = NonNullable<DailySipBleLogPayload["records"]>[number];

const appendLogNotificationPayload = (
  payload: unknown,
  records: DailySipBleLogRecordPayload[]
) => {
  if (!payload || typeof payload !== "object") {
    return;
  }

  const maybeLogPayload = payload as DailySipBleLogPayload;
  if (Array.isArray(maybeLogPayload.records)) {
    records.push(...maybeLogPayload.records);
    return;
  }

  const maybeRecord = payload as Partial<DailySipBleLogRecordPayload>;
  const recordId = normalizeRecordId(maybeRecord.record_id);
  if (recordId) {
    records.push({ ...maybeRecord, record_id: recordId } as DailySipBleLogRecordPayload);
  }
};

const getLogSyncControl = (payload: unknown) => {
  if (!payload || typeof payload !== "object") {
    return {};
  }

  const control = payload as Pick<
    DailySipBleLogPayload,
    "sync_started" | "sync_complete" | "records_sent" | "sync_error"
  >;

  return {
    started: control.sync_started === true,
    completed: control.sync_complete === true,
    recordsSent: typeof control.records_sent === "number" ? control.records_sent : undefined,
    error: typeof control.sync_error === "string" ? control.sync_error : undefined
  };
};
