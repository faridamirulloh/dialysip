import React from "react";
import { Pressable, Text, View } from "react-native";
import type { HistorySyncMode } from "../data/types";
import type { AppCopy } from "../i18n";
import { styles } from "../styles/appStyles";

interface HistorySyncSelectorProps {
  copy: AppCopy;
  mode: HistorySyncMode;
  onChange: (mode: HistorySyncMode) => void;
}

export function HistorySyncSelector({ copy, mode, onChange }: HistorySyncSelectorProps) {
  const options: Array<{ mode: HistorySyncMode; label: string }> = [
    { mode: "full", label: copy.fullHistory },
    { mode: "after_last_sync", label: copy.afterLastSync },
  ];

  return (
    <View style={styles.settingRow}>
      <View style={styles.settingText}>
        <Text style={styles.infoLabel}>{copy.historySync}</Text>
        <Text style={styles.infoValue}>
          {mode === "full" ? copy.fullHistory : copy.afterLastSync}
        </Text>
      </View>
      <View style={styles.historySyncChoices}>
        {options.map((option) => {
          const active = option.mode === mode;
          return (
            <Pressable
              key={option.mode}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(option.mode)}
              style={[styles.historySyncChoice, active && styles.historySyncChoiceActive]}
            >
              <Text style={[styles.historySyncChoiceText, active && styles.historySyncChoiceTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
