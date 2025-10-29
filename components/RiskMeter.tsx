import React from 'react';
import { StyleSheet, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import Animated, {
  Easing,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { Text, useTheme } from 'react-native-paper';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export type RiskLevel = 'low' | 'medium' | 'high' | 'critical' | 'unknown';

export type RiskMeterProps = {
  score: number;
  riskLevel?: RiskLevel | string | null;
  size?: number;
};

const DEFAULT_SIZE = 220;
const STROKE_WIDTH = 18;

function coerceRiskLevel(level: RiskMeterProps['riskLevel'], score: number): RiskLevel {
  if (typeof level === 'string') {
    switch (level.toLowerCase()) {
      case 'low':
        return 'low';
      case 'medium':
      case 'moderate':
        return 'medium';
      case 'high':
        return 'high';
      case 'critical':
      case 'severe':
        return 'critical';
      default:
        break;
    }
  }

  if (score >= 90) return 'critical';
  if (score >= 70) return 'high';
  if (score >= 40) return 'medium';
  if (score >= 0) return 'low';
  return 'unknown';
}

function getRiskColor(level: RiskLevel, fallback: string) {
  switch (level) {
    case 'low':
      return '#22C55E';
    case 'medium':
      return '#FACC15';
    case 'high':
      return '#F97316';
    case 'critical':
      return '#EF4444';
    default:
      return fallback;
  }
}

function formatScore(score: number) {
  return Math.round(score);
}

export function RiskMeter({ score, riskLevel, size = DEFAULT_SIZE }: RiskMeterProps) {
  const theme = useTheme();
  const clampedScore = Math.max(0, Math.min(100, Number.isFinite(score) ? score : 0));
  const derivedLevel = coerceRiskLevel(riskLevel, clampedScore);
  const radius = (size - STROKE_WIDTH) / 2;
  const circumference = 2 * Math.PI * radius;
  const progress = useSharedValue(0);
  const pulse = useSharedValue(1);

  React.useEffect(() => {
    progress.value = withTiming(clampedScore / 100, {
      duration: 900,
      easing: Easing.out(Easing.cubic),
    });
  }, [clampedScore, progress]);

  React.useEffect(() => {
    if (derivedLevel === 'critical') {
      pulse.value = withRepeat(
        withSequence(
          withTiming(1.05, { duration: 700, easing: Easing.inOut(Easing.ease) }),
          withTiming(1, { duration: 700, easing: Easing.inOut(Easing.ease) }),
        ),
        -1,
        true,
      );
      return;
    }

    if (pulse.value !== 1) {
      pulse.value = withTiming(1, { duration: 280, easing: Easing.out(Easing.circle) });
    }
  }, [derivedLevel, pulse]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: pulse.value }],
  }));

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }));

  const trackColor = theme.colors.outlineVariant ?? theme.colors.surfaceVariant;
  const riskColor = getRiskColor(derivedLevel, theme.colors.primary);

  return (
    <Animated.View style={[styles.wrapper, { width: size, height: size }, animatedStyle]}>
      <View style={styles.meterContent}>
        <Svg width={size} height={size} style={styles.svg}>
          <Circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={STROKE_WIDTH}
            stroke={trackColor}
            opacity={0.3}
            fill="none"
          />
          <AnimatedCircle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            strokeWidth={STROKE_WIDTH}
            stroke={riskColor}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            animatedProps={animatedProps}
            fill="none"
          />
        </Svg>
        <View style={styles.labelContainer} pointerEvents="none">
          <Text variant="headlineLarge" style={[styles.score, { color: riskColor }]}>
            {formatScore(clampedScore)}
          </Text>
          <Text variant="titleSmall" style={styles.riskLabel}>
            {derivedLevel === 'unknown' ? 'No risk data' : `${derivedLevel.charAt(0).toUpperCase()}${derivedLevel.slice(1)} risk`}
          </Text>
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  meterContent: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  svg: {
    transform: [{ rotate: '-90deg' }],
  },
  labelContainer: {
    position: 'absolute',
    alignItems: 'center',
    justifyContent: 'center',
  },
  score: {
    fontWeight: '700',
  },
  riskLabel: {
    marginTop: 4,
    opacity: 0.75,
    textTransform: 'capitalize',
  },
});
