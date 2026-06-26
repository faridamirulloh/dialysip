import React from "react";
import Svg, { Circle } from "react-native-svg";
import { palette } from "../theme";
import { styles } from "../styles/appStyles";

export function ProgressRing({ progress }: { progress: number }) {
  const size = 176;
  const stroke = 18;
  const radiusValue = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radiusValue;
  const clamped = Math.min(Math.max(progress, 0), 1);
  const strokeDashoffset = circumference * (1 - clamped);

  return (
    <Svg width={size} height={size} style={styles.progressSvg}>
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radiusValue}
        stroke={palette.tintStrong}
        strokeWidth={stroke}
        fill={palette.surface}
      />
      <Circle
        cx={size / 2}
        cy={size / 2}
        r={radiusValue}
        stroke={palette.accent}
        strokeWidth={stroke}
        fill="transparent"
        strokeLinecap="round"
        strokeDasharray={`${circumference} ${circumference}`}
        strokeDashoffset={strokeDashoffset}
        rotation="-90"
        origin={`${size / 2}, ${size / 2}`}
      />
    </Svg>
  );
}
