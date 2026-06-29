import DateTimePicker, { type DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { Ionicons } from "@expo/vector-icons";
import React, { useState } from "react";
import { Platform, Pressable, Text, TextInput, View } from "react-native";
import { intakeCategories } from "../constants/intakeCategories";
import type { DailySipSnapshot, IntakeCategory, ManualIntakeInput } from "../data/types";
import type { AppCopy } from "../i18n";
import { formatCategoryLabel } from "../i18n";
import { palette } from "../theme";
import { styles } from "../styles/appStyles";
import { IconButton } from "../components/IconButton";
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
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [datePickerVisible, setDatePickerVisible] = useState(false);
  const [timeText, setTimeText] = useState(formatTimeKey(new Date()));
  const [note, setNote] = useState("");
  const amountMl = Number.parseInt(amountText, 10) || 0;
  const normalizedDateText = formatDateKey(selectedDate);
  const normalizedTimeText = timeText.trim();
  const timeIsValid = isValidTimeKey(normalizedTimeText);
  const isToday = normalizedDateText === formatDateKey(new Date());
  const totalAfterSave = isToday ? snapshot.summary.totalMl + amountMl : snapshot.summary.totalMl;
  const language = snapshot.settings.language;
  const changeTimeByMinutes = (minutes: number) => {
    setTimeText((current) => formatTimeKey(addMinutes(parseTimeKey(current), minutes)));
  };
  const handleDateChange = (event: DateTimePickerEvent, date?: Date) => {
    if (Platform.OS !== "ios") {
      setDatePickerVisible(false);
    }

    if (event.type === "dismissed" || !date) {
      return;
    }

    setSelectedDate(date);
  };

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
        <Text style={styles.inputLabel}>{copy.datePicker}</Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={copy.datePicker}
          onPress={() => setDatePickerVisible(true)}
          style={({ pressed }) => [styles.datePickerButton, pressed && styles.datePickerButtonPressed]}
        >
          <Text style={styles.datePickerButtonText}>{normalizedDateText}</Text>
          <Ionicons name="calendar-outline" size={18} color={palette.accent} />
        </Pressable>
        {datePickerVisible && (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display={Platform.OS === "ios" ? "inline" : "default"}
            onChange={handleDateChange}
            style={styles.datePickerInline}
          />
        )}
        <Text style={styles.inputLabel}>{copy.timePicker}</Text>
        <View style={styles.pickerControlRow}>
          <IconButton icon="remove-outline" accessibilityLabel={`${copy.decrease} ${copy.time}`} onPress={() => changeTimeByMinutes(-15)} />
          <TextInput
            value={timeText}
            onChangeText={setTimeText}
            placeholder="HH:mm"
            placeholderTextColor={palette.muted}
            style={[styles.clockInput, !timeIsValid ? styles.dateInputInvalid : undefined]}
            accessibilityLabel={copy.time}
            autoCapitalize="none"
            keyboardType="numbers-and-punctuation"
            maxLength={5}
          />
          <IconButton icon="add-outline" accessibilityLabel={`${copy.increase} ${copy.time}`} onPress={() => changeTimeByMinutes(15)} />
        </View>
        <Text style={[styles.dateHint, !timeIsValid ? styles.dateHintInvalid : undefined]}>
          {timeIsValid ? "HH:mm" : copy.invalidTime}
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
        <MetricCard label={copy.time} value={normalizedTimeText} />
        <MetricCard
          label={isToday ? copy.todayAfterSave : copy.historyDate}
          value={isToday ? `${totalAfterSave} ml` : normalizedDateText}
        />
      </View>
      <View style={styles.manualSaveAction}>
        <PrimaryButton
          label={copy.saveEntry}
          icon="save-outline"
          disabled={amountMl <= 0 || !timeIsValid}
          onPress={() => onSave({ amountMl, category, dateKey: normalizedDateText, timeKey: normalizedTimeText, note })}
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

const formatTimeKey = (date: Date) =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

const isValidTimeKey = (timeKey: string) => {
  if (!/^\d{2}:\d{2}$/.test(timeKey)) {
    return false;
  }

  const [hours, minutes] = timeKey.split(":").map(Number);
  return hours >= 0 && hours <= 23 && minutes >= 0 && minutes <= 59;
};

const parseTimeKey = (timeKey: string) => {
  const fallback = new Date();
  if (!isValidTimeKey(timeKey)) {
    fallback.setSeconds(0, 0);
    return fallback;
  }

  const [hours, minutes] = timeKey.split(":").map(Number);
  fallback.setHours(hours, minutes, 0, 0);
  return fallback;
};

const addMinutes = (date: Date, minutes: number) => {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + minutes);
  return next;
};
