export type WarningState = "normal" | "near_limit" | "over_limit" | "low_battery" | "device_error";

export type ConnectionState = "connected" | "offline" | "scanning";

export type BleActivity = "send" | "receive";

export interface BleLogEntry {
  id: number;
  direction: BleActivity;
  characteristic: string;
  payload: string;
  timestamp: number;
}

export type CalibrationStep = "idle" | "wait_tare" | "wait_weight" | "live_weight";

export type RecordType =
  | "drink_auto"
  | "manual_sync_marker"
  | "manual_app"
  | "refill"
  | "tare"
  | "calibration"
  | "no_change"
  | "suspicious_change"
  | "battery_event"
  | "device_error"
  | "time_sync"
  | "settings_update";

export type IntakeCategory = "Mineral water" | "Tea" | "Soup" | "Other fluid";

export type HistoryRange = "daily" | "weekly" | "monthly";

export type HistorySyncMode = "full" | "after_last_sync";

export type LanguageCode = "id" | "en";

export interface DailySipSettings {
  dailyLimitMl: number;
  warningThresholdPercent: number;
  oledTimeoutSeconds: number;
  bleSyncWindowSeconds: number;
  historySyncMode: HistorySyncMode;
  historyRetentionDays: number;
  language: LanguageCode;
}

export interface DeviceStatus {
  deviceId: string;
  name: string;
  firmwareVersion: string;
  connection: ConnectionState;
  batteryPercent: number;
  lastSyncLabel: string;
  lastRecordId: string;
  unsyncedRecords: number;
  currentWeightG: number | null;
  stableForSeconds: number | null;
  calibrationActive: boolean;
  calibrationStep: CalibrationStep;
  calibrated: boolean;
  rtcOk: boolean;
  storageOk: boolean;
  sdOk: boolean;
  sensorOk: boolean;
}

export interface DailySummary {
  localDateLabel: string;
  totalMl: number;
  dailyLimitMl: number;
  remainingMl: number;
  autoMl: number;
  manualMl: number;
  ignoredMl: number;
  lastDrinkAmountMl: number;
  lastDrinkTimeLabel: string;
  warningState: WarningState;
}

export interface IntakeRecord {
  id: string;
  recordId?: string;
  type: RecordType;
  source: "device_auto" | "manual_app" | "edited_auto";
  amountMl: number;
  timeLabel: string;
  title: string;
  detail: string;
  ignored?: boolean;
  flagged?: boolean;
}

export interface HistoryPeriodSummary {
  id: string;
  range: HistoryRange;
  label: string;
  totalMl: number;
  autoMl: number;
  manualMl: number;
  ignoredMl: number;
  limitMl: number;
  warningState: WarningState;
  chartTotalsMl: number[];
  records: IntakeRecord[];
}

export interface DailySipSnapshot {
  mode: "demo" | "ble-sqlite";
  device: DeviceStatus;
  summary: DailySummary;
  settings: DailySipSettings;
  records: IntakeRecord[];
  weekTotalsMl: number[];
  history: Record<HistoryRange, HistoryPeriodSummary[]>;
  notice?: string;
}

export interface ManualIntakeInput {
  amountMl: number;
  category: IntakeCategory;
  dateKey?: string;
  note?: string;
}

export interface DailySipDataSource {
  loadSnapshot(): Promise<DailySipSnapshot>;
  subscribeToLiveSync(onSnapshot: (snapshot: DailySipSnapshot) => void): () => void;
  subscribeToBleActivity(onActivity: (activity: BleActivity) => void): () => void;
  subscribeToBleLog(onEntry: (entry: BleLogEntry) => void): () => void;
  setAppActive(isActive: boolean): void;
  autoConnectActiveDevice(): Promise<DailySipSnapshot | null>;
  connectDevice(): Promise<DailySipSnapshot>;
  syncNow(): Promise<DailySipSnapshot>;
  startCalibration(): Promise<DailySipSnapshot>;
  refreshDeviceStatus(): Promise<DailySipSnapshot>;
  saveTare(): Promise<DailySipSnapshot>;
  confirmCalibrationAmount(amountMl: number): Promise<DailySipSnapshot>;
  finishCalibration(): Promise<DailySipSnapshot>;
  addManualIntake(input: ManualIntakeInput): Promise<DailySipSnapshot>;
  deleteHistoryForDate(dateKey: string): Promise<DailySipSnapshot>;
  deleteAllHistory(): Promise<DailySipSnapshot>;
  renameDevice(name: string): Promise<DailySipSnapshot>;
  removeDevice(): Promise<DailySipSnapshot>;
  updateSettings(settings: DailySipSettings): Promise<DailySipSnapshot>;
}
