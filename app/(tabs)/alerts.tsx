import React from 'react';
import { ActivityIndicator, Button, Chip, Text, useTheme } from 'react-native-paper';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useInfiniteQuery, useQueryClient, type InfiniteData } from '@tanstack/react-query';

import { ThemedView } from '../../components/Themed';
import { AlertCard } from '../../components/AlertCard';
import { AlertDetailsModal } from '../../components/AlertDetailsModal';
import { supabase, type FraudAlert } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useAlertStore, type AlertWithRead } from '../../contexts/AlertStoreContext';
import { useAlertsRealtime } from '../../hooks/useAlerts';

const PAGE_SIZE = 20;
const FILTER_OPTIONS = ['all', 'critical', 'high', 'medium', 'low'] as const;
type FilterOption = (typeof FILTER_OPTIONS)[number];

const FILTER_LABELS: Record<FilterOption, string> = {
  all: 'All',
  critical: 'Critical',
  high: 'High',
  medium: 'Medium',
  low: 'Low',
};

const MAX_ALERT_CACHE = PAGE_SIZE * 5;

type AlertsPageResult = {
  alerts: FraudAlert[];
  nextCursor: number | null;
};

async function fetchAlertsPage(userId: string, offset: number): Promise<AlertsPageResult> {
  const start = Math.max(0, offset);
  const end = start + PAGE_SIZE - 1;
  const { data, error } = await supabase
    .from('fraud_alerts')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .range(start, end);

  if (error) {
    throw new Error(error.message);
  }

  const alerts = (data ?? []) as FraudAlert[];
  const nextCursor = alerts.length === PAGE_SIZE ? end + 1 : null;

  return {
    alerts,
    nextCursor,
  };
}

function mergeAlertIntoCache(
  existing: InfiniteData<AlertsPageResult, number> | undefined,
  alert: FraudAlert,
): InfiniteData<AlertsPageResult, number> {
  const all = existing?.pages.flatMap((page) => page.alerts) ?? [];
  const mergedMap = new Map<string, FraudAlert>();

  all.forEach((item) => {
    mergedMap.set(item.id, item);
  });
  mergedMap.set(alert.id, alert);

  const merged = Array.from(mergedMap.values()).sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );
  const limited = merged.slice(0, MAX_ALERT_CACHE);

  const pages: AlertsPageResult[] = [];
  const pageParams: number[] = [];

  for (let offsetIndex = 0; offsetIndex < limited.length; offsetIndex += PAGE_SIZE) {
    const slice = limited.slice(offsetIndex, offsetIndex + PAGE_SIZE);
    const nextCursor = slice.length === PAGE_SIZE ? offsetIndex + PAGE_SIZE : null;
    pages.push({ alerts: slice, nextCursor });
    pageParams.push(offsetIndex);
  }

  if (pages.length === 0) {
    pages.push({ alerts: [], nextCursor: null });
    pageParams.push(0);
  }

  return {
    pages,
    pageParams,
  };
}

export default function AlertsScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const router = useRouter();
  const queryClient = useQueryClient();
  const localSearchParams = useLocalSearchParams<{ alertId?: string | string[] }>();
  const alertIdParam = React.useMemo(() => {
    const raw = localSearchParams.alertId;
    if (!raw) {
      return null;
    }
    if (Array.isArray(raw)) {
      return raw[0] ?? null;
    }
    return raw;
  }, [localSearchParams.alertId]);

  const { alerts, replaceAlerts, upsertAlert, markAlertRead } = useAlertStore();

  const handleRealtimeAlert = React.useCallback(
    (record: FraudAlert) => {
      if (!userId) {
        return;
      }
      queryClient.setQueryData<InfiniteData<AlertsPageResult, number>>(
        ['fraudAlerts', userId],
        (existing) => mergeAlertIntoCache(existing, record),
      );
    },
    [queryClient, userId],
  );

  useAlertsRealtime({ onAlert: handleRealtimeAlert });

  const [filter, setFilter] = React.useState<FilterOption>('all');
  const [selectedAlert, setSelectedAlert] = React.useState<AlertWithRead | null>(null);

  const filteredAlerts = React.useMemo(() => {
    if (filter === 'all') {
      return alerts;
    }
    return alerts.filter((alert) => alert.severity === filter);
  }, [alerts, filter]);

  React.useEffect(() => {
    setSelectedAlert(null);
  }, [userId]);

  const {
    data,
    error,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
    isPending,
    isRefetching,
    refetch,
  } = useInfiniteQuery({
    queryKey: ['fraudAlerts', userId],
    enabled: Boolean(userId),
    initialPageParam: 0,
    queryFn: ({ pageParam }) => {
      if (!userId) {
        return Promise.resolve({ alerts: [], nextCursor: null });
      }
      return fetchAlertsPage(userId, pageParam as number);
    },
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
  });

  const alertsFromQuery = React.useMemo(() => {
    if (!data?.pages) {
      return [] as FraudAlert[];
    }
    return data.pages.flatMap((page) => page.alerts);
  }, [data]);

  const initializing = isPending && alertsFromQuery.length === 0;
  const refreshing = isRefetching;
  const fetchingMore = isFetchingNextPage;
  const errorMessage = error instanceof Error ? error.message : null;

  React.useEffect(() => {
    if (!userId) {
      replaceAlerts([]);
      return;
    }
    if (!data) {
      return;
    }
    replaceAlerts(alertsFromQuery);
  }, [alertsFromQuery, data, replaceAlerts, userId]);

  React.useEffect(() => {
    if (!alertIdParam) {
      return;
    }

    const targetId = alertIdParam;

    const clearParam = () => {
      try {
        router.setParams({ alertId: undefined });
      } catch (error) {
        if (__DEV__) {
          console.warn('Failed to clear alertId search param', error);
        }
      }
    };

    const existing = alerts.find((alert) => alert.id === targetId);
    if (existing) {
      setSelectedAlert(existing);
      clearParam();
      return;
    }

    if (!userId) {
      clearParam();
      return;
    }

    let cancelled = false;

    supabase
      .from('fraud_alerts')
      .select('*')
      .eq('id', targetId)
      .eq('user_id', userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) {
          return;
        }

        if (error) {
          if (__DEV__) {
            console.warn('Failed to fetch alert by id', error);
          }
          return;
        }

        if (data) {
          const record = data as FraudAlert;
          upsertAlert(record);
          queryClient.setQueryData<InfiniteData<AlertsPageResult, number>>(
            ['fraudAlerts', userId],
            (existing) => mergeAlertIntoCache(existing, record),
          );
          setSelectedAlert({ ...record, read: false });
        }
      })
      .finally(() => {
        if (!cancelled) {
          clearParam();
        }
      });

    return () => {
      cancelled = true;
    };
  }, [alertIdParam, alerts, queryClient, router, upsertAlert, userId]);

  const handleRefresh = React.useCallback(() => {
    if (!userId) {
      replaceAlerts([]);
      return;
    }

    refetch({ throwOnError: false }).catch(() => undefined);
  }, [refetch, replaceAlerts, userId]);

  const handleEndReached = React.useCallback(() => {
    if (!userId || !hasNextPage || fetchingMore || initializing || refreshing) {
      return;
    }

    fetchNextPage().catch(() => undefined);
  }, [userId, hasNextPage, fetchingMore, initializing, refreshing, fetchNextPage]);

  const handleSelectAlert = React.useCallback((alertItem: AlertWithRead) => {
    setSelectedAlert(alertItem);
  }, []);

  const handleMarkRead = React.useCallback(
    (alertId: string) => {
      markAlertRead(alertId);
      setSelectedAlert((current) => (current && current.id === alertId ? { ...current, read: true } : current));
    },
    [markAlertRead],
  );

  const renderItem = React.useCallback(
    ({ item }: { item: AlertWithRead }) => <AlertCard alert={item} onPress={handleSelectAlert} />,
    [handleSelectAlert],
  );

  const keyExtractor = React.useCallback((item: AlertWithRead) => item.id, []);

  const headerComponent = React.useMemo(() => {
    return (
      <View style={styles.filterContainer}>
        <View style={styles.filterRow}>
          {FILTER_OPTIONS.map((option) => {
            const isSelected = filter === option;
            return (
              <Chip
                key={option}
                mode={isSelected ? 'flat' : 'outlined'}
                selected={isSelected}
                onPress={() => setFilter(option)}
                accessibilityRole="button"
                accessibilityLabel={`${FILTER_LABELS[option]} alerts`}
                style={[
                  styles.filterChip,
                  isSelected ? { backgroundColor: theme.colors.primary } : null,
                ]}
                textStyle={{
                  color: isSelected ? theme.colors.onPrimary : theme.colors.onSurface,
                  fontWeight: isSelected ? '600' : '400',
                }}
              >
                {FILTER_LABELS[option]}
              </Chip>
            );
          })}
        </View>
        {errorMessage && !refreshing && !initializing ? (
          <Text style={[styles.errorText, { color: theme.colors.error }]} accessibilityLiveRegion="polite">
            {errorMessage}
          </Text>
        ) : null}
      </View>
    );
  }, [filter, theme.colors.primary, theme.colors.onPrimary, theme.colors.onSurface, theme.colors.error, errorMessage, refreshing, initializing]);

  const listEmptyComponent = React.useMemo(() => {
    if (initializing) {
      return null;
    }

    return (
      <View style={styles.emptyState}>
        <Text style={{ color: theme.colors.onSurfaceVariant, textAlign: 'center' }}>
          {errorMessage ? 'We could not load your alerts.' : 'You are all caught up. No alerts found.'}
        </Text>
        {errorMessage ? (
          <Button mode="outlined" style={styles.retryButton} onPress={handleRefresh} accessibilityLabel="Retry loading alerts">
            Retry
          </Button>
        ) : null}
      </View>
    );
  }, [initializing, theme.colors.onSurfaceVariant, errorMessage, handleRefresh]);

  if (!userId) {
    return (
      <ThemedView style={styles.centered}>
        <Text>You need to be signed in to view alerts.</Text>
      </ThemedView>
    );
  }

  if (initializing && !refreshing) {
    return (
      <ThemedView style={styles.centered}>
        <ActivityIndicator animating size="large" />
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlatList
          data={filteredAlerts}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          ListFooterComponent={fetchingMore ? <ActivityIndicator animating size="small" style={styles.footerLoader} /> : null}
          ListHeaderComponent={headerComponent}
          ListEmptyComponent={listEmptyComponent}
          refreshing={refreshing}
          onRefresh={handleRefresh}
          onEndReachedThreshold={0.4}
          onEndReached={handleEndReached}
          accessibilityRole="list"
        />
        <AlertDetailsModal
          alert={selectedAlert}
          visible={Boolean(selectedAlert)}
          onDismiss={() => setSelectedAlert(null)}
          onMarkRead={handleMarkRead}
        />
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    paddingTop: 16,
  },
  separator: {
    height: 16,
  },
  footerLoader: {
    marginVertical: 16,
  },
  filterContainer: {
    gap: 12,
    marginBottom: 16,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  filterChip: {
    minWidth: 80,
  },
  errorText: {
    fontSize: 13,
    textAlign: 'left',
  },
  emptyState: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    paddingVertical: 48,
  },
  retryButton: {
    marginTop: 8,
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
});
