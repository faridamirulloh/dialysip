import React from "react";
import { Text, View } from "react-native";
import type { AppCopy } from "../i18n";
import { styles } from "../styles/appStyles";
import { IconButton } from "./IconButton";

interface SettingsStepperProps {
  copy: AppCopy;
  label: string;
  value: string;
  onMinus: () => void;
  onPlus: () => void;
}

export function SettingsStepper({ copy, label, value, onMinus, onPlus }: SettingsStepperProps) {
  return (
    <View style={styles.settingRow}>
      <View style={styles.settingText}>
        <Text style={styles.infoLabel}>{label}</Text>
        <Text style={styles.infoValue}>{value}</Text>
      </View>
      <View style={styles.stepperControls}>
        <IconButton icon="remove-outline" accessibilityLabel={`${copy.decrease} ${label}`} onPress={onMinus} />
        <IconButton icon="add-outline" accessibilityLabel={`${copy.increase} ${label}`} onPress={onPlus} />
      </View>
    </View>
  );
}
