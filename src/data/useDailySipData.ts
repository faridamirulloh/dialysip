import { useCallback, useEffect, useRef, useState } from "react";
import { AppState } from "react-native";
import { createDailySipDataSource } from "./createDailySipDataSource";
import type { BleActivity, BleLogEntry, DailySipSettings, DailySipSnapshot, ManualIntakeInput } from "./types";

const BLE_ACTIVITY_VISIBLE_MS = 2000;
const MAX_BLE_LOG_ENTRIES = 100;

export const useDailySipData = () => {
  const sourceRef = useRef(createDailySipDataSource());
  const autoConnectInFlightRef = useRef(false);
  const bleActivityTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [snapshot, setSnapshot] = useState<DailySipSnapshot | null>(null);
  const [bleActivity, setBleActivity] = useState<BleActivity | null>(null);
  const [bleLog, setBleLog] = useState<BleLogEntry[]>([]);
  const [isAppActive, setIsAppActive] = useState(AppState.currentState === "active");
  const [isBusy, setIsBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const autoConnectMode = snapshot?.mode;
  const autoConnectDeviceId = snapshot?.device.deviceId;
  const hasRegisteredDevice = autoConnectDeviceId && autoConnectDeviceId !== "dialysip-local";

  const run = useCallback(
    async (operation: () => Promise<DailySipSnapshot>, showBusy = true) => {
      if (showBusy) {
        setIsBusy(true);
      }
      setError(null);
      try {
        const nextSnapshot = await operation();
        setSnapshot(nextSnapshot);
      } catch (caught) {
        const message = caught instanceof Error ? caught.message : "DialySip action failed.";
        setError(message);
      } finally {
        if (showBusy) {
          setIsBusy(false);
        }
      }
    },
    []
  );

  const autoConnectActiveDevice = useCallback(async () => {
    if (autoConnectInFlightRef.current) {
      return;
    }

    autoConnectInFlightRef.current = true;
    try {
      const nextSnapshot = await sourceRef.current.autoConnectActiveDevice();
      if (nextSnapshot) {
        setSnapshot(nextSnapshot);
        setError(null);
      }
    } finally {
      autoConnectInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void run(() => sourceRef.current.loadSnapshot());
  }, [run]);

  useEffect(() => {
    return sourceRef.current.subscribeToLiveSync((nextSnapshot) => {
      setSnapshot(nextSnapshot);
      setError(null);
    });
  }, []);

  useEffect(() => {
    return sourceRef.current.subscribeToBleLog((entry) => {
      setBleLog((current) => [...current, entry].slice(-MAX_BLE_LOG_ENTRIES));
    });
  }, []);

  useEffect(() => {
    sourceRef.current.setAppActive(AppState.currentState === "active");
    const subscription = AppState.addEventListener("change", (nextState) => {
      if (nextState === "active") {
        setIsAppActive(true);
        sourceRef.current.setAppActive(true);
      } else if (nextState === "background") {
        setIsAppActive(false);
        sourceRef.current.setAppActive(false);
      }
    });

    return () => {
      sourceRef.current.setAppActive(false);
      subscription.remove();
    };
  }, []);

  const clearBleLog = useCallback(() => {
    setBleLog([]);
  }, []);

  useEffect(() => {
    const unsubscribe = sourceRef.current.subscribeToBleActivity((activity) => {
      if (bleActivityTimeoutRef.current) {
        clearTimeout(bleActivityTimeoutRef.current);
      }

      setBleActivity(activity);
      bleActivityTimeoutRef.current = setTimeout(() => {
        setBleActivity(null);
        bleActivityTimeoutRef.current = null;
      }, BLE_ACTIVITY_VISIBLE_MS);
    });

    return () => {
      unsubscribe();
      if (bleActivityTimeoutRef.current) {
        clearTimeout(bleActivityTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!isAppActive || !autoConnectMode || !hasRegisteredDevice) {
      return undefined;
    }

    void autoConnectActiveDevice();
    const timer = setInterval(() => {
      void autoConnectActiveDevice();
    }, 10000);

    return () => clearInterval(timer);
  }, [autoConnectActiveDevice, autoConnectMode, hasRegisteredDevice, isAppActive]);

  return {
    snapshot,
    bleActivity,
    bleLog,
    clearBleLog,
    isBusy,
    error,
    refreshSnapshot: () => run(() => sourceRef.current.loadSnapshot()),
    connectDevice: () => run(() => sourceRef.current.connectDevice()),
    syncNow: () => run(() => sourceRef.current.syncNow()),
    startCalibration: () => run(() => sourceRef.current.startCalibration()),
    refreshDeviceStatus: () => run(() => sourceRef.current.refreshDeviceStatus(), false),
    saveTare: () => run(() => sourceRef.current.saveTare()),
    confirmCalibrationAmount: (amountMl: number) =>
      run(() => sourceRef.current.confirmCalibrationAmount(amountMl)),
    finishCalibration: () => run(() => sourceRef.current.finishCalibration()),
    addManualIntake: (input: ManualIntakeInput) =>
      run(() => sourceRef.current.addManualIntake(input)),
    deleteHistoryForDate: (dateKey: string) =>
      run(() => sourceRef.current.deleteHistoryForDate(dateKey)),
    deleteHistoryRange: (startDateKey: string, endDateKey: string) =>
      run(() => sourceRef.current.deleteHistoryRange(startDateKey, endDateKey)),
    deleteAllHistory: () => run(() => sourceRef.current.deleteAllHistory()),
    renameDevice: (name: string) => run(() => sourceRef.current.renameDevice(name)),
    removeDevice: () => run(() => sourceRef.current.removeDevice()),
    updateSettings: (settings: DailySipSettings) =>
      run(() => sourceRef.current.updateSettings(settings))
  };
};
