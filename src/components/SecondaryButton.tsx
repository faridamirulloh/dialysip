import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable, Text } from "react-native";
import { palette } from "../theme";
import type { IconName } from "../types/ui";
import { styles } from "../styles/appStyles";

interface SecondaryButtonProps {
  label: string;
  icon: IconName;
  onPress: () => void;
  disabled?: boolean;
}

export function SecondaryButton({ label, icon, onPress, disabled = false }: SecondaryButtonProps) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={({ pressed }) => [
        styles.secondaryButton,
        pressed && !disabled && styles.secondaryButtonPressed,
        disabled && styles.secondaryButtonDisabled,
      ]}
    >
      <Ionicons name={icon} size={17} color={disabled ? palette.disabled : palette.accent} />
      <Text style={[styles.secondaryButtonText, disabled && styles.secondaryButtonTextDisabled]}>{label}</Text>
    </Pressable>
  );
}
