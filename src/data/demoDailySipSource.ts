import { createDemoSnapshot } from "./demoData";
import type {
  BleActivity,
  DailySipDataSource,
  DailySipSettings,
  DailySipSnapshot,
  ManualIntakeInput,
  WarningState
} from "./types";

const wait = async () => {
  await new Promise((resolve) => setTimeout(resolve, 220));
};

const getWarningState = (
  totalMl: number,
  settings: DailySipSettings,
  batteryPercent: number
): WarningState => {
  if (batteryPercent <= 20) return "low_battery";
  if (totalMl > settings.dailyLimitMl) return "over_limit";
  if (totalMl >= settings.dailyLimitMl * (settings.warningThresholdPercent / 100)) {
    return "near_limit";
  }
  return "normal";
};

const recalculate = (snapshot: DailySipSnapshot): DailySipSnapshot => {
  const totalMl = snapshot.summary.autoMl + snapshot.summary.manualMl;
  const remainingMl = Math.max(snapshot.settings.dailyLimitMl - totalMl, 0);
  const warningState = getWarningState(totalMl, snapshot.settings, snapshot.device.batteryPercent);
  const currentDaily = snapshot.history.daily[0];
  const currentWeekly = snapshot.history.weekly[0];
  const currentMonthly = snapshot.history.monthly[0];
  const weeklyChart = [...currentWeekly.chartTotalsMl];
  const monthlyChart = [...currentMonthly.chartTotalsMl];

  weeklyChart[weeklyChart.length - 1] = totalMl;
  monthlyChart[6] = totalMl;

  const updatedDaily = {
    ...currentDaily,
    totalMl,
    autoMl: snapshot.summary.autoMl,
    manualMl: snapshot.summary.manualMl,
    limitMl: snapshot.settings.dailyLimitMl,
    warningState,
    chartTotalsMl: [...currentDaily.chartTotalsMl.slice(0, -1), totalMl],
    records: snapshot.records
  };

  const updatedWeekly = {
    ...currentWeekly,
    totalMl: weeklyChart.reduce((sum, value) => sum + value, 0),
    autoMl: currentWeekly.autoMl - currentDaily.autoMl + snapshot.summary.autoMl,
    manualMl: currentWeekly.manualMl - currentDaily.manualMl + snapshot.summary.manualMl,
    limitMl: snapshot.settings.dailyLimitMl * 7,
    chartTotalsMl: weeklyChart
  };

  const updatedMonthly = {
    ...currentMonthly,
    totalMl: monthlyChart.reduce((sum, value) => sum + value, 0),
    autoMl: currentMonthly.autoMl - currentDaily.autoMl + snapshot.summary.autoMl,
    manualMl: currentMonthly.manualMl - currentDaily.manualMl + snapshot.summary.manualMl,
    limitMl: snapshot.settings.dailyLimitMl * 30,
    chartTotalsMl: monthlyChart
  };

  return {
    ...snapshot,
    summary: {
      ...snapshot.summary,
      totalMl,
      dailyLimitMl: snapshot.settings.dailyLimitMl,
      remainingMl,
      warningState
    },
    weekTotalsMl: weeklyChart,
    history: {
      daily: [updatedDaily, ...snapshot.history.daily.slice(1)],
      weekly: [updatedWeekly, ...snapshot.history.weekly.slice(1)],
      monthly: [updatedMonthly, ...snapshot.history.monthly.slice(1)]
    }
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

  async autoConnectActiveDevice() {
    return null;
  }

  async connectDevice() {
    await wait();
    this.snapshot = {
      ...this.snapshot,
      device: {
        ...this.snapshot.device,
        connection: "connected",
        lastSyncLabel: "Just now",
        unsyncedRecords: 0
      },
      notice: "Connected to demo bottle DialySip-001."
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
        lastRecordId: `demo-${Date.now()}`
      },
      notice: "Demo history sync complete. No new bottle records."
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
        calibrationStep: "wait_tare"
      },
      notice: "Demo calibration mode started."
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
        stableForSeconds: Math.min((this.snapshot.device.stableForSeconds ?? 0) + 1.2, 3.6)
      }
    };
    return this.snapshot;
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
        calibrationStep: "wait_weight"
      },
      notice: "Empty bottle tare saved in demo mode."
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
        calibrated: true
      },
      notice: `Calibration saved with ${amountMl} ml known amount.`
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
        calibrationStep: "idle"
      },
      notice: "Demo calibration mode finished."
    };
    return this.snapshot;
  }

  async addManualIntake(input: ManualIntakeInput) {
    await wait();
    const newRecord = {
      id: `manual-${Date.now()}`,
      type: "manual_app" as const,
      source: "manual_app" as const,
      amountMl: input.amountMl,
      timeLabel: "Now",
      title: input.category,
      detail: input.note?.trim() ? input.note.trim() : "Manual app entry"
    };

    this.snapshot = recalculate({
      ...this.snapshot,
      summary: {
        ...this.snapshot.summary,
        manualMl: this.snapshot.summary.manualMl + input.amountMl,
        lastDrinkAmountMl: input.amountMl,
        lastDrinkTimeLabel: "Now"
      },
      records: [newRecord, ...this.snapshot.records],
      notice: input.dateKey ? `${input.category} added to ${input.dateKey}.` : `${input.category} added to today's total.`
    });
    return this.snapshot;
  }

  async deleteHistoryForDate(dateKey: string) {
    await wait();
    this.snapshot = {
      ...this.snapshot,
      notice: `Riwayat tanggal ${dateKey} dihapus.`
    };
    return this.snapshot;
  }

  async deleteAllHistory() {
    await wait();
    this.snapshot = recalculate({
      ...this.snapshot,
      records: [],
      notice: "Semua riwayat dihapus."
    });
    return this.snapshot;
  }

  async renameDevice(name: string) {
    await wait();
    const displayName = name.trim();
    if (!displayName) {
      throw new Error("Bottle name cannot be empty.");
    }

    this.snapshot = {
      ...this.snapshot,
      device: {
        ...this.snapshot.device,
        name: displayName
      },
      notice: "Nama botol diperbarui."
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
        lastSyncLabel: "Never",
        lastRecordId: "",
        unsyncedRecords: 0,
        currentWeightG: null,
        stableForSeconds: null,
        calibrationActive: false,
        calibrationStep: "idle",
        calibrated: false,
        rtcOk: false,
        storageOk: false,
        sdOk: false,
        sensorOk: false
      },
      notice: "Botol dihapus dari aplikasi."
    };
    return this.snapshot;
  }

  async updateSettings(settings: DailySipSettings) {
    await wait();
    this.snapshot = recalculate({
      ...this.snapshot,
      settings,
      notice: "Settings saved to demo local data."
    });
    return this.snapshot;
  }
}
