import type { HistoryRange, LanguageCode, WarningState } from "../data/types";

export const historyRanges: HistoryRange[] = ["daily", "weekly", "monthly"];

export const warningTone: Record<WarningState, "normal" | "warn" | "danger"> = {
  normal: "normal",
  near_limit: "warn",
  over_limit: "danger",
  low_battery: "warn",
  device_error: "danger",
};

const dailyChartLabels: Record<LanguageCode, string[]> = {
  en: ["06:00", "09:00", "12:00", "15:00", "Now"],
  id: ["06:00", "09:00", "12:00", "15:00", "Sekarang"],
};

const weeklyChartLabels: Record<LanguageCode, string[]> = {
  en: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"],
  id: ["Min", "Sen", "Sel", "Rab", "Kam", "Jum", "Sab"],
};

export function getHistoryChartLabels(range: HistoryRange, count: number, language: LanguageCode): string[] {
  if (range === "daily") {
    return Array.from(
      { length: count },
      (_, index) => dailyChartLabels[language][index] ?? `${String(index + 1).padStart(2, "0")}:00`,
    );
  }

  if (range === "weekly") {
    return Array.from(
      { length: count },
      (_, index) => weeklyChartLabels[language][index % weeklyChartLabels[language].length],
    );
  }

  return Array.from({ length: count }, (_, index) =>
    count <= 6 ? `${language === "id" ? "M" : "W"}${index + 1}` : `${index + 1}`,
  );
}

export function formatChartAxisVolume(value: number): string {
  if (value <= 0) {
    return "0";
  }

  const liters = value / 1000;

  if (liters < 0.1) {
    return "<0.1";
  }

  return liters.toFixed(1);
}

export function formatChartTooltipVolume(value: number): string {
  return `${value.toLocaleString("en-US")} ml`;
}
