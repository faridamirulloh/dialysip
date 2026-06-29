import type { DailySipSnapshot, HistoryPeriodSummary, IntakeRecord } from "./types";

const todayRecords: IntakeRecord[] = [
  {
    id: "auto-1024",
    recordId: "20260605-102200-1024",
    type: "drink_auto",
    source: "device_auto",
    amountMl: 85,
    timeLabel: "10:22",
    title: "Drink auto",
    detail: "Detected from bottle weight"
  },
  {
    id: "manual-01",
    type: "manual_app",
    source: "manual_app",
    amountMl: 120,
    timeLabel: "10:40",
    title: "Tea",
    detail: "Manual app entry"
  },
  {
    id: "refill-1023",
    recordId: "20260605-095000-1023",
    type: "refill",
    source: "device_auto",
    amountMl: 500,
    timeLabel: "09:50",
    title: "Refill",
    detail: "Bottle refill marker"
  },
  {
    id: "flag-1022",
    recordId: "20260605-091200-1022",
    type: "suspicious_change",
    source: "device_auto",
    amountMl: 0,
    timeLabel: "09:12",
    title: "Suspicious change",
    detail: "Review later",
    flagged: true
  }
];

const olderDayRecords = (prefix: string, amountMl: number): IntakeRecord[] => [
  {
    id: `${prefix}-auto`,
    type: "drink_auto",
    source: "device_auto",
    amountMl,
    timeLabel: "08:35",
    title: "Drink auto",
    detail: "Detected from bottle weight"
  },
  {
    id: `${prefix}-manual`,
    type: "manual_app",
    source: "manual_app",
    amountMl: Math.round(amountMl / 3),
    timeLabel: "13:10",
    title: "Soup",
    detail: "Manual app entry"
  }
];

const dailyHistory: HistoryPeriodSummary[] = [
  {
    id: "2026-06-05",
    range: "daily",
    label: "Today, Jun 5",
    totalMl: 720,
    autoMl: 520,
    manualMl: 200,
    ignoredMl: 0,
    limitMl: 1000,
    warningState: "near_limit",
    chartTotalsMl: [80, 210, 360, 520, 720],
    records: todayRecords
  },
  {
    id: "2026-06-04",
    range: "daily",
    label: "Thu, Jun 4",
    totalMl: 710,
    autoMl: 510,
    manualMl: 200,
    ignoredMl: 0,
    limitMl: 1000,
    warningState: "normal",
    chartTotalsMl: [120, 260, 420, 590, 710],
    records: olderDayRecords("jun-04", 95)
  },
  {
    id: "2026-06-03",
    range: "daily",
    label: "Wed, Jun 3",
    totalMl: 930,
    autoMl: 620,
    manualMl: 310,
    ignoredMl: 0,
    limitMl: 1000,
    warningState: "near_limit",
    chartTotalsMl: [140, 300, 520, 760, 930],
    records: olderDayRecords("jun-03", 110)
  },
  {
    id: "2026-06-02",
    range: "daily",
    label: "Tue, Jun 2",
    totalMl: 590,
    autoMl: 430,
    manualMl: 160,
    ignoredMl: 0,
    limitMl: 1000,
    warningState: "normal",
    chartTotalsMl: [90, 220, 330, 480, 590],
    records: olderDayRecords("jun-02", 70)
  }
];

const weeklyHistory: HistoryPeriodSummary[] = [
  {
    id: "2026-W23",
    range: "weekly",
    label: "Jun 1-7",
    totalMl: 4930,
    autoMl: 3440,
    manualMl: 1490,
    ignoredMl: 0,
    limitMl: 7000,
    warningState: "normal",
    chartTotalsMl: [560, 640, 780, 590, 930, 710, 720],
    records: todayRecords
  },
  {
    id: "2026-W22",
    range: "weekly",
    label: "May 25-31",
    totalMl: 4620,
    autoMl: 3290,
    manualMl: 1330,
    ignoredMl: 90,
    limitMl: 7000,
    warningState: "normal",
    chartTotalsMl: [520, 680, 610, 740, 800, 590, 680],
    records: olderDayRecords("may-w22", 90)
  },
  {
    id: "2026-W21",
    range: "weekly",
    label: "May 18-24",
    totalMl: 5220,
    autoMl: 3700,
    manualMl: 1520,
    ignoredMl: 120,
    limitMl: 7000,
    warningState: "normal",
    chartTotalsMl: [700, 760, 820, 690, 780, 710, 760],
    records: olderDayRecords("may-w21", 100)
  }
];

const monthlyHistory: HistoryPeriodSummary[] = [
  {
    id: "2026-06",
    range: "monthly",
    label: "June 2026",
    totalMl: 4930,
    autoMl: 3440,
    manualMl: 1490,
    ignoredMl: 0,
    limitMl: 30000,
    warningState: "normal",
    chartTotalsMl: [560, 640, 780, 590, 930, 710, 720, 0, 0, 0],
    records: todayRecords
  },
  {
    id: "2026-05",
    range: "monthly",
    label: "May 2026",
    totalMl: 21180,
    autoMl: 15130,
    manualMl: 6050,
    ignoredMl: 320,
    limitMl: 31000,
    warningState: "normal",
    chartTotalsMl: [4620, 5220, 4980, 5080, 1280],
    records: olderDayRecords("may-month", 105)
  },
  {
    id: "2026-04",
    range: "monthly",
    label: "April 2026",
    totalMl: 19840,
    autoMl: 14110,
    manualMl: 5730,
    ignoredMl: 260,
    limitMl: 30000,
    warningState: "normal",
    chartTotalsMl: [4410, 4700, 5230, 5060, 440],
    records: olderDayRecords("apr-month", 95)
  }
];

export const createDemoSnapshot = (): DailySipSnapshot => ({
  mode: "demo",
  device: {
    deviceId: "dialysip-001",
    name: "DialySip-001",
    firmwareVersion: "0.1.0",
    connection: "connected",
    batteryPercent: 82,
    chargerConnected: false,
    lastSyncLabel: "4 min ago",
    lastRecordId: "20260605-102200-1024",
    unsyncedRecords: 0,
    currentWeightG: null,
    stableForSeconds: null,
    calibrationActive: false,
    calibrationStep: "idle",
    calibrationFactor: null,
    calibrated: false,
    rtcOk: true,
    storageOk: true,
    sdOk: true,
    sensorOk: true
  },
  summary: {
    localDateLabel: "Friday, June 5",
    totalMl: 720,
    dailyLimitMl: 1000,
    remainingMl: 280,
    autoMl: 520,
    manualMl: 200,
    ignoredMl: 0,
    lastDrinkAmountMl: 85,
    lastDrinkTimeLabel: "10:22",
    warningState: "near_limit"
  },
  settings: {
    dailyLimitMl: 1000,
    warningThresholdPercent: 80,
    oledTimeoutSeconds: 15,
    bleSyncWindowSeconds: 60,
    stableSaveSeconds: 60,
    historySyncMode: "after_last_sync",
    historyRetentionDays: 10,
    cupWeightTenthsG: 525,
    cupToleranceTenthsG: 30,
    language: "id"
  },
  records: todayRecords,
  weekTotalsMl: weeklyHistory[0].chartTotalsMl,
  history: {
    daily: dailyHistory,
    weekly: weeklyHistory,
    monthly: monthlyHistory
  },
  notice: "Demo mode uses mock local data. Flip isDemo to use the BLE/SQLite source."
});
