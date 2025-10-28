import React from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { ActivityIndicator, Button, Surface, Text, useTheme, FAB } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { Session } from '@supabase/supabase-js';

import { ThemedView } from '../../components/Themed';
import { StatsCard } from '../../components/StatsCard';
import { AlertBanner } from '../../components/AlertBanner';
import { useAuth } from '../../hooks/useAuth';
import { useAlerts, useAlertsLoader, useAlertsRealtime, useLatestRealtimeAlert } from '../../hooks/useAlerts';
import { useScans, useScansLoader } from '../../hooks/useScans';
import { getSeverityColor, getSeverityLabel } from '../../lib/alerts';
import type { AlertWithRead } from '../../store/alertStore';
import type { Scan, ScanStatus } from '../../lib/supabase';

function getFirstName(session: Session | null): string {
  const fullName = session?.user?.user_metadata && typeof session.user.user_metadata === 'object'
    ? (session.user.user_metadata as Record<string, unknown>).full_name
    : null;
  if (typeof fullName === 'string' && fullName.trim()) {
    return fullName.trim().split(' ')[0] ?? fullName.trim();
  }
  const email = session?.user?.email;
  if (email) {
    return email.split('@')[0] ?? email;
  }
  return 'there';
}

function formatDateTime(value: string | null | undefined) {
  if (!value) return null;
  try {
    const date = new Date(value);
    return `${date.toLocaleDateString()} • ${date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  } catch (_error) {
    return value ?? null;
  }
}

function formatScanStatus(status: ScanStatus) {
  switch (status) {
    case 'complete':
      return 'Completed';
    case 'processing':
      return 'Processing';
    case 'pending':
      return 'Pending';
    case 'failed':
      return 'Failed';
    default:
      return status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function getScanTitle(scan: Scan) {
  const metadata = scan.metadata;
  if (isRecord(metadata)) {
    const summary =
      getString(metadata.summary) ||
      getString(metadata.title) ||
      getString(metadata.description) ||
      getString(metadata.label);
    if (summary) {
      return summary;
    }
    const nestedDetails = metadata.upiDetails ?? metadata.upi_details;
    if (isRecord(nestedDetails)) {
      const nestedSummary =
        getString(nestedDetails.payeeName) ||
        getString(nestedDetails.payerName) ||
        getString(nestedDetails.upiId) ||
        getString(nestedDetails.upi_id);
      if (nestedSummary) {
        return nestedSummary;
      }
    }
  }

  if (scan.storage_path) {
    const parts = scan.storage_path.split('/');
    const last = parts[parts.length - 1];
    if (last) {
      return last;
    }
  }

  return `Scan ${new Date(scan.created_at).toLocaleDateString()}`;
}

function resolveAlertsError(result: { error?: string } | undefined): string | null {
  if (!result?.error || result.error === 'NOT_AUTHENTICATED') {
    return null;
  }
  return result.error;
}

export default function DashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session } = useAuth();

  const { load: loadScans } = useScansLoader();
  const { load: loadAlerts } = useAlertsLoader({ limit: 20 });

  const stats = useScans((state) => state.stats);
  const scans = useScans((state) => state.scans);
  const scanError = useScans((state) => state.error);
  const scanning = useScans((state) => state.isLoading);

  const alerts = useAlerts((state) => state.alerts);
  const acknowledgeRealtimeAlert = useAlerts((state) => state.acknowledgeRealtimeAlert);
  const markAlertRead = useAlerts((state) => state.markAlertRead);

  const latestRealtimeAlert = useLatestRealtimeAlert();

  const [alertsError, setAlertsError] = React.useState<string | null>(null);
  const [initializing, setInitializing] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  useAlertsRealtime();

  const bootstrap = React.useCallback(async () => {
    const [scansResult, alertsResult] = await Promise.all([loadScans(), loadAlerts(20)]);
    setAlertsError(resolveAlertsError(alertsResult));
    return scansResult;
  }, [loadScans, loadAlerts]);

  React.useEffect(() => {
    let cancelled = false;
    bootstrap()
      .catch((error) => {
        if (__DEV__) {
          console.warn('Dashboard bootstrap failed', error);
        }
      })
      .finally(() => {
        if (!cancelled) {
          setInitializing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [bootstrap]);

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    Promise.all([loadScans({ background: true }), loadAlerts(20)])
      .then(([_, alertsResult]) => {
        setAlertsError(resolveAlertsError(alertsResult));
      })
      .catch((error) => {
        if (__DEV__) {
          console.warn('Dashboard refresh failed', error);
        }
      })
      .finally(() => {
        setRefreshing(false);
      });
  }, [loadScans, loadAlerts]);

  const handleOpenAlert = React.useCallback(
    (alert: AlertWithRead) => {
      markAlertRead(alert.id);
      acknowledgeRealtimeAlert(alert.id);
      router.push({ pathname: '/(tabs)/alerts', params: { alertId: alert.id } });
    },
    [acknowledgeRealtimeAlert, markAlertRead, router],
  );

  const handleDismissAlertBanner = React.useCallback(
    (alertId: string) => {
      acknowledgeRealtimeAlert(alertId);
      markAlertRead(alertId);
    },
    [acknowledgeRealtimeAlert, markAlertRead],
  );

  const handleViewAllAlerts = React.useCallback(() => {
    router.push('/(tabs)/alerts');
  }, [router]);

  const handleViewScanHistory = React.useCallback(() => {
    router.push('/(tabs)/scan/history');
  }, [router]);

  const handleStartScan = React.useCallback(() => {
    router.push('/(tabs)/scan');
  }, [router]);

  const greetingName = getFirstName(session);
  const recentAlerts = React.useMemo(() => alerts.slice(0, 3), [alerts]);
  const recentScans = React.useMemo(() => scans.slice(0, 3), [scans]);
  const lastScanAt = stats?.lastScanAt ?? recentScans[0]?.created_at ?? null;

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
        >
          <View style={styles.headerSection}>
            <Text variant="headlineMedium" accessibilityRole="header">
              Welcome back, {greetingName}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Here's the latest on your scans and alerts.
            </Text>
          </View>

          {latestRealtimeAlert && !latestRealtimeAlert.read ? (
            <AlertBanner
              alert={latestRealtimeAlert}
              onPress={handleOpenAlert}
              onDismiss={handleDismissAlertBanner}
              testID="dashboard-alert-banner"
            />
          ) : null}

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="titleMedium">Performance</Text>
              {lastScanAt ? (
                <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                  Last scan {formatDateTime(lastScanAt)}
                </Text>
              ) : null}
            </View>
            {initializing && scanning ? (
              <View style={styles.loadingState}>
                <ActivityIndicator animating size="large" />
              </View>
            ) : (
              <View style={styles.statsGrid}>
                <StatsCard
                  title="Total scans"
                  value={stats?.totalScans ?? scans.length}
                  iconName="qr-code-scanner"
                />
                <StatsCard
                  title="Accuracy rate"
                  value={`${stats?.accuracyRate ?? 100}%`}
                  iconName="verified"
                />
                <StatsCard
                  title="High-risk flagged"
                  value={stats?.highRisk ?? 0}
                  iconName="warning"
                  accentColor={theme.colors.error}
                />
                <StatsCard
                  title="Reputation"
                  value={`${stats?.reputation ?? 75}%`}
                  iconName="shield"
                />
              </View>
            )}
            {scanError ? (
              <Text variant="bodySmall" style={[styles.errorText, { color: theme.colors.error }]}>
                {scanError}
              </Text>
            ) : null}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="titleMedium">Recent alerts</Text>
              <Button mode="text" onPress={handleViewAllAlerts} compact>
                View all
              </Button>
            </View>
            {alertsError ? (
              <Text variant="bodySmall" style={[styles.errorText, { color: theme.colors.error }]}>
                {alertsError}
              </Text>
            ) : null}
            {recentAlerts.length === 0 && !alertsError ? (
              <Surface style={styles.emptyState} elevation={0}>
                <Text variant="bodyMedium">All clear. No alerts right now.</Text>
              </Surface>
            ) : (
              recentAlerts.map((alert) => {
                const severityColor = getSeverityColor(alert.severity);
                const createdAt = formatDateTime(alert.created_at);
                return (
                  <Surface key={alert.id} style={styles.alertRow} elevation={1}>
                    <View style={[styles.alertSeverityDot, { backgroundColor: severityColor }]} />
                    <View style={styles.alertContent}>
                      <Text variant="labelLarge" style={{ color: severityColor }}>
                        {getSeverityLabel(alert.severity)}
                      </Text>
                      <Text variant="bodyLarge" numberOfLines={2}>
                        {alert.reason}
                      </Text>
                      {createdAt ? (
                        <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                          {createdAt}
                        </Text>
                      ) : null}
                    </View>
                    <Button mode="text" onPress={() => handleOpenAlert(alert)}>
                      View
                    </Button>
                  </Surface>
                );
              })
            )}
          </View>

          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Text variant="titleMedium">Latest scans</Text>
              <Button mode="text" onPress={handleViewScanHistory} compact>
                History
              </Button>
            </View>
            {recentScans.length === 0 ? (
              <Surface style={styles.emptyState} elevation={0}>
                <Text variant="bodyMedium">No scans yet. Start one to see results here.</Text>
              </Surface>
            ) : (
              recentScans.map((scan) => {
                const statusLabel = formatScanStatus(scan.status);
                const createdAt = formatDateTime(scan.created_at);
                return (
                  <Surface key={scan.id} style={styles.scanRow} elevation={1}>
                    <View style={styles.scanContent}>
                      <Text variant="titleMedium" numberOfLines={1}>
                        {getScanTitle(scan)}
                      </Text>
                      <Text variant="bodySmall" style={{ color: theme.colors.onSurfaceVariant }}>
                        {createdAt ?? 'Unknown timestamp'}
                      </Text>
                    </View>
                    <Surface
                      elevation={0}
                      style={[
                        styles.scanStatusPill,
                        { backgroundColor: theme.colors.surfaceVariant },
                      ]}
                    >
                      <Text variant="labelMedium">{statusLabel}</Text>
                    </Surface>
                  </Surface>
                );
              })
            )}
          </View>
        </ScrollView>
        <FAB
          icon="qr-code-scanner"
          style={styles.fab}
          onPress={handleStartScan}
          accessibilityLabel="Start a new scan"
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
    paddingTop: 24,
    gap: 24,
  },
  headerSection: {
    gap: 8,
  },
  section: {
    gap: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 16,
    justifyContent: 'space-between',
  },
  loadingState: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  errorText: {
    marginTop: -8,
  },
  emptyState: {
    padding: 20,
    borderRadius: 16,
  },
  alertRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  alertSeverityDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  alertContent: {
    flex: 1,
    gap: 4,
  },
  scanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
  },
  scanContent: {
    flex: 1,
    gap: 4,
  },
  scanStatusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
  },
  fab: {
    position: 'absolute',
    right: 24,
    bottom: 24,
  },
});
