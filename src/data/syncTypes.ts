import type { CalibrationStep, ConnectionState, DailySipSettings, RecordType } from "./types";

export interface SyncedDeviceStatus {
  deviceId: string;
  name: string;
  firmwareVersion: string;
  connection: ConnectionState;
  batteryPercent: number;
  chargerConnected: boolean;
  lastRecordId: string;
  currentWeightG: number | null;
  stableForSeconds: number | null;
  calibrationActive: boolean;
  calibrationStep: CalibrationStep;
  calibrationFactor: number | null;
  calibrated: boolean;
  rtcOk: boolean;
  storageOk: boolean;
  sdOk: boolean;
  sensorOk: boolean;
  lastSyncId: string;
}

export interface SyncedDeviceRecord {
  recordId: string;
  timestampUtc: number;
  type: RecordType;
  amountMl: number;
  weightBeforeG?: number;
  weightAfterG?: number;
  confidence?: string;
  flags?: string[];
  note?: string;
}

export interface BleConnectionSnapshot {
  status: SyncedDeviceStatus;
}

export interface BleSyncResult {
  status: SyncedDeviceStatus;
  records: SyncedDeviceRecord[];
  acknowledgedRecordId: string;
  warning?: string;
}

export interface PendingDeviceSettings extends DailySipSettings {
  overLimitThresholdPercent: number;
}
