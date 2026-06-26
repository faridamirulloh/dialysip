import React, { useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { intakeCategories } from "../constants/intakeCategories";
import type { DailySipSnapshot, IntakeCategory, ManualIntakeInput } from "../data/types";
import type { AppCopy } from "../i18n";
import { formatCategoryLabel } from "../i18n";
import { palette } from "../theme";
import { styles } from "../styles/appStyles";
import { MetricCard } from "../components/MetricCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { ScreenCard } from "../components/ScreenCard";

interface ManualIntakeScreenProps {
  snapshot: DailySipSnapshot;
  copy: AppCopy;
  onSave: (input: ManualIntakeInput) => void;
}

export function ManualIntakeScreen({ snapshot, copy, onSave }: ManualIntakeScreenProps) {
  const [amountText, setAmountText] = useState("120");
  const [category, setCategory] = useState<IntakeCategory>("Mineral water");
  const [dateText, setDateText] = useState(formatDateKey(new Date()));
  const [note, setNote] = useState("");
  const amountMl = Number.parseInt(amountText, 10) || 0;
  const normalizedDateText = dateText.trim();
  const dateIsValid = isValidDateKey(normalizedDateText);
  const isToday = normalizedDateText === formatDateKey(new Date());
  const totalAfterSave = isToday ? snapshot.summary.totalMl + amountMl : snapshot.summary.totalMl;
  const language = snapshot.settings.language;

  return (
    <ScreenCard title={copy.manualTitle} subtitle={copy.manualSubtitle} chip={copy.manual} chipIcon="create-outline">
      <View style={styles.amountPanel}>
        <Text style={styles.inputLabel}>{copy.amount}</Text>
        <View style={styles.amountInputRow}>
          <TextInput
            value={amountText}
            onChangeText={setAmountText}
            keyboardType="number-pad"
            maxLength={4}
            style={styles.amountInput}
            accessibilityLabel={copy.manualAmountA11y}
          />
          <Text style={styles.amountUnit}>ml</Text>
        </View>
        <View style={styles.categoryGrid}>
          {intakeCategories.map((item) => (
            <Pressable
              key={item}
              onPress={() => setCategory(item)}
              style={[styles.categoryButton, category === item && styles.categoryButtonActive]}
            >
              <Text style={[styles.categoryText, category === item && styles.categoryTextActive]}>
                {formatCategoryLabel(item, language)}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      <View style={styles.datePanel}>
        <Text style={styles.inputLabel}>{copy.historyDate}</Text>
        <TextInput
          value={dateText}
          onChangeText={setDateText}
          placeholder="YYYY-MM-DD"
          placeholderTextColor={palette.muted}
          style={[styles.dateInput, !dateIsValid && styles.dateInputInvalid]}
          accessibilityLabel={copy.historyDateA11y}
          autoCapitalize="none"
        />
        <Text style={[styles.dateHint, !dateIsValid && styles.dateHintInvalid]}>
          {dateIsValid ? copy.historyDateHint : copy.invalidHistoryDate}
        </Text>
      </View>
      <TextInput
        value={note}
        onChangeText={setNote}
        placeholder={copy.note}
        placeholderTextColor={palette.muted}
        style={styles.noteInput}
      />
      <View style={styles.metricGrid}>
        <MetricCard label={copy.time} value={copy.now} />
        <MetricCard
          label={isToday ? copy.todayAfterSave : copy.historyDate}
          value={isToday ? `${totalAfterSave} ml` : normalizedDateText}
        />
      </View>
      <View style={styles.manualSaveAction}>
        <PrimaryButton
          label={copy.saveEntry}
          icon="save-outline"
          disabled={amountMl <= 0 || !dateIsValid}
          onPress={() => onSave({ amountMl, category, dateKey: normalizedDateText, note })}
        />
      </View>
    </ScreenCard>
  );
}

const formatDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const isValidDateKey = (dateKey: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    return false;
  }

  const [year, month, day] = dateKey.split("-").map(Number);
  const parsed = new Date(year, month - 1, day);
  return formatDateKey(parsed) === dateKey;
};
