import React, { type ReactNode } from "react";
import { Text, View } from "react-native";
import type { IconName } from "../types/ui";
import { styles } from "../styles/appStyles";
import { StatusPill } from "./StatusPill";

interface ScreenCardProps {
  title: string;
  subtitle: string;
  chip: string;
  chipIcon: IconName;
  tone?: "normal" | "warn" | "danger";
  children: ReactNode;
}

export function ScreenCard({ title, subtitle, chip, chipIcon, tone = "normal", children }: ScreenCardProps) {
  return (
    <View style={styles.screenCard}>
      <View style={styles.screenHeader}>
        <View style={styles.screenTitleBlock}>
          <Text style={styles.screenTitle}>{title}</Text>
          <Text style={styles.screenSubtitle}>{subtitle}</Text>
        </View>
        <StatusPill label={chip} icon={chipIcon} tone={tone} />
      </View>
      {children}
    </View>
  );
}
