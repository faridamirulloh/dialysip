import React from "react";
import { Text, View } from "react-native";
import { styles } from "../styles/appStyles";

export function ModePill({ label }: { label: string }) {
  return (
    <View style={styles.modePill}>
      <Text style={styles.modePillText}>{label}</Text>
    </View>
  );
}
