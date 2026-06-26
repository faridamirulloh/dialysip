import type { PendingDeviceSettings, SyncedDeviceRecord, SyncedDeviceStatus } from "../data/syncTypes";
import type { CalibrationStep } from "../data/types";

export const dailySipBleContract = {
  advertisedName: "DialySip",
  serviceUuid: "3f4f1000-9d9a-4a5f-8f13-102a2d4d1000",
  characteristics: {
    status: "3f4f1001-9d9a-4a5f-8f13-102a2d4d1000",
    settings: "3f4f1002-9d9a-4a5f-8f13-102a2d4d1000",
    timeSync: "3f4f1003-9d9a-4a5f-8f13-102a2d4d1000",
    command: "3f4f1004-9d9a-4a5f-8f13-102a2d4d1000",
    logStream: "3f4f1005-9d9a-4a5f-8f13-102a2d4d1000",
    ack: "3f4f1006-9d9a-4a5f-8f13-102a2d4d1000"
  }
} as const;

export interface DailySipBleStatusPayload {
  protocol_version?: number;
  device_id?: string;
  name?: string;
  firmware_version?: string;
  current_weight_g?: number | null;
  stable_for_ms?: number;
  calibration_active?: boolean;
  calibration_step?: string;
  today_total_ml?: number;
  battery_mv?: number;
  battery_percent?: number;
  storage_ok?: boolean;
  sd_ok?: boolean;
  rtc_ok?: boolean;
  sensor_ok?: boolean;
  bmi160_ok?: boolean;
  hx711_ok?: boolean;
  calibrated?: boolean;
  last_record_id?: string | number;
  last_sync_id?: string | number;
  last_acked_record_id?: string | number;
}

export interface DailySipBleLogPayload {
  sync_started?: boolean;
  sync_complete?: boolean;
  records_sent?: number;
  sync_error?: string;
  sync_warning?: string;
  records?: Array<{
    record_id: string | number;
    timestamp_utc: number;
    type: SyncedDeviceRecord["type"];
    amount_ml?: number;
    weight_before_g?: number;
    weight_after_g?: number;
    confidence?: string;
    flags?: string[] | string;
    note?: string;
  }>;
}

export type DailySipBleCommand =
  | "tare"
  | "start_calibration"
  | "finish_calibration"
  | "request_sync"
  | "heartbeat"
  | "clear_error"
  | "factory_reset";

export const toSyncedDeviceStatus = (
  payload: DailySipBleStatusPayload,
  fallbackName: string
): SyncedDeviceStatus => ({
  deviceId: payload.device_id ?? fallbackName,
  name: payload.name ?? fallbackName,
  firmwareVersion: payload.firmware_version ?? "unknown",
  connection: "connected",
  batteryPercent: payload.battery_percent ?? 0,
  lastRecordId: normalizeRecordId(payload.last_record_id),
  lastSyncId: normalizeRecordId(payload.last_sync_id ?? payload.last_acked_record_id),
  currentWeightG: payload.current_weight_g ?? null,
  stableForSeconds:
    typeof payload.stable_for_ms === "number"
      ? Math.max(0, payload.stable_for_ms / 1000)
      : null,
  calibrationActive: Boolean(payload.calibration_active),
  calibrationStep: normalizeCalibrationStep(
    payload.calibration_step,
    Boolean(payload.calibration_active),
    Boolean(payload.calibrated)
  ),
  calibrated: Boolean(payload.calibrated),
  rtcOk: Boolean(payload.rtc_ok),
  storageOk: Boolean(payload.storage_ok ?? payload.sd_ok),
  sdOk: Boolean(payload.storage_ok ?? payload.sd_ok),
  sensorOk: payload.sensor_ok ?? Boolean(payload.bmi160_ok && payload.hx711_ok)
});

export const toDeviceSettingsPayload = (settings: PendingDeviceSettings) => ({
  daily_limit_ml: settings.dailyLimitMl,
  warning_threshold_percent: settings.warningThresholdPercent,
  over_limit_threshold_percent: settings.overLimitThresholdPercent,
  oled_timeout_seconds: settings.oledTimeoutSeconds,
  ble_advertise_seconds: settings.bleSyncWindowSeconds,
  history_retention_days: settings.historyRetentionDays,
  drink_threshold_ml: 10,
  refill_threshold_ml: 50
});

export const toTimeSyncPayload = () => {
  const now = new Date();
  return {
    timestamp_utc: Math.floor(now.getTime() / 1000),
    timezone_offset_minutes: -now.getTimezoneOffset()
  };
};

export const toCommandPayload = (
  command: DailySipBleCommand,
  payload: Record<string, unknown> = {}
) => ({
  command,
  ...payload
});

export const toSyncedDeviceRecords = (
  payload: DailySipBleLogPayload
): SyncedDeviceRecord[] =>
  (payload.records ?? [])
    .map((record) => ({
      recordId: normalizeRecordId(record.record_id),
      timestampUtc: record.timestamp_utc,
      type: record.type,
      amountMl: record.amount_ml ?? 0,
      weightBeforeG: record.weight_before_g,
      weightAfterG: record.weight_after_g,
      confidence: record.confidence,
      flags: normalizeFlags(record.flags),
      note: record.note
    }))
    .filter((record) => record.recordId.length > 0);

const normalizeFlags = (flags: string[] | string | undefined) => {
  if (Array.isArray(flags)) {
    return flags;
  }

  if (!flags) {
    return undefined;
  }

  return flags
    .split(",")
    .map((flag) => flag.trim())
    .filter(Boolean);
};

export const normalizeRecordId = (recordId: string | number | null | undefined) => {
  if (typeof recordId === "number") {
    return recordId > 0 ? String(recordId) : "";
  }

  return recordId?.trim() ?? "";
};

const calibrationSteps: CalibrationStep[] = ["idle", "wait_tare", "wait_weight", "live_weight"];

const normalizeCalibrationStep = (
  step: string | undefined,
  calibrationActive: boolean,
  calibrated: boolean
): CalibrationStep => {
  if (step && calibrationSteps.includes(step as CalibrationStep)) {
    return step as CalibrationStep;
  }

  if (!calibrationActive) {
    return "idle";
  }

  return calibrated ? "live_weight" : "wait_tare";
};
