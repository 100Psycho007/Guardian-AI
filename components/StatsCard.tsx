import React from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { Surface, Text, useTheme } from 'react-native-paper';

export type StatsCardProps = {
  label: string;
  value: string;
  icon?: React.ReactNode;
  loading?: boolean;
  accessibilityLabel?: string;
  accessibilityHint?: string;
  style?: ViewStyle;
};

export function StatsCard({
  label,
  value,
  icon,
  loading = false,
  accessibilityLabel: accessibilityLabelOverride,
  accessibilityHint,
  style,
}: StatsCardProps) {
  const theme = useTheme();
  const skeletonColor = theme.colors.surfaceVariant;

  const accessibilityLabel = accessibilityLabelOverride ?? `${label}: ${loading ? 'Loading' : value}`;

  return (
    <Surface
      mode="elevated"
      elevation={2}
      style={[styles.card, { backgroundColor: theme.colors.surface }, style]}
      accessibilityLabel={accessibilityLabel}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ busy: loading }}
    >
      {icon ? (
        <View style={[styles.iconContainer, { backgroundColor: theme.colors.secondaryContainer }]}>{icon}</View>
      ) : null}
      <View style={styles.content}>
        {loading ? (
          <View
            style={[styles.valueSkeleton, { backgroundColor: skeletonColor }]}
            accessible={false}
            accessibilityElementsHidden
            importantForAccessibility="no"
          />
        ) : (
          <Text variant="headlineMedium">{value}</Text>
        )}
        <Text variant="labelLarge" style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>
          {label}
        </Text>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    borderRadius: 20,
    paddingVertical: 16,
    paddingHorizontal: 16,
    justifyContent: 'space-between',
  },
  iconContainer: {
    alignSelf: 'flex-start',
    borderRadius: 16,
    padding: 8,
    marginBottom: 12,
  },
  content: {
    gap: 4,
  },
  label: {
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  valueSkeleton: {
    height: 28,
    borderRadius: 12,
  },
});
