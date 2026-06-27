import type { HistoryRange, IntakeCategory, IntakeRecord, LanguageCode, WarningState } from "./data/types";

export const defaultLanguage: LanguageCode = "id";

export const appCopy = {
  en: {
    loading: "Loading DialySip",
    demoData: "Demo data",
    openPairing: "Open pairing",
    openCalibration: "Open calibration",
    pairTitle: "Pair DialySip",
    pairSubtitle: "Connect your smart bottle",
    bluetoothPermission: "Bluetooth permission",
    ready: "Ready",
    allowed: "Allowed",
    nearbyBottle: "Nearby bottle",
    scan: "Scan",
    found: "Found",
    phoneTimeSync: "Phone time sync",
    showLog: "Show log >",
    hideLog: "Hide log v",
    liveLog: "Live log",
    noBleLog: "No BLE activity yet.",
    bleSent: "Sent",
    bleReceived: "Received",
    bleLogAll: "All",
    bleLogDirectionFilter: "Direction",
    bleLogChannelFilter: "Channel",
    bleLogChannel: "Channel",
    bleLogPayload: "Payload",
    bleLogOrder: "Order",
    bleLogNewestFirst: "Newest first",
    bleLogOldestFirst: "Oldest first",
    clearBleLog: "Clear logs",
    noMatchingBleLog: "No activity matches these filters.",
    next: "Next",
    connectBottle: "Connect bottle",
    syncTime: "Sync time",
    calibrationTitle: "Calibration",
    bottleCalibrated: "Bottle is calibrated",
    calibrationStep: "Guided calibration",
    calibrationNeeded: "Calibration needed",
    tareTitle: "Tare empty bottle",
    tareBody: "Place the empty bottle on a flat surface.",
    reading: "Reading",
    stableFor: "Stable for",
    knownAmount: "Known amount",
    scaleStatus: "Scale status",
    scaleStable: "Stable",
    scaleMoving: "Moving",
    waitingReading: "Waiting",
    calibrationAmountTitle: "Add known water",
    calibrationAmountBody: "Add the known amount, then confirm once the bottle reading is stable.",
    calibrationSavedTitle: "Calibration saved",
    calibrationSavedBody: "Finish calibration to leave bottle calibration mode.",
    refreshReading: "Refresh reading",
    restartCalibration: "Restart calibration",
    finishCalibration: "Finish calibration",
    saveCalibration: "Save calibration",
    saveTare: "Save tare",
    today: "Today",
    connected: "Connected",
    syncNeeded: "Sync needed",
    of: "of",
    remaining: "Remaining",
    lastDrink: "Last drink",
    bottleBattery: "Bottle battery",
    low: "Low",
    good: "Good",
    lastSync: "Last sync",
    sync: "Sync",
    warning: "Warning",
    addManualIntake: "Add manual intake",
    syncNow: "Sync history",
    manualTitle: "Add manual intake",
    manualSubtitle: "Counts toward today",
    manual: "Manual",
    amount: "Amount",
    manualAmountA11y: "Manual intake amount in milliliters",
    historyDate: "History date",
    historyDateA11y: "History date in YYYY-MM-DD format",
    invalidHistoryDate: "Use a valid YYYY-MM-DD date",
    invalidTime: "Use a valid HH:mm time",
    note: "Note",
    time: "Time",
    now: "Now",
    todayAfterSave: "Today after save",
    saveEntry: "Save entry",
    historyTitle: "History",
    refreshHistory: "Refresh",
    selectPeriod: "Select period",
    showPeriod: "Show",
    periodDateHint: "Use YYYY-MM-DD. Week and month use the date inside that period.",
    periodNotFound: "No saved period contains that date.",
    removeSelectedHistory: "Remove selected",
    confirmRemoveSelectedHistory: "Confirm selected",
    removeAllHistories: "Remove all histories",
    datePicker: "Date picker",
    timePicker: "Clock",
    date: "Date",
    week: "Week",
    month: "Month",
    previous: "Previous",
    chartBottle: "Bottle",
    total: "Total",
    limit: "Limit",
    auto: "Bottle",
    flag: "Flag",
    marker: "Marker",
    ok: "OK",
    noRecordsFor: "No records for this",
    historyActions: "Manage history",
    confirmDeleteAllHistory: "Confirm all delete",
    settingsTitle: "Settings",
    settingsSubtitle: "Configured with clinic guidance",
    dailyLimit: "Daily limit",
    warningThreshold: "Warning threshold",
    bleSyncWindow: "BLE sync window",
    historySync: "History sync",
    fullHistory: "Full history",
    afterLastSync: "After last sync",
    deviceManager: "Device manager",
    noBottleRegistered: "No bottle registered",
    addBottle: "Add bottle",
    bottleName: "Bottle name",
    renameBottle: "Rename bottle",
    saveName: "Save name",
    removeBottle: "Remove bottle",
    confirmRemoveBottle: "Confirm remove",
    cancel: "Cancel",
    historyRetention: "History retention",
    oledTimeout: "OLED timeout",
    secondsShort: "sec",
    daysShort: "days",
    language: "Language",
    english: "English",
    indonesian: "Indonesia",
    pairing: "Pairing",
    saveSettings: "Save settings",
    decrease: "Decrease",
    increase: "Increase",
    navToday: "Today",
    navAdd: "Add",
    navHistory: "History",
    navSettings: "Settings",
    closeNotice: "Close notification",
  },
  id: {
    loading: "Memuat DialySip",
    demoData: "Data demo",
    openPairing: "Buka pemasangan",
    openCalibration: "Buka kalibrasi",
    pairTitle: "Pasangkan DialySip",
    pairSubtitle: "Hubungkan botol pintar Anda",
    bluetoothPermission: "Izin Bluetooth",
    ready: "Siap",
    allowed: "Diizinkan",
    nearbyBottle: "Botol terdekat",
    scan: "Pindai",
    found: "Ditemukan",
    phoneTimeSync: "Sinkron waktu ponsel",
    showLog: "Tampilkan log >",
    hideLog: "Sembunyikan log v",
    liveLog: "Log langsung",
    noBleLog: "Belum ada aktivitas BLE.",
    bleSent: "Terkirim",
    bleReceived: "Diterima",
    bleLogAll: "Semua",
    bleLogDirectionFilter: "Arah",
    bleLogChannelFilter: "Kanal",
    bleLogChannel: "Kanal",
    bleLogPayload: "Data",
    bleLogOrder: "Urutan",
    bleLogNewestFirst: "Terbaru dulu",
    bleLogOldestFirst: "Terlama dulu",
    clearBleLog: "Hapus log",
    noMatchingBleLog: "Tidak ada aktivitas yang sesuai dengan filter ini.",
    next: "Berikutnya",
    connectBottle: "Hubungkan botol",
    syncTime: "Sinkron waktu",
    calibrationTitle: "Kalibrasi",
    bottleCalibrated: "Botol sudah dikalibrasi",
    calibrationStep: "Kalibrasi terpandu",
    calibrationNeeded: "Perlu kalibrasi",
    tareTitle: "Tare botol kosong",
    tareBody: "Letakkan botol kosong di permukaan datar.",
    reading: "Bacaan",
    stableFor: "Stabil selama",
    knownAmount: "Jumlah acuan",
    scaleStatus: "Status timbangan",
    scaleStable: "Stabil",
    scaleMoving: "Bergerak",
    waitingReading: "Menunggu",
    calibrationAmountTitle: "Tambah air acuan",
    calibrationAmountBody: "Tambahkan jumlah acuan, lalu konfirmasi saat bacaan botol stabil.",
    calibrationSavedTitle: "Kalibrasi tersimpan",
    calibrationSavedBody: "Selesaikan kalibrasi untuk keluar dari mode kalibrasi botol.",
    refreshReading: "Segarkan bacaan",
    restartCalibration: "Mulai ulang kalibrasi",
    finishCalibration: "Selesai kalibrasi",
    saveCalibration: "Simpan kalibrasi",
    saveTare: "Simpan tare",
    today: "Hari ini",
    connected: "Terhubung",
    syncNeeded: "Perlu sinkron",
    of: "dari",
    remaining: "Sisa",
    lastDrink: "Minum terakhir",
    bottleBattery: "Baterai botol",
    low: "Rendah",
    good: "Baik",
    lastSync: "Sinkron terakhir",
    sync: "Sinkron",
    warning: "Peringatan",
    addManualIntake: "Tambah manual",
    syncNow: "Sinkron riwayat",
    manualTitle: "Tambah asupan manual",
    manualSubtitle: "Masuk ke total hari ini",
    manual: "Manual",
    amount: "Jumlah",
    manualAmountA11y: "Jumlah asupan manual dalam mililiter",
    historyDate: "Tanggal riwayat",
    historyDateA11y: "Tanggal riwayat dalam format YYYY-MM-DD",
    invalidHistoryDate: "Gunakan tanggal valid YYYY-MM-DD",
    invalidTime: "Gunakan waktu valid HH:mm",
    note: "Catatan",
    time: "Waktu",
    now: "Sekarang",
    todayAfterSave: "Hari ini setelah simpan",
    saveEntry: "Simpan entri",
    historyTitle: "Riwayat",
    refreshHistory: "Segarkan",
    selectPeriod: "Pilih periode",
    showPeriod: "Tampilkan",
    periodDateHint: "Gunakan YYYY-MM-DD. Minggu dan bulan memakai tanggal di dalam periode itu.",
    periodNotFound: "Tidak ada periode tersimpan untuk tanggal itu.",
    removeSelectedHistory: "Hapus terpilih",
    confirmRemoveSelectedHistory: "Konfirmasi terpilih",
    removeAllHistories: "Hapus semua riwayat",
    datePicker: "Pilih tanggal",
    timePicker: "Jam",
    date: "Tanggal",
    week: "Minggu",
    month: "Bulan",
    previous: "Sebelumnya",
    chartBottle: "Botol",
    total: "Total",
    limit: "Batas",
    auto: "Botol",
    flag: "Tandai",
    marker: "Penanda",
    ok: "OK",
    noRecordsFor: "Belum ada catatan untuk",
    historyActions: "Kelola riwayat",
    confirmDeleteAllHistory: "Konfirmasi semua",
    settingsTitle: "Pengaturan",
    settingsSubtitle: "Diatur sesuai arahan klinik",
    dailyLimit: "Batas harian",
    warningThreshold: "Ambang peringatan",
    bleSyncWindow: "Jendela sinkron BLE",
    historySync: "Sinkron riwayat",
    fullHistory: "Riwayat penuh",
    afterLastSync: "Setelah sinkron terakhir",
    deviceManager: "Kelola botol",
    noBottleRegistered: "Belum ada botol terdaftar",
    addBottle: "Tambah botol",
    bottleName: "Nama botol",
    renameBottle: "Ubah nama botol",
    saveName: "Simpan nama",
    removeBottle: "Hapus botol",
    confirmRemoveBottle: "Konfirmasi hapus",
    cancel: "Batal",
    historyRetention: "Simpan riwayat",
    oledTimeout: "Batas waktu OLED",
    secondsShort: "dtk",
    daysShort: "hari",
    language: "Bahasa",
    english: "English",
    indonesian: "Indonesia",
    pairing: "Pemasangan",
    saveSettings: "Simpan pengaturan",
    decrease: "Kurangi",
    increase: "Tambah",
    navToday: "Hari ini",
    navAdd: "Tambah",
    navHistory: "Riwayat",
    navSettings: "Pengaturan",
    closeNotice: "Tutup pemberitahuan",
  },
} as const;

export type AppCopy = (typeof appCopy)[LanguageCode];

export const historyRangeLabels: Record<LanguageCode, Record<HistoryRange, string>> = {
  en: {
    daily: "Daily",
    weekly: "Weekly",
    monthly: "Monthly",
  },
  id: {
    daily: "Harian",
    weekly: "Mingguan",
    monthly: "Bulanan",
  },
};

export const warningLabels: Record<LanguageCode, Record<WarningState, string>> = {
  en: {
    normal: "Normal",
    near_limit: "Near the limit",
    over_limit: "Over the limit",
    low_battery: "Battery low",
    device_error: "Device error",
  },
  id: {
    normal: "Normal",
    near_limit: "Mendekati batas",
    over_limit: "Melebihi batas",
    low_battery: "Baterai rendah",
    device_error: "Gangguan perangkat",
  },
};

const categoryLabels: Record<LanguageCode, Record<IntakeCategory, string>> = {
  en: {
    "Mineral water": "Mineral water",
    Tea: "Tea",
    Soup: "Soup",
    "Other fluid": "Other fluid",
  },
  id: {
    "Mineral water": "Air mineral",
    Tea: "Teh",
    Soup: "Sup",
    "Other fluid": "Cairan lain",
  },
};

const knownLabelTranslations: Record<LanguageCode, Record<string, string>> = {
  en: {},
  id: {
    "4 min ago": "4 menit lalu",
    "Just now": "Baru saja",
    "Not synced": "Belum sinkron",
    Never: "Belum pernah",
    "No records": "Belum ada catatan",
    "Friday, June 5": "Jumat, 5 Juni",
    Today: "Hari ini",
    "Today, Jun 5": "Hari ini, 5 Jun",
    "Thu, Jun 4": "Kam, 4 Jun",
    "Wed, Jun 3": "Rab, 3 Jun",
    "Tue, Jun 2": "Sel, 2 Jun",
    "Jun 1-7": "1-7 Jun",
    "May 25-31": "25-31 Mei",
    "May 18-24": "18-24 Mei",
    "June 2026": "Juni 2026",
    "May 2026": "Mei 2026",
    "April 2026": "April 2026",
    "This week": "Minggu ini",
    "This month": "Bulan ini",
  },
};

const recordTitleTranslations: Record<LanguageCode, Record<string, string>> = {
  en: {},
  id: {
    "Drink auto": "Minum",
    "Mineral water": "Air mineral",
    Tea: "Teh",
    Soup: "Sup",
    "Other fluid": "Cairan lain",
    Refill: "Isi ulang",
    "Suspicious change": "Perubahan mencurigakan",
  },
};

const recordDetailTranslations: Record<LanguageCode, Record<string, string>> = {
  en: {},
  id: {
    "Detected from bottle weight": "Terdeteksi dari berat botol",
    "Manual app entry": "Entri manual dari aplikasi",
    "Bottle refill marker": "Penanda isi ulang botol",
    "Review later": "Tinjau nanti",
  },
};

const noticeTranslations: Record<string, string> = {
  "Demo mode uses mock local data. Flip isDemo to use the BLE/SQLite source.":
    "Mode demo memakai data lokal tiruan. Ubah isDemo untuk memakai sumber BLE/SQLite.",
  "Connected to demo bottle DialySip-001.": "Terhubung ke botol demo DialySip-001.",
  "Demo sync complete. Phone time is current.": "Sinkron demo selesai. Waktu ponsel sudah terbaru.",
  "Empty bottle tare saved in demo mode.": "Tare botol kosong tersimpan dalam mode demo.",
  "Settings saved to demo local data.": "Pengaturan tersimpan ke data lokal demo.",
  "BLE/SQLite mode is selected, but react-native-ble-plx and SQLite persistence are not wired yet.":
    "Mode BLE/SQLite dipilih, tetapi react-native-ble-plx dan penyimpanan SQLite belum disambungkan.",
  "Bottle sync complete. No new records.": "Sinkron botol selesai. Tidak ada catatan baru.",
  "BLE pairing is not connected yet. Local SQLite storage is ready.":
    "Pemasangan BLE belum terhubung. Penyimpanan SQLite lokal sudah siap.",
  "Local database checked. BLE log sync will attach to this step next.":
    "Database lokal sudah diperiksa. Sinkron log BLE akan dipasang ke langkah ini berikutnya.",
  "Tare command saved locally. BLE command delivery is next.":
    "Perintah tare tersimpan lokal. Pengiriman perintah BLE adalah langkah berikutnya.",
  "Tare command sent to bottle.": "Perintah tare dikirim ke botol.",
  "Settings saved to SQLite.": "Pengaturan tersimpan ke SQLite.",
  "DialySip BLE action failed.": "Tindakan BLE DialySip gagal.",
};

export function getAppCopy(language?: LanguageCode): AppCopy {
  return appCopy[language ?? defaultLanguage];
}

export function formatCategoryLabel(category: IntakeCategory, language: LanguageCode): string {
  return categoryLabels[language][category];
}

export function localizeKnownLabel(value: string, language: LanguageCode): string {
  if (language === "id") {
    const minutesMatch = value.match(/^(\d+) min ago$/);
    if (minutesMatch) {
      return `${minutesMatch[1]} menit lalu`;
    }

    const hoursMatch = value.match(/^(\d+) hr ago$/);
    if (hoursMatch) {
      return `${hoursMatch[1]} jam lalu`;
    }

    const daysMatch = value.match(/^(\d+) days? ago$/);
    if (daysMatch) {
      return `${daysMatch[1]} hari lalu`;
    }
  }

  return knownLabelTranslations[language][value] ?? value;
}

export function localizeRecord(record: IntakeRecord, language: LanguageCode) {
  return {
    title: recordTitleTranslations[language][record.title] ?? record.title,
    detail: recordDetailTranslations[language][record.detail] ?? record.detail,
    timeLabel: localizeKnownLabel(record.timeLabel, language),
  };
}

export function localizeNotice(text: string, language: LanguageCode): string {
  if (language === "en") {
    return text;
  }

  const calibrationMatch = text.match(/^Calibration saved with (.+) known amount\.$/);
  if (calibrationMatch) {
    return `Kalibrasi tersimpan dengan jumlah acuan ${calibrationMatch[1]}.`;
  }

  const localCalibrationMatch = text.match(/^Calibration saved locally with (.+) known amount\.$/);
  if (localCalibrationMatch) {
    return `Kalibrasi tersimpan lokal dengan jumlah acuan ${localCalibrationMatch[1]}.`;
  }

  const manualMatch = text.match(/^(Mineral water|Tea|Soup|Medicine water|Outside drink|Other fluid) added to today's total\.$/);
  if (manualMatch) {
    return `${formatNoticeCategoryLabel(manualMatch[1], language)} ditambahkan ke total hari ini.`;
  }

  const datedManualMatch = text.match(
    /^(Mineral water|Tea|Soup|Medicine water|Outside drink|Other fluid) added to (\d{4}-\d{2}-\d{2})\.$/,
  );
  if (datedManualMatch) {
    return `${formatNoticeCategoryLabel(datedManualMatch[1], language)} ditambahkan ke ${datedManualMatch[2]}.`;
  }

  const connectedMatch = text.match(/^Connected to (.+)\. Phone time was synced\.$/);
  if (connectedMatch) {
    return `Terhubung ke ${connectedMatch[1]}. Waktu ponsel sudah disinkronkan.`;
  }

  const recordsSyncedMatch = text.match(/^(\d+) bottle records synced to SQLite\.$/);
  if (recordsSyncedMatch) {
    return `${recordsSyncedMatch[1]} catatan botol disinkronkan ke SQLite.`;
  }

  return noticeTranslations[text] ?? text;
}

const formatNoticeCategoryLabel = (category: string, language: LanguageCode) => {
  if (category === "Medicine water") {
    return formatCategoryLabel("Mineral water", language);
  }

  if (category === "Outside drink") {
    return language === "id" ? "Minuman luar" : "Outside drink";
  }

  return formatCategoryLabel(category as IntakeCategory, language);
};
