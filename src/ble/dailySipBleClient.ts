import { Platform } from "react-native";
import type { BleManager, Device, Subscription } from "react-native-ble-plx";
import type { BleConnectionSnapshot, BleSyncResult, PendingDeviceSettings, SyncedDeviceRecord } from "../data/syncTypes";
import type { BleActivity } from "../data/types";
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

export class DailySipBleClient {
  private manager?: BleManager;
  private connectedDevice?: Device;
  private disconnectSubscription?: Subscription;
  private disconnectListener?: (error: unknown) => void;
  private activityListener?: (activity: BleActivity) => void;

  setDisconnectListener(listener: (error: unknown) => void) {
    this.disconnectListener = listener;
  }

  setActivityListener(listener: (activity: BleActivity) => void) {
    this.activityListener = listener;
  }

  async connectToBottle(expectedDeviceId?: string): Promise<BleConnectionSnapshot> {
    const existingStatus = await this.readConnectedStatus(expectedDeviceId);
    if (existingStatus) {
      await this.watchDeviceDisconnect();
      await this.writeTimeSync();
      return { status: existingStatus };
    }

    const device = await this.findBottle();
    this.connectedDevice = (await device.isConnected())
      ? device
      : await device.connect({ timeout: CONNECT_TIMEOUT_MS });
    await this.requestLargeMtu();
    this.connectedDevice = await this.connectedDevice.discoverAllServicesAndCharacteristics();
    await this.watchDeviceDisconnect();

    const status = await this.readStatus();
    if (expectedDeviceId && status.deviceId !== expectedDeviceId) {
      await this.disconnect();
      throw new Error(`Connected DialySip device ${status.deviceId} does not match active device ${expectedDeviceId}.`);
    }

    await this.writeTimeSync();

    return { status };
  }

  async sync(afterRecordId: string, settings: PendingDeviceSettings): Promise<BleSyncResult> {
    const device = await this.ensureConnected();
    await device.discoverAllServicesAndCharacteristics();
    await this.writeSettings(settings);

    const logCollector = await this.collectLogNotifications();
    let logPayload: DailySipBleLogPayload;

    try {
      await wait(LOG_SUBSCRIPTION_SETTLE_MS);
      await this.writeCommand("request_sync", { after_record_id: afterRecordId });
      logCollector.startIdleTimer();
      logPayload = await logCollector.result;
    } catch (caught) {
      logCollector.cancel();
      throw caught;
    }

    const status = await this.readStatus();
    const records = toSyncedDeviceRecords(logPayload);
    const acknowledgedRecordId = records.length > 0 ? records[records.length - 1].recordId : afterRecordId;

    if (acknowledgedRecordId && acknowledgedRecordId !== afterRecordId) {
      await this.writeAck(acknowledgedRecordId);
    }

    return {
      status,
      records,
      acknowledgedRecordId
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

  async readConnectedDeviceStatus(expectedDeviceId?: string) {
    return this.readConnectedStatus(expectedDeviceId);
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
          this.emitActivity("receive");
          const records: DailySipBleLogRecordPayload[] = [];
          appendLogNotificationPayload(decodeJsonBase64<unknown>(characteristic.value), records);
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

  private async findBottle(): Promise<Device> {
    const manager = await this.getManager();
    const permissionResult = await requestBlePermissions();

    if (!permissionResult.granted) {
      throw new Error(permissionResult.reason ?? "Bluetooth permission was not granted.");
    }

    const connectedBottle = await this.findConnectedBottle(manager);
    if (connectedBottle) {
      return connectedBottle;
    }

    return new Promise<Device>((resolve, reject) => {
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

      manager.startDeviceScan([dailySipBleContract.serviceUuid], { allowDuplicates: false }, (error, scannedDevice) => {
        if (error) {
          finish(() => reject(error));
          return;
        }

        if (!scannedDevice || !isDailySipDevice(scannedDevice)) {
          return;
        }

        finish(() => resolve(scannedDevice));
      });
    });
  }

  private async findConnectedBottle(manager: BleManager): Promise<Device | undefined> {
    try {
      const devices = await manager.connectedDevices([dailySipBleContract.serviceUuid]);
      return devices.find(isDailySipDevice) ?? devices[0];
    } catch {
      return undefined;
    }
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

    const cleanup = () => {
      subscription?.remove();

      if (idleTimeoutId) {
        clearTimeout(idleTimeoutId);
      }

    };

    const result = new Promise<DailySipBleLogPayload>((resolve, reject) => {
      const finish = () => {
        if (settled) {
          return;
        }

        settled = true;
        cleanup();
        resolve({ records });
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
            this.emitActivity("receive");
            const payload = decodeJsonBase64<unknown>(characteristic.value);
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
    const payload = await this.readJsonCharacteristic<DailySipBleStatusPayload>(
      dailySipBleContract.characteristics.status
    );
    return toSyncedDeviceStatus(payload, this.connectedDevice?.name ?? dailySipBleContract.advertisedName);
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

  private async readJsonCharacteristic<T>(characteristicUuid: string): Promise<T> {
    const device = await this.ensureDeviceHandle();
    const characteristic = await device.readCharacteristicForService(
      dailySipBleContract.serviceUuid,
      characteristicUuid
    );

    if (!characteristic.value) {
      throw new Error(`DialySip characteristic ${characteristicUuid} returned no value.`);
    }

    this.emitActivity("receive");
    return decodeJsonBase64<T>(characteristic.value);
  }

  private async writeJsonCharacteristic(characteristicUuid: string, payload: unknown) {
    const device = await this.ensureDeviceHandle();
    await device.writeCharacteristicWithResponseForService(
      dailySipBleContract.serviceUuid,
      characteristicUuid,
      encodeJsonBase64(payload)
    );
    this.emitActivity("send");
  }

  private emitActivity(activity: BleActivity) {
    this.activityListener?.(activity);
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
