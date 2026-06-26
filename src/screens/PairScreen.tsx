import React from "react";
import { Image, View } from "react-native";
import { dialysipIcon } from "../constants/assets";
import type { DailySipSnapshot } from "../data/types";
import type { AppCopy } from "../i18n";
import { localizeKnownLabel } from "../i18n";
import { styles } from "../styles/appStyles";
import { InfoList } from "../components/InfoList";
import { PrimaryButton } from "../components/PrimaryButton";
import { ScreenCard } from "../components/ScreenCard";
import { SecondaryButton } from "../components/SecondaryButton";

interface PairScreenProps {
  snapshot: DailySipSnapshot;
  copy: AppCopy;
  onConnect: () => void;
  onSync: () => void;
}

export function PairScreen({ snapshot, copy, onConnect, onSync }: PairScreenProps) {
  return (
    <ScreenCard title={copy.pairTitle} subtitle={copy.pairSubtitle} chip="BLE" chipIcon="bluetooth-outline">
      <View style={styles.bottlePanel}>
        <View style={styles.bottleBadge}>
          <Image
            source={dialysipIcon}
            style={styles.bottleBadgeLogo}
            resizeMode="contain"
            accessibilityLabel="DialySip"
          />
        </View>
        <InfoList
          rows={[
            [copy.bluetoothPermission, copy.ready, copy.allowed],
            [
              copy.nearbyBottle,
              snapshot.device.name,
              snapshot.device.connection === "offline" ? copy.scan : copy.found,
            ],
            [
              copy.phoneTimeSync,
              localizeKnownLabel(snapshot.device.lastSyncLabel, snapshot.settings.language),
              copy.next,
            ],
          ]}
        />
      </View>
      <View style={styles.actionRow}>
        <PrimaryButton label={copy.connectBottle} icon="link-outline" onPress={onConnect} />
        <SecondaryButton label={copy.syncTime} icon="time-outline" onPress={onSync} />
      </View>
    </ScreenCard>
  );
}
