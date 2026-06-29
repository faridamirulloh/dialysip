import React, { useEffect, useState } from "react";
import { Text, TextInput, View } from "react-native";
import type { DeviceStatus } from "../data/types";
import type { AppCopy } from "../i18n";
import { palette } from "../theme";
import { styles } from "../styles/appStyles";
import { IconButton } from "./IconButton";
import { PrimaryButton } from "./PrimaryButton";
import { SecondaryButton } from "./SecondaryButton";

interface DeviceManagerProps {
  copy: AppCopy;
  device: DeviceStatus;
  onAdd: () => void;
  onRename: (name: string) => void;
  onRemove: () => void;
}

const isRegisteredDevice = (device: DeviceStatus) => device.deviceId !== "dialysip-local";

export function DeviceManager({ copy, device, onAdd, onRename, onRemove }: DeviceManagerProps) {
  const registered = isRegisteredDevice(device);
  const [isEditing, setIsEditing] = useState(false);
  const [isRemoveArmed, setIsRemoveArmed] = useState(false);
  const [name, setName] = useState(device.name);

  useEffect(() => {
    setName(device.name);
    setIsEditing(false);
    setIsRemoveArmed(false);
  }, [device.deviceId, device.name]);

  const saveName = () => {
    const nextName = name.trim();
    if (!nextName) {
      return;
    }

    onRename(nextName);
    setIsEditing(false);
  };

  return (
    <View style={styles.deviceManager}>
      <View style={styles.deviceManagerHeader}>
        <View style={styles.settingText}>
          <Text style={styles.infoLabel}>{copy.deviceManager}</Text>
          <Text style={styles.infoValue}>{registered ? device.name : copy.noBottleRegistered}</Text>
          {registered && <Text style={styles.deviceManagerId}>{device.deviceId}</Text>}
        </View>
        {registered && !isEditing && (
          <IconButton icon="pencil-outline" accessibilityLabel={copy.renameBottle} onPress={() => setIsEditing(true)} />
        )}
      </View>
      {isEditing && (
        <View style={styles.deviceManagerEditor}>
          <TextInput
            accessibilityLabel={copy.bottleName}
            autoCapitalize="words"
            maxLength={48}
            onChangeText={setName}
            onSubmitEditing={saveName}
            placeholder={copy.bottleName}
            placeholderTextColor={palette.muted}
            returnKeyType="done"
            style={styles.dateInput}
            value={name}
          />
          <View style={styles.deviceManagerEditActions}>
            <SecondaryButton
              label={copy.cancel}
              icon="close-outline"
              onPress={() => {
                setName(device.name);
                setIsEditing(false);
              }}
            />
            <PrimaryButton label={copy.saveName} icon="checkmark-outline" onPress={saveName} disabled={!name.trim()} />
          </View>
        </View>
      )}
      <View style={styles.deviceManagerActions}>
        {registered ? (
          <PrimaryButton
            label={isRemoveArmed ? copy.confirmRemoveBottle : copy.removeBottle}
            icon="trash-outline"
            tone="danger"
            onPress={() => {
              if (isRemoveArmed) {
                onRemove();
                return;
              }

              setIsRemoveArmed(true);
            }}
          />
        ) : (
          <SecondaryButton label={copy.addBottle} icon="add-circle-outline" onPress={onAdd} />
        )}
      </View>
    </View>
  );
}
