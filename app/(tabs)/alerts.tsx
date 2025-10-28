import React from 'react';
import { ActivityIndicator, Button, Chip, Text, useTheme } from 'react-native-paper';
import { FlatList, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { ThemedView } from '../../components/Themed';
import { AlertCard } from '../../components/AlertCard';
import { AlertDetailsModal } from '../../components/AlertDetailsModal';
import { supabase, type FraudAlert } from '../../lib/supabase';
import { useAuth } from '../../hooks/useAuth';
import { useAlertStore, type AlertWithRead } from '../../contexts/AlertStoreContext';

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

export default function AlertsScreen() {
  const theme = useTheme();
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;
  const router = useRouter();
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

  const { alerts, replaceAlerts, appendAlerts, upsertAlert, markAlertRead } = useAlertStore();

  const [filter, setFilter] = React.useState<FilterOption>('all');
  const [initializing, setInitializing] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [fetchingMore, setFetchingMore] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(true);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [selectedAlert, setSelectedAlert] = React.useState<AlertWithRead | null>(null);

  const filteredAlerts = React.useMemo(() => {
    if (filter === 'all') {
      return alerts;
    }
    return alerts.filter((alert) => alert.severity === filter);
  }, [alerts, filter]);

  const fetchRange = React.useCallback(
    async (start: number, end: number) => {
      if (!userId) {
        return [] as FraudAlert[];
      }

      const { data, error } = await supabase
        .from('fraud_alerts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .range(start, end);

      if (error) {
        throw new Error(error.message);
      }

      return (data ?? []) as FraudAlert[];
    },
    [userId],
  );

  React.useEffect(() => {
    setSelectedAlert(null);
    setHasMore(true);
    setErrorMessage(null);
  }, [userId]);

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
          upsertAlert(data as FraudAlert);
          setSelectedAlert({ ...(data as FraudAlert), read: false });
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
  }, [alertIdParam, alerts, router, upsertAlert, userId]);

  React.useEffect(() => {
    let cancelled = false;

    if (!userId) {
      setInitializing(false);
      return () => {
        cancelled = true;
      };
    }

    setInitializing(true);
    setErrorMessage(null);

    fetchRange(0, PAGE_SIZE - 1)
      .then((data) => {
        if (cancelled) return;
        replaceAlerts(data);
        setHasMore(data.length === PAGE_SIZE);
      })
      .catch((error) => {
        if (cancelled) return;
        setErrorMessage(error instanceof Error ? error.message : 'Unable to load alerts.');
      })
      .finally(() => {
        if (!cancelled) {
          setInitializing(false);
          setRefreshing(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [userId, fetchRange, replaceAlerts]);

  const handleRefresh = React.useCallback(async () => {
    if (!userId) {
      return;
    }

    setRefreshing(true);
    setErrorMessage(null);

    try {
      const data = await fetchRange(0, PAGE_SIZE - 1);
      replaceAlerts(data);
      setHasMore(data.length === PAGE_SIZE);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to refresh alerts.');
    } finally {
      setRefreshing(false);
    }
  }, [userId, fetchRange, replaceAlerts]);

  const handleEndReached = React.useCallback(async () => {
    if (!userId || fetchingMore || initializing || refreshing || !hasMore) {
      return;
    }

    setFetchingMore(true);

    try {
      const start = alerts.length;
      const data = await fetchRange(start, start + PAGE_SIZE - 1);
      appendAlerts(data);
      if (data.length < PAGE_SIZE) {
        setHasMore(false);
      }
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Unable to load more alerts.');
    } finally {
      setFetchingMore(false);
    }
  }, [userId, fetchingMore, initializing, refreshing, hasMore, alerts.length, fetchRange, appendAlerts]);

  React.useEffect(() => {
    if (!userId) {
      return;
    }

    const channel = supabase
      .channel(`fraud_alerts:user:${userId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'fraud_alerts', filter: `user_id=eq.${userId}` },
        (payload) => {
          const record = payload.new as FraudAlert | null;
          if (record) {
            upsertAlert(record);
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'fraud_alerts', filter: `user_id=eq.${userId}` },
        (payload) => {
          const record = payload.new as FraudAlert | null;
          if (record) {
            upsertAlert(record);
          }
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId, upsertAlert]);

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
