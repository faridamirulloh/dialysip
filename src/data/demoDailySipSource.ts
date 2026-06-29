import { createDemoSnapshot } from "./demoData";
import type {
  BleActivity,
  BleLogEntry,
  DailySipDataSource,
  DailySipSettings,
  DailySipSnapshot,
  DiscoveredBottle,
  ManualIntakeInput,
  WarningState,
} from "./types";

const wait = async () => {
  await new Promise((resolve) => setTimeout(resolve, 220));
};

const getWarningState = (
  totalMl: number,
  limitMl: number,
  warningThresholdPercent: number,
  batteryPercent: number,
): WarningState => {
  if (batteryPercent <= 20) return "low_battery";
  if (totalMl > limitMl) return "over_limit";
  if (totalMl >= limitMl * (warningThresholdPercent / 100)) {
    return "near_limit";
  }
  return "normal";
};

const recalculate = (snapshot: DailySipSnapshot): DailySipSnapshot => {
  const totalMl = snapshot.summary.autoMl + snapshot.summary.manualMl;
  const remainingMl = Math.max(snapshot.settings.dailyLimitMl - totalMl, 0);
  const warningState = getWarningState(
    totalMl,
    snapshot.settings.dailyLimitMl,
    snapshot.settings.warningThresholdPercent,
    snapshot.device.batteryPercent,
  );
  const currentDaily = snapshot.history.daily[0];
  const currentWeekly = snapshot.history.weekly[0];
  const currentMonthly = snapshot.history.monthly[0];
  const weeklyChart = [...currentWeekly.chartTotalsMl];
  const monthlyChart = [...currentMonthly.chartTotalsMl];
  const weeklyLimitMl = snapshot.settings.dailyLimitMl * 7;
  const monthlyLimitMl = snapshot.settings.dailyLimitMl * 30;

  weeklyChart[weeklyChart.length - 1] = totalMl;
  monthlyChart[6] = totalMl;
  const weeklyTotalMl = weeklyChart.reduce((sum, value) => sum + value, 0);
  const monthlyTotalMl = monthlyChart.reduce((sum, value) => sum + value, 0);

  const updatedDaily = {
    ...currentDaily,
    totalMl,
    autoMl: snapshot.summary.autoMl,
    manualMl: snapshot.summary.manualMl,
    limitMl: snapshot.settings.dailyLimitMl,
    warningState,
    chartTotalsMl: [...currentDaily.chartTotalsMl.slice(0, -1), totalMl],
    records: snapshot.records,
  };

  const updatedWeekly = {
    ...currentWeekly,
    totalMl: weeklyTotalMl,
    autoMl: currentWeekly.autoMl - currentDaily.autoMl + snapshot.summary.autoMl,
    manualMl: currentWeekly.manualMl - currentDaily.manualMl + snapshot.summary.manualMl,
    limitMl: weeklyLimitMl,
    warningState: getWarningState(
      weeklyTotalMl,
      weeklyLimitMl,
      snapshot.settings.warningThresholdPercent,
      snapshot.device.batteryPercent,
    ),
    chartTotalsMl: weeklyChart,
  };

  const updatedMonthly = {
    ...currentMonthly,
    totalMl: monthlyTotalMl,
    autoMl: currentMonthly.autoMl - currentDaily.autoMl + snapshot.summary.autoMl,
    manualMl: currentMonthly.manualMl - currentDaily.manualMl + snapshot.summary.manualMl,
    limitMl: monthlyLimitMl,
    warningState: getWarningState(
      monthlyTotalMl,
      monthlyLimitMl,
      snapshot.settings.warningThresholdPercent,
      snapshot.device.batteryPercent,
    ),
    chartTotalsMl: monthlyChart,
  };

  return {
    ...snapshot,
    summary: {
      ...snapshot.summary,
      totalMl,
      dailyLimitMl: snapshot.settings.dailyLimitMl,
      remainingMl,
      warningState,
    },
    weekTotalsMl: weeklyChart,
    history: {
      daily: [updatedDaily, ...snapshot.history.daily.slice(1)],
      weekly: [updatedWeekly, ...snapshot.history.weekly.slice(1)],
      monthly: [updatedMonthly, ...snapshot.history.monthly.slice(1)],
    },
  };
};

export class DemoDailySipSource implements DailySipDataSource {
  private snapshot = createDemoSnapshot();

  async loadSnapshot() {
    await wait();
    return this.snapshot;
  }

  subscribeToLiveSync(_onSnapshot: (snapshot: DailySipSnapshot) => void) {
    return () => undefined;
  }

  subscribeToBleActivity(_onActivity: (activity: BleActivity) => void) {
    return () => undefined;
  }

  subscribeToBleLog(_onEntry: (entry: BleLogEntry) => void) {
    return () => undefined;
  }

  setAppActive(_isActive: boolean) {}

  async autoConnectActiveDevice() {
    return null;
  }

  async scanBottles(): Promise<DiscoveredBottle[]> {
    await wait();
    return [
      {
        scanId: "demo-dialysip-001",
        name: "DialySip-001",
        rssi: -48,
        isConnected: this.snapshot.device.connection === "connected",
      },
    ];
  }

  async registerBottle(_scanId: string) {
    return this.connectDevice();
  }

  async connectDevice() {
    await wait();
    this.snapshot = {
      ...this.snapshot,
      device: {
        ...this.snapshot.device,
        connection: "connected",
        lastSyncLabel: "Just now",
        unsyncedRecords: 0,
      },
      notice: "Connected to demo bottle DialySip-001.",
    };
    return this.snapshot;
  }

  async syncNow() {
    await wait();
    this.snapshot = {
      ...this.snapshot,
      device: {
        ...this.snapshot.device,
        lastSyncLabel: "Just now",
        unsyncedRecords: 0,
        lastRecordId: `demo-${Date.now()}`,
      },
      notice: "Demo history sync complete. No new bottle records.",
    };
    return this.snapshot;
  }

  async syncDeviceTime() {
    await wait();
    this.snapshot = {
      ...this.snapshot,
      device: {
        ...this.snapshot.device,
        lastSyncLabel: "Just now",
      },
      notice: "Bottle time synced.",
    };
    return this.snapshot;
  }

  async startCalibration() {
    await wait();
    this.snapshot = {
      ...this.snapshot,
      device: {
        ...this.snapshot.device,
        currentWeightG: 0,
        stableForSeconds: 0,
        calibrationActive: true,
        calibrationStep: "wait_tare",
      },
      notice: "Demo calibration mode started.",
    };
    return this.snapshot;
  }

  async refreshDeviceStatus() {
    await wait();
    const currentWeightG = this.snapshot.device.currentWeightG ?? 0;
    this.snapshot = {
      ...this.snapshot,
      device: {
        ...this.snapshot.device,
        currentWeightG,
        stableForSeconds: Math.min((this.snapshot.device.stableForSeconds ?? 0) + 1.2, 3.6),
      },
    };
    return this.snapshot;
  }

  async refreshLiveWeight() {
    return this.refreshDeviceStatus();
  }

  async saveTare() {
    await wait();
    this.snapshot = {
      ...this.snapshot,
      device: {
        ...this.snapshot.device,
        currentWeightG: 0,
        stableForSeconds: 2.1,
        calibrationActive: true,
        calibrationStep: "wait_weight",
      },
      notice: "Empty bottle tare saved in demo mode.",
    };
    return this.snapshot;
  }

  async confirmCalibrationAmount(amountMl: number) {
    await wait();
    this.snapshot = {
      ...this.snapshot,
      device: {
        ...this.snapshot.device,
        currentWeightG: amountMl,
        stableForSeconds: 2.4,
        calibrationActive: true,
        calibrationStep: "live_weight",
        calibrationFactor: 1000 + amountMl / 10,
        calibrated: true,
      },
      notice: `Calibration saved with ${amountMl} ml known amount.`,
    };
    return this.snapshot;
  }

  async resetCalibrationToDefault() {
    await wait();
    this.snapshot = {
      ...this.snapshot,
      device: {
        ...this.snapshot.device,
        calibrated: false,
        calibrationFactor: 1000,
        calibrationActive: false,
        calibrationStep: "idle",
      },
      notice: "Calibration reset to default.",
    };
    return this.snapshot;
  }

  async finishCalibration() {
    await wait();
    this.snapshot = {
      ...this.snapshot,
      device: {
        ...this.snapshot.device,
        calibrationActive: false,
        calibrationStep: "idle",
      },
      notice: "Demo calibration mode finished.",
    };
    return this.snapshot;
  }

  async saveCupCalibration(cupWeightTenthsG: number) {
    return this.updateSettings({
      ...this.snapshot.settings,
      cupWeightTenthsG,
    });
  }

  async addManualIntake(input: ManualIntakeInput) {
    await wait();
    const newRecord = {
      id: `manual-${Date.now()}`,
      type: "manual_app" as const,
      source: "manual_app" as const,
      amountMl: input.amountMl,
      dateKey: input.dateKey,
      timeLabel: input.timeKey ?? "Now",
      title: input.category,
      detail: input.note?.trim() ? input.note.trim() : "Manual app entry",
    };

    this.snapshot = recalculate({
      ...this.snapshot,
      summary: {
        ...this.snapshot.summary,
        manualMl: this.snapshot.summary.manualMl + input.amountMl,
      },
      records: [newRecord, ...this.snapshot.records],
      notice: input.dateKey
        ? `${input.category} added to ${input.dateKey}.`
        : `${input.category} added to today's total.`,
    });
    return this.snapshot;
  }

  async deleteHistoryForDate(dateKey: string) {
    await wait();
    this.snapshot = {
      ...this.snapshot,
      notice: `Riwayat tanggal ${dateKey} dihapus.`,
    };
    return this.snapshot;
  }

  async deleteHistoryRange(startDateKey: string, endDateKey: string) {
    await wait();
    this.snapshot = {
      ...this.snapshot,
      notice:
        startDateKey === endDateKey
          ? `Riwayat tanggal ${startDateKey} dihapus.`
          : `Riwayat ${startDateKey} sampai ${endDateKey} dihapus.`,
    };
    return this.snapshot;
  }

  async deleteAllHistory() {
    await wait();
    this.snapshot = recalculate({
      ...this.snapshot,
      records: [],
      notice: "Semua riwayat dihapus.",
    });
    return this.snapshot;
  }

  async renameDevice(name: string) {
    await wait();
    const displayName = name.trim();
    if (!displayName) {
      throw new Error("Nama botol tidak boleh kosong.");
    }

    this.snapshot = {
      ...this.snapshot,
      device: {
        ...this.snapshot.device,
        name: displayName,
      },
      notice: "Nama botol diperbarui.",
    };
    return this.snapshot;
  }

  async removeDevice() {
    await wait();
    this.snapshot = {
      ...this.snapshot,
      device: {
        ...this.snapshot.device,
        deviceId: "dialysip-local",
        name: "DialySip",
        firmwareVersion: "unknown",
        connection: "offline",
        batteryPercent: 0,
        chargerConnected: false,
        lastSyncLabel: "Never",
        lastRecordId: "",
        unsyncedRecords: 0,
        currentWeightG: null,
        stableForSeconds: null,
        calibrationActive: false,
        calibrationStep: "idle",
        calibrationFactor: null,
        calibrated: false,
        rtcOk: false,
        storageOk: false,
        sdOk: false,
        sensorOk: false,
      },
      notice: "Botol dihapus dari aplikasi.",
    };
    return this.snapshot;
  }

  async updateSettings(settings: DailySipSettings) {
    await wait();
    this.snapshot = recalculate({
      ...this.snapshot,
      settings,
      notice: "Pengaturan tersimpan ke data lokal demo.",
    });
    return this.snapshot;
  }
}
