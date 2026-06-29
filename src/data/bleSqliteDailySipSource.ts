import { DailySipBleClient } from "../ble/dailySipBleClient";
import { isRegisteredDeviceId, SqliteDailySipStore } from "./sqliteDailySipStore";
import type { SyncedDeviceRecord, SyncedDeviceStatus } from "./syncTypes";
import type {
  BleActivity,
  BleLogEntry,
  DailySipDataSource,
  DailySipSettings,
  DailySipSnapshot,
  DiscoveredBottle,
  ManualIntakeInput,
} from "./types";

export class BleSqliteDailySipSource implements DailySipDataSource {
  private readonly store = new SqliteDailySipStore();
  private readonly ble = new DailySipBleClient();
  private liveSnapshotListener?: (snapshot: DailySipSnapshot) => void;
  private bleActivityListener?: (activity: BleActivity) => void;
  private bleLogListener?: (entry: BleLogEntry) => void;
  private liveSyncUnsubscribe?: () => void;
  private liveSyncStarting?: Promise<void>;
  private historySyncInProgress?: Promise<Awaited<ReturnType<DailySipBleClient["sync"]>>>;
  private lastAutoConnectError?: string;
  private appActive = false;

  constructor() {
    this.ble.setDisconnectListener(() => {
      void this.handleBleDisconnect();
    });
    this.ble.setActivityListener((activity) => {
      this.bleActivityListener?.(activity);
    });
    this.ble.setLogListener((entry) => {
      this.bleLogListener?.(entry);
    });
  }

  async loadSnapshot(): Promise<DailySipSnapshot> {
    return this.store.loadSnapshot();
  }

  subscribeToLiveSync(onSnapshot: (snapshot: DailySipSnapshot) => void) {
    this.liveSnapshotListener = onSnapshot;
    return () => {
      if (this.liveSnapshotListener === onSnapshot) {
        this.liveSnapshotListener = undefined;
      }
    };
  }

  subscribeToBleActivity(onActivity: (activity: BleActivity) => void) {
    this.bleActivityListener = onActivity;
    return () => {
      if (this.bleActivityListener === onActivity) {
        this.bleActivityListener = undefined;
      }
    };
  }

  subscribeToBleLog(onEntry: (entry: BleLogEntry) => void) {
    this.bleLogListener = onEntry;
    return () => {
      if (this.bleLogListener === onEntry) {
        this.bleLogListener = undefined;
      }
    };
  }

  setAppActive(isActive: boolean) {
    this.appActive = isActive;
    this.ble.setAppActive(isActive);
    if (!isActive) {
      this.clearLiveSyncMonitor();
    }
  }

  async autoConnectActiveDevice(): Promise<DailySipSnapshot | null> {
    const snapshot = await this.store.loadSnapshot();
    if (!isRegisteredDeviceId(snapshot.device.deviceId)) {
      return null;
    }

    const expectedDeviceId = snapshot.device.deviceId;

    try {
      const connection = await this.ble.connectToBottle(expectedDeviceId);
      const connectedSnapshot = await this.store.applyBleStatus(connection.status);
      this.publishSnapshot(connectedSnapshot);
      const syncedSnapshot = await this.syncConnectedDevice();
      void this.ensureLiveSyncMonitor();
      this.lastAutoConnectError = undefined;
      return syncedSnapshot ?? connectedSnapshot;
    } catch (caught) {
      const message = getErrorMessage(caught);
      if (this.lastAutoConnectError === message) {
        return null;
      }

      this.lastAutoConnectError = message;
      const failedSnapshot = await this.store.recordBleError(message);
      this.publishSnapshot(failedSnapshot);
      return failedSnapshot;
    }
  }

  async connectDevice(): Promise<DailySipSnapshot> {
    try {
      const connection = await this.ble.connectToBottle();
      const connectedSnapshot = await this.store.applyBleConnection(connection);
      this.publishSnapshot(connectedSnapshot);
      const syncedSnapshot = await this.syncConnectedDevice();
      void this.ensureLiveSyncMonitor();
      if (syncedSnapshot) {
        return syncedSnapshot;
      }
      return this.store.applyBleStatus(
        connection.status,
        "Terhubung ke botol. Riwayat belum berhasil diambil; tekan Sinkron riwayat.",
      );
    } catch (caught) {
      return this.store.recordBleError(getErrorMessage(caught));
    }
  }

  async scanBottles(): Promise<DiscoveredBottle[]> {
    return this.ble.scanBottles();
  }

  async registerBottle(scanId: string): Promise<DailySipSnapshot> {
    this.clearLiveSyncMonitor();
    try {
      const connection = await this.ble.connectToScannedBottle(scanId);
      const connectedSnapshot = await this.store.applyBleConnection(connection);
      this.publishSnapshot(connectedSnapshot);
      const syncedSnapshot = await this.syncConnectedDevice();
      void this.ensureLiveSyncMonitor();
      if (syncedSnapshot) {
        return syncedSnapshot;
      }
      return this.store.applyBleStatus(
        connection.status,
        "Terhubung ke botol. Riwayat belum berhasil diambil; tekan Sinkron riwayat.",
      );
    } catch (caught) {
      return this.store.recordBleError(getErrorMessage(caught));
    }
  }

  async syncNow(): Promise<DailySipSnapshot> {
    try {
      const snapshot = await this.store.loadSnapshot();
      const result = await this.syncHistory(snapshot);
      const nextSnapshot = await this.store.applyBleSync(result);
      void this.ensureLiveSyncMonitor();
      return nextSnapshot;
    } catch (caught) {
      const message = getErrorMessage(caught);
      const connectedSnapshot = await this.applySyncErrorIfStillConnected(message);
      return connectedSnapshot ?? this.store.recordBleError(message);
    }
  }

  async syncDeviceTime(): Promise<DailySipSnapshot> {
    try {
      const snapshot = await this.store.loadSnapshot();
      const expectedDeviceId = isRegisteredDeviceId(snapshot.device.deviceId)
        ? snapshot.device.deviceId
        : undefined;
      const status = await this.ble.syncDeviceTime(expectedDeviceId);
      const nextSnapshot = await this.store.applyBleStatus(status, "Bottle time synced.");
      void this.ensureLiveSyncMonitor();
      return nextSnapshot;
    } catch (caught) {
      return this.store.recordBleError(getErrorMessage(caught));
    }
  }

  async startCalibration(): Promise<DailySipSnapshot> {
    try {
      await this.ble.sendCommand("start_calibration");
      const status = await this.ble.readDeviceStatus();
      return this.store.applyBleStatus(status, "Mode kalibrasi dimulai. Ikuti bacaan berat di botol.");
    } catch (caught) {
      return this.store.recordBleError(getErrorMessage(caught));
    }
  }

  async refreshDeviceStatus(): Promise<DailySipSnapshot> {
    try {
      const status = await this.ble.readDeviceStatus();
      return this.store.applyBleStatus(status);
    } catch (caught) {
      return this.store.recordBleError(getErrorMessage(caught));
    }
  }

  async refreshLiveWeight(): Promise<DailySipSnapshot> {
    try {
      await this.ble.sendCommand("refresh_weight");
      const status = await this.ble.readDeviceStatus();
      return this.store.applyBleStatus(status);
    } catch (caught) {
      return this.store.recordBleError(getErrorMessage(caught));
    }
  }

  async saveTare(): Promise<DailySipSnapshot> {
    try {
      await this.ble.sendCommand("tare");
      const status = await this.ble.readDeviceStatus();
      await this.store.recordPendingBleCommand("tare", {}, "Perintah tara dikirim ke botol.");
      return this.store.applyBleStatus(status, "Perintah tara dikirim ke botol.");
    } catch (caught) {
      return this.store.recordBleError(getErrorMessage(caught));
    }
  }

  async confirmCalibrationAmount(amountMl: number): Promise<DailySipSnapshot> {
    try {
      await this.ble.sendCommand("calibrate_known_weight", { known_amount_ml: amountMl });
      const status = await this.ble.readDeviceStatus();
      return this.store.confirmCalibrationAmount(amountMl, status);
    } catch (caught) {
      return this.store.recordBleError(getErrorMessage(caught));
    }
  }

  async resetCalibrationToDefault(): Promise<DailySipSnapshot> {
    try {
      await this.ble.sendCommand("reset_calibration_default");
      const status = await this.ble.readDeviceStatus();
      return this.store.applyBleStatus(status, "Calibration reset to default.");
    } catch (caught) {
      return this.store.recordBleError(getErrorMessage(caught));
    }
  }

  async finishCalibration(): Promise<DailySipSnapshot> {
    try {
      await this.ble.sendCommand("finish_calibration");
      const status = await this.ble.readDeviceStatus();
      return this.store.applyBleStatus(status, "Mode kalibrasi selesai.");
    } catch (caught) {
      return this.store.recordBleError(getErrorMessage(caught));
    }
  }

  async saveCupCalibration(cupWeightTenthsG: number): Promise<DailySipSnapshot> {
    const snapshot = await this.store.loadSnapshot();
    return this.updateSettings({
      ...snapshot.settings,
      cupWeightTenthsG,
    });
  }

  async addManualIntake(input: ManualIntakeInput): Promise<DailySipSnapshot> {
    return this.store.addManualIntake(input);
  }

  async deleteHistoryForDate(dateKey: string): Promise<DailySipSnapshot> {
    return this.store.deleteHistoryForDate(dateKey);
  }

  async deleteHistoryRange(startDateKey: string, endDateKey: string): Promise<DailySipSnapshot> {
    return this.store.deleteHistoryRange(startDateKey, endDateKey);
  }

  async deleteAllHistory(): Promise<DailySipSnapshot> {
    return this.store.deleteAllHistory();
  }

  async renameDevice(name: string): Promise<DailySipSnapshot> {
    return this.store.renameDevice(name);
  }

  async removeDevice(): Promise<DailySipSnapshot> {
    this.clearLiveSyncMonitor();
    try {
      await this.ble.disconnect();
    } catch {
      // Local removal still succeeds if the phone has already dropped the BLE link.
    }
    const snapshot = await this.store.removeDevice();
    this.publishSnapshot(snapshot);
    return snapshot;
  }

  async updateSettings(settings: DailySipSettings): Promise<DailySipSnapshot> {
    const snapshot = await this.store.updateSettings(settings);
    await this.ble.writeSettingsIfConnected({
      ...snapshot.settings,
      overLimitThresholdPercent: 100,
    });
    return snapshot;
  }

  private async syncConnectedDevice(): Promise<DailySipSnapshot | null> {
    try {
      const snapshot = await this.store.loadSnapshot();
      const result = await this.syncHistory(snapshot);
      const syncedSnapshot = await this.store.applyBleSync(result);
      this.publishSnapshot(syncedSnapshot);
      return syncedSnapshot;
    } catch {
      return null;
    }
  }

  private async syncHistory(snapshot: DailySipSnapshot) {
    if (this.historySyncInProgress) {
      return this.historySyncInProgress;
    }

    const historyMode = snapshot.settings.historySyncMode;
    const afterRecordId = historyMode === "full" ? "" : snapshot.device.lastRecordId;

    const syncPromise = this.ble
      .sync(
        afterRecordId,
        {
          ...snapshot.settings,
          overLimitThresholdPercent: 100,
        },
        historyMode,
        toFallbackStatus(snapshot),
      )
      .finally(() => {
        if (this.historySyncInProgress === syncPromise) {
          this.historySyncInProgress = undefined;
        }
      });

    this.historySyncInProgress = syncPromise;
    return syncPromise;
  }

  private async ensureLiveSyncMonitor() {
    if (!this.appActive || this.liveSyncUnsubscribe || this.liveSyncStarting) {
      return this.liveSyncStarting;
    }

    this.liveSyncStarting = this.ble
      .monitorLiveRecords(
        (records) => {
          void this.applyLiveRecords(records).catch(() => undefined);
        },
        () => {
          this.clearLiveSyncMonitor();
        },
      )
      .then((subscription) => {
        if (!this.appActive) {
          subscription.remove();
          return;
        }
        this.liveSyncUnsubscribe = () => subscription.remove();
      })
      .catch(() => {
        this.clearLiveSyncMonitor();
      })
      .finally(() => {
        this.liveSyncStarting = undefined;
      });

    return this.liveSyncStarting;
  }

  private async applyLiveRecords(records: SyncedDeviceRecord[]) {
    if (!this.appActive || Boolean(this.historySyncInProgress) || records.length === 0) {
      return;
    }

    const status = await this.ble.readDeviceStatus();
    const acknowledgedRecordId = records[records.length - 1]?.recordId ?? status.lastRecordId;
    const snapshot = await this.store.applyBleSync({
      status,
      records,
      acknowledgedRecordId,
    });

    if (acknowledgedRecordId) {
      await this.ble.acknowledgeRecord(acknowledgedRecordId);
    }

    this.liveSnapshotListener?.(snapshot);
  }

  private async applySyncErrorIfStillConnected(message: string): Promise<DailySipSnapshot | null> {
    try {
      const status = await this.ble.readConnectedDeviceStatus();
      if (!status) {
        return null;
      }

      const snapshot = await this.store.applyBleStatus(status, `Riwayat belum berhasil diambil dari botol: ${message}`);
      this.publishSnapshot(snapshot);
      return snapshot;
    } catch {
      return null;
    }
  }

  private async handleBleDisconnect() {
    this.clearLiveSyncMonitor();

    try {
      const snapshot = await this.store.markBleOffline();
      this.publishSnapshot(snapshot);
    } catch {
      // Snapshot refresh failures should not crash BLE disconnect handling.
    }
  }

  private publishSnapshot(snapshot: DailySipSnapshot) {
    this.liveSnapshotListener?.(snapshot);
  }

  private clearLiveSyncMonitor() {
    this.liveSyncUnsubscribe?.();
    this.liveSyncUnsubscribe = undefined;
  }
}

const getErrorMessage = (caught: unknown) =>
  caught instanceof Error ? caught.message : "Tindakan BLE DialySip gagal.";

const toFallbackStatus = (snapshot: DailySipSnapshot): SyncedDeviceStatus => ({
  deviceId: snapshot.device.deviceId,
  name: snapshot.device.name,
  firmwareVersion: snapshot.device.firmwareVersion,
  connection: "connected",
  batteryPercent: snapshot.device.batteryPercent,
  chargerConnected: snapshot.device.chargerConnected,
  lastRecordId: snapshot.device.lastRecordId,
  currentWeightG: snapshot.device.currentWeightG,
  stableForSeconds: snapshot.device.stableForSeconds,
  calibrationActive: snapshot.device.calibrationActive,
  calibrationStep: snapshot.device.calibrationStep,
  calibrationFactor: snapshot.device.calibrationFactor,
  calibrated: snapshot.device.calibrated,
  rtcOk: snapshot.device.rtcOk,
  storageOk: snapshot.device.storageOk,
  sdOk: snapshot.device.sdOk,
  sensorOk: snapshot.device.sensorOk,
  lastSyncId: snapshot.device.lastRecordId,
});
