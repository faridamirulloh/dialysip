import { StatusBar } from "expo-status-bar";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Image,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ScrollView,
  Text,
  View,
} from "react-native";
import type { GestureResponderEvent } from "react-native";
import { BottomNav } from "./src/components/BottomNav";
import { AppHeader } from "./src/components/AppHeader";
import { NoticeBanner } from "./src/components/NoticeBanner";
import { dialysipLoading } from "./src/constants/assets";
import { useDailySipData } from "./src/data/useDailySipData";
import { getAppCopy, localizeNotice } from "./src/i18n";
import { getScreenTransitionDirection, getSwipeTargetScreen } from "./src/navigation/pageNavigation";
import type { ScreenName } from "./src/navigation/types";
import { CalibrationScreen } from "./src/screens/CalibrationScreen";
import { DashboardScreen } from "./src/screens/DashboardScreen";
import { HistoryScreen } from "./src/screens/HistoryScreen";
import { ManualIntakeScreen } from "./src/screens/ManualIntakeScreen";
import { PairScreen } from "./src/screens/PairScreen";
import { SettingsScreen } from "./src/screens/SettingsScreen";
import { styles } from "./src/styles/appStyles";

const noticeAutoHideMs = 6000;
const pageSwipeMinDistance = 64;
const pageSwipeHorizontalRatio = 1.2;
const pageSlideDistance = 34;
const pageSlideDurationMs = 220;

export default function App() {
  const {
    snapshot,
    bleActivity,
    bleLog,
    clearBleLog,
    isBusy,
    error,
    refreshSnapshot,
    connectDevice,
    syncNow,
    startCalibration,
    refreshDeviceStatus,
    saveTare,
    confirmCalibrationAmount,
    finishCalibration,
    addManualIntake,
    deleteHistoryRange,
    deleteAllHistory,
    renameDevice,
    removeDevice,
    updateSettings,
  } = useDailySipData();
  const [screen, setScreen] = useState<ScreenName>("dashboard");
  const [dismissedNoticeText, setDismissedNoticeText] = useState<string | null>(null);
  const contentTouchStart = useRef<{ x: number; y: number } | null>(null);
  const previousScreen = useRef<ScreenName>("dashboard");
  const pageTranslateX = useRef(new Animated.Value(0)).current;
  const pageOpacity = useRef(new Animated.Value(1)).current;
  const loadingPulse = useRef(new Animated.Value(0)).current;
  const bootCopy = getAppCopy();
  const noticeText = snapshot ? localizeNotice(error ?? snapshot.notice ?? "", snapshot.settings.language) : "";
  const noticeTone = snapshot ? (error ? "danger" : snapshot.mode === "demo" ? "normal" : "warn") : "normal";

  const loadingDropScale = loadingPulse.interpolate({
    inputRange: [0, 0.45, 0.75, 1],
    outputRange: [0.92, 1.06, 0.96, 0.92],
  });
  const loadingDropTranslateY = loadingPulse.interpolate({
    inputRange: [0, 0.5, 1],
    outputRange: [0, -5, 0],
  });
  const loadingRippleScale = loadingPulse.interpolate({
    inputRange: [0, 0.55, 1],
    outputRange: [0.62, 1, 1.22],
  });
  const loadingRippleOpacity = loadingPulse.interpolate({
    inputRange: [0, 0.4, 1],
    outputRange: [0.38, 0.18, 0],
  });

  useEffect(() => {
    setDismissedNoticeText(null);

    if (!noticeText) {
      return undefined;
    }

    const timer = setTimeout(() => setDismissedNoticeText(noticeText), noticeAutoHideMs);
    return () => clearTimeout(timer);
  }, [noticeText]);

  useEffect(() => {
    if (snapshot) {
      return undefined;
    }

    loadingPulse.setValue(0);
    const animation = Animated.loop(
      Animated.timing(loadingPulse, {
        toValue: 1,
        duration: 1500,
        easing: Easing.inOut(Easing.cubic),
        useNativeDriver: true,
      }),
    );

    animation.start();
    return () => animation.stop();
  }, [loadingPulse, snapshot]);

  useEffect(() => {
    const direction = getScreenTransitionDirection(previousScreen.current, screen);
    previousScreen.current = screen;
    pageTranslateX.setValue(direction * pageSlideDistance);
    pageOpacity.setValue(direction === 0 ? 1 : 0.88);

    const animation = Animated.parallel([
      Animated.timing(pageTranslateX, {
        toValue: 0,
        duration: pageSlideDurationMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(pageOpacity, {
        toValue: 1,
        duration: pageSlideDurationMs,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
    ]);

    animation.start();
    return () => animation.stop();
  }, [pageOpacity, pageTranslateX, screen]);

  const handleContentTouchStart = useCallback((event: GestureResponderEvent) => {
    const { pageX, pageY } = event.nativeEvent;
    contentTouchStart.current = { x: pageX, y: pageY };
  }, []);

  const handleContentTouchEnd = useCallback(
    (event: GestureResponderEvent) => {
      const start = contentTouchStart.current;
      contentTouchStart.current = null;

      if (!start) {
        return;
      }

      const { pageX, pageY } = event.nativeEvent;
      const deltaX = pageX - start.x;
      const deltaY = pageY - start.y;
      const horizontalDistance = Math.abs(deltaX);
      const verticalDistance = Math.abs(deltaY);

      if (
        horizontalDistance < pageSwipeMinDistance ||
        horizontalDistance < verticalDistance * pageSwipeHorizontalRatio
      ) {
        return;
      }

      const targetScreen = getSwipeTargetScreen(screen, deltaX < 0 ? "next" : "previous");

      if (targetScreen) {
        setScreen(targetScreen);
      }
    },
    [screen],
  );

  if (!snapshot) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <StatusBar style="dark" />
        <View style={styles.loadingState}>
          <Image source={dialysipLoading} style={styles.loadingLogo} resizeMode="contain" />
          <View style={styles.loadingDropWrap}>
            <Animated.View
              style={[
                styles.loadingRipple,
                {
                  opacity: loadingRippleOpacity,
                  transform: [{ scale: loadingRippleScale }],
                },
              ]}
            />
            <Animated.View
              style={[
                styles.loadingDrop,
                {
                  transform: [{ translateY: loadingDropTranslateY }, { rotate: "45deg" }, { scale: loadingDropScale }],
                },
              ]}
            />
            <View style={styles.loadingDropHighlight} />
          </View>
          <Text style={styles.loadingText}>{bootCopy.loading}</Text>
        </View>
      </SafeAreaView>
    );
  }

  const language = snapshot.settings.language;
  const copy = getAppCopy(language);
  const showNotice = Boolean(noticeText) && dismissedNoticeText !== noticeText;

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.flex}>
        <View style={styles.appShell}>
          <AppHeader
            isBusy={isBusy}
            isDeviceConnected={snapshot.device.connection === "connected"}
            bleActivity={bleActivity}
            copy={copy}
            onPair={() => setScreen("pair")}
            onCalibration={() => setScreen("calibration")}
          />
          {showNotice && (
            <NoticeBanner
              tone={noticeTone}
              text={noticeText}
              autoHideMs={noticeAutoHideMs}
              closeLabel={copy.closeNotice}
              onClose={() => setDismissedNoticeText(noticeText)}
            />
          )}
          <ScrollView
            contentContainerStyle={styles.content}
            showsVerticalScrollIndicator={false}
            onTouchStart={handleContentTouchStart}
            onTouchEnd={handleContentTouchEnd}
          >
            <Animated.View
              style={[
                styles.pageTransition,
                {
                  opacity: pageOpacity,
                  transform: [{ translateX: pageTranslateX }],
                },
              ]}
            >
              {screen === "pair" && (
                <PairScreen
                  snapshot={snapshot}
                  bleLog={bleLog}
                  copy={copy}
                  onConnect={connectDevice}
                  onSync={syncNow}
                  onClearLog={clearBleLog}
                />
              )}
              {screen === "calibration" && (
                <CalibrationScreen
                  snapshot={snapshot}
                  copy={copy}
                  isBusy={isBusy}
                  onStartCalibration={startCalibration}
                  onRefreshStatus={refreshDeviceStatus}
                  onSaveTare={saveTare}
                  onConfirmAmount={confirmCalibrationAmount}
                  onFinishCalibration={finishCalibration}
                />
              )}
              {screen === "dashboard" && (
                <DashboardScreen
                  snapshot={snapshot}
                  copy={copy}
                  onSync={syncNow}
                  onAddManual={() => setScreen("manual")}
                />
              )}
              {screen === "manual" && <ManualIntakeScreen snapshot={snapshot} copy={copy} onSave={addManualIntake} />}
              {screen === "history" && (
                <HistoryScreen
                  snapshot={snapshot}
                  copy={copy}
                  onRefresh={refreshSnapshot}
                  onSync={syncNow}
                  onDeleteRange={deleteHistoryRange}
                  onDeleteAllHistory={deleteAllHistory}
                />
              )}
              {screen === "settings" && (
                <SettingsScreen
                  snapshot={snapshot}
                  copy={copy}
                  onSave={updateSettings}
                  onCalibration={() => setScreen("calibration")}
                  onPair={() => setScreen("pair")}
                  onRenameDevice={renameDevice}
                  onRemoveDevice={removeDevice}
                />
              )}
            </Animated.View>
          </ScrollView>
          <BottomNav activeScreen={screen} copy={copy} onChange={setScreen} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
