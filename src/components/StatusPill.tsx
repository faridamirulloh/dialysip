import { Ionicons } from "@expo/vector-icons";
import React from "react";
import { Text, View } from "react-native";
import { palette } from "../theme";
import type { IconName } from "../types/ui";
import { styles } from "../styles/appStyles";

interface StatusPillProps {
  label: string;
  icon: IconName;
  tone?: "normal" | "warn" | "danger";
}

export function StatusPill({ label, icon, tone = "normal" }: StatusPillProps) {
  const toneStyle = tone === "danger" ? styles.pillDanger : tone === "warn" ? styles.pillWarn : styles.pillNormal;
  const iconColor = tone === "danger" ? palette.danger : tone === "warn" ? palette.warning : palette.accent;

  return (
    <View style={[styles.statusPill, toneStyle]}>
      <Ionicons name={icon} size={14} color={iconColor} />
      <Text
        style={[
          styles.statusPillText,
          tone === "danger" && styles.statusPillTextDanger,
          tone === "warn" && styles.statusPillTextWarn,
        ]}
      >
        {label}
      </Text>
    </View>
  );
}
