import React from "react";
import { Text, View } from "react-native";
import type { DailySipSnapshot } from "../data/types";
import type { AppCopy } from "../i18n";
import { localizeKnownLabel, warningLabels } from "../i18n";
import { styles } from "../styles/appStyles";
import { InfoList } from "../components/InfoList";
import { MetricCard } from "../components/MetricCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { ProgressRing } from "../components/ProgressRing";
import { ScreenCard } from "../components/ScreenCard";
import { SecondaryButton } from "../components/SecondaryButton";

interface DashboardScreenProps {
  snapshot: DailySipSnapshot;
  copy: AppCopy;
  onSync: () => void;
  onAddManual: () => void;
}

export function DashboardScreen({ snapshot, copy, onSync, onAddManual }: DashboardScreenProps) {
  const progress = snapshot.summary.totalMl / snapshot.summary.dailyLimitMl;

  return (
    <ScreenCard
      title={copy.today}
      subtitle={localizeKnownLabel(snapshot.summary.localDateLabel, snapshot.settings.language)}
      chip={snapshot.device.connection === "connected" ? copy.connected : copy.syncNeeded}
      tone={snapshot.device.connection === "connected" ? "normal" : "warn"}
      chipIcon={snapshot.device.connection === "connected" ? "checkmark-circle-outline" : "cloud-offline-outline"}
    >
      <View style={styles.progressWrap}>
        <ProgressRing progress={progress} />
        <View style={styles.progressText}>
          <Text style={styles.progressValue}>{snapshot.summary.totalMl}</Text>
          <Text style={styles.progressLabel}>
            {copy.of} {snapshot.summary.dailyLimitMl} ml
          </Text>
        </View>
      </View>
      <View style={styles.metricGrid}>
        <MetricCard label={copy.remaining} value={`${snapshot.summary.remainingMl} ml`} />
        <MetricCard label={copy.lastDrink} value={`${snapshot.summary.lastDrinkAmountMl} ml`} />
      </View>
      <InfoList
        rows={[
          [
            copy.bottleBattery,
            `${snapshot.device.batteryPercent}%`,
            snapshot.device.batteryPercent <= 20 ? copy.low : copy.good,
          ],
          [
            copy.lastSync,
            localizeKnownLabel(snapshot.device.lastSyncLabel, snapshot.settings.language),
            snapshot.device.unsyncedRecords ? copy.sync : copy.ok,
          ],
          [
            copy.warning,
            warningLabels[snapshot.settings.language][snapshot.summary.warningState],
            `${Math.round(progress * 100)}%`,
          ],
        ]}
      />
      <View style={styles.actionRow}>
        <PrimaryButton label={copy.addManualIntake} icon="add-outline" onPress={onAddManual} />
        <SecondaryButton label={copy.syncNow} icon="sync-outline" onPress={onSync} />
      </View>
    </ScreenCard>
  );
}
