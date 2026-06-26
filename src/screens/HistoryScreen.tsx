import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import type { DailySipSnapshot, HistoryRange } from "../data/types";
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
  onDeleteDate: (dateKey: string) => void;
  onDeleteAllHistory: () => void;
}

export function HistoryScreen({
  snapshot,
  copy,
  onRefresh,
  onSync,
  onDeleteDate,
  onDeleteAllHistory
}: HistoryScreenProps) {
  const [range, setRange] = useState<HistoryRange>("weekly");
  const [periodIndex, setPeriodIndex] = useState(0);
  const [selectedBarIndex, setSelectedBarIndex] = useState<number | null>(null);
  const [pendingDelete, setPendingDelete] = useState<"date" | "all" | null>(null);
  const [deleteDateText, setDeleteDateText] = useState(formatDateKey(new Date()));
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
  const chartTotals = period.chartTotalsMl.length ? period.chartTotalsMl : [0];
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

  useEffect(() => {
    setSelectedBarIndex(null);
    setPendingDelete(null);
    if (range === "daily") {
      setDeleteDateText(period.id);
    }
  }, [period.id, range]);
  const normalizedDeleteDate = deleteDateText.trim();
  const deleteDateIsValid = isValidDateKey(normalizedDeleteDate);

  const handleDeleteDate = () => {
    if (!deleteDateIsValid) {
      return;
    }

    if (pendingDelete !== "date") {
      setPendingDelete("date");
      return;
    }

    setPendingDelete(null);
    onDeleteDate(normalizedDeleteDate);
  };

  const handleDeleteAllHistory = () => {
    if (pendingDelete !== "all") {
      setPendingDelete("all");
      return;
    }

    setPendingDelete(null);
    onDeleteAllHistory();
  };

  return (
    <ScreenCard
      title={copy.historyTitle}
      subtitle={`${periodTypeLabel}: ${localizeKnownLabel(period.label, language)}`}
      chip={warningLabels[language][period.warningState]}
      tone={warningTone[period.warningState]}
      chipIcon="calendar-outline"
    >
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
      <View style={styles.historyToolbar}>
        <SecondaryButton label={copy.refreshHistory} icon="refresh-outline" onPress={onRefresh} />
        <SecondaryButton label={copy.syncNow} icon="sync-outline" onPress={onSync} />
      </View>
      <View style={styles.periodSelector}>
        <IconButton
          icon="chevron-back-outline"
          accessibilityLabel={`${copy.previous} ${historyRangeLabels[language][range]}`}
          onPress={() => setPeriodIndex((current) => Math.min(current + 1, periods.length - 1))}
        />
        <View style={styles.periodTitleBlock}>
          <Text style={styles.periodType}>{periodTypeLabel}</Text>
          <Text style={styles.periodTitle}>{localizeKnownLabel(period.label, language)}</Text>
        </View>
        <IconButton
          icon="chevron-forward-outline"
          accessibilityLabel={`${copy.next} ${historyRangeLabels[language][range]}`}
          onPress={() => setPeriodIndex((current) => Math.max(current - 1, 0))}
        />
      </View>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.periodChipRow}>
        {periods.map((item, index) => (
          <Pressable
            key={item.id}
            onPress={() => setPeriodIndex(index)}
            style={[styles.periodChip, selectedIndex === index && styles.periodChipActive]}
          >
            <Text style={[styles.periodChipText, selectedIndex === index && styles.periodChipTextActive]}>
              {localizeKnownLabel(item.label, language)}
            </Text>
          </Pressable>
        ))}
      </ScrollView>
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
              <Text style={styles.legendText}>{copy.chartManualHeavy}</Text>
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
              {chartTotals.map((total, index) => {
                const selected = selectedBarIndex === index;
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
                            styles.bar,
                            index % 3 === 1 && styles.barManual,
                            selected && styles.barSelected,
                            { height: `${Math.max(14, (total / maxTotal) * 100)}%` },
                          ]}
                        />
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
        {period.records.slice(0, 5).map((record) => {
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
        <Text style={styles.panelBody}>{copy.deleteSelectedDateHint}</Text>
        <TextInput
          value={deleteDateText}
          onChangeText={(value) => {
            setDeleteDateText(value);
            setPendingDelete(null);
          }}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={palette.muted}
          style={[styles.dateInput, !deleteDateIsValid && styles.dateInputInvalid]}
          accessibilityLabel={copy.historyDateA11y}
          autoCapitalize="none"
        />
        <Text style={[styles.dateHint, !deleteDateIsValid && styles.dateHintInvalid]}>
          {deleteDateIsValid ? copy.historyDateHint : copy.invalidHistoryDate}
        </Text>
        <Text style={styles.panelBody}>{copy.deleteAllHistoryHint}</Text>
        <View style={styles.actionRow}>
          <SecondaryButton
            label={pendingDelete === "date" ? copy.confirmDeleteSelectedDate : copy.deleteSelectedDate}
            icon="trash-outline"
            onPress={handleDeleteDate}
            disabled={!deleteDateIsValid}
          />
          <PrimaryButton
            label={pendingDelete === "all" ? copy.confirmDeleteAllHistory : copy.deleteAllHistory}
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

const isValidDateKey = (dateKey: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return false;
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return formatDateKey(parsed) === dateKey;
};
