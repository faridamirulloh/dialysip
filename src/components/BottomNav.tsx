import { Ionicons } from "@expo/vector-icons";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Pressable, Text, View } from "react-native";
import type { LayoutChangeEvent } from "react-native";
import type { AppCopy } from "../i18n";
import type { ScreenName } from "../navigation/types";
import { palette } from "../theme";
import type { IconName } from "../types/ui";
import { styles } from "../styles/appStyles";

interface BottomNavProps {
  activeScreen: ScreenName;
  copy: AppCopy;
  onChange: (screen: ScreenName) => void;
}

export function BottomNav({ activeScreen, copy, onChange }: BottomNavProps) {
  const [navWidth, setNavWidth] = useState(0);
  const indicatorTranslateX = useRef(new Animated.Value(0)).current;
  const items: Array<{ label: string; screen: ScreenName; icon: IconName }> = [
    { label: copy.navToday, screen: "dashboard", icon: "home-outline" },
    { label: copy.navAdd, screen: "manual", icon: "add-circle-outline" },
    { label: copy.navHistory, screen: "history", icon: "bar-chart-outline" },
    { label: copy.navSettings, screen: "settings", icon: "settings-outline" },
  ];

  const activeNavScreen = useMemo(() => {
    if (activeScreen === "pair" || activeScreen === "calibration") return "settings";
    return activeScreen;
  }, [activeScreen]);
  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.screen === activeNavScreen),
  );
  const navPadding = 8;
  const indicatorWidth = navWidth > navPadding * 2 ? (navWidth - navPadding * 2) / items.length : 0;

  useEffect(() => {
    if (!indicatorWidth) {
      return;
    }

    Animated.timing(indicatorTranslateX, {
      toValue: activeIndex * indicatorWidth,
      duration: 220,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start();
  }, [activeIndex, indicatorTranslateX, indicatorWidth]);

  const handleLayout = (event: LayoutChangeEvent) => {
    setNavWidth(event.nativeEvent.layout.width);
  };

  return (
    <View style={styles.bottomNav} onLayout={handleLayout}>
      {indicatorWidth > 0 && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.navActiveIndicator,
            {
              width: indicatorWidth,
              transform: [{ translateX: indicatorTranslateX }],
            },
          ]}
        />
      )}
      {items.map((item) => {
        const active = item.screen === activeNavScreen;
        return (
          <Pressable
            key={item.screen}
            onPress={() => onChange(item.screen)}
            style={styles.navItem}
          >
            <Ionicons name={item.icon} size={18} color={active ? palette.accent : palette.muted} />
            <Text style={[styles.navLabel, active && styles.navLabelActive]}>{item.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}
