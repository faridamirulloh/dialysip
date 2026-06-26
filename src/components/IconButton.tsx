import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Pressable } from "react-native";
import { palette } from "../theme";
import type { IconName } from "../types/ui";
import { styles } from "../styles/appStyles";

interface IconButtonProps {
  icon: IconName;
  accessibilityLabel: string;
  onPress: () => void;
}

export function IconButton({ icon, accessibilityLabel, onPress }: IconButtonProps) {
  return (
    <Pressable
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, pressed && styles.secondaryButtonPressed]}
    >
      <Ionicons name={icon} size={19} color={palette.accent} />
    </Pressable>
  );
}
