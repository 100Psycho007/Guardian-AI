import React from 'react';
import { Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Button, Surface, Text, useTheme } from 'react-native-paper';

import { trackError, trackEvent } from '../lib/analytics';
import { ThemedView } from './Themed';

type AppErrorBoundaryProps = {
  children: React.ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
};

function ErrorFallback({ error, onRetry }: { error: Error | null; onRetry: () => void }) {
  const theme = useTheme();
  const isDev = __DEV__;

  return (
    <ThemedView style={styles.container}>
      <Surface style={[styles.surface, { backgroundColor: theme.colors.surface }]} elevation={2}>
        <View style={styles.header}>
          <Text variant="headlineSmall" accessibilityRole="header">
            Something went wrong
          </Text>
          <Text variant="bodyMedium" style={[styles.subtitle, { color: theme.colors.onSurfaceVariant }]}> 
            We hit an unexpected error and have reported it. You can try reloading the app to continue.
          </Text>
        </View>

        <View style={styles.actions}>
          <Button mode="contained" onPress={onRetry} accessibilityLabel="Reload the app">
            Reload app
          </Button>
        </View>

        {isDev && error ? (
          <View
            style={[styles.devBlock, { borderColor: theme.colors.outlineVariant, backgroundColor: theme.colors.surfaceVariant }]}
          >
            <Text variant="titleSmall">Error details (development only)</Text>
            <ScrollView
              style={styles.errorScroll}
              contentContainerStyle={styles.errorContent}
              showsVerticalScrollIndicator
              accessibilityRole="text"
            >
              <Text style={[styles.errorMessage, { color: theme.colors.error }]}>{error.message}</Text>
              {error.stack ? (
                <Text style={[styles.errorStack, { color: theme.colors.onSurfaceVariant }]}>{error.stack}</Text>
              ) : null}
            </ScrollView>
          </View>
        ) : null}
      </Surface>
    </ThemedView>
  );
}

export class AppErrorBoundary extends React.Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
  };

  static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    trackError('app.fatal_error', error, { componentStack: info.componentStack }, true);
  }

  handleRetry = () => {
    if (this.state.error) {
      trackEvent('app.error_boundary.reset', {
        message: this.state.error.message,
      });
    }
    this.setState({ error: null });
  };

  render() {
    const { error } = this.state;

    if (error) {
      return <ErrorFallback error={error} onRetry={this.handleRetry} />;
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 24,
    justifyContent: 'center',
  },
  surface: {
    borderRadius: 24,
    padding: 24,
    gap: 24,
  },
  header: {
    gap: 12,
  },
  subtitle: {
    lineHeight: 20,
  },
  actions: {
    gap: 12,
  },
  devBlock: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 12,
  },
  errorScroll: {
    maxHeight: 200,
  },
  errorContent: {
    gap: 8,
  },
  errorMessage: {
    fontWeight: '600',
  },
  errorStack: {
    fontFamily: Platform.select({ ios: 'Menlo', android: 'monospace', default: 'monospace' }),
    fontSize: 12,
    lineHeight: 16,
  },
});
