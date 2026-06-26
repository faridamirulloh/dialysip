import { PermissionsAndroid, Platform } from "react-native";

export interface BlePermissionResult {
  granted: boolean;
  reason?: string;
}

const getAndroidVersion = () => {
  const version = Platform.Version;
  return typeof version === "string" ? Number.parseInt(version, 10) : version;
};

export const requestBlePermissions = async (): Promise<BlePermissionResult> => {
  if (Platform.OS === "web") {
    return {
      granted: false,
      reason: "BLE is not available in the web preview. Use an Android development build."
    };
  }

  if (Platform.OS !== "android") {
    return {
      granted: false,
      reason: "DialySip v1 is Android-only."
    };
  }

  const androidVersion = getAndroidVersion();
  const permissions =
    androidVersion >= 31
      ? [
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
          PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT
        ]
      : [PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION];

  const result = await PermissionsAndroid.requestMultiple(permissions);
  const deniedPermission = permissions.find(
    (permission) => result[permission] !== PermissionsAndroid.RESULTS.GRANTED
  );

  if (deniedPermission) {
    return {
      granted: false,
      reason: "Bluetooth permission is required to scan for the DialySip bottle."
    };
  }

  return { granted: true };
};
