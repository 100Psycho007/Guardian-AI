import React from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Surface, Text, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';

import { ThemedView } from '../../../components/Themed';
import { loadStoredResults, StoredScanResult } from '../../../lib/scanQueue';

function formatTimestamp(value: number) {
  try {
    return new Date(value).toLocaleString();
  } catch (_error) {
    return new Date(value).toString();
  }
}

function getRiskLevel(response: Record<string, unknown> | undefined) {
  if (!response) return 'unknown';
  return (
    (response.risk_level as string) ||
    (response.riskLevel as string) ||
    (response.risk as Record<string, unknown>)?.level ||
    'unknown'
  );
}

function getStatus(response: Record<string, unknown> | undefined) {
  if (!response) return 'pending';
  return (response.status as string) || 'pending';
}

function getSummary(response: Record<string, unknown> | undefined) {
  if (!response) return 'UPI details pending';
  const upiDetails = response.upi_details as Record<string, unknown> | undefined;
  if (!upiDetails) return 'UPI details pending';
  return (
    (upiDetails.upiId as string) ||
    (upiDetails.upi_id as string) ||
    (upiDetails.payee as string) ||
    (upiDetails.name as string) ||
    'UPI details pending'
  );
}

export default function ScanHistoryScreen() {
  const theme = useTheme();
  const router = useRouter();
  const [results, setResults] = React.useState<StoredScanResult[]>([]);
  const [refreshing, setRefreshing] = React.useState(false);

  const loadResults = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const items = await loadStoredResults();
      setResults(items);
    } finally {
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(
    React.useCallback(() => {
      loadResults().catch((error) => {
        if (__DEV__) {
          console.warn('Failed to load scan history', error);
        }
      });
    }, [loadResults]),
  );

  const renderItem = React.useCallback(
    ({ item }: { item: StoredScanResult }) => {
      const response = (item.response ?? undefined) as Record<string, unknown> | undefined;
      const riskLevel = getRiskLevel(response);
      const status = getStatus(response);
      const summary = getSummary(response);

      return (
        <Pressable
          accessibilityRole="button"
          onPress={() =>
            router.push({ pathname: '/(tabs)/scan/result/[id]', params: { id: item.id } })
          }
          style={({ pressed }) => [styles.cardPressable, pressed && styles.cardPressed]}
        >
          <Surface elevation={1} style={styles.card}>
            <Text variant="titleMedium" numberOfLines={1} style={styles.cardTitle}>
              {summary}
            </Text>
            <Text variant="bodySmall" style={styles.cardSubtitle}>
              Processed {formatTimestamp(item.processedAt)} • Status: {status}
            </Text>
            <View style={styles.cardFooter}>
              <Text variant="labelLarge" style={[styles.pill, { color: theme.colors.primary }]}>
                Risk: {riskLevel}
              </Text>
              <Text variant="bodySmall" style={styles.muted}>
                Storage path: {item.storagePath}
              </Text>
            </View>
          </Surface>
        </Pressable>
      );
    },
    [router, theme.colors.primary],
  );

  return (
    <ThemedView style={styles.container}>
      <FlatList
        data={results}
        keyExtractor={(item) => item.id}
        contentContainerStyle={[styles.listContent, results.length === 0 && styles.emptyList]}
        renderItem={renderItem}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={loadResults} />}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text variant="headlineSmall" style={styles.emptyTitle}>
              No scans yet
            </Text>
            <Text style={styles.emptySubtitle}>
              Your processed scans will appear here after capturing them from the Scan tab.
            </Text>
          </View>
        }
      />
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    padding: 20,
    gap: 16,
  },
  emptyList: {
    flex: 1,
    justifyContent: 'center',
  },
  cardPressable: {
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardPressed: {
    opacity: 0.94,
  },
  card: {
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  cardTitle: {
    fontWeight: '600',
  },
  cardSubtitle: {
    opacity: 0.7,
  },
  cardFooter: {
    marginTop: 4,
    gap: 6,
  },
  pill: {
    fontWeight: '600',
  },
  muted: {
    opacity: 0.6,
  },
  emptyState: {
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 8,
  },
  emptyTitle: {
    textAlign: 'center',
  },
  emptySubtitle: {
    textAlign: 'center',
    opacity: 0.7,
  },
});
