import React, { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { BLE_RECEIVE_ICON, BLE_SEND_ICON, dialysipIcon } from "../constants/assets";
import type { BleActivity, BleLogEntry, DailySipSnapshot, DiscoveredBottle } from "../data/types";
import type { AppCopy } from "../i18n";
import { localizeKnownLabel } from "../i18n";
import { styles } from "../styles/appStyles";
import { InfoList } from "../components/InfoList";
import { PrimaryButton } from "../components/PrimaryButton";
import { ScreenCard } from "../components/ScreenCard";
import { SecondaryButton } from "../components/SecondaryButton";

interface PairScreenProps {
  snapshot: DailySipSnapshot;
  bleLog: BleLogEntry[];
  discoveredBottles: DiscoveredBottle[];
  isBusy: boolean;
  copy: AppCopy;
  onScan: () => void;
  onRegister: (scanId: string) => void;
  onClearLog: () => void;
}

export function PairScreen({
  snapshot,
  bleLog,
  discoveredBottles,
  isBusy,
  copy,
  onScan,
  onRegister,
  onClearLog
}: PairScreenProps) {
  const [isLogVisible, setIsLogVisible] = useState(false);
  const [hasScanned, setHasScanned] = useState(false);
  const [directionFilter, setDirectionFilter] = useState<"all" | BleActivity>("all");
  const [channelFilter, setChannelFilter] = useState("all");
  const [logOrder, setLogOrder] = useState<"newest" | "oldest">("newest");
  const channels = Array.from(new Set(bleLog.map((entry) => entry.characteristic))).sort();
  const orderedLog = logOrder === "newest" ? [...bleLog].reverse() : bleLog;
  const filteredLog = orderedLog
    .filter((entry) => directionFilter === "all" || entry.direction === directionFilter)
    .filter((entry) => channelFilter === "all" || entry.characteristic === channelFilter);
  const hasRegisteredBottle = snapshot.device.deviceId !== "dialysip-local";

  const clearLog = () => {
    setDirectionFilter("all");
    setChannelFilter("all");
    setLogOrder("newest");
    onClearLog();
  };

  const scan = () => {
    setHasScanned(true);
    onScan();
  };

  return (
    <ScreenCard title={copy.addBottleTitle} subtitle={copy.addBottleSubtitle} chip="BLE" chipIcon="bluetooth-outline">
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
              copy.registeredBottle,
              hasRegisteredBottle ? snapshot.device.name : copy.noBottleRegistered,
              hasRegisteredBottle
                ? snapshot.device.connection === "connected"
                  ? copy.connected
                  : copy.ready
                : copy.scan,
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
        <PrimaryButton label={copy.scanBottles} icon="search-outline" onPress={scan} disabled={isBusy} />
      </View>

      <View style={styles.bottleScanPanel}>
        <Text style={styles.panelTitle}>{copy.availableBottles}</Text>
        {discoveredBottles.length > 0 ? (
          discoveredBottles.map((bottle) => (
            <View key={bottle.scanId} style={styles.bottleScanItem}>
              <View style={styles.settingText}>
                <Text style={styles.infoValue}>{bottle.name}</Text>
                <Text style={styles.bottleScanMeta}>{formatBottleScanMeta(bottle, copy)}</Text>
              </View>
              <SecondaryButton
                label={copy.connect}
                icon="link-outline"
                onPress={() => onRegister(bottle.scanId)}
                disabled={isBusy}
              />
            </View>
          ))
        ) : (
          <Text style={styles.bleLogEmpty}>
            {hasScanned && !isBusy ? copy.noBottlesFound : copy.scanBottlePrompt}
          </Text>
        )}
      </View>

      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded: isLogVisible }}
        onPress={() => setIsLogVisible((visible) => !visible)}
        style={styles.bleLogToggle}
      >
        <Text style={styles.bleLogToggleText}>{isLogVisible ? copy.hideLog : copy.showLog}</Text>
      </Pressable>
      {isLogVisible && (
        <View style={styles.bleLogPanel}>
          <View style={styles.bleLogHeader}>
            <Text style={styles.panelTitle}>{copy.liveLog}</Text>
            {bleLog.length > 0 && (
              <Pressable accessibilityRole="button" onPress={clearLog} style={styles.bleLogClearButton}>
                <Text style={styles.bleLogClearButtonText}>{copy.clearBleLog}</Text>
              </Pressable>
            )}
          </View>
          {bleLog.length === 0 ? (
            <Text style={styles.bleLogEmpty}>{copy.noBleLog}</Text>
          ) : (
            <>
              <LogFilterGroup<"all" | BleActivity>
                label={copy.bleLogDirectionFilter}
                selected={directionFilter}
                options={[
                  { value: "all", label: copy.bleLogAll },
                  { value: "send", label: copy.bleSent },
                  { value: "receive", label: copy.bleReceived },
                ]}
                onChange={setDirectionFilter}
              />
              <LogFilterGroup
                label={copy.bleLogChannelFilter}
                selected={channelFilter}
                options={[
                  { value: "all", label: copy.bleLogAll },
                  ...channels.map((channel) => ({ value: channel, label: channel })),
                ]}
                onChange={setChannelFilter}
              />
              <LogFilterGroup<"newest" | "oldest">
                label={copy.bleLogOrder}
                selected={logOrder}
                options={[
                  { value: "newest", label: copy.bleLogNewestFirst },
                  { value: "oldest", label: copy.bleLogOldestFirst },
                ]}
                onChange={setLogOrder}
              />
              {filteredLog.length === 0 ? (
                <Text style={styles.bleLogEmpty}>{copy.noMatchingBleLog}</Text>
              ) : (
                filteredLog.map((entry) => (
                  <View key={entry.id} style={styles.bleLogEntry}>
                    <Image
                      source={entry.direction === "send" ? BLE_SEND_ICON : BLE_RECEIVE_ICON}
                      style={styles.bleLogDirectionIcon}
                    />
                    <View style={styles.bleLogEntryBody}>
                      <View style={styles.bleLogEntryMeta}>
                        <Text style={styles.bleLogDirection}>
                          {entry.direction === "send" ? copy.bleSent : copy.bleReceived}
                        </Text>
                        <Text style={styles.bleLogTime}>{formatBleLogTime(entry.timestamp)}</Text>
                      </View>
                      <View style={styles.bleLogField}>
                        <Text style={styles.bleLogFieldLabel}>{copy.bleLogChannel}</Text>
                        <Text selectable style={styles.bleLogCharacteristic}>{entry.characteristic}</Text>
                      </View>
                      <View style={styles.bleLogField}>
                        <Text style={styles.bleLogFieldLabel}>{copy.bleLogPayload}</Text>
                        <Text selectable style={styles.bleLogPayload}>{formatBleLogPayload(entry.payload)}</Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </>
          )}
        </View>
      )}
    </ScreenCard>
  );
}

const formatBottleScanMeta = (bottle: DiscoveredBottle, copy: AppCopy) => {
  const idSuffix = bottle.scanId.slice(-8);
  const signal = bottle.rssi === null ? "" : ` - ${copy.signal}: ${bottle.rssi} dBm`;
  const connected = bottle.isConnected ? ` - ${copy.connected}` : "";
  return `${copy.bleId}: ${idSuffix}${signal}${connected}`;
};

const formatBleLogTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });

const formatBleLogPayload = (payload: string) => {
  try {
    return JSON.stringify(JSON.parse(payload), null, 2) ?? payload;
  } catch {
    return payload;
  }
};

interface LogFilterGroupProps<T extends string> {
  label: string;
  options: Array<{ value: T; label: string }>;
  selected: T;
  onChange: (value: T) => void;
}

function LogFilterGroup<T extends string>({ label, options, selected, onChange }: LogFilterGroupProps<T>) {
  return (
    <View style={styles.bleLogFilterGroup}>
      <Text style={styles.bleLogFilterLabel}>{label}</Text>
      <View style={styles.bleLogFilterChoices}>
        {options.map((option) => {
          const active = option.value === selected;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
              onPress={() => onChange(option.value)}
              style={[styles.bleLogFilterChoice, active && styles.bleLogFilterChoiceActive]}
            >
              <Text style={[styles.bleLogFilterChoiceText, active && styles.bleLogFilterChoiceTextActive]}>
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
