import type {
  ConnectionState,
  DailySipSettings,
  DailySipSnapshot,
  HistorySyncMode,
  HistoryPeriodSummary,
  IntakeCategory,
  IntakeRecord,
  ManualIntakeInput,
  RecordType,
  WarningState
} from "./types";
import type { BleConnectionSnapshot, BleSyncResult, SyncedDeviceRecord, SyncedDeviceStatus } from "./syncTypes";

type SQLiteModule = typeof import("expo-sqlite");
type SQLiteDatabase = Awaited<ReturnType<SQLiteModule["openDatabaseAsync"]>>;

const DATABASE_NAME = "dialysip.db";
const DATABASE_VERSION = 5;
const DEFAULT_DEVICE_ID = "dialysip-local";
const DEFAULT_DEVICE_NAME = "DialySip";
const DAY_MS = 24 * 60 * 60 * 1000;

let databasePromise: Promise<SQLiteDatabase> | null = null;

interface SettingsRow {
  daily_limit_ml: number;
  warning_threshold_percent: number;
  oled_timeout_seconds: number;
  ble_sync_window_seconds: number;
  history_sync_mode: HistorySyncMode | null;
  history_retention_days: number;
  language: DailySipSettings["language"];
}

interface DeviceRow {
  device_id: string;
  name: string;
  firmware_version: string;
  last_seen_at: number | null;
  last_synced_record_id: string | number | null;
  battery_percent: number;
  connection_state: ConnectionState;
  calibrated: number;
  rtc_ok: number;
  sd_ok: number;
  sensor_ok: number;
}

interface IntakeRecordRow {
  id: string;
  device_id: string;
  record_id: string | number | null;
  source: IntakeRecord["source"];
  type: RecordType;
  amount_ml: number;
  timestamp_utc: number;
  local_date: string;
  weight_before_g: number | null;
  weight_after_g: number | null;
  confidence: string | null;
  flags_json: string;
  note: string | null;
  category: IntakeCategory | null;
  ignored: number;
  created_at: number;
  updated_at: number;
}

interface TotalRow {
  total_ml: number | null;
  auto_ml: number | null;
  manual_ml: number | null;
  ignored_ml: number | null;
}

interface DailyTotalRow {
  local_date: string;
  total_ml: number | null;
  auto_ml: number | null;
  manual_ml: number | null;
  ignored_ml: number | null;
}

const openDatabase = async () => {
  if (!databasePromise) {
    databasePromise = (async () => {
      const SQLite = await import("expo-sqlite");
      const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await migrateDatabase(db);
      return db;
    })();
  }

  return databasePromise;
};

const migrateDatabase = async (db: SQLiteDatabase) => {
  const row = await db.getFirstAsync<{ user_version: number }>("PRAGMA user_version");
  const currentVersion = row?.user_version ?? 0;

  if (currentVersion >= DATABASE_VERSION) {
    return;
  }

  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS devices (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      display_name TEXT,
      firmware_version TEXT NOT NULL,
      last_seen_at INTEGER,
      last_synced_record_id TEXT NOT NULL DEFAULT '',
      battery_percent INTEGER NOT NULL DEFAULT 0,
      connection_state TEXT NOT NULL DEFAULT 'offline',
      calibrated INTEGER NOT NULL DEFAULT 0,
      rtc_ok INTEGER NOT NULL DEFAULT 0,
      sd_ok INTEGER NOT NULL DEFAULT 0,
      sensor_ok INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS intake_records (
      id TEXT PRIMARY KEY NOT NULL,
      device_id TEXT NOT NULL,
      record_id TEXT,
      source TEXT NOT NULL,
      type TEXT NOT NULL,
      amount_ml INTEGER NOT NULL,
      timestamp_utc INTEGER NOT NULL,
      local_date TEXT NOT NULL,
      weight_before_g INTEGER,
      weight_after_g INTEGER,
      confidence TEXT,
      flags_json TEXT NOT NULL DEFAULT '[]',
      note TEXT,
      category TEXT,
      ignored INTEGER NOT NULL DEFAULT 0,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE INDEX IF NOT EXISTS intake_records_local_date_idx
      ON intake_records (local_date, timestamp_utc DESC);

    CREATE TABLE IF NOT EXISTS device_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      device_id TEXT NOT NULL,
      record_id TEXT,
      type TEXT NOT NULL,
      timestamp_utc INTEGER NOT NULL,
      payload_json TEXT NOT NULL DEFAULT '{}',
      created_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_summaries (
      date TEXT PRIMARY KEY NOT NULL,
      total_ml INTEGER NOT NULL,
      auto_ml INTEGER NOT NULL,
      manual_ml INTEGER NOT NULL,
      ignored_ml INTEGER NOT NULL,
      limit_ml INTEGER NOT NULL,
      warning_state TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS app_settings (
      id INTEGER PRIMARY KEY CHECK (id = 1),
      daily_limit_ml INTEGER NOT NULL,
      warning_threshold_percent INTEGER NOT NULL,
      oled_timeout_seconds INTEGER NOT NULL,
      ble_sync_window_seconds INTEGER NOT NULL,
      history_sync_mode TEXT NOT NULL DEFAULT 'after_last_sync',
      history_retention_days INTEGER NOT NULL DEFAULT 10,
      language TEXT NOT NULL,
      timezone TEXT NOT NULL,
      updated_at INTEGER NOT NULL
    );
  `);

  if (currentVersion > 0 && currentVersion < 3) {
    await addColumnIfMissing(
      db,
      "app_settings",
      "history_retention_days",
      "INTEGER NOT NULL DEFAULT 10"
    );
  }

  if (currentVersion > 0 && currentVersion < 4) {
    await addColumnIfMissing(
      db,
      "app_settings",
      "history_sync_mode",
      "TEXT NOT NULL DEFAULT 'after_last_sync'"
    );
  }

  if (currentVersion > 0 && currentVersion < 5) {
    await addColumnIfMissing(db, "devices", "display_name", "TEXT");
  }

  const now = unixNow();
  await db.runAsync(
    `INSERT OR IGNORE INTO app_settings (
      id,
      daily_limit_ml,
      warning_threshold_percent,
      oled_timeout_seconds,
      ble_sync_window_seconds,
      history_sync_mode,
      history_retention_days,
      language,
      timezone,
      updated_at
    ) VALUES (1, 1000, 80, 15, 60, 'after_last_sync', 10, 'id', 'local', ?)`,
    now
  );
  await db.runAsync(
    `INSERT OR IGNORE INTO devices (
      device_id,
      name,
      firmware_version,
      last_seen_at,
      last_synced_record_id,
      battery_percent,
      connection_state,
      calibrated,
      rtc_ok,
      sd_ok,
      sensor_ok,
      created_at,
      updated_at
    ) VALUES (?, ?, 'unknown', NULL, '', 0, 'offline', 0, 0, 0, 0, ?, ?)`,
    DEFAULT_DEVICE_ID,
    DEFAULT_DEVICE_NAME,
    now,
    now
  );
  await db.execAsync(`PRAGMA user_version = ${DATABASE_VERSION}`);
};

const addColumnIfMissing = async (
  db: SQLiteDatabase,
  tableName: string,
  columnName: string,
  definition: string
) => {
  const columns = await db.getAllAsync<{ name: string }>(`PRAGMA table_info(${tableName})`);
  if (columns.some((column) => column.name === columnName)) {
    return;
  }

  await db.execAsync(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
};

const normalizeHistorySyncMode = (value: string | null | undefined): HistorySyncMode =>
  value === "full" ? "full" : "after_last_sync";

export class SqliteDailySipStore {
  private notice?: string;
  private latestDeviceStatus?: SyncedDeviceStatus;

  async loadSnapshot(): Promise<DailySipSnapshot> {
    const db = await openDatabase();
    return this.buildSnapshot(db);
  }

  async applyBleConnection(connection: BleConnectionSnapshot): Promise<DailySipSnapshot> {
    const db = await openDatabase();
    await this.updateDeviceFromStatus(db, connection.status);
    await this.insertDeviceEvent(db, "ble_connected", {
      device_id: connection.status.deviceId,
      firmware_version: connection.status.firmwareVersion
    });
    this.notice = `Terhubung ke ${connection.status.name}. Waktu ponsel sudah disinkronkan.`;
    return this.buildSnapshot(db);
  }

  async applyBleStatus(status: SyncedDeviceStatus, notice?: string): Promise<DailySipSnapshot> {
    const db = await openDatabase();
    await this.updateDeviceFromStatus(db, status);
    if (notice) {
      this.notice = notice;
    }
    return this.buildSnapshot(db);
  }

  async applyBleSync(result: BleSyncResult): Promise<DailySipSnapshot> {
    const db = await openDatabase();
    await this.updateDeviceFromStatus(db, result.status, result.acknowledgedRecordId);
    const changedDates = new Set<string>();
    let insertedRecords = 0;

    for (const record of result.records) {
      const insertResult = await this.insertSyncedDeviceRecord(db, result.status.deviceId, record);
      if (insertResult.inserted) {
        insertedRecords += 1;
        changedDates.add(insertResult.dateKey);
      }
    }

    if (changedDates.size === 0) {
      changedDates.add(toLocalDateKey(new Date()));
    }

    for (const dateKey of changedDates) {
      await this.upsertDailySummary(db, dateKey);
    }

    await this.insertDeviceEvent(db, "sync_complete", {
      acknowledged_record_id: result.acknowledgedRecordId,
      records_received: result.records.length,
      records_inserted: insertedRecords
    });
    const syncNotice = insertedRecords
      ? `Data riwayat berhasil diambil dari botol. ${insertedRecords} catatan baru disimpan dari ${result.records.length} diterima.`
      : result.records.length
        ? `Data riwayat berhasil diambil dari botol. ${result.records.length} catatan diterima, semuanya sudah ada.`
      : "Data riwayat berhasil diambil dari botol. Tidak ada catatan baru.";
    this.notice = result.warning ? `${syncNotice} ${result.warning}` : syncNotice;
    return this.buildSnapshot(db);
  }

  async recordBleError(message: string): Promise<DailySipSnapshot> {
    const db = await openDatabase();
    const now = unixNow();

    await db.runAsync(
      `UPDATE devices
        SET connection_state = 'offline',
            updated_at = ?
        WHERE id = (SELECT id FROM devices ORDER BY id ASC LIMIT 1)`,
      now
    );
    await this.insertDeviceEvent(db, "ble_error", { message });
    this.notice = message;
    return this.buildSnapshot(db);
  }

  async markBleOffline(): Promise<DailySipSnapshot> {
    const db = await openDatabase();
    const now = unixNow();

    await db.runAsync(
      `UPDATE devices
        SET connection_state = 'offline',
            updated_at = ?
        WHERE id = (SELECT id FROM devices ORDER BY id ASC LIMIT 1)`,
      now
    );
    return this.buildSnapshot(db);
  }

  async recordPendingBleCommand(
    type: string,
    payload: Record<string, unknown>,
    notice: string
  ): Promise<DailySipSnapshot> {
    const db = await openDatabase();
    await this.insertDeviceEvent(db, type, payload);
    this.notice = notice;
    return this.buildSnapshot(db);
  }

  async markPairingRequested(): Promise<DailySipSnapshot> {
    const db = await openDatabase();
    const now = unixNow();

    await db.runAsync(
      `UPDATE devices
        SET connection_state = 'scanning',
            last_seen_at = ?,
            updated_at = ?
        WHERE device_id = ?`,
      now,
      now,
      DEFAULT_DEVICE_ID
    );
    await this.insertDeviceEvent(db, "pairing_requested", { requested_at: now });
    this.notice = "Pemasangan BLE belum terhubung. Penyimpanan SQLite lokal sudah siap.";
    return this.buildSnapshot(db);
  }

  async markSyncRequested(): Promise<DailySipSnapshot> {
    const db = await openDatabase();
    const now = unixNow();
    const latestRecord = await db.getFirstAsync<{ record_id: string | number | null }>(
      `SELECT record_id
      FROM intake_records
      WHERE record_id IS NOT NULL
      ORDER BY timestamp_utc DESC, created_at DESC
      LIMIT 1`
    );

    await db.runAsync(
      `UPDATE devices
        SET last_seen_at = ?,
            last_synced_record_id = ?,
            updated_at = ?
        WHERE device_id = ?`,
      now,
      normalizeStoredRecordId(latestRecord?.record_id),
      now,
      DEFAULT_DEVICE_ID
    );
    await this.insertDeviceEvent(db, "sync_requested", { requested_at: now });
    this.notice = "Database lokal sudah diperiksa. Sinkron log BLE akan dipasang ke langkah ini berikutnya.";
    return this.buildSnapshot(db);
  }

  async saveTare(): Promise<DailySipSnapshot> {
    const db = await openDatabase();
    await this.insertDeviceEvent(db, "tare", { mode: "app_command" });
    this.notice = "Perintah tare tersimpan lokal. Pengiriman perintah BLE adalah langkah berikutnya.";
    return this.buildSnapshot(db);
  }

  async confirmCalibrationAmount(amountMl: number, status?: SyncedDeviceStatus): Promise<DailySipSnapshot> {
    const db = await openDatabase();
    const now = unixNow();

    if (status) {
      await this.updateDeviceFromStatus(db, { ...status, calibrated: true });
    }

    await db.runAsync(
      `UPDATE devices
        SET calibrated = 1,
            updated_at = ?
        WHERE id = (SELECT id FROM devices ORDER BY id ASC LIMIT 1)`,
      now
    );
    await this.insertDeviceEvent(db, "calibration", { known_amount_ml: amountMl });
    this.notice = `Kalibrasi tersimpan lokal dengan jumlah acuan ${amountMl} ml.`;
    return this.buildSnapshot(db);
  }

  async addManualIntake(input: ManualIntakeInput): Promise<DailySipSnapshot> {
    const db = await openDatabase();
    const nowDate = new Date();
    const dateKey = input.dateKey ? normalizeDateKey(input.dateKey) : toLocalDateKey(nowDate);
    const entryDate = parseDateKey(dateKey);
    const entryTimestamp = new Date(
      entryDate.getFullYear(),
      entryDate.getMonth(),
      entryDate.getDate(),
      nowDate.getHours(),
      nowDate.getMinutes(),
      nowDate.getSeconds()
    );
    const now = toUnix(entryTimestamp);
    const createdAt = unixNow();
    const note = input.note?.trim() || null;
    const id = `manual-${dateKey}-${createdAt}-${Math.random().toString(36).slice(2, 8)}`;

    await db.runAsync(
      `INSERT INTO intake_records (
        id,
        device_id,
        record_id,
        source,
        type,
        amount_ml,
        timestamp_utc,
        local_date,
        weight_before_g,
        weight_after_g,
        confidence,
        flags_json,
        note,
        category,
        ignored,
        created_at,
        updated_at
      ) VALUES (?, ?, NULL, 'manual_app', 'manual_app', ?, ?, ?, NULL, NULL, 'normal', '[]', ?, ?, 0, ?, ?)`,
      id,
      DEFAULT_DEVICE_ID,
      input.amountMl,
      now,
      dateKey,
      note,
      input.category,
      createdAt,
      createdAt
    );
    this.notice =
      dateKey === toLocalDateKey(nowDate)
        ? `${input.category} added to today's total.`
        : `${input.category} added to ${dateKey}.`;
    await this.upsertDailySummary(db, dateKey);
    return this.buildSnapshot(db);
  }

  async deleteHistoryForDate(dateKey: string): Promise<DailySipSnapshot> {
    const db = await openDatabase();
    const normalizedDateKey = normalizeDateKey(dateKey);

    await db.runAsync("DELETE FROM intake_records WHERE local_date = ?", normalizedDateKey);
    await db.runAsync("DELETE FROM daily_summaries WHERE date = ?", normalizedDateKey);
    await db.runAsync(
      "DELETE FROM device_events WHERE date(timestamp_utc, 'unixepoch', 'localtime') = ?",
      normalizedDateKey
    );
    this.notice = `Riwayat tanggal ${normalizedDateKey} dihapus.`;
    return this.buildSnapshot(db);
  }

  async deleteAllHistory(): Promise<DailySipSnapshot> {
    const db = await openDatabase();

    await db.runAsync("DELETE FROM intake_records");
    await db.runAsync("DELETE FROM daily_summaries");
    await db.runAsync("DELETE FROM device_events");
    this.notice = "Semua riwayat dihapus.";
    return this.buildSnapshot(db);
  }

  async renameDevice(name: string): Promise<DailySipSnapshot> {
    const displayName = name.trim().slice(0, 48);
    if (!displayName) {
      throw new Error("Bottle name cannot be empty.");
    }

    const db = await openDatabase();
    await db.runAsync(
      `UPDATE devices
        SET display_name = ?,
            updated_at = ?
        WHERE id = (SELECT id FROM devices ORDER BY id ASC LIMIT 1)`,
      displayName,
      unixNow()
    );
    this.notice = "Nama botol diperbarui.";
    return this.buildSnapshot(db);
  }

  async removeDevice(): Promise<DailySipSnapshot> {
    const db = await openDatabase();
    const now = unixNow();

    await db.runAsync("DELETE FROM devices");
    await db.runAsync(
      `INSERT INTO devices (
        device_id,
        name,
        firmware_version,
        last_seen_at,
        last_synced_record_id,
        battery_percent,
        connection_state,
        calibrated,
        rtc_ok,
        sd_ok,
        sensor_ok,
        created_at,
        updated_at
      ) VALUES (?, ?, 'unknown', NULL, '', 0, 'offline', 0, 0, 0, 0, ?, ?)`,
      DEFAULT_DEVICE_ID,
      DEFAULT_DEVICE_NAME,
      now,
      now
    );

    this.latestDeviceStatus = undefined;
    this.notice = "Botol dihapus dari aplikasi.";
    return this.buildSnapshot(db);
  }

  async updateSettings(settings: DailySipSettings): Promise<DailySipSnapshot> {
    const db = await openDatabase();
    const now = unixNow();

    await db.runAsync(
      `UPDATE app_settings
        SET daily_limit_ml = ?,
            warning_threshold_percent = ?,
            oled_timeout_seconds = ?,
            ble_sync_window_seconds = ?,
            history_sync_mode = ?,
            history_retention_days = ?,
            language = ?,
            updated_at = ?
        WHERE id = 1`,
      settings.dailyLimitMl,
      settings.warningThresholdPercent,
      settings.oledTimeoutSeconds,
      settings.bleSyncWindowSeconds,
      settings.historySyncMode,
      settings.historyRetentionDays,
      settings.language,
      now
    );

    await this.upsertDailySummary(db, toLocalDateKey(new Date()));
    this.notice = "Pengaturan tersimpan ke SQLite.";
    return this.buildSnapshot(db);
  }

  private async buildSnapshot(db: SQLiteDatabase): Promise<DailySipSnapshot> {
    const settings = await this.readSettings(db);
    const device = await this.readDevice(db);
    const todayKey = toLocalDateKey(new Date());
    const todayRecords = await this.readRecordsForRange(db, todayKey, todayKey);
    const summary = await this.buildDailySummary(db, settings, device, todayKey);
    const history = await this.buildHistory(db, settings, device);
    const weekTotalsMl = history.weekly[0]?.chartTotalsMl ?? [0, 0, 0, 0, 0, 0, 0];
    const lastSyncedRecordId = normalizeStoredRecordId(device.last_synced_record_id);

    return {
      mode: "ble-sqlite",
      device: {
        deviceId: device.device_id,
        name: device.name,
        firmwareVersion: device.firmware_version,
        connection: device.connection_state,
        batteryPercent: device.battery_percent,
        lastSyncLabel: formatRelativeTime(device.last_seen_at),
        lastRecordId: lastSyncedRecordId,
        unsyncedRecords: await this.countUnsyncedRecords(db, lastSyncedRecordId),
        currentWeightG: this.latestDeviceStatus?.currentWeightG ?? null,
        stableForSeconds: this.latestDeviceStatus?.stableForSeconds ?? null,
        calibrationActive: this.latestDeviceStatus?.calibrationActive ?? false,
        calibrationStep: this.latestDeviceStatus?.calibrationStep ?? "idle",
        calibrated: Boolean(device.calibrated),
        rtcOk: Boolean(device.rtc_ok),
        storageOk: Boolean(device.sd_ok),
        sdOk: Boolean(device.sd_ok),
        sensorOk: Boolean(device.sensor_ok)
      },
      summary,
      settings,
      records: todayRecords.map(toIntakeRecord),
      weekTotalsMl,
      history,
      notice: this.notice
    };
  }

  private async readSettings(db: SQLiteDatabase): Promise<DailySipSettings> {
    const row = await db.getFirstAsync<SettingsRow>(
      `SELECT
        daily_limit_ml,
        warning_threshold_percent,
        oled_timeout_seconds,
        ble_sync_window_seconds,
        history_sync_mode,
        history_retention_days,
        language
      FROM app_settings
      WHERE id = 1`
    );

    return {
      dailyLimitMl: row?.daily_limit_ml ?? 1000,
      warningThresholdPercent: row?.warning_threshold_percent ?? 80,
      oledTimeoutSeconds: row?.oled_timeout_seconds ?? 15,
      bleSyncWindowSeconds: row?.ble_sync_window_seconds ?? 60,
      historySyncMode: normalizeHistorySyncMode(row?.history_sync_mode),
      historyRetentionDays: row?.history_retention_days ?? 10,
      language: row?.language ?? "id"
    };
  }

  private async readDevice(db: SQLiteDatabase): Promise<DeviceRow> {
    const row = await db.getFirstAsync<DeviceRow>(
      `SELECT
        device_id,
        COALESCE(NULLIF(display_name, ''), name) AS name,
        firmware_version,
        last_seen_at,
        last_synced_record_id,
        battery_percent,
        connection_state,
        calibrated,
        rtc_ok,
        sd_ok,
        sensor_ok
      FROM devices
      ORDER BY id ASC
      LIMIT 1`
    );

    if (row) {
      return row;
    }

    const now = unixNow();
    await db.runAsync(
      `INSERT INTO devices (
        device_id,
        name,
        firmware_version,
        created_at,
        updated_at
      ) VALUES (?, ?, 'unknown', ?, ?)`,
      DEFAULT_DEVICE_ID,
      DEFAULT_DEVICE_NAME,
      now,
      now
    );

    return {
      device_id: DEFAULT_DEVICE_ID,
      name: DEFAULT_DEVICE_NAME,
      firmware_version: "unknown",
      last_seen_at: null,
      last_synced_record_id: "",
      battery_percent: 0,
      connection_state: "offline",
      calibrated: 0,
      rtc_ok: 0,
      sd_ok: 0,
      sensor_ok: 0
    };
  }

  private async buildDailySummary(
    db: SQLiteDatabase,
    settings: DailySipSettings,
    device: DeviceRow,
    dateKey: string
  ): Promise<DailySipSnapshot["summary"]> {
    const records = await this.readRecordsForRange(db, dateKey, dateKey);
    const totals = summarizeRows(records);
    const lastIntake = records.find((record) => record.amount_ml > 0 && !record.ignored);
    const warningState = getWarningState(totals.totalMl, settings, device.battery_percent);

    return {
      localDateLabel: formatDateLabel(parseDateKey(dateKey), settings.language),
      totalMl: totals.totalMl,
      dailyLimitMl: settings.dailyLimitMl,
      remainingMl: Math.max(settings.dailyLimitMl - totals.totalMl, 0),
      autoMl: totals.autoMl,
      manualMl: totals.manualMl,
      ignoredMl: totals.ignoredMl,
      lastDrinkAmountMl: lastIntake?.amount_ml ?? 0,
      lastDrinkTimeLabel: lastIntake ? formatTime(lastIntake.timestamp_utc) : "No records",
      warningState
    };
  }

  private async buildHistory(
    db: SQLiteDatabase,
    settings: DailySipSettings,
    device: DeviceRow
  ): Promise<DailySipSnapshot["history"]> {
    const recordDateKeys = await this.readRecordDateKeys(db);

    return {
      daily: await this.buildDailyHistory(db, settings, device, recordDateKeys),
      weekly: await this.buildWeeklyHistory(db, settings, device, recordDateKeys),
      monthly: await this.buildMonthlyHistory(db, settings, device, recordDateKeys)
    };
  }

  private async buildDailyHistory(
    db: SQLiteDatabase,
    settings: DailySipSettings,
    device: DeviceRow,
    recordDateKeys: string[]
  ): Promise<HistoryPeriodSummary[]> {
    const today = startOfDay(new Date());
    const todayKey = toLocalDateKey(today);
    const dateKeys = uniqueSortedDateKeys([
      ...Array.from({ length: 7 }, (_, offset) => toLocalDateKey(addDays(today, -offset))),
      ...recordDateKeys
    ]);
    const periods: HistoryPeriodSummary[] = [];

    for (const key of dateKeys) {
      const day = parseDateKey(key);
      const rows = await this.readRecordsForRange(db, key, key);
      const totals = summarizeRows(rows);

      periods.push({
        id: key,
        range: "daily",
        label: key === todayKey ? todayLabel(settings.language, day) : formatShortDateLabel(day, settings.language),
        totalMl: totals.totalMl,
        autoMl: totals.autoMl,
        manualMl: totals.manualMl,
        ignoredMl: totals.ignoredMl,
        limitMl: settings.dailyLimitMl,
        warningState: getWarningState(totals.totalMl, settings, device.battery_percent),
        chartTotalsMl: buildDailyRangeChart(rows, day),
        records: rows.map(toIntakeRecord)
      });
    }

    return periods;
  }

  private async buildWeeklyHistory(
    db: SQLiteDatabase,
    settings: DailySipSettings,
    device: DeviceRow,
    recordDateKeys: string[]
  ): Promise<HistoryPeriodSummary[]> {
    const currentWeek = startOfWeek(new Date());
    const weekStarts = uniqueSortedPeriodStarts([
      ...Array.from({ length: 4 }, (_, offset) => addDays(currentWeek, -offset * 7)),
      ...recordDateKeys.map((dateKey) => startOfWeek(parseDateKey(dateKey)))
    ]);
    const periods: HistoryPeriodSummary[] = [];

    for (const start of weekStarts) {
      const end = addDays(start, 6);
      const rows = await this.readRecordsForRange(db, toLocalDateKey(start), toLocalDateKey(end));
      const totals = summarizeRows(rows);

      periods.push({
        id: `${toLocalDateKey(start)}-${toLocalDateKey(end)}`,
        range: "weekly",
        label: formatRangeLabel(start, end, settings.language),
        totalMl: totals.totalMl,
        autoMl: totals.autoMl,
        manualMl: totals.manualMl,
        ignoredMl: totals.ignoredMl,
        limitMl: settings.dailyLimitMl * 7,
        warningState: getWarningState(totals.totalMl, settings, device.battery_percent),
        chartTotalsMl: await this.readDailyTotals(db, start, 7),
        records: rows.map(toIntakeRecord)
      });
    }

    return periods;
  }

  private async buildMonthlyHistory(
    db: SQLiteDatabase,
    settings: DailySipSettings,
    device: DeviceRow,
    recordDateKeys: string[]
  ): Promise<HistoryPeriodSummary[]> {
    const currentMonth = startOfMonth(new Date());
    const monthStarts = uniqueSortedPeriodStarts([
      ...Array.from({ length: 6 }, (_, offset) => addMonths(currentMonth, -offset)),
      ...recordDateKeys.map((dateKey) => startOfMonth(parseDateKey(dateKey)))
    ]);
    const periods: HistoryPeriodSummary[] = [];

    for (const start of monthStarts) {
      const end = endOfMonth(start);
      const rows = await this.readRecordsForRange(db, toLocalDateKey(start), toLocalDateKey(end));
      const totals = summarizeRows(rows);

      periods.push({
        id: `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, "0")}`,
        range: "monthly",
        label: formatMonthLabel(start, settings.language),
        totalMl: totals.totalMl,
        autoMl: totals.autoMl,
        manualMl: totals.manualMl,
        ignoredMl: totals.ignoredMl,
        limitMl: settings.dailyLimitMl * daysInMonth(start),
        warningState: getWarningState(totals.totalMl, settings, device.battery_percent),
        chartTotalsMl: buildMonthlyBuckets(rows, start),
        records: rows.map(toIntakeRecord)
      });
    }

    return periods;
  }

  private async readRecordsForRange(
    db: SQLiteDatabase,
    startDate: string,
    endDate: string
  ): Promise<IntakeRecordRow[]> {
    return db.getAllAsync<IntakeRecordRow>(
      `SELECT
        id,
        device_id,
        record_id,
        source,
        type,
        amount_ml,
        timestamp_utc,
        local_date,
        weight_before_g,
        weight_after_g,
        confidence,
        flags_json,
        note,
        category,
        ignored,
        created_at,
        updated_at
      FROM intake_records
      WHERE local_date >= ?
        AND local_date <= ?
      ORDER BY timestamp_utc DESC, created_at DESC`,
      startDate,
      endDate
    );
  }

  private async readRecordDateKeys(db: SQLiteDatabase): Promise<string[]> {
    const rows = await db.getAllAsync<{ local_date: string }>(
      `SELECT DISTINCT local_date
      FROM intake_records
      ORDER BY local_date DESC`
    );

    return rows.map((row) => row.local_date).filter(isDateKey);
  }

  private async readDailyTotals(
    db: SQLiteDatabase,
    startDate: Date,
    days: number
  ): Promise<number[]> {
    const endDate = addDays(startDate, days - 1);
    const rows = await db.getAllAsync<DailyTotalRow>(
      `SELECT
        local_date,
        SUM(CASE WHEN ignored = 0 AND (type IN ('drink_auto', 'manual_app') OR source = 'edited_auto') THEN amount_ml ELSE 0 END) AS total_ml,
        SUM(CASE WHEN ignored = 0 AND source = 'device_auto' AND type = 'drink_auto' THEN amount_ml ELSE 0 END) AS auto_ml,
        SUM(CASE WHEN ignored = 0 AND source = 'manual_app' AND type = 'manual_app' THEN amount_ml ELSE 0 END) AS manual_ml,
        SUM(CASE WHEN ignored = 1 THEN amount_ml ELSE 0 END) AS ignored_ml
      FROM intake_records
      WHERE local_date >= ?
        AND local_date <= ?
      GROUP BY local_date`,
      toLocalDateKey(startDate),
      toLocalDateKey(endDate)
    );
    const totalsByDate = new Map(rows.map((row) => [row.local_date, row.total_ml ?? 0]));

    return Array.from({ length: days }, (_, index) =>
      totalsByDate.get(toLocalDateKey(addDays(startDate, index))) ?? 0
    );
  }

  private async upsertDailySummary(db: SQLiteDatabase, dateKey: string) {
    const settings = await this.readSettings(db);
    const device = await this.readDevice(db);
    const records = await this.readRecordsForRange(db, dateKey, dateKey);
    const totals = summarizeRows(records);
    const warningState = getWarningState(totals.totalMl, settings, device.battery_percent);

    await db.runAsync(
      `INSERT INTO daily_summaries (
        date,
        total_ml,
        auto_ml,
        manual_ml,
        ignored_ml,
        limit_ml,
        warning_state,
        updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(date) DO UPDATE SET
        total_ml = excluded.total_ml,
        auto_ml = excluded.auto_ml,
        manual_ml = excluded.manual_ml,
        ignored_ml = excluded.ignored_ml,
        limit_ml = excluded.limit_ml,
        warning_state = excluded.warning_state,
        updated_at = excluded.updated_at`,
      dateKey,
      totals.totalMl,
      totals.autoMl,
      totals.manualMl,
      totals.ignoredMl,
      settings.dailyLimitMl,
      warningState,
      unixNow()
    );
  }

  private async insertDeviceEvent(
    db: SQLiteDatabase,
    type: string,
    payload: Record<string, unknown>
  ) {
    const now = unixNow();
    await db.runAsync(
      `INSERT INTO device_events (
        device_id,
        record_id,
        type,
        timestamp_utc,
        payload_json,
        created_at
      ) VALUES (?, NULL, ?, ?, ?, ?)`,
      DEFAULT_DEVICE_ID,
      type,
      now,
      JSON.stringify(payload),
      now
    );
  }

  private async updateDeviceFromStatus(
    db: SQLiteDatabase,
    status: SyncedDeviceStatus,
    acknowledgedRecordId?: string
  ) {
    this.latestDeviceStatus = status;
    const now = unixNow();
    const acknowledgedRecordIdValue =
      normalizeStoredRecordId(acknowledgedRecordId) || normalizeStoredRecordId(status.lastSyncId);

    if (acknowledgedRecordIdValue) {
      await db.runAsync(
        `UPDATE devices
          SET display_name = CASE WHEN device_id <> ? THEN NULL ELSE display_name END,
              device_id = ?,
              name = ?,
              firmware_version = ?,
              last_seen_at = ?,
              last_synced_record_id = ?,
              battery_percent = ?,
              connection_state = ?,
              calibrated = ?,
              rtc_ok = ?,
              sd_ok = ?,
              sensor_ok = ?,
              updated_at = ?
          WHERE id = (SELECT id FROM devices ORDER BY id ASC LIMIT 1)`,
        status.deviceId,
        status.deviceId,
        status.name,
        status.firmwareVersion,
        now,
        acknowledgedRecordIdValue,
        status.batteryPercent,
        status.connection,
        status.calibrated ? 1 : 0,
        status.rtcOk ? 1 : 0,
        status.storageOk ? 1 : 0,
        status.sensorOk ? 1 : 0,
        now
      );
      return;
    }

    await db.runAsync(
      `UPDATE devices
        SET display_name = CASE WHEN device_id <> ? THEN NULL ELSE display_name END,
            device_id = ?,
            name = ?,
            firmware_version = ?,
            last_seen_at = ?,
            battery_percent = ?,
            connection_state = ?,
            calibrated = ?,
            rtc_ok = ?,
            sd_ok = ?,
            sensor_ok = ?,
            updated_at = ?
        WHERE id = (SELECT id FROM devices ORDER BY id ASC LIMIT 1)`,
      status.deviceId,
      status.deviceId,
      status.name,
      status.firmwareVersion,
      now,
      status.batteryPercent,
      status.connection,
      status.calibrated ? 1 : 0,
      status.rtcOk ? 1 : 0,
      status.storageOk ? 1 : 0,
      status.sensorOk ? 1 : 0,
      now
    );
  }

  private async insertSyncedDeviceRecord(
    db: SQLiteDatabase,
    deviceId: string,
    record: SyncedDeviceRecord
  ): Promise<{ dateKey: string; inserted: boolean }> {
    const timestamp = new Date(record.timestampUtc * 1000);
    const dateKey = toLocalDateKey(timestamp);
    const flags = record.flags ?? [];
    const ignored = record.type === "no_change" ? 1 : 0;

    const result = await db.runAsync(
      `INSERT OR IGNORE INTO intake_records (
        id,
        device_id,
        record_id,
        source,
        type,
        amount_ml,
        timestamp_utc,
        local_date,
        weight_before_g,
        weight_after_g,
        confidence,
        flags_json,
        note,
        category,
        ignored,
        created_at,
        updated_at
      ) VALUES (?, ?, ?, 'device_auto', ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, ?)`,
      `device-${record.recordId}`,
      deviceId,
      record.recordId,
      record.type,
      record.amountMl,
      record.timestampUtc,
      dateKey,
      record.weightBeforeG ?? null,
      record.weightAfterG ?? null,
      record.confidence ?? "normal",
      JSON.stringify(flags),
      record.note ?? null,
      ignored,
      unixNow(),
      unixNow()
    );

    return {
      dateKey,
      inserted: getSqliteChangeCount(result) > 0
    };
  }

  private async countUnsyncedRecords(
    db: SQLiteDatabase,
    lastSyncedRecordId: string
  ): Promise<number> {
    const rows = await db.getAllAsync<{ record_id: string | number | null }>(
      `SELECT record_id
      FROM intake_records
      WHERE record_id IS NOT NULL
      ORDER BY timestamp_utc ASC, created_at ASC`
    );
    const recordIds = rows.map((row) => normalizeStoredRecordId(row.record_id)).filter(Boolean);

    if (!lastSyncedRecordId) {
      return recordIds.length;
    }

    const syncedIndex = recordIds.findIndex((recordId) => recordId === lastSyncedRecordId);
    return syncedIndex < 0 ? recordIds.length : Math.max(recordIds.length - syncedIndex - 1, 0);
  }
}

export const isRegisteredDeviceId = (deviceId: string) =>
  deviceId.trim().length > 0 && deviceId !== DEFAULT_DEVICE_ID;

const summarizeRows = (rows: IntakeRecordRow[]) => {
  return rows.reduce(
    (summary, row) => {
      if (row.ignored) {
        summary.ignoredMl += row.amount_ml;
      } else if (isCountedIntakeRow(row)) {
        summary.totalMl += row.amount_ml;
        if (row.source === "manual_app") {
          summary.manualMl += row.amount_ml;
        } else if (row.source === "device_auto") {
          summary.autoMl += row.amount_ml;
        }
      }

      return summary;
    },
    { totalMl: 0, autoMl: 0, manualMl: 0, ignoredMl: 0 }
  );
};

const isCountedIntakeRow = (row: IntakeRecordRow) =>
  row.type === "drink_auto" || row.type === "manual_app" || row.source === "edited_auto";

const toIntakeRecord = (row: IntakeRecordRow): IntakeRecord => {
  return {
    id: row.id,
    recordId: normalizeStoredRecordId(row.record_id) || undefined,
    type: row.type,
    source: row.source,
    amountMl: row.amount_ml,
    timeLabel: formatTime(row.timestamp_utc),
    title: titleForRecord(row),
    detail: detailForRecord(row),
    ignored: Boolean(row.ignored),
    flagged: isFlagged(row)
  };
};

const normalizeStoredRecordId = (recordId: string | number | null | undefined) => {
  if (typeof recordId === "number") {
    return recordId > 0 ? String(recordId) : "";
  }

  return recordId?.trim() ?? "";
};

const titleForRecord = (row: IntakeRecordRow) => {
  if (row.category) {
    return row.category;
  }

  if (row.type === "drink_auto") return "Drink auto";
  if (row.type === "refill") return "Refill";
  if (row.type === "suspicious_change") return "Suspicious change";

  return "Manual app entry";
};

const detailForRecord = (row: IntakeRecordRow) => {
  if (row.note) {
    return row.note;
  }

  if (row.type === "drink_auto") return "Detected from bottle weight";
  if (row.type === "refill") return "Bottle refill marker";
  if (row.type === "suspicious_change") return "Review later";

  return "Manual app entry";
};

const isFlagged = (row: IntakeRecordRow) => {
  if (row.type === "suspicious_change") {
    return true;
  }

  try {
    const flags = JSON.parse(row.flags_json) as string[];
    return flags.length > 0;
  } catch {
    return false;
  }
};

const getWarningState = (
  totalMl: number,
  settings: DailySipSettings,
  batteryPercent: number
): WarningState => {
  if (batteryPercent > 0 && batteryPercent <= 20) return "low_battery";
  if (totalMl > settings.dailyLimitMl) return "over_limit";
  if (totalMl >= settings.dailyLimitMl * (settings.warningThresholdPercent / 100)) {
    return "near_limit";
  }
  return "normal";
};

const buildDailyRangeChart = (rows: IntakeRecordRow[], day: Date) => {
  const bins = [6, 9, 12, 15, 24];
  const activeRows = rows.filter((row) => !row.ignored && isCountedIntakeRow(row));
  const rangeStartUnix = toUnix(startOfDay(day));
  const totals = Array.from({ length: bins.length }, () => 0);

  activeRows.forEach((row) => {
    const bucketIndex = bins.findIndex((hour) => row.timestamp_utc <= toUnix(addHours(day, hour)));

    if (row.timestamp_utc >= rangeStartUnix && bucketIndex >= 0) {
      totals[bucketIndex] += row.amount_ml;
    }
  });

  return totals;
};

const buildMonthlyBuckets = (rows: IntakeRecordRow[], monthStart: Date) => {
  const bucketCount = Math.ceil(daysInMonth(monthStart) / 7);
  const buckets = Array.from({ length: bucketCount }, () => 0);

  rows.forEach((row) => {
    if (row.ignored || !isCountedIntakeRow(row)) return;
    const day = parseDateKey(row.local_date).getDate();
    const bucketIndex = Math.min(Math.floor((day - 1) / 7), bucketCount - 1);
    buckets[bucketIndex] += row.amount_ml;
  });

  return buckets;
};

const unixNow = () => toUnix(new Date());

const toUnix = (date: Date) => Math.floor(date.getTime() / 1000);

const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const isDateKey = (dateKey: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return false;
  }

  return toLocalDateKey(parseDateKey(dateKey)) === dateKey;
};

const normalizeDateKey = (dateKey: string) => {
  const trimmed = dateKey.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error("Tanggal harus menggunakan format YYYY-MM-DD.");
  }

  if (!isDateKey(trimmed)) {
    throw new Error("Tanggal tidak valid.");
  }

  return trimmed;
};

const toLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const startOfDay = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

const startOfWeek = (date: Date) => {
  const day = startOfDay(date);
  return addDays(day, -day.getDay());
};

const startOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth(), 1);

const endOfMonth = (date: Date) =>
  new Date(date.getFullYear(), date.getMonth() + 1, 0);

const addDays = (date: Date, days: number) =>
  new Date(date.getTime() + days * DAY_MS);

const addHours = (date: Date, hours: number) =>
  new Date(date.getTime() + hours * 60 * 60 * 1000);

const addMonths = (date: Date, months: number) =>
  new Date(date.getFullYear(), date.getMonth() + months, 1);

const daysInMonth = (date: Date) => endOfMonth(date).getDate();

const uniqueSortedDateKeys = (dateKeys: string[]) =>
  Array.from(new Set(dateKeys.filter(isDateKey))).sort().reverse();

const uniqueSortedPeriodStarts = (dates: Date[]) =>
  Array.from(
    new Map(
      dates
        .filter((date) => !Number.isNaN(date.getTime()))
        .map((date) => [toLocalDateKey(date), date])
    ).values()
  ).sort((left, right) => right.getTime() - left.getTime());

const getSqliteChangeCount = (result: unknown) => {
  if (typeof result !== "object" || result === null || !("changes" in result)) {
    return 0;
  }

  const changes = (result as { changes?: unknown }).changes;
  return typeof changes === "number" ? changes : 0;
};

const formatTime = (timestampUtc: number) => {
  const date = new Date(timestampUtc * 1000);
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

const formatRelativeTime = (timestampUtc: number | null) => {
  if (!timestampUtc) {
    return "Not synced";
  }

  const diffSeconds = Math.max(0, unixNow() - timestampUtc);
  if (diffSeconds < 60) {
    return "Just now";
  }

  const diffMinutes = Math.round(diffSeconds / 60);
  if (diffMinutes < 60) {
    return `${diffMinutes} min ago`;
  }

  const diffHours = Math.round(diffMinutes / 60);
  if (diffHours < 24) {
    return `${diffHours} hr ago`;
  }

  return `${Math.round(diffHours / 24)} days ago`;
};

const monthNames = {
  en: ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"],
  id: ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"]
};

const fullMonthNames = {
  en: [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December"
  ],
  id: [
    "Januari",
    "Februari",
    "Maret",
    "April",
    "Mei",
    "Juni",
    "Juli",
    "Agustus",
    "September",
    "Oktober",
    "November",
    "Desember"
  ]
};

const dayNames = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  id: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"]
};

const formatDateLabel = (date: Date, language: DailySipSettings["language"]) =>
  `${dayNames[language][date.getDay()]}, ${date.getDate()} ${fullMonthNames[language][date.getMonth()]}`;

const formatShortDateLabel = (date: Date, language: DailySipSettings["language"]) =>
  `${dayNames[language][date.getDay()]}, ${date.getDate()} ${monthNames[language][date.getMonth()]}`;

const todayLabel = (language: DailySipSettings["language"], date: Date) =>
  language === "id"
    ? `Hari ini, ${date.getDate()} ${monthNames.id[date.getMonth()]}`
    : `Today, ${monthNames.en[date.getMonth()]} ${date.getDate()}`;

const formatRangeLabel = (
  start: Date,
  end: Date,
  language: DailySipSettings["language"]
) => {
  const sameMonth = start.getMonth() === end.getMonth();
  if (sameMonth) {
    return `${start.getDate()}-${end.getDate()} ${monthNames[language][start.getMonth()]}`;
  }

  return `${start.getDate()} ${monthNames[language][start.getMonth()]}-${end.getDate()} ${monthNames[language][end.getMonth()]}`;
};

const formatMonthLabel = (date: Date, language: DailySipSettings["language"]) =>
  `${fullMonthNames[language][date.getMonth()]} ${date.getFullYear()}`;
