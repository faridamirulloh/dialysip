import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { showLanguageSetting } from "../constants/settings";
import type { DailySipSettings, DailySipSnapshot } from "../data/types";
import type { AppCopy } from "../i18n";
import { styles } from "../styles/appStyles";
import { palette } from "../theme";
import { LanguageSelector } from "../components/LanguageSelector";
import { HistorySyncSelector } from "../components/HistorySyncSelector";
import { DeviceManager } from "../components/DeviceManager";
import { PrimaryButton } from "../components/PrimaryButton";
import { ScreenCard } from "../components/ScreenCard";
import { SecondaryButton } from "../components/SecondaryButton";
import { SettingsStepper } from "../components/SettingsStepper";

interface SettingsScreenProps {
  snapshot: DailySipSnapshot;
  copy: AppCopy;
  onSave: (settings: DailySipSettings) => void;
  onSyncTime: () => void;
  onCalibration: () => void;
  onPair: () => void;
  onRenameDevice: (name: string) => void;
  onRemoveDevice: () => void;
}

const formatTenthsG = (tenths: number) => `${tenths % 10 === 0 ? tenths / 10 : (tenths / 10).toFixed(1)} g`;

export function SettingsScreen({
  snapshot,
  copy,
  onSave,
  onSyncTime,
  onCalibration,
  onPair,
  onRenameDevice,
  onRemoveDevice,
}: SettingsScreenProps) {
  const [draft, setDraft] = useState(snapshot.settings);
  const [deviceSettingsOpen, setDeviceSettingsOpen] = useState(false);

  const setNumber = (
    key: Exclude<keyof DailySipSettings, "language" | "historySyncMode">,
    value: number,
    minimum = 1,
    maximum?: number,
  ) => {
    setDraft((current) => ({
      ...current,
      [key]: Math.min(maximum ?? Number.POSITIVE_INFINITY, Math.max(minimum, value)),
    }));
  };

  return (
    <ScreenCard title={copy.settingsTitle} subtitle={copy.settingsSubtitle} chip="DialySip" chipIcon="settings-outline">
      <Text style={styles.settingsSectionLabel}>{copy.userSettings}</Text>
      {showLanguageSetting && (
        <LanguageSelector
          copy={copy}
          language={draft.language}
          onChange={(language) => setDraft((current) => ({ ...current, language }))}
        />
      )}
      <SettingsStepper
        copy={copy}
        label={copy.dailyLimit}
        value={`${draft.dailyLimitMl} ml`}
        onMinus={() => setNumber("dailyLimitMl", draft.dailyLimitMl - 50)}
        onPlus={() => setNumber("dailyLimitMl", draft.dailyLimitMl + 50)}
      />
      <SettingsStepper
        copy={copy}
        label={copy.warningThreshold}
        value={`${draft.warningThresholdPercent}%`}
        onMinus={() => setNumber("warningThresholdPercent", draft.warningThresholdPercent - 5)}
        onPlus={() => setNumber("warningThresholdPercent", draft.warningThresholdPercent + 5)}
      />

      <View style={styles.deviceSettingsPanel}>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ expanded: deviceSettingsOpen }}
          onPress={() => setDeviceSettingsOpen((open) => !open)}
          style={({ pressed }) => [styles.deviceSettingsHeader, pressed && styles.deviceSettingsHeaderPressed]}
        >
          <Text style={styles.deviceSettingsTitle}>{copy.deviceSettings}</Text>
          <Ionicons
            name={deviceSettingsOpen ? "chevron-up-outline" : "chevron-down-outline"}
            size={20}
            color={palette.accent}
          />
        </Pressable>

        {deviceSettingsOpen && (
          <View style={styles.deviceSettingsContent}>
            <HistorySyncSelector
              copy={copy}
              mode={draft.historySyncMode}
              onChange={(historySyncMode) => setDraft((current) => ({ ...current, historySyncMode }))}
            />
            <SettingsStepper
              copy={copy}
              label={copy.bleSyncWindow}
              value={`${draft.bleSyncWindowSeconds} ${copy.secondsShort}`}
              onMinus={() => setNumber("bleSyncWindowSeconds", draft.bleSyncWindowSeconds - 5)}
              onPlus={() => setNumber("bleSyncWindowSeconds", draft.bleSyncWindowSeconds + 5)}
            />
            <SettingsStepper
              copy={copy}
              label={copy.historyRetention}
              value={`${draft.historyRetentionDays} ${copy.daysShort}`}
              onMinus={() => setNumber("historyRetentionDays", draft.historyRetentionDays - 1)}
              onPlus={() => setNumber("historyRetentionDays", draft.historyRetentionDays + 1)}
            />
            <SettingsStepper
              copy={copy}
              label={copy.stableSaveTime}
              value={`${draft.stableSaveSeconds} ${copy.secondsShort}`}
              onMinus={() => setNumber("stableSaveSeconds", draft.stableSaveSeconds - 10, 10, 300)}
              onPlus={() => setNumber("stableSaveSeconds", draft.stableSaveSeconds + 10, 10, 300)}
            />
            <SettingsStepper
              copy={copy}
              label={copy.cupWeight}
              value={formatTenthsG(draft.cupWeightTenthsG)}
              onMinus={() => setNumber("cupWeightTenthsG", draft.cupWeightTenthsG - 5, 10)}
              onPlus={() => setNumber("cupWeightTenthsG", draft.cupWeightTenthsG + 5)}
            />
            <SettingsStepper
              copy={copy}
              label={copy.cupTolerance}
              value={formatTenthsG(draft.cupToleranceTenthsG)}
              onMinus={() => setNumber("cupToleranceTenthsG", draft.cupToleranceTenthsG - 5, 5)}
              onPlus={() => setNumber("cupToleranceTenthsG", draft.cupToleranceTenthsG + 5)}
            />
            <SettingsStepper
              copy={copy}
              label={copy.oledTimeout}
              value={`${draft.oledTimeoutSeconds} ${copy.secondsShort}`}
              onMinus={() => setNumber("oledTimeoutSeconds", draft.oledTimeoutSeconds - 5)}
              onPlus={() => setNumber("oledTimeoutSeconds", draft.oledTimeoutSeconds + 5)}
            />
            <DeviceManager
              copy={copy}
              device={snapshot.device}
              onAdd={onPair}
              onRename={onRenameDevice}
              onRemove={onRemoveDevice}
            />
            <View style={styles.settingsActions}>
              <SecondaryButton label={copy.syncTime} icon="time-outline" onPress={onSyncTime} />
            </View>
            <View style={styles.settingsActions}>
              <SecondaryButton label={copy.pairing} icon="bluetooth-outline" onPress={onPair} />
              <SecondaryButton label={copy.calibrationTitle} icon="scale-outline" onPress={onCalibration} />
            </View>
          </View>
        )}
      </View>

      <PrimaryButton label={copy.saveSettings} icon="checkmark-outline" onPress={() => onSave(draft)} />
    </ScreenCard>
  );
}
