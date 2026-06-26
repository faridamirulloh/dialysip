import React, { useState } from "react";
import { View } from "react-native";
import { showLanguageSetting } from "../constants/settings";
import type { DailySipSettings, DailySipSnapshot } from "../data/types";
import type { AppCopy } from "../i18n";
import { styles } from "../styles/appStyles";
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
  onCalibration: () => void;
  onPair: () => void;
  onRenameDevice: (name: string) => void;
  onRemoveDevice: () => void;
}

export function SettingsScreen({
  snapshot,
  copy,
  onSave,
  onCalibration,
  onPair,
  onRenameDevice,
  onRemoveDevice,
}: SettingsScreenProps) {
  const [draft, setDraft] = useState(snapshot.settings);

  const setNumber = (
    key: Exclude<keyof DailySipSettings, "language" | "historySyncMode">,
    value: number
  ) => {
    setDraft((current) => ({
      ...current,
      [key]: Math.max(1, value),
    }));
  };

  return (
    <ScreenCard
      title={copy.settingsTitle}
      subtitle={copy.settingsSubtitle}
      chip="DialySip"
      chipIcon="settings-outline"
    >
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
      <SettingsStepper
        copy={copy}
        label={copy.bleSyncWindow}
        value={`${draft.bleSyncWindowSeconds} ${copy.secondsShort}`}
        onMinus={() => setNumber("bleSyncWindowSeconds", draft.bleSyncWindowSeconds - 5)}
        onPlus={() => setNumber("bleSyncWindowSeconds", draft.bleSyncWindowSeconds + 5)}
      />
      <HistorySyncSelector
        copy={copy}
        mode={draft.historySyncMode}
        onChange={(historySyncMode) => setDraft((current) => ({ ...current, historySyncMode }))}
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
        <SecondaryButton label={copy.pairing} icon="bluetooth-outline" onPress={onPair} />
        <SecondaryButton label={copy.calibrationTitle} icon="scale-outline" onPress={onCalibration} />
      </View>
      <PrimaryButton label={copy.saveSettings} icon="checkmark-outline" onPress={() => onSave(draft)} />
    </ScreenCard>
  );
}
