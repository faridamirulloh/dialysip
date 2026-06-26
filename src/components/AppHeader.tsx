import React from "react";
import { ActivityIndicator, Image, View } from "react-native";
import { BLE_RECEIVE_ICON, BLE_SEND_ICON, dialysipLogoHorizontal } from "../constants/assets";
import type { AppCopy } from "../i18n";
import { palette } from "../theme";
import type { BleActivity } from "../data/types";
import { styles } from "../styles/appStyles";
import { IconButton } from "./IconButton";

interface AppHeaderProps {
  isBusy: boolean;
  isDeviceConnected: boolean;
  bleActivity: BleActivity | null;
  copy: AppCopy;
  onPair: () => void;
  onCalibration: () => void;
}

export function AppHeader({
  isBusy,
  isDeviceConnected,
  bleActivity,
  copy,
  onPair,
  onCalibration
}: AppHeaderProps) {
  return (
    <View style={styles.header}>
      <View>
        <Image source={dialysipLogoHorizontal} style={styles.headerLogo} resizeMode="contain" />
      </View>
      <View style={styles.headerActions}>
        {isBusy ? <ActivityIndicator color={palette.accent} /> : null}
        <View style={styles.bleHeaderActivityGroup}>
          <View style={styles.bleHeaderButtonWrap}>
            <IconButton icon="bluetooth-outline" accessibilityLabel={copy.openPairing} onPress={onPair} />
            <View
              pointerEvents="none"
              style={[
                styles.bleConnectionDot,
                isDeviceConnected ? styles.bleConnectionDotConnected : styles.bleConnectionDotDisconnected,
              ]}
            />
          </View>
          <View pointerEvents="none" style={styles.bleActivityIconSlot}>
            {bleActivity ? (
              <Image
                source={bleActivity === "send" ? BLE_SEND_ICON : BLE_RECEIVE_ICON}
                style={styles.bleActivityIcon}
                resizeMode="contain"
              />
            ) : null}
          </View>
        </View>
        <IconButton icon="scale-outline" accessibilityLabel={copy.openCalibration} onPress={onCalibration} />
      </View>
    </View>
  );
}
