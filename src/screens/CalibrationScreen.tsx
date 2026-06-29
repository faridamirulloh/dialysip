import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import type { CalibrationStep, DailySipSnapshot } from "../data/types";
import type { AppCopy } from "../i18n";
import { styles } from "../styles/appStyles";
import { MetricCard } from "../components/MetricCard";
import { PrimaryButton } from "../components/PrimaryButton";
import { ScreenCard } from "../components/ScreenCard";
import { SecondaryButton } from "../components/SecondaryButton";
import { SettingsStepper } from "../components/SettingsStepper";

const knownAmountStepMl = 50;
const minKnownAmountMl = 50;
const maxKnownAmountMl = 5000;
const defaultKnownAmountMl = 600;
const stableThresholdSeconds = 2;
const cupStableSeconds = 10;
const cupPollMs = 1000;
const cupMaxWaitMs = 45000;

type CupCalibrationPhase = "idle" | "without_waiting" | "with_ready" | "with_waiting" | "saved" | "error";

interface CalibrationScreenProps {
  snapshot: DailySipSnapshot;
  copy: AppCopy;
  isBusy: boolean;
  onStartCalibration: () => Promise<unknown> | unknown;
  onFinishCalibration: () => Promise<unknown> | unknown;
  onRefreshLiveWeight: () => Promise<DailySipSnapshot | null>;
  onSaveTare: () => Promise<unknown> | unknown;
  onConfirmAmount: (amountMl: number) => Promise<unknown> | unknown;
  onResetCalibrationDefault: () => Promise<unknown> | unknown;
  onSaveCupCalibration: (cupWeightTenthsG: number) => Promise<DailySipSnapshot | null>;
}

export function CalibrationScreen({
  snapshot,
  copy,
  isBusy,
  onStartCalibration,
  onFinishCalibration,
  onRefreshLiveWeight,
  onSaveTare,
  onConfirmAmount,
  onResetCalibrationDefault,
  onSaveCupCalibration
}: CalibrationScreenProps) {
  const [knownAmountMl, setKnownAmountMl] = useState(defaultKnownAmountMl);
  const [cupPhase, setCupPhase] = useState<CupCalibrationPhase>("idle");
  const [cupBaselineWeightG, setCupBaselineWeightG] = useState<number | null>(null);
  const [cupMessage, setCupMessage] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const refreshLiveWeightRef = useRef(onRefreshLiveWeight);
  const stableForSeconds = snapshot.device.stableForSeconds;
  const isStable = stableForSeconds !== null && stableForSeconds >= stableThresholdSeconds;
  const scaleStatus = stableForSeconds === null ? copy.waitingReading : isStable ? copy.scaleStable : copy.scaleMoving;
  const cupIsMeasuring = cupPhase === "without_waiting" || cupPhase === "with_waiting";
  const isConnected = snapshot.device.connection === "connected";
  const calibrationActive = snapshot.device.calibrationActive;
  const calibrationActionDisabled = isBusy || cupIsMeasuring || !isConnected || !calibrationActive;
  const cupWeightLabel = `${(snapshot.settings.cupWeightTenthsG / 10).toFixed(1)} g`;

  useEffect(() => {
    refreshLiveWeightRef.current = onRefreshLiveWeight;
  }, [onRefreshLiveWeight]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const handleSaveTare = async () => {
    await onSaveTare();
  };

  const handleStartCalibration = async () => {
    await onStartCalibration();
  };

  const handleFinishCalibration = async () => {
    await onFinishCalibration();
  };

  const handleConfirmAmount = async () => {
    await onConfirmAmount(knownAmountMl);
  };

  const handleResetCalibrationDefault = async () => {
    await onResetCalibrationDefault();
  };

  const decreaseKnownAmount = () => {
    setKnownAmountMl((value) => Math.max(minKnownAmountMl, value - knownAmountStepMl));
  };

  const increaseKnownAmount = () => {
    setKnownAmountMl((value) => Math.min(maxKnownAmountMl, value + knownAmountStepMl));
  };

  const waitForCupStableWeight = async (phase: CupCalibrationPhase) => {
    setCupPhase(phase);
    setCupMessage(copy.cupCalibrationWaiting);
    const startedAt = Date.now();
    let latestSnapshot: DailySipSnapshot | null = null;

    while (mountedRef.current && Date.now() - startedAt <= cupMaxWaitMs) {
      latestSnapshot = await refreshLiveWeightRef.current();
      const elapsedMs = Date.now() - startedAt;
      const latestWeightG = latestSnapshot?.device.currentWeightG ?? null;
      const latestStableForSeconds = latestSnapshot?.device.stableForSeconds ?? null;

      if (
        elapsedMs >= cupStableSeconds * 1000 &&
        latestWeightG !== null &&
        latestStableForSeconds !== null &&
        latestStableForSeconds >= cupStableSeconds
      ) {
        return latestWeightG;
      }

      await wait(cupPollMs);
    }

    if (mountedRef.current) {
      setCupPhase("error");
      setCupMessage(copy.cupCalibrationUnstable);
    }
    return null;
  };

  const handleMeasureBottleOnly = async () => {
    setCupBaselineWeightG(null);
    const bottleOnlyWeightG = await waitForCupStableWeight("without_waiting");
    if (bottleOnlyWeightG === null || !mountedRef.current) {
      return;
    }

    setCupBaselineWeightG(bottleOnlyWeightG);
    setCupPhase("with_ready");
    setCupMessage(`${copy.cupCalibrationBottleSaved} ${formatWeight(bottleOnlyWeightG, copy)}.`);
  };

  const handleMeasureBottleWithCup = async () => {
    if (cupBaselineWeightG === null) {
      setCupPhase("error");
      setCupMessage(copy.cupCalibrationInvalid);
      return;
    }

    const bottleWithCupWeightG = await waitForCupStableWeight("with_waiting");
    if (bottleWithCupWeightG === null || !mountedRef.current) {
      return;
    }

    const cupWeightG = bottleWithCupWeightG - cupBaselineWeightG;
    if (cupWeightG < 1) {
      setCupPhase("error");
      setCupMessage(copy.cupCalibrationInvalid);
      return;
    }

    const cupWeightTenthsG = Math.round(cupWeightG * 10);
    const savedSnapshot = await onSaveCupCalibration(cupWeightTenthsG);
    if (!savedSnapshot) {
      setCupPhase("error");
      setCupMessage(copy.cupCalibrationSaveFailed);
      return;
    }

    setCupPhase("saved");
    setCupMessage(`${copy.cupCalibrationSaved} ${formatWeight(cupWeightG, copy)}.`);
  };

  return (
    <ScreenCard
      title={copy.calibrationTitle}
      subtitle={copy.calibrationStep}
      chip={snapshot.device.calibrated ? copy.ready : copy.calibrationNeeded}
      tone={snapshot.device.calibrated ? "normal" : "warn"}
      chipIcon="scale-outline"
    >
      <View style={styles.calibrationPanelStack}>
        <View style={styles.softPanel}>
          <Text style={styles.panelTitle}>{copy.calibrationModeTitle}</Text>
          <Text style={styles.panelBody}>
            {calibrationActive ? copy.calibrationModeActive : copy.calibrationModeInactive}
          </Text>
          <View style={styles.metricGrid}>
            <MetricCard
              label={copy.calibrationModeStatus}
              value={calibrationActive ? copy.calibrationModeEnabled : copy.calibrationModeDisabled}
            />
            <MetricCard label={copy.calibrationStepLabel} value={formatCalibrationStep(snapshot.device.calibrationStep, copy)} />
          </View>
          <View style={styles.actionRow}>
            <SecondaryButton
              label={copy.startCalibration}
              icon="play-circle-outline"
              onPress={() => void handleStartCalibration()}
              disabled={isBusy || cupIsMeasuring || !isConnected || calibrationActive}
            />
            <PrimaryButton
              label={copy.finishCalibration}
              icon="checkmark-done-circle-outline"
              onPress={() => void handleFinishCalibration()}
              disabled={isBusy || cupIsMeasuring || !isConnected || !calibrationActive}
            />
          </View>
        </View>

        <View style={styles.softPanel}>
          <Text style={styles.panelTitle}>{copy.liveWeightTitle}</Text>
          <Text style={styles.panelBody}>{copy.liveWeightBody}</Text>
          <View style={styles.metricGrid}>
            <MetricCard label={copy.reading} value={formatWeight(snapshot.device.currentWeightG, copy)} />
            <MetricCard label={copy.stableFor} value={formatStableFor(stableForSeconds, copy)} />
          </View>
          <View style={styles.metricGrid}>
            <MetricCard label={copy.scaleStatus} value={scaleStatus} />
            <MetricCard label={copy.cupWeight} value={cupWeightLabel} />
          </View>
          <View style={styles.actionRow}>
            <SecondaryButton
              label={copy.refreshLiveWeight}
              icon="refresh-outline"
              onPress={() => void onRefreshLiveWeight()}
              disabled={calibrationActionDisabled}
            />
          </View>
        </View>

        <View style={styles.softPanel}>
          <Text style={styles.panelTitle}>{copy.tareTitle}</Text>
          <Text style={styles.panelBody}>{copy.tareBody}</Text>
          <View style={styles.actionRow}>
            <PrimaryButton
              label={copy.saveTare}
              icon="checkmark-circle-outline"
              onPress={() => void handleSaveTare()}
              disabled={calibrationActionDisabled}
            />
          </View>
        </View>

        <View style={styles.softPanel}>
          <Text style={styles.panelTitle}>{copy.knownWeightTitle}</Text>
          <Text style={styles.panelBody}>{copy.knownWeightBody}</Text>
          <View style={styles.metricGrid}>
            <MetricCard label={copy.calibrationFactor} value={formatCalibrationFactor(snapshot.device.calibrationFactor, copy)} />
            <MetricCard label={copy.knownAmount} value={`${knownAmountMl} ml`} />
          </View>
          <SettingsStepper
            copy={copy}
            label={copy.knownAmount}
            value={`${knownAmountMl} ml`}
            onMinus={decreaseKnownAmount}
            onPlus={increaseKnownAmount}
          />
          <View style={styles.actionRow}>
            <SecondaryButton
              label={copy.resetLoadCellDefault}
              icon="refresh-circle-outline"
              onPress={() => void handleResetCalibrationDefault()}
              disabled={calibrationActionDisabled}
            />
            <PrimaryButton
              label={copy.saveCalibration}
              icon="save-outline"
              onPress={() => void handleConfirmAmount()}
              disabled={calibrationActionDisabled || !isStable}
            />
          </View>
        </View>

        <View style={styles.softPanel}>
          <Text style={styles.panelTitle}>{copy.cupCalibrationTitle}</Text>
          <Text style={styles.panelBody}>
            {cupPhase === "with_ready" ? copy.cupCalibrationWithCupBody : copy.cupCalibrationBody}
          </Text>
          {cupMessage && <Text style={styles.panelBody}>{cupMessage}</Text>}
          <View style={styles.metricGrid}>
            <MetricCard label={copy.cupWeight} value={cupWeightLabel} />
            <MetricCard
              label={copy.bottleOnlyWeight}
              value={cupBaselineWeightG === null ? copy.waitingReading : formatWeight(cupBaselineWeightG, copy)}
            />
          </View>
          <View style={styles.metricGrid}>
            <MetricCard label={copy.requiredStable} value={`${cupStableSeconds} ${copy.secondsShort}`} />
          </View>
          <View style={styles.actionRow}>
            {cupPhase === "with_ready" ? (
              <PrimaryButton
                label={copy.confirmBottleWithCup}
                icon="checkmark-circle-outline"
                onPress={() => void handleMeasureBottleWithCup()}
                disabled={calibrationActionDisabled}
              />
            ) : (
              <PrimaryButton
                label={copy.confirmBottleOnly}
                icon="ellipse-outline"
                onPress={() => void handleMeasureBottleOnly()}
                disabled={calibrationActionDisabled}
              />
            )}
            <SecondaryButton
              label={copy.refreshLiveWeight}
              icon="refresh-outline"
              onPress={() => void onRefreshLiveWeight()}
              disabled={calibrationActionDisabled}
            />
          </View>
        </View>
      </View>
    </ScreenCard>
  );
}

const formatWeight = (value: number | null, copy: AppCopy) =>
  value === null ? copy.waitingReading : `${value.toFixed(1)} g`;

const formatStableFor = (value: number | null, copy: AppCopy) =>
  value === null ? copy.waitingReading : `${value.toFixed(1)} ${copy.secondsShort}`;

const formatCalibrationFactor = (value: number | null, copy: AppCopy) =>
  value === null ? copy.waitingReading : value.toFixed(2);

const formatCalibrationStep = (step: CalibrationStep, copy: AppCopy) => {
  switch (step) {
    case "wait_tare":
      return copy.calibrationStepWaitTare;
    case "wait_weight":
      return copy.calibrationStepWaitWeight;
    case "live_weight":
      return copy.calibrationStepLiveWeight;
    case "idle":
    default:
      return copy.calibrationStepIdle;
  }
};

const wait = async (durationMs: number) => {
  await new Promise((resolve) => setTimeout(resolve, durationMs));
};
