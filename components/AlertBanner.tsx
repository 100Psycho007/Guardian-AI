import React from 'react';
import { GestureResponderEvent, StyleSheet, View } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Surface, Text, TouchableRipple, useTheme } from 'react-native-paper';

import type { AlertWithRead } from '../store/alertStore';
import { formatRiskLevel, getSeverityColor, getSeverityLabel, parseAlertMetadata } from '../lib/alerts';

export type AlertBannerProps = {
  alert: AlertWithRead;
  onPress?: (alert: AlertWithRead) => void;
  onDismiss?: (alertId: string) => void;
  actionLabel?: string;
  testID?: string;
};

export function AlertBanner({ alert, onPress, onDismiss, actionLabel = 'View details', testID }: AlertBannerProps) {
  const theme = useTheme();
  const severityColor = getSeverityColor(alert.severity);
  const severityLabel = getSeverityLabel(alert.severity);
  const metadata = React.useMemo(() => parseAlertMetadata(alert.metadata), [alert.metadata]);
  const riskLabel = formatRiskLevel(metadata.riskLevel);

  const handleBannerPress = React.useCallback(() => {
    onPress?.(alert);
  }, [onPress, alert]);

  const handleActionPress = React.useCallback(
    (event?: GestureResponderEvent) => {
      event?.stopPropagation();
      onPress?.(alert);
    },
    [onPress, alert],
  );

  const handleDismiss = React.useCallback(
    (event?: GestureResponderEvent) => {
      event?.stopPropagation();
      onDismiss?.(alert.id);
    },
    [onDismiss, alert.id],
  );

  return (
    <Surface style={[styles.container, { borderColor: severityColor }]} elevation={2} testID={testID}>
      <View style={styles.row}>
        <TouchableRipple style={styles.touchable} onPress={handleBannerPress} borderless>
          <View style={styles.content}>
            <View
              style={[styles.iconWrapper, { backgroundColor: severityColor }]}
              accessibilityRole="image"
              accessibilityLabel={`${severityLabel} alert`}
            >
              <MaterialIcons name="warning" size={20} color="#ffffff" />
            </View>
            <View style={styles.details}>
              <Text variant="labelSmall" style={[styles.label, { color: severityColor }]} accessibilityRole="text">
                {severityLabel} alert
              </Text>
              <Text variant="titleMedium" style={styles.title} numberOfLines={2}>
                {alert.reason}
              </Text>
              <Text variant="bodySmall" style={[styles.meta, { color: theme.colors.onSurfaceVariant }]} numberOfLines={2}>
                {riskLabel ? `${riskLabel} risk` : 'Tap to review details'}
              </Text>
            </View>
          </View>
        </TouchableRipple>
        <View style={styles.actions}>
          <TouchableRipple
            borderless
            onPress={handleActionPress}
            style={styles.actionButton}
            accessibilityRole="button"
            accessibilityLabel="View alert details"
          >
            <Text variant="labelLarge" style={[styles.actionLabel, { color: theme.colors.primary }]}>
              {actionLabel}
            </Text>
          </TouchableRipple>
          {onDismiss ? (
            <TouchableRipple
              borderless
              onPress={handleDismiss}
              style={styles.dismissButton}
              accessibilityRole="button"
              accessibilityLabel="Dismiss alert banner"
            >
              <MaterialIcons name="close" size={20} color={theme.colors.onSurfaceVariant} />
            </TouchableRipple>
          ) : null}
        </View>
      </View>
    </Surface>
  );
}

const styles = StyleSheet.create({
  container: {
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row',
    alignItems: 'stretch',
  },
  touchable: {
    flex: 1,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  iconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  details: {
    flex: 1,
    gap: 4,
  },
  label: {
    fontWeight: '600',
  },
  title: {
    fontWeight: '700',
  },
  meta: {
    lineHeight: 18,
  },
  actions: {
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 8,
  },
  actionButton: {
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  actionLabel: {
    fontWeight: '600',
  },
  dismissButton: {
    padding: 6,
    borderRadius: 16,
  },
});
