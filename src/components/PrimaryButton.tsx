import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text } from "react-native";
import { palette } from "../theme";
import type { IconName } from "../types/ui";
import { styles } from "../styles/appStyles";

interface PrimaryButtonProps {
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
  tone?: "primary" | "danger";
}

export function PrimaryButton({ label, icon, onPress, disabled = false, tone = "primary" }: PrimaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.primaryButton,
        tone === "danger" && styles.primaryButtonDanger,
        pressed && !disabled && styles.buttonPressed,
        pressed && !disabled && tone === "danger" && styles.buttonPressedDanger,
        disabled && styles.buttonDisabled,
      ]}
    >
      <Ionicons name={icon} size={18} color={palette.surface} />
      <Text style={styles.primaryButtonText}>{label}</Text>
    </Pressable>
  );
}
