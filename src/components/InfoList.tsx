import React from "react";
import { Text, View } from "react-native";
import { styles } from "../styles/appStyles";

export function InfoList({ rows }: { rows: Array<[string, string, string]> }) {
  return (
    <View style={styles.infoList}>
      {rows.map(([label, value, meta]) => (
        <View key={`${label}-${value}`} style={styles.infoRow}>
          <View style={styles.infoCopy}>
            <Text style={styles.infoLabel}>{label}</Text>
            <Text style={styles.infoValue}>{value}</Text>
          </View>
          <Text style={styles.infoMeta}>{meta}</Text>
        </View>
      ))}
    </View>
  );
}
