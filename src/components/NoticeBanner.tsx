import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import { palette } from "../theme";
import { styles } from "../styles/appStyles";

interface NoticeBannerProps {
  text: string;
  tone: "normal" | "warn" | "danger";
  autoHideMs: number;
  closeLabel: string;
  onClose: () => void;
}

export function NoticeBanner({ text, tone, autoHideMs, closeLabel, onClose }: NoticeBannerProps) {
  const timeoutProgress = useRef(new Animated.Value(1)).current;
  const iconColor = tone === "danger" ? palette.danger : tone === "warn" ? palette.warning : palette.accent;
  const timeoutBarWidth = timeoutProgress.interpolate({
    inputRange: [0, 1],
    outputRange: ["0%", "100%"],
  });

  useEffect(() => {
    timeoutProgress.setValue(1);

    const animation = Animated.timing(timeoutProgress, {
      toValue: 0,
      duration: autoHideMs,
      easing: Easing.linear,
      useNativeDriver: false,
    });

    animation.start();
    return () => animation.stop();
  }, [autoHideMs, text, timeoutProgress]);

  return (
    <View style={[styles.notice, tone === "warn" && styles.noticeWarn, tone === "danger" && styles.noticeDanger]}>
      <Ionicons
        name={tone === "danger" ? "alert-circle-outline" : "information-circle-outline"}
        size={18}
        color={iconColor}
      />
      <Text
        style={[
          styles.noticeText,
          tone === "warn" && styles.noticeTextWarn,
          tone === "danger" && styles.noticeTextDanger,
        ]}
      >
        {text}
      </Text>
      <Pressable
        accessibilityLabel={closeLabel}
        onPress={onClose}
        style={({ pressed }) => [styles.noticeCloseButton, pressed && styles.secondaryButtonPressed]}
      >
        <Ionicons name="close-outline" size={18} color={iconColor} />
      </Pressable>
      <Animated.View style={[styles.noticeTimeoutBar, { backgroundColor: iconColor, width: timeoutBarWidth }]} />
    </View>
  );
}
