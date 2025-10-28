import React from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, Surface, Text, TouchableRipple, useTheme } from 'react-native-paper';

import type { AlertWithRead } from '../contexts/AlertStoreContext';
import { formatRiskLevel, getSeverityColor, getSeverityLabel, normalizeProbability, parseAlertMetadata } from '../lib/alerts';

type AlertCardProps = {
  alert: AlertWithRead;
  onPress?: (alert: AlertWithRead) => void;
};

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch (_error) {
    return value;
  }
}

function titleCase(value: string) {
  if (!value) {
    return value;
  }
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function AlertCard({ alert, onPress }: AlertCardProps) {
  const theme = useTheme();
  const metadata = React.useMemo(() => parseAlertMetadata(alert.metadata), [alert.metadata]);
  const severityColor = getSeverityColor(alert.severity);
  const severityLabel = getSeverityLabel(alert.severity);
  const riskLevelLabel = formatRiskLevel(metadata.riskLevel);
  const riskScore = metadata.riskScore != null ? Math.round(metadata.riskScore) : null;
  const fraudProbability = normalizeProbability(metadata.fraudProbability);
  const createdAtLabel = React.useMemo(() => formatDate(alert.created_at), [alert.created_at]);
  const statusLabel = React.useMemo(() => titleCase(alert.status), [alert.status]);

  return (
    <Surface
      style={[styles.surface, { backgroundColor: theme.colors.surface, borderColor: alert.read ? theme.colors.surfaceVariant : severityColor }]}
      elevation={alert.read ? 1 : 3}
    >
      <TouchableRipple
        borderless={false}
        onPress={() => onPress?.(alert)}
        accessibilityRole="button"
        accessibilityLabel={`${alert.read ? 'Read' : 'Unread'} ${severityLabel} alert. ${alert.reason}`}
        accessibilityHint="Opens alert details"
        style={styles.touchable}
      >
        <View style={styles.content}>
          <View style={styles.header}>
            <Text variant="titleMedium" style={[styles.reason, { color: theme.colors.onSurface }]} numberOfLines={2}>
              {alert.reason}
            </Text>
            {!alert.read ? (
              <View style={[styles.unreadDot, { backgroundColor: severityColor }]} importantForAccessibility="no" pointerEvents="none" />
            ) : null}
          </View>
          <View style={styles.metaRow}>
            <Chip
              compact
              mode="outlined"
              style={[styles.severityChip, { borderColor: severityColor }]}
              textStyle={{ color: severityColor, fontWeight: '600' }}
            >
              {severityLabel}
            </Chip>
            {riskLevelLabel ? (
              <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>{riskLevelLabel} risk</Text>
            ) : null}
            {riskScore != null ? (
              <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>Score {riskScore}</Text>
            ) : null}
            {fraudProbability != null ? (
              <Text style={[styles.metaText, { color: theme.colors.onSurfaceVariant }]}>{fraudProbability}% likelihood</Text>
            ) : null}
          </View>
          {metadata.flags.length > 0 ? (
            <View style={styles.flagRow}>
              {metadata.flags.slice(0, 3).map((flag, index) => (
                <Chip
                  compact
                  key={`${flag}-${index}`}
                  mode="outlined"
                  style={[styles.flagChip, { borderColor: theme.colors.outlineVariant }]}
                  textStyle={{ color: theme.colors.onSurfaceVariant }}
                >
                  {flag}
                </Chip>
              ))}
              {metadata.flags.length > 3 ? (
                <Text style={[styles.flagOverflow, { color: theme.colors.onSurfaceVariant }]}>+{metadata.flags.length - 3}</Text>
              ) : null}
            </View>
          ) : null}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: theme.colors.onSurfaceVariant }]}>{statusLabel}</Text>
            <Text style={[styles.footerText, { color: theme.colors.onSurfaceVariant }]}>{createdAtLabel}</Text>
          </View>
        </View>
      </TouchableRipple>
    </Surface>
  );
}

const styles = StyleSheet.create({
  surface: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  touchable: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  reason: {
    flex: 1,
    fontWeight: '600',
  },
  unreadDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginTop: 4,
  },
  metaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: 10,
  },
  severityChip: {
    height: 28,
  },
  metaText: {
    fontSize: 12,
    fontWeight: '500',
  },
  flagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  flagChip: {
    height: 26,
  },
  flagOverflow: {
    fontSize: 12,
    fontWeight: '600',
  },
  footer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  footerText: {
    fontSize: 12,
    flexShrink: 1,
    textAlign: 'right',
  },
});
