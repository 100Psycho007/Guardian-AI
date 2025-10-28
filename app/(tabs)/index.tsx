import React from 'react';
import type { ComponentProps } from 'react';
import {
  FlatList,
  ListRenderItem,
  RefreshControl,
  StyleSheet,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Chip, FAB, IconButton, Surface, Text, useTheme } from 'react-native-paper';
import type { MD3Theme } from 'react-native-paper';

import { ThemedView } from '../../components/Themed';
import { StatsCard } from '../../components/StatsCard';
import { useAuth } from '../../hooks/useAuth';
import { supabase, type FraudAlert, type Profile, type Scan, type ScanStatus } from '../../lib/supabase';

type MaterialIconName = ComponentProps<typeof MaterialIcons>['name'];

type ScanStats = {
  totalScans: number;
  fraudDetected: number;
  moneySaved: number;
};

async function fetchProfile(userId: string) {
  const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

async function fetchRecentScans(userId: string) {
  const { data, error } = await supabase
    .from('scans')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(10);

  if (error) {
    throw new Error(error.message);
  }

  return data ?? [];
}

async function fetchLatestHighSeverityAlert(userId: string) {
  const { data, error } = await supabase
    .from('fraud_alerts')
    .select('*')
    .eq('user_id', userId)
    .in('severity', ['high', 'critical'])
    .in('status', ['open', 'investigating'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function parseScanStats(stats: Profile['scan_stats'] | null | undefined): ScanStats {
  if (!isRecord(stats)) {
    return { totalScans: 0, fraudDetected: 0, moneySaved: 0 };
  }

  const totalScans = getNumeric(stats, ['total_scans', 'totalScans']);
  const fraudDetected = getNumeric(stats, ['fraud_detected', 'fraudDetected']);
  const moneySaved = getNumeric(stats, ['money_saved', 'moneySaved']);

  return { totalScans, fraudDetected, moneySaved };
}

function getNumeric(record: Record<string, unknown>, keys: string[]): number {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'number' && Number.isFinite(value)) {
      return value;
    }
  }
  return 0;
}

function formatNumber(value: number) {
  if (!Number.isFinite(value)) return '0';
  try {
    return new Intl.NumberFormat('en-IN').format(value);
  } catch (_error) {
    return String(Math.round(value));
  }
}

function formatCurrency(value: number) {
  if (!Number.isFinite(value)) return '₹0';
  const safeValue = Math.max(0, Math.round(value));
  try {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0,
    }).format(safeValue);
  } catch (_error) {
    return `₹${safeValue.toString()}`;
  }
}

function formatDateTime(value: string | null) {
  if (!value) return 'Unknown';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Unknown';
  try {
    return new Intl.DateTimeFormat('en-IN', {
      dateStyle: 'medium',
      timeStyle: 'short',
    }).format(date);
  } catch (_error) {
    return date.toLocaleString();
  }
}

function getFirstString(record: Record<string, unknown>, keys: string[]) {
  for (const key of keys) {
    const value = record[key];
    if (typeof value === 'string' && value.trim().length > 0) {
      return value.trim();
    }
  }
  return undefined;
}

function getScanTitle(metadata: Record<string, unknown>) {
  return (
    getFirstString(metadata, [
      'document_title',
      'documentTitle',
      'document_type',
      'documentType',
      'source',
      'friendly_name',
      'friendlyName',
    ]) ?? 'Recent scan'
  );
}

function getScanDetail(metadata: Record<string, unknown>, status: ScanStatus) {
  const detail = getFirstString(metadata, [
    'summary',
    'description',
    'upi_id',
    'upiId',
    'account_name',
    'accountName',
    'payee',
  ]);

  if (detail) return detail;

  switch (status) {
    case 'complete':
      return 'Scan completed successfully.';
    case 'processing':
      return 'Scan is being processed.';
    case 'failed':
      return 'Scan failed. Try again from the Scan tab.';
    default:
      return 'Scan queued and awaiting processing.';
  }
}

function getGreeting() {
  const hour = new Date().getHours();
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

function getErrorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Something went wrong.';
}

function getStatusDescriptor(status: ScanStatus, colors: MD3Theme['colors']) {
  switch (status) {
    case 'complete':
      return {
        label: 'Complete',
        backgroundColor: colors.primaryContainer,
        textColor: colors.onPrimaryContainer,
      };
    case 'processing':
      return {
        label: 'Processing',
        backgroundColor: colors.tertiaryContainer,
        textColor: colors.onTertiaryContainer,
      };
    case 'failed':
      return {
        label: 'Failed',
        backgroundColor: colors.errorContainer,
        textColor: colors.onErrorContainer,
      };
    default:
      return {
        label: 'Pending',
        backgroundColor: colors.surfaceVariant,
        textColor: colors.onSurfaceVariant,
      };
  }
}

function getReputationDescriptor(score: number | null | undefined, colors: MD3Theme['colors']) {
  if (typeof score === 'number') {
    if (score >= 80) {
      return {
        label: 'Excellent',
        icon: 'verified' as MaterialIconName,
        backgroundColor: colors.primaryContainer,
        textColor: colors.onPrimaryContainer,
      };
    }
    if (score >= 50) {
      return {
        label: 'Trusted',
        icon: 'shield' as MaterialIconName,
        backgroundColor: colors.tertiaryContainer,
        textColor: colors.onTertiaryContainer,
      };
    }
    return {
      label: 'Watchlist',
      icon: 'error-outline' as MaterialIconName,
      backgroundColor: colors.errorContainer,
      textColor: colors.onErrorContainer,
    };
  }

  return {
    label: 'Unrated',
    icon: 'help-outline' as MaterialIconName,
    backgroundColor: colors.surfaceVariant,
    textColor: colors.onSurfaceVariant,
  };
}

function AlertBanner({ alert, onDismiss }: { alert: FraudAlert; onDismiss: () => void }) {
  const theme = useTheme();
  const containerColor =
    alert.severity === 'critical' ? theme.colors.errorContainer : theme.colors.tertiaryContainer;
  const textColor =
    alert.severity === 'critical' ? theme.colors.onErrorContainer : theme.colors.onTertiaryContainer;
  const iconName: MaterialIconName = alert.severity === 'critical' ? 'priority-high' : 'warning';

  return (
    <Surface
      elevation={2}
      style={[styles.alertBanner, { backgroundColor: containerColor }]}
      accessibilityRole="alert"
      accessibilityLiveRegion="assertive"
    >
      <MaterialIcons name={iconName} size={24} color={textColor} accessibilityElementsHidden />
      <View style={styles.alertContent}>
        <Text variant="titleSmall" style={[styles.alertTitle, { color: textColor }]}>
          {alert.severity === 'critical' ? 'Critical fraud alert' : 'High fraud alert'}
        </Text>
        <Text variant="bodyMedium" style={{ color: textColor }}>
          {alert.reason}
        </Text>
        <Text variant="bodySmall" style={{ color: textColor, opacity: 0.9 }}>
          Reported {formatDateTime(alert.created_at)}
        </Text>
      </View>
      <IconButton
        accessibilityLabel="Dismiss alert"
        icon="close"
        onPress={onDismiss}
        iconColor={textColor}
        style={styles.alertDismiss}
        size={20}
      />
    </Surface>
  );
}

function SkeletonScanItem() {
  const theme = useTheme();
  const placeholder = theme.colors.surfaceVariant;

  return (
    <Surface
      elevation={1}
      style={[styles.scanCard, { backgroundColor: theme.colors.surface }]}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <View style={[styles.skeletonBlock, { width: '55%', height: 20, backgroundColor: placeholder }]} />
      <View style={[styles.skeletonBlock, { width: '80%', backgroundColor: placeholder }]} />
      <View style={[styles.skeletonBlock, { width: '45%', backgroundColor: placeholder }]} />
    </Surface>
  );
}

export default function DashboardScreen() {
  const theme = useTheme();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const { session } = useAuth();
  const userId = session?.user?.id;

  const profileQuery = useQuery({
    queryKey: ['dashboard', 'profile', userId],
    queryFn: () => fetchProfile(userId!),
    enabled: Boolean(userId),
    staleTime: 60_000,
  });

  const scansQuery = useQuery({
    queryKey: ['dashboard', 'scans', userId],
    queryFn: () => fetchRecentScans(userId!),
    enabled: Boolean(userId),
    staleTime: 30_000,
  });

  const alertQuery = useQuery({
    queryKey: ['dashboard', 'alert', userId],
    queryFn: () => fetchLatestHighSeverityAlert(userId!),
    enabled: Boolean(userId),
    staleTime: 15_000,
  });

  const [activeAlert, setActiveAlert] = React.useState<FraudAlert | null>(null);
  const dismissAlert = React.useCallback(() => setActiveAlert(null), []);

  React.useEffect(() => {
    if (alertQuery.data === undefined) return;
    setActiveAlert(alertQuery.data ?? null);
  }, [alertQuery.data]);

  React.useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`dashboard-data-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'scans', filter: `user_id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'scans', userId] });
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'profile', userId] });
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles', filter: `id=eq.${userId}` },
        () => {
          queryClient.invalidateQueries({ queryKey: ['dashboard', 'profile', userId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  React.useEffect(() => {
    if (!userId) return;

    const channel = supabase
      .channel(`dashboard-alerts-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fraud_alerts', filter: `user_id=eq.${userId}` },
        (payload) => {
          const next = payload.new as FraudAlert | null;
          const previous = payload.old as FraudAlert | null;

          if (payload.eventType === 'DELETE') {
            setActiveAlert((current) => {
              if (current && previous && current.id === previous.id) {
                return null;
              }
              return current;
            });
            queryClient.invalidateQueries({ queryKey: ['dashboard', 'alert', userId] });
            return;
          }

          if (!next) return;

          const isHighSeverity = next.severity === 'high' || next.severity === 'critical';
          const isActiveStatus = next.status === 'open' || next.status === 'investigating';

          if (isHighSeverity && isActiveStatus) {
            setActiveAlert(next);
          } else {
            setActiveAlert((current) => {
              if (current && current.id === next.id) {
                return null;
              }
              return current;
            });
          }

          queryClient.invalidateQueries({ queryKey: ['dashboard', 'alert', userId] });
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient, userId]);

  const profile = profileQuery.data ?? null;
  const scans = scansQuery.data ?? [];

  const stats = React.useMemo(() => parseScanStats(profile?.scan_stats), [profile?.scan_stats]);
  const reputationScore = typeof profile?.reputation_score === 'number' ? profile.reputation_score : null;
  const reputationDescriptor = getReputationDescriptor(reputationScore, theme.colors);

  const statsLoading = profileQuery.isLoading && !profile;
  const scansLoading = scansQuery.isLoading && scans.length === 0;
  const refreshing = profileQuery.isRefetching || scansQuery.isRefetching || alertQuery.isRefetching;

  const greeting = getGreeting();
  const displayName = profile?.full_name?.split(' ')[0] ?? session?.user?.email ?? 'there';

  const handleRefresh = React.useCallback(() => {
    void profileQuery.refetch();
    void scansQuery.refetch();
    void alertQuery.refetch();
  }, [alertQuery, profileQuery, scansQuery]);

  const handleStartScan = React.useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => undefined);
    router.push('/(tabs)/scan');
  }, [router]);

  const errorMessages = React.useMemo(() => {
    const messages: string[] = [];
    if (profileQuery.error) messages.push(getErrorMessage(profileQuery.error));
    if (scansQuery.error) messages.push(getErrorMessage(scansQuery.error));
    if (alertQuery.error) messages.push(getErrorMessage(alertQuery.error));
    return messages;
  }, [alertQuery.error, profileQuery.error, scansQuery.error]);

  const statsIconColor = theme.colors.onSecondaryContainer;

  const reputationAccessibilityLabel = React.useMemo(() => {
    const parts = [`Reputation ${reputationDescriptor.label}`];
    if (typeof reputationScore === 'number') {
      parts.push(`score ${Math.round(reputationScore)}`);
    }
    return parts.join(', ');
  }, [reputationDescriptor.label, reputationScore]);

  const renderScanItem = React.useCallback<ListRenderItem<Scan>>(
    ({ item }) => {
      const metadata = isRecord(item.metadata) ? item.metadata : {};
      const title = getScanTitle(metadata);
      const detail = getScanDetail(metadata, item.status);
      const statusDescriptor = getStatusDescriptor(item.status, theme.colors);
      const createdAt = formatDateTime(item.created_at);
      const processedAt = item.processed_at ? formatDateTime(item.processed_at) : null;

      return (
        <Surface
          elevation={1}
          style={[styles.scanCard, { backgroundColor: theme.colors.surface }]}
          accessibilityLabel={`${title}. Status ${statusDescriptor.label}. Created ${createdAt}`}
        >
          <View style={styles.scanHeader}>
            <Text variant="titleMedium" style={styles.scanTitle} numberOfLines={1}>
              {title}
            </Text>
            <Chip
              compact
              style={[styles.statusChip, { backgroundColor: statusDescriptor.backgroundColor }]}
              textStyle={{ color: statusDescriptor.textColor }}
              accessibilityLabel={`Status ${statusDescriptor.label}`}
            >
              {statusDescriptor.label}
            </Chip>
          </View>
          <Text variant="bodyMedium" style={[styles.scanDescription, { color: theme.colors.onSurfaceVariant }]}
            numberOfLines={2}
          >
            {detail}
          </Text>
          <View style={styles.scanFooter}>
            <MaterialIcons
              name="schedule"
              size={16}
              color={theme.colors.onSurfaceVariant}
              accessibilityElementsHidden
            />
            <Text variant="bodySmall" style={[styles.scanFooterText, { color: theme.colors.onSurfaceVariant }]}
              numberOfLines={1}
            >
              Created {createdAt}
            </Text>
            {processedAt ? (
              <Text
                variant="bodySmall"
                style={[styles.scanFooterText, { color: theme.colors.onSurfaceVariant }]}
                numberOfLines={1}
              >
                • Processed {processedAt}
              </Text>
            ) : null}
          </View>
        </Surface>
      );
    },
    [theme.colors],
  );

  const renderSeparator = React.useCallback(() => <View style={styles.listSeparator} />, []);

  const listEmptyComponent = React.useMemo(() => {
    if (scansLoading) {
      return (
        <View style={styles.skeletonContainer}>
          {[0, 1, 2].map((key) => (
            <SkeletonScanItem key={`skeleton-${key}`} />
          ))}
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <MaterialIcons
          name="inventory"
          size={36}
          color={theme.colors.onSurfaceVariant}
          accessibilityElementsHidden
        />
        <Text variant="titleMedium">No scans yet</Text>
        <Text variant="bodyMedium" style={[styles.emptySubtitle, { color: theme.colors.onSurfaceVariant }]}
          numberOfLines={2}
          accessibilityRole="text"
        >
          Start a new scan to see it appear here.
        </Text>
      </View>
    );
  }, [scansLoading, theme.colors.onSurfaceVariant]);

  const listHeader = React.useMemo(() => {
    return (
      <View style={styles.header}>
        {activeAlert ? <AlertBanner alert={activeAlert} onDismiss={dismissAlert} /> : null}
        <View style={styles.greetingRow}>
          <View style={styles.greetingTextContainer}>
            <Text variant="headlineSmall" numberOfLines={1}>
              {greeting}, {displayName}
            </Text>
            <Text variant="bodyMedium" style={{ color: theme.colors.onSurfaceVariant }}>
              Here's the latest on your scans.
            </Text>
          </View>
          <View
            style={[styles.reputationBadge, { backgroundColor: reputationDescriptor.backgroundColor }]}
            accessible
            accessibilityRole="text"
            accessibilityLabel={reputationAccessibilityLabel}
          >
            <MaterialIcons
              name={reputationDescriptor.icon}
              size={18}
              color={reputationDescriptor.textColor}
              accessibilityElementsHidden
            />
            <Text variant="labelLarge" style={{ color: reputationDescriptor.textColor }}>
              {reputationDescriptor.label}
            </Text>
            {typeof reputationScore === 'number' ? (
              <Text variant="labelLarge" style={{ color: reputationDescriptor.textColor }}>
                {Math.round(reputationScore)}
              </Text>
            ) : null}
          </View>
        </View>
        {errorMessages.map((message, index) => (
          <Surface
            key={`error-${index}`}
            elevation={1}
            style={[styles.errorCard, { backgroundColor: theme.colors.errorContainer }]}
            accessibilityRole="alert"
          >
            <MaterialIcons
              name="error-outline"
              size={20}
              color={theme.colors.onErrorContainer}
              accessibilityElementsHidden
            />
            <Text variant="bodyMedium" style={{ color: theme.colors.onErrorContainer, flex: 1 }}>
              {message}
            </Text>
          </Surface>
        ))}
        <View style={styles.statsRow}>
          <StatsCard
            label="Total scans"
            value={formatNumber(stats.totalScans)}
            loading={statsLoading}
            style={styles.statsCard}
            accessibilityHint="Total number of scans you've performed"
            icon={<MaterialIcons name="qr-code" size={24} color={statsIconColor} />}
          />
          <StatsCard
            label="Fraud detected"
            value={formatNumber(stats.fraudDetected)}
            loading={statsLoading}
            style={styles.statsCard}
            accessibilityHint="High-risk scans that were flagged"
            icon={<MaterialIcons name="warning" size={24} color={statsIconColor} />}
          />
          <StatsCard
            label="Money saved"
            value={formatCurrency(stats.moneySaved)}
            loading={statsLoading}
            style={styles.statsCard}
            accessibilityHint="Estimated value protected by blocking fraud"
            icon={<MaterialIcons name="savings" size={24} color={statsIconColor} />}
          />
        </View>
        <Text variant="titleMedium" style={styles.sectionHeading}>
          Recent scans
        </Text>
      </View>
    );
  }, [
    activeAlert,
    displayName,
    dismissAlert,
    errorMessages,
    greeting,
    reputationAccessibilityLabel,
    reputationDescriptor.backgroundColor,
    reputationDescriptor.icon,
    reputationDescriptor.label,
    reputationDescriptor.textColor,
    reputationScore,
    stats.fraudDetected,
    stats.moneySaved,
    stats.totalScans,
    statsLoading,
    statsIconColor,
    theme.colors.errorContainer,
    theme.colors.onErrorContainer,
    theme.colors.onSurfaceVariant,
  ]);

  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'bottom']}>
        <FlatList
          data={scans}
          keyExtractor={(item) => item.id}
          renderItem={renderScanItem}
          ItemSeparatorComponent={renderSeparator}
          contentContainerStyle={styles.listContent}
          ListHeaderComponent={listHeader}
          ListEmptyComponent={listEmptyComponent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.primary}
              colors={[theme.colors.primary]}
            />
          }
          showsVerticalScrollIndicator={false}
        />
        <FAB
          mode="elevated"
          icon={({ color, size }) => <MaterialIcons name="qr-code-scanner" color={color} size={size} />}
          style={[styles.fab, { bottom: insets.bottom + 24 }]}
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
  listContent: {
    padding: 24,
    paddingBottom: 140,
    gap: 16,
  },
  listSeparator: {
    height: 16,
  },
  header: {
    gap: 20,
    marginBottom: 12,
  },
  greetingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 16,
  },
  greetingTextContainer: {
    flex: 1,
    gap: 6,
  },
  reputationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    alignSelf: 'flex-start',
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  statsCard: {
    minWidth: 160,
  },
  sectionHeading: {
    marginTop: 4,
  },
  scanCard: {
    borderRadius: 18,
    padding: 16,
    gap: 10,
  },
  scanHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  scanTitle: {
    flex: 1,
  },
  statusChip: {
    alignSelf: 'flex-start',
    height: 28,
  },
  scanDescription: {
    lineHeight: 20,
  },
  scanFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  scanFooterText: {
    flexShrink: 1,
  },
  emptyState: {
    alignItems: 'center',
    gap: 12,
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  emptySubtitle: {
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    right: 24,
  },
  skeletonContainer: {
    gap: 16,
  },
  skeletonBlock: {
    height: 14,
    borderRadius: 12,
  },
  alertBanner: {
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  alertContent: {
    flex: 1,
    gap: 4,
  },
  alertTitle: {
    fontWeight: '600',
  },
  alertDismiss: {
    margin: -8,
  },
  errorCard: {
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
});
