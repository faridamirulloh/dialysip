import React from "react";
import { Pressable, Text, View } from "react-native";
import type { LanguageCode } from "../data/types";
import type { AppCopy } from "../i18n";
import { styles } from "../styles/appStyles";

interface LanguageSelectorProps {
  copy: AppCopy;
  language: LanguageCode;
  onChange: (language: LanguageCode) => void;
}

export function LanguageSelector({ copy, language, onChange }: LanguageSelectorProps) {
  const options: Array<{ language: LanguageCode; label: string }> = [
    { language: "id", label: copy.indonesian },
    { language: "en", label: copy.english },
  ];

  return (
    <View style={styles.settingRow}>
      <View style={styles.settingText}>
        <Text style={styles.infoLabel}>{copy.language}</Text>
        <Text style={styles.infoValue}>{language === "id" ? copy.indonesian : copy.english}</Text>
      </View>
      <View style={styles.languageChoices}>
        {options.map((option) => {
          const active = option.language === language;
          return (
            <Pressable
              key={option.language}
              onPress={() => onChange(option.language)}
              style={[styles.languageChoice, active && styles.languageChoiceActive]}
            >
              <Text style={[styles.languageChoiceText, active && styles.languageChoiceTextActive]}>{option.label}</Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
