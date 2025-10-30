import React, { useEffect } from 'react'
import { View, Text, StyleSheet } from 'react-native'
import Animated, { useSharedValue, useAnimatedProps, withTiming, Easing } from 'react-native-reanimated'
import Svg, { Circle } from 'react-native-svg'
import * as Haptics from 'expo-haptics'

const AnimatedCircle = Animated.createAnimatedComponent(Circle)

interface RiskMeterProps {
  score: number
  size?: number
}

export function RiskMeter({ score, size = 200 }: RiskMeterProps) {
  const progress = useSharedValue(0)
  const radius = (size - 40) / 2
  const circumference = 2 * Math.PI * radius

  useEffect(() => {
    progress.value = withTiming(score / 100, {
      duration: 1500,
      easing: Easing.bezier(0.25, 0.1, 0.25, 1),
    })

    if (score < 40) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light)
    } else if (score < 70) {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium)
    } else {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning)
    }
  }, [score])

  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: circumference * (1 - progress.value),
  }))

  const getColor = () => {
    if (score < 40) return '#10b981'
    if (score < 70) return '#f59e0b'
    return '#ef4444'
  }

  const getRiskLevel = () => {
    if (score < 40) return 'Safe'
    if (score < 70) return 'Caution'
    if (score < 85) return 'Danger'
    return 'Critical'
  }

  return (
    <View style={styles.container}>
      <Svg width={size} height={size}>
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke="#e5e7eb"
          strokeWidth={20}
          fill="none"
        />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          stroke={getColor()}
          strokeWidth={20}
          fill="none"
          strokeDasharray={circumference}
          animatedProps={animatedProps}
          strokeLinecap="round"
          rotation="-90"
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
      <View style={styles.centerContent}>
        <Text style={styles.score}>{score}</Text>
        <Text style={[styles.label, { color: getColor() }]}>{getRiskLevel()}</Text>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerContent: {
    position: 'absolute',
    alignItems: 'center',
  },
  score: {
    fontSize: 48,
    fontWeight: 'bold',
    color: '#1f2937',
  },
  label: {
    fontSize: 16,
    fontWeight: '600',
    marginTop: 4,
  },
})


