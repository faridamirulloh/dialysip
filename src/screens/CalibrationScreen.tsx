import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import type { DailySipSnapshot } from "../data/types";
import type { AppCopy } from "../i18n";
import { styles } from "../styles/appStyles";
import { MetricCard } from "../components/MetricCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { ScreenCard } from "../components/ScreenCard";
import { SecondaryButton } from "../components/SecondaryButton";
import { SettingsStepper } from "../components/SettingsStepper";

const calibrationRefreshMs = 2500;
const knownAmountStepMl = 50;
const minKnownAmountMl = 50;
const maxKnownAmountMl = 1000;
const stableThresholdSeconds = 2;

interface CalibrationScreenProps {
  snapshot: DailySipSnapshot;
  copy: AppCopy;
  isBusy: boolean;
  onStartCalibration: () => Promise<void> | void;
  onRefreshStatus: () => Promise<void> | void;
  onSaveTare: () => Promise<void> | void;
  onConfirmAmount: (amountMl: number) => Promise<void> | void;
  onFinishCalibration: () => Promise<void> | void;
}

export function CalibrationScreen({
  snapshot,
  copy,
  isBusy,
  onStartCalibration,
  onRefreshStatus,
  onSaveTare,
  onConfirmAmount,
  onFinishCalibration
}: CalibrationScreenProps) {
  const calibrationSavedOnDevice = snapshot.device.calibrationStep === "live_weight";
  const deviceTareSaved = snapshot.device.calibrationActive
    ? snapshot.device.calibrationStep === "wait_weight" || calibrationSavedOnDevice
    : snapshot.device.calibrated;
  const [knownAmountMl, setKnownAmountMl] = useState(250);
  const [tareSaved, setTareSaved] = useState(deviceTareSaved);
  const [isRecalibrating, setIsRecalibrating] = useState(false);
  const startedRef = useRef(false);
  const startCalibrationRef = useRef(onStartCalibration);
  const refreshStatusRef = useRef(onRefreshStatus);
  const isCalibrationComplete =
    snapshot.device.calibrated && !snapshot.device.calibrationActive && !isRecalibrating;
  const isCalibrationInProgress = !isCalibrationComplete;
  const showRestartCalibration = isCalibrationInProgress || snapshot.device.calibrated;
  const tareStepReady = tareSaved || deviceTareSaved;
  const activeStep = isCalibrationComplete || calibrationSavedOnDevice ? 4 : tareStepReady ? 3 : 1;
  const showFinishCalibration = snapshot.device.calibrationActive;
  const showSaveAction = !isCalibrationComplete && !calibrationSavedOnDevice;
  const stableForSeconds = snapshot.device.stableForSeconds;
  const isStable = stableForSeconds !== null && stableForSeconds >= stableThresholdSeconds;
  const scaleStatus = stableForSeconds === null ? copy.waitingReading : isStable ? copy.scaleStable : copy.scaleMoving;
  const panelTitle = calibrationSavedOnDevice
    ? copy.calibrationSavedTitle
    : tareStepReady
      ? copy.calibrationAmountTitle
      : copy.tareTitle;
  const panelBody = calibrationSavedOnDevice
    ? copy.calibrationSavedBody
    : tareStepReady
      ? copy.calibrationAmountBody
      : copy.tareBody;

  useEffect(() => {
    startCalibrationRef.current = onStartCalibration;
  }, [onStartCalibration]);

  useEffect(() => {
    refreshStatusRef.current = onRefreshStatus;
  }, [onRefreshStatus]);

  useEffect(() => {
    setTareSaved(deviceTareSaved);
  }, [deviceTareSaved]);

  useEffect(() => {
    if (snapshot.device.calibrationActive) {
      startedRef.current = true;
      return;
    }

    if (snapshot.device.calibrated || startedRef.current) {
      return;
    }

    startedRef.current = true;
    void startCalibrationRef.current();
  }, [snapshot.device.calibrated, snapshot.device.calibrationActive]);

  useEffect(() => {
    if (isCalibrationComplete || snapshot.device.connection !== "connected" || isBusy) {
      return undefined;
    }

    const intervalId = setInterval(() => {
      void refreshStatusRef.current();
    }, calibrationRefreshMs);

    return () => clearInterval(intervalId);
  }, [isBusy, isCalibrationComplete, snapshot.device.connection]);

  const handleSaveTare = async () => {
    await onSaveTare();
    setTareSaved(true);
  };

  const handleConfirmAmount = async () => {
    await onConfirmAmount(knownAmountMl);
    setIsRecalibrating(false);
  };

  const handleFinishCalibration = async () => {
    setIsRecalibrating(false);
    await onFinishCalibration();
  };

  const handleRestartCalibration = async () => {
    setKnownAmountMl(250);
    setTareSaved(false);
    setIsRecalibrating(true);
    startedRef.current = true;
    await onStartCalibration();
  };

  const decreaseKnownAmount = () => {
    setKnownAmountMl((value) => Math.max(minKnownAmountMl, value - knownAmountStepMl));
  };

  const increaseKnownAmount = () => {
    setKnownAmountMl((value) => Math.min(maxKnownAmountMl, value + knownAmountStepMl));
  };

  return (
    <ScreenCard
      title={copy.calibrationTitle}
      subtitle={isCalibrationComplete ? copy.bottleCalibrated : copy.calibrationStep}
      chip={isCalibrationComplete ? copy.ready : copy.calibrationNeeded}
      tone={isCalibrationComplete ? "normal" : "warn"}
      chipIcon="scale-outline"
    >
      <View style={styles.softPanel}>
        <Text style={styles.panelTitle}>{panelTitle}</Text>
        <Text style={styles.panelBody}>{panelBody}</Text>
        <View style={styles.stepDots}>
          {[1, 2, 3, 4].map((step) => (
            <View key={step} style={[styles.stepDot, step <= activeStep && styles.stepDotActive]} />
          ))}
        </View>
        <View style={styles.metricGrid}>
          <MetricCard label={copy.reading} value={formatWeight(snapshot.device.currentWeightG, copy)} />
          <MetricCard label={copy.stableFor} value={formatStableFor(stableForSeconds, copy)} />
        </View>
        <View style={styles.metricGrid}>
          <MetricCard label={copy.scaleStatus} value={scaleStatus} />
          <MetricCard label={copy.knownAmount} value={`${knownAmountMl} ml`} />
        </View>
      </View>
      {tareStepReady && !isCalibrationComplete && !calibrationSavedOnDevice && (
        <SettingsStepper
          copy={copy}
          label={copy.knownAmount}
          value={`${knownAmountMl} ml`}
          onMinus={decreaseKnownAmount}
          onPlus={increaseKnownAmount}
        />
      )}
      {showRestartCalibration && (
        <View style={styles.actionRow}>
          <SecondaryButton
            label={copy.restartCalibration}
            icon="refresh-circle-outline"
            onPress={() => void handleRestartCalibration()}
            disabled={isBusy}
          />
        </View>
      )}
      {showFinishCalibration && (
        <View style={styles.actionRow}>
          <SecondaryButton
            label={copy.finishCalibration}
            icon="checkmark-done-circle-outline"
            onPress={() => void handleFinishCalibration()}
            disabled={isBusy}
          />
        </View>
      )}
      <View style={styles.actionRow}>
        <SecondaryButton
          label={copy.refreshReading}
          icon="refresh-outline"
          onPress={() => void onRefreshStatus()}
          disabled={isBusy}
        />
        {showSaveAction && (
          <PrimaryButton
            label={tareStepReady ? copy.saveCalibration : copy.saveTare}
            icon={tareStepReady ? "save-outline" : "checkmark-circle-outline"}
            onPress={tareStepReady ? () => void handleConfirmAmount() : () => void handleSaveTare()}
            disabled={isBusy || (tareStepReady && !isStable)}
          />
        )}
      </View>
    </ScreenCard>
  );
}

const formatWeight = (value: number | null, copy: AppCopy) =>
  value === null ? copy.waitingReading : `${Math.round(value)} g`;

const formatStableFor = (value: number | null, copy: AppCopy) =>
  value === null ? copy.waitingReading : `${value.toFixed(1)} s`;
