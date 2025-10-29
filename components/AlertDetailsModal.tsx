import React from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Button, Chip, Divider, Modal, Portal, Text, useTheme } from 'react-native-paper';

import type { AlertWithRead } from '../contexts/AlertStoreContext';
import { formatRiskLevel, getSeverityColor, getSeverityLabel, normalizeProbability, parseAlertMetadata } from '../lib/alerts';

type AlertDetailsModalProps = {
  alert: AlertWithRead | null;
  visible: boolean;
  onDismiss: () => void;
  onMarkRead: (alertId: string) => void;
};

function formatDate(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch (_error) {
    return value;
  }
}

function formatStatus(value: string) {
  const lower = value.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function AlertDetailsModal({ alert, visible, onDismiss, onMarkRead }: AlertDetailsModalProps) {
  const theme = useTheme();

  const metadata = React.useMemo(() => (alert ? parseAlertMetadata(alert.metadata) : null), [alert]);

  const severityColor = alert ? getSeverityColor(alert.severity) : theme.colors.primary;
  const severityLabel = alert ? getSeverityLabel(alert.severity) : '';
  const riskLevelLabel = metadata ? formatRiskLevel(metadata.riskLevel) : null;
  const riskScore = metadata?.riskScore != null ? Math.round(metadata.riskScore) : null;
  const fraudProbability = metadata ? normalizeProbability(metadata.fraudProbability) : null;
  const flags = metadata?.flags ?? [];
  const createdAt = alert ? formatDate(alert.created_at) : null;
  const updatedAt = alert ? formatDate(alert.updated_at) : null;
  const statusLabel = alert ? formatStatus(alert.status) : null;

  const handleMarkAsRead = React.useCallback(() => {
    if (!alert || alert.read) {
      return;
    }
    onMarkRead(alert.id);
  }, [alert, onMarkRead]);

  if (!alert) {
    return null;
  }

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={[styles.modal, { backgroundColor: theme.colors.surface }]}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          accessibilityLabel={`Alert details for ${alert.reason}`}
        >
          <View style={styles.header}>
            <Text variant="titleLarge" style={[styles.title, { color: theme.colors.onSurface }]}>
              {alert.reason}
            </Text>
            <Chip
              compact
              mode="outlined"
              style={[styles.severityChip, { borderColor: severityColor }]}
              textStyle={{ color: severityColor, fontWeight: '600' }}
            >
              {severityLabel}
            </Chip>
          </View>

          <Text style={[styles.status, { color: theme.colors.onSurfaceVariant }]}>Status: {statusLabel}</Text>
          {createdAt ? (
            <Text style={[styles.timestamp, { color: theme.colors.onSurfaceVariant }]}>Created: {createdAt}</Text>
          ) : null}
          {updatedAt && updatedAt !== createdAt ? (
            <Text style={[styles.timestamp, { color: theme.colors.onSurfaceVariant }]}>Updated: {updatedAt}</Text>
          ) : null}

          <Divider style={styles.divider} />

          <View style={styles.section}>
            <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Risk breakdown</Text>
            <View style={styles.detailRow}>
              <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Severity</Text>
              <Text style={[styles.value, { color: severityColor }]}>{severityLabel}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Risk level</Text>
              <Text style={[styles.value, { color: theme.colors.onSurface }]}>{riskLevelLabel ?? 'Unknown'}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Risk score</Text>
              <Text style={[styles.value, { color: theme.colors.onSurface }]}>
                {riskScore != null ? riskScore : 'Not provided'}
              </Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={[styles.label, { color: theme.colors.onSurfaceVariant }]}>Fraud probability</Text>
              <Text style={[styles.value, { color: theme.colors.onSurface }]}>
                {fraudProbability != null ? `${fraudProbability}%` : 'Not available'}
              </Text>
            </View>
          </View>

          {flags.length > 0 ? (
            <View style={styles.section}>
              <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Risk factors</Text>
              <View style={styles.flagRow}>
                {flags.map((flag, index) => (
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
              </View>
            </View>
          ) : null}

          {alert.notes ? (
            <View style={styles.section}>
              <Text variant="titleMedium" style={[styles.sectionTitle, { color: theme.colors.onSurface }]}>Notes</Text>
              <View style={[styles.notesBox, { backgroundColor: theme.colors.surfaceVariant }]}>
                <Text style={{ color: theme.colors.onSurfaceVariant }}>{alert.notes}</Text>
              </View>
            </View>
          ) : null}

          <View style={styles.actions}>
            <Button
              mode="contained"
              onPress={handleMarkAsRead}
              disabled={alert.read}
              accessibilityLabel="Mark this alert as read"
            >
              {alert.read ? 'Marked as read' : 'Mark as read'}
            </Button>
            <Button mode="outlined" onPress={onDismiss} accessibilityLabel="Close alert details">
              Close
            </Button>
          </View>
        </ScrollView>
      </Modal>
    </Portal>
  );
}

const styles = StyleSheet.create({
  modal: {
    margin: 16,
    borderRadius: 20,
    overflow: 'hidden',
    maxHeight: '85%',
  },
  content: {
    padding: 24,
    gap: 16,
  },
  header: {
    gap: 12,
  },
  title: {
    fontWeight: '600',
  },
  severityChip: {
    alignSelf: 'flex-start',
  },
  status: {
    fontSize: 14,
  },
  timestamp: {
    fontSize: 12,
  },
  divider: {
    marginVertical: 8,
  },
  section: {
    gap: 12,
  },
  sectionTitle: {
    fontWeight: '600',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 16,
  },
  label: {
    fontSize: 14,
    flexShrink: 0,
  },
  value: {
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    flexShrink: 0,
  },
  flagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  flagChip: {
    height: 28,
  },
  notesBox: {
    borderRadius: 12,
    padding: 12,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
  },
});
