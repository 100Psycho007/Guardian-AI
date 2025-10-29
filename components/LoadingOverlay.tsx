
import React from 'react';
import { StyleSheet, View } from 'react-native';
import { ActivityIndicator, Button, Card, Portal, Text, useTheme } from 'react-native-paper';
import { MaterialIcons } from '@expo/vector-icons';

export type LoadingStepStatus = 'pending' | 'active' | 'complete' | 'error';

export type LoadingStep = {
  key: string;
  label: string;
  status: LoadingStepStatus;
};

export type LoadingOverlayProps = {
  visible: boolean;
  title: string;
  steps: LoadingStep[];
  message?: string;
  error?: string | null;
  onDismiss?: () => void;
  dismissLabel?: string;
  retryLabel?: string;
  onRetry?: () => void;
};

const ICON_SIZE = 22;

export function LoadingOverlay({
  visible,
  title,
  steps,
  message,
  error,
  onDismiss,
  dismissLabel = 'Close',
  retryLabel = 'Retry',
  onRetry,
}: LoadingOverlayProps) {
  const theme = useTheme();

  if (!visible) return null;

  const renderIcon = (status: LoadingStepStatus) => {
    switch (status) {
      case 'complete':
        return <MaterialIcons name="check-circle" size={ICON_SIZE} color={theme.colors.primary} />;
      case 'error':
        return <MaterialIcons name="error" size={ICON_SIZE} color={theme.colors.error} />;
      case 'active':
        return <ActivityIndicator size="small" color={theme.colors.primary} />;
      default:
        return <MaterialIcons name="radio-button-unchecked" size={ICON_SIZE} color={theme.colors.outline} />;
    }
  };

  return (
    <Portal>
      <View style={styles.overlay} pointerEvents="auto">
        <Card style={styles.card}>
          <Card.Title title={title} />
          <Card.Content>
            <View style={styles.steps}>
              {steps.map((step) => (
                <View key={step.key} style={styles.stepRow}>
                  {renderIcon(step.status)}
                  <Text style={styles.stepLabel}>{step.label}</Text>
                </View>
              ))}
            </View>
            {message ? <Text style={styles.message}>{message}</Text> : null}
            {error ? (
              <Text style={[styles.message, { color: theme.colors.error }]}>{error}</Text>
            ) : null}
          </Card.Content>
          {(onRetry || onDismiss) && (
            <Card.Actions style={styles.actions}>
              {onRetry ? (
                <Button mode="contained" onPress={onRetry} style={styles.actionButton}>
                  {retryLabel}
                </Button>
              ) : null}
              {onDismiss ? (
                <Button
                  onPress={onDismiss}
                  style={[styles.actionButton, onRetry ? styles.dismissSpacing : null]}>
                  {dismissLabel}
                </Button>
              ) : null}
            </Card.Actions>
          )}
        </Card>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  card: {
    width: '100%',
    maxWidth: 420,
  },
  steps: {
    gap: 12,
  },
  stepRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  stepLabel: {
    marginLeft: 12,
  },
  message: {
    marginTop: 16,
  },
  actions: {
    justifyContent: 'flex-end',
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  actionButton: {
    marginTop: 4,
  },
  dismissSpacing: {
    marginLeft: 8,
  },
});
