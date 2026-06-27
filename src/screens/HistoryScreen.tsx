import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import type { DailySipSnapshot, HistoryChartBucket, HistoryRange, IntakeRecord } from "../data/types";
import type { AppCopy } from "../i18n";
import { historyRangeLabels, localizeKnownLabel, localizeRecord, warningLabels } from "../i18n";
import { palette } from "../theme";
import { styles } from "../styles/appStyles";
import { IconButton } from "../components/IconButton";
import { MetricCard } from "../components/MetricCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { ScreenCard } from "../components/ScreenCard";
import { SecondaryButton } from "../components/SecondaryButton";
import {
  formatChartAxisVolume,
  formatChartTooltipVolume,
  getHistoryChartLabels,
  historyRanges,
  warningTone,
} from "./historyHelpers";

interface HistoryScreenProps {
  snapshot: DailySipSnapshot;
  copy: AppCopy;
  onRefresh: () => void;
  onSync: () => void;
  onDeleteRange: (startDateKey: string, endDateKey: string) => void;
  onDeleteAllHistory: () => void;
}

export function HistoryScreen({
  snapshot,
  copy,
  onRefresh,
  onSync,
  onDeleteRange,
  onDeleteAllHistory,
}: HistoryScreenProps) {
  const [range, setRange] = useState<HistoryRange>("weekly");
  const [periodIndex, setPeriodIndex] = useState(0);
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<"selected" | "all" | null>(null);
  const [periodSelectorOpen, setPeriodSelectorOpen] = useState(false);
  const [periodDateText, setPeriodDateText] = useState(formatDateKey(new Date()));
  const [periodDateError, setPeriodDateError] = useState("");
  const [currentTime, setCurrentTime] = useState(() => new Date());
  const language = snapshot.settings.language;

  useEffect(() => {
    setPeriodIndex(0);
  }, [range]);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);

  const periods = snapshot.history[range];
  const selectedIndex = Math.min(periodIndex, periods.length - 1);
  const period = periods[selectedIndex];
  const chartBuckets = getChartBuckets(period.chartBucketsMl, period.chartTotalsMl);
  const chartTotals = chartBuckets.map((bucket) => bucket.totalMl);
  const chartLimit = range === "monthly" ? Math.max(...chartTotals, 1) : snapshot.settings.dailyLimitMl;
  const maxTotal = Math.max(...chartTotals, chartLimit, 1);
  const chartLabels = getHistoryChartLabels(
    range,
    chartTotals.length,
    language,
    range === "daily" && period.id === formatDateKey(currentTime),
    currentTime,
  );
  const volumeTicks = [maxTotal, Math.round(maxTotal / 2), 0];
  const periodTypeLabel = range === "daily" ? copy.date : range === "weekly" ? copy.week : copy.month;
  const groupedRecords = groupRecordsByDate(period.records, period.id);

  useEffect(() => {
    setSelectedBarIndex(null);
    setPendingDelete(null);
    setPeriodDateText(getPeriodInputValue(period.id, range));
    setPeriodDateError("");
  }, [period.id, range]);

  const handleDeleteSelected = () => {
    if (pendingDelete !== "selected") {
      setPendingDelete("selected");
      return;
    }

    setPendingDelete(null);
    const selectedRange = getPeriodDateRange(range, period.id);
    onDeleteRange(selectedRange.startDateKey, selectedRange.endDateKey);
  };

  const handleDeleteAllHistory = () => {
    if (pendingDelete !== "all") {
      setPendingDelete("all");
      return;
    }

    setPendingDelete(null);
    onDeleteAllHistory();
  };

  const handleShowPeriod = () => {
    const normalizedDate = periodDateText.trim();
    if (!isValidDateKey(normalizedDate)) {
      setPeriodDateError(copy.invalidHistoryDate);
      return;
    }

    const targetId = getPeriodLookupId(range, normalizedDate);
    const targetIndex = periods.findIndex((item) => item.id === targetId);
    if (targetIndex < 0) {
      setPeriodDateError(copy.periodNotFound);
      return;
    }

    setPeriodIndex(targetIndex);
    setPeriodDateError("");
    setPeriodSelectorOpen(false);
  };

  return (
    <ScreenCard
      title={copy.historyTitle}
      subtitle={`${periodTypeLabel}: ${localizeKnownLabel(period.label, language)}`}
      chip={warningLabels[language][period.warningState]}
      tone={warningTone[period.warningState]}
      chipIcon="calendar-outline"
    >
      <View style={styles.historyToolbar}>
        <SecondaryButton label={copy.refreshHistory} icon="refresh-outline" onPress={onRefresh} />
        <SecondaryButton label={copy.syncNow} icon="sync-outline" onPress={onSync} />
      </View>
      <View style={styles.segmentControl}>
        {historyRanges.map((item) => {
          const active = item === range;
          return (
            <Pressable
              key={item}
              onPress={() => setRange(item)}
              style={[styles.segmentButton, active && styles.segmentButtonActive]}
            >
              <Text style={[styles.segmentButtonText, active && styles.segmentButtonTextActive]}>
                {historyRangeLabels[language][item]}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <View style={styles.periodSelector}>
        <IconButton
          icon="chevron-back-outline"
          accessibilityLabel={`${copy.previous} ${historyRangeLabels[language][range]}`}
          onPress={() => setPeriodIndex((current) => Math.min(current + 1, periods.length - 1))}
        />
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.selectPeriod}
          onPress={() => setPeriodSelectorOpen((current) => !current)}
          style={styles.periodTitleBlock}
        >
          <Text style={styles.periodType}>{periodTypeLabel}</Text>
          <Text style={styles.periodTitle}>{localizeKnownLabel(period.label, language)}</Text>
        </Pressable>
        <IconButton
          icon="chevron-forward-outline"
          accessibilityLabel={`${copy.next} ${historyRangeLabels[language][range]}`}
          onPress={() => setPeriodIndex((current) => Math.max(current - 1, 0))}
        />
      </View>
      {periodSelectorOpen && (
        <View style={styles.periodPickerPanel}>
          <Text style={styles.panelTitle}>{copy.selectPeriod}</Text>
          <TextInput
            value={periodDateText}
            onChangeText={(value) => {
              setPeriodDateText(value);
              setPeriodDateError("");
            }}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={palette.muted}
            style={[styles.dateInput, periodDateError ? styles.dateInputInvalid : undefined]}
            accessibilityLabel={copy.historyDateA11y}
            autoCapitalize="none"
          />
          <Text style={[styles.dateHint, periodDateError ? styles.dateHintInvalid : undefined]}>
            {periodDateError || copy.periodDateHint}
          </Text>
          <View style={styles.periodPickerActions}>
            <SecondaryButton label={copy.showPeriod} icon="calendar-outline" onPress={handleShowPeriod} />
          </View>
        </View>
      )}
      <View style={styles.chartPanel}>
        <View style={styles.chartTopRow}>
          <Text style={styles.chartUnitLabel}>Vol L</Text>
          <View style={styles.chartLegend}>
            <View style={styles.legendItem}>
              <View style={styles.legendDot} />
              <Text style={styles.legendText}>{copy.chartBottle}</Text>
            </View>
            <View style={styles.legendItem}>
              <View style={[styles.legendDot, styles.legendDotManual]} />
              <Text style={styles.legendText}>{copy.manual}</Text>
            </View>
          </View>
        </View>
        <View style={styles.chartBody}>
          <View style={styles.volumeAxis}>
            {volumeTicks.map((tick) => (
              <Text key={tick} style={styles.volumeTick}>
                {formatChartAxisVolume(tick)}
              </Text>
            ))}
          </View>
          <View style={styles.chartPlot}>
            <View pointerEvents="none" style={styles.chartGrid}>
              <View style={styles.chartGridLine} />
              <View style={styles.chartGridLine} />
              <View style={styles.chartGridLine} />
            </View>
            <View style={styles.chartBars}>
              {chartBuckets.map((bucket, index) => {
                const total = bucket.totalMl;
                const selected = selectedBarIndex === index;
                const segments = getChartSegments(bucket);
                return (
                  <Pressable
                    key={`${total}-${index}`}
                    accessibilityRole="button"
                    accessibilityLabel={`${chartLabels[index]} ${formatChartTooltipVolume(total)}`}
                    onPress={() => setSelectedBarIndex((current) => (current === index ? null : index))}
                    style={styles.barColumn}
                  >
                    <View style={styles.barTrack}>
                      {selected && (
                        <View style={styles.barTooltip}>
                          <Text style={styles.barTooltipText} numberOfLines={1}>
                            {formatChartTooltipVolume(total)}
                          </Text>
                        </View>
                      )}
                      {total > 0 && (
                        <View
                          style={[
                            styles.barStack,
                            selected && styles.barSelected,
                            { height: `${Math.max(14, (total / maxTotal) * 100)}%` },
                          ]}
                        >
                          {segments.map((segment) => (
                            <View
                              key={segment.key}
                              style={[
                                styles.barSegment,
                                segment.key === "auto" && styles.barSegmentAuto,
                                segment.key === "manual" && styles.barSegmentManual,
                                segment.key === "other" && styles.barSegmentOther,
                                { height: `${(segment.amountMl / total) * 100}%` },
                              ]}
                            />
                          ))}
                        </View>
                      )}
                    </View>
                    <Text style={styles.barLabel} numberOfLines={1}>
                      {chartLabels[index]}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </View>
      </View>
      <View style={styles.metricGrid}>
        <MetricCard label={copy.total} value={`${period.totalMl} ml`} />
        <MetricCard label={copy.limit} value={`${period.limitMl} ml`} />
      </View>
      <View style={styles.metricGrid}>
        <MetricCard label={copy.auto} value={`${period.autoMl} ml`} />
        <MetricCard label={copy.manual} value={`${period.manualMl} ml`} />
      </View>
      <View style={styles.timeline}>
        {groupedRecords.map((group) => (
          <View key={group.dateKey} style={styles.historyDateGroup}>
            <Text style={styles.historyDateHeader}>{group.dateKey}</Text>
            {group.records.map((record) => {
              const localizedRecord = localizeRecord(record, language);
              return (
                <View key={record.id} style={styles.timelineRow}>
                  <View
                    style={[
                      styles.timelineDot,
                      record.type === "refill" && styles.timelineDotWarn,
                      record.flagged && styles.timelineDotDanger,
                    ]}
                  />
                  <View style={styles.timelineCopy}>
                    <Text style={styles.timelineTitle}>{localizedRecord.title}</Text>
                    <Text style={styles.timelineDetail}>
                      {record.amountMl ? `${record.amountMl} ml - ` : ""}
                      {localizedRecord.timeLabel} - {localizedRecord.detail}
                    </Text>
                  </View>
                  <Text style={styles.timelineMeta}>
                    {record.flagged ? copy.flag : record.type === "refill" ? copy.marker : copy.ok}
                  </Text>
                </View>
              );
            })}
          </View>
        ))}
        {period.records.length === 0 && (
          <View style={styles.emptyHistoryState}>
            <Ionicons name="calendar-clear-outline" size={22} color={palette.muted} />
            <Text style={styles.emptyHistoryText}>
              {copy.noRecordsFor} {historyRangeLabels[language][range].toLowerCase()}.
            </Text>
          </View>
        )}
      </View>
      <View style={styles.historyActionPanel}>
        <Text style={styles.panelTitle}>{copy.historyActions}</Text>
        <View style={styles.actionRow}>
          <SecondaryButton
            label={pendingDelete === "selected" ? copy.confirmRemoveSelectedHistory : copy.removeSelectedHistory}
            icon="trash-outline"
            onPress={handleDeleteSelected}
          />
          <PrimaryButton
            label={pendingDelete === "all" ? copy.confirmDeleteAllHistory : copy.removeAllHistories}
            icon="trash-bin-outline"
            tone="danger"
            onPress={handleDeleteAllHistory}
          />
        </View>
      </View>
    </ScreenCard>
  );
}

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const parseDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split("-").map(Number);
  return new Date(year, month - 1, day);
};

const isValidDateKey = (dateKey: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return false;
  }

  const parsed = parseDateKey(dateKey);
  return formatDateKey(parsed) === dateKey;
};

const startOfWeek = (date: Date) => {
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  day.setDate(day.getDate() - day.getDay());
  return day;
};

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getPeriodLookupId = (range: HistoryRange, dateKey: string) => {
  if (range === "daily") {
    return dateKey;
  }

  const date = parseDateKey(dateKey);
  if (range === "weekly") {
    const start = startOfWeek(date);
    const end = addDays(start, 6);
    return `${formatDateKey(start)}-${formatDateKey(end)}`;
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
};

const getPeriodDateRange = (range: HistoryRange, periodId: string) => {
  if (range === "daily") {
    return { startDateKey: periodId, endDateKey: periodId };
  }

  if (range === "weekly") {
    return {
      startDateKey: periodId.slice(0, 10),
      endDateKey: periodId.slice(11),
    };
  }

  const [year, month] = periodId.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0);
  return {
    startDateKey: formatDateKey(start),
    endDateKey: formatDateKey(end),
  };
};

const getPeriodInputValue = (periodId: string, range: HistoryRange) => {
  if (range === "daily") {
    return periodId;
  }

  if (range === "weekly") {
    return periodId.slice(0, 10);
  }

  return `${periodId}-01`;
};

const groupRecordsByDate = (records: IntakeRecord[], fallbackPeriodId: string) => {
  const grouped = new Map<string, IntakeRecord[]>();

  records.forEach((record) => {
    const dateKey = record.dateKey ?? fallbackPeriodId.slice(0, 10);
    grouped.set(dateKey, [...(grouped.get(dateKey) ?? []), record]);
  });

  return Array.from(grouped.entries()).map(([dateKey, groupedRecords]) => ({
    dateKey,
    records: groupedRecords,
  }));
};

const getChartBuckets = (chartBucketsMl: HistoryChartBucket[] | undefined, chartTotalsMl: number[]) => {
  if (chartBucketsMl?.length) {
    return chartBucketsMl;
  }

  const totals = chartTotalsMl.length ? chartTotalsMl : [0];
  return totals.map((totalMl) => ({
    totalMl,
    autoMl: totalMl,
    manualMl: 0,
    otherMl: 0,
  }));
};

const getChartSegments = (bucket: HistoryChartBucket) =>
  [
    { key: "manual", amountMl: bucket.manualMl },
    { key: "other", amountMl: bucket.otherMl },
    { key: "auto", amountMl: bucket.autoMl },
  ].filter((segment) => segment.amountMl > 0);
