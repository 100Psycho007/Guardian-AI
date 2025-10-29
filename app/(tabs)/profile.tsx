import React from 'react';
import {
  FlatList,
  Linking,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useRouter } from 'expo-router';
import {
  Button,
  Chip,
  List,
  ProgressBar,
  Searchbar,
  Snackbar,
  Surface,
  Switch,
  Text,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedView } from '../../components/Themed';
import { useAuth } from '../../hooks/useAuth';
import { useNotificationPreferences } from '../../contexts/NotificationPreferencesContext';
import { useThemeController } from '../../contexts/ThemeContext';
import { fetchProfileById, listScansForUser, type Profile as SupabaseProfile, type Scan, type ScanStatus } from '../../lib/supabase';
import { parseScanStats, type ProfileStats } from '../../lib/scanStats';

const STATUS_FILTERS: Array<{ label: string; value: 'all' | ScanStatus }> = [
  { label: 'All', value: 'all' },
  { label: 'Completed', value: 'complete' },
  { label: 'Processing', value: 'processing' },
  { label: 'Pending', value: 'pending' },
  { label: 'Failed', value: 'failed' },
];

const HELP_LINK = 'https://striide.ai/help';
const ABOUT_LINK = 'https://striide.ai/about';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function getString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }
  return null;
}

function getNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max);
}


function formatDateTime(value: string) {
  try {
    return new Date(value).toLocaleString();
  } catch (_error) {
    return value;
  }
}

function getInitials(name: string | null | undefined, fallback: string | null | undefined) {
  const source = (name ?? fallback ?? '').trim();
  if (!source) {
    return 'U';
  }

  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) {
    return parts[0].slice(0, 2).toUpperCase();
  }

  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function capitalize(value: string) {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function extractMetadataField(metadata: unknown, keys: string[]): string | null {
  if (!isRecord(metadata)) return null;
  for (const key of keys) {
    const value = metadata[key];
    const str = getString(value);
    if (str) {
      return str;
    }
  }
  return null;
}

function getNestedRecord(metadata: unknown, key: string): Record<string, unknown> | null {
  if (!isRecord(metadata)) return null;
  const value = metadata[key];
  if (isRecord(value)) {
    return value;
  }
  return null;
}

function getScanTitle(scan: Scan) {
  const metadata = scan.metadata;
  const nestedDetails = getNestedRecord(metadata, 'upi_details') ?? getNestedRecord(metadata, 'upiDetails');

  const candidates = [
    extractMetadataField(metadata, ['summary', 'title', 'description', 'label', 'name']),
    extractMetadataField(nestedDetails, ['payeeName', 'payerName', 'upiId', 'upi_id']),
    extractMetadataField(metadata, ['payee', 'merchant', 'accountName', 'account_name']),
  ].filter(Boolean) as string[];

  if (candidates.length > 0) {
    return candidates[0];
  }

  if (scan.storage_path) {
    const parts = scan.storage_path.split('/');
    const last = parts[parts.length - 1];
    if (last) {
      return last;
    }
  }

  return `Scan ${formatDateTime(scan.created_at)}`;
}

function getRiskLabel(metadata: Scan['metadata']): string | null {
  if (!metadata) return null;
  if (isRecord(metadata)) {
    const risk = getString(metadata.riskLevel ?? metadata.risk_level ?? metadata.risk);
    if (risk) {
      return capitalize(risk.toLowerCase());
    }
    const nestedRisk = getNestedRecord(metadata, 'risk') ?? getNestedRecord(metadata, 'assessment');
    if (nestedRisk) {
      const riskLevel = getString(nestedRisk.riskLevel ?? nestedRisk.risk_level);
      if (riskLevel) {
        return capitalize(riskLevel.toLowerCase());
      }
    }
  }
  return null;
}

function formatStatus(status: ScanStatus) {
  switch (status) {
    case 'complete':
      return 'Completed';
    case 'failed':
      return 'Failed';
    case 'pending':
      return 'Pending';
    case 'processing':
      return 'Processing';
    default:
      return capitalize(status);
  }
}

type LoadOptions = {
  showLoading?: boolean;
};

type ScanListItem = Scan;

type ToggleKey = 'biometric' | 'push' | 'theme' | null;

export default function ProfileScreen() {
  const theme = useTheme();
  const router = useRouter();
  const { session, signOut, biometricAvailable, isBiometricEnabled, setBiometricPreference } = useAuth();
  const { pushEnabled, updating: pushUpdating, isLoading: pushLoading, setPushEnabled } = useNotificationPreferences();
  const { setDarkMode, preference: themePreference, isUsingSystem } = useThemeController();

  const userId = session?.user?.id ?? null;
  const email = session?.user?.email ?? null;
  const fullName =
    (session?.user?.user_metadata && getString((session.user.user_metadata as Record<string, unknown>).full_name)) ?? null;

  const [profile, setProfile] = React.useState<SupabaseProfile | null>(null);
  const [scans, setScans] = React.useState<ScanListItem[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);
  const [searchQuery, setSearchQuery] = React.useState('');
  const [statusFilter, setStatusFilter] = React.useState<'all' | ScanStatus>('all');
  const [snackbarMessage, setSnackbarMessage] = React.useState<string | null>(null);
  const [signOutLoading, setSignOutLoading] = React.useState(false);
  const [pendingToggle, setPendingToggle] = React.useState<ToggleKey>(null);

  const stats = React.useMemo(() => parseScanStats(profile?.scan_stats ?? null), [profile?.scan_stats]);
  const isDarkPreferred = themePreference === 'dark';

  const loadData = React.useCallback(
    async ({ showLoading = true }: LoadOptions = {}) => {
      if (!userId) {
        setProfile(null);
        setScans([]);
        setLoading(false);
        setRefreshing(false);
        return;
      }

      if (showLoading) {
        setLoading(true);
      }
      setErrorMessage(null);

      try {
        const [profileResult, scansResult] = await Promise.all([
          fetchProfileById(userId),
          listScansForUser(userId),
        ]);

        if (profileResult.error) {
          throw profileResult.error;
        }

        if (scansResult.error) {
          throw scansResult.error;
        }

        const profileData = (profileResult.data ?? null) as SupabaseProfile | null;
        const scanData = (scansResult.data ?? []) as ScanListItem[];
        setProfile(profileData);
        setScans(scanData);
        setErrorMessage(null);
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to load your profile right now. Please try again later.';
        setErrorMessage(message);
        setSnackbarMessage(message);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId],
  );

  useFocusEffect(
    React.useCallback(() => {
      loadData().catch((error) => {
        if (__DEV__) {
          console.warn('Failed to load profile data', error);
        }
      });
    }, [loadData]),
  );

  const handleRefresh = React.useCallback(() => {
    setRefreshing(true);
    loadData({ showLoading: false }).catch((error) => {
      if (__DEV__) {
        console.warn('Refresh failed', error);
      }
    });
  }, [loadData]);

  const filteredScans = React.useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    return scans.filter((scan) => {
      if (statusFilter !== 'all' && scan.status !== statusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      const haystack = [
        scan.id,
        scan.storage_path,
        getScanTitle(scan),
        JSON.stringify(scan.metadata ?? {}),
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [scans, searchQuery, statusFilter]);

  const handlePushToggle = React.useCallback(async () => {
    if (pushLoading) {
      return;
    }

    setPendingToggle('push');
    try {
      const result = await setPushEnabled(!pushEnabled);
      if (result.error) {
        setSnackbarMessage(result.error);
      } else {
        setSnackbarMessage(
          !pushEnabled ? 'Push notifications enabled. We will keep you informed of new alerts.' : 'Push notifications disabled.',
        );
      }
    } finally {
      setPendingToggle((current) => (current === 'push' ? null : current));
    }
  }, [pushLoading, pushEnabled, setPushEnabled]);

  const handleBiometricToggle = React.useCallback(async () => {
    if (!biometricAvailable) {
      setSnackbarMessage('Biometric authentication is not available on this device.');
      return;
    }

    setPendingToggle('biometric');
    try {
      const result = await setBiometricPreference(!isBiometricEnabled);
      if (result.error) {
        setSnackbarMessage(result.error);
      } else {
        setSnackbarMessage(
          !isBiometricEnabled ? 'Biometric login enabled for this device.' : 'Biometric login disabled.',
        );
      }
    } finally {
      setPendingToggle((current) => (current === 'biometric' ? null : current));
    }
  }, [biometricAvailable, isBiometricEnabled, setBiometricPreference]);

  const handleThemeToggle = React.useCallback(async () => {
    setPendingToggle('theme');
    try {
      const result = await setDarkMode(!isDarkPreferred);
      if (result.error) {
        setSnackbarMessage(result.error);
      } else {
        setSnackbarMessage(!isDarkPreferred ? 'Dark mode enabled.' : 'Dark mode disabled.');
      }
    } finally {
      setPendingToggle((current) => (current === 'theme' ? null : current));
    }
  }, [isDarkPreferred, setDarkMode]);

  const handleSignOut = React.useCallback(async () => {
    setSignOutLoading(true);
    try {
      await signOut();
      router.replace('/(auth)/sign-in');
    } catch (error) {
      if (__DEV__) {
        console.warn('Error signing out', error);
      }
      setSnackbarMessage('Unable to sign out right now. Please try again.');
    } finally {
      setSignOutLoading(false);
    }
  }, [router, signOut]);

  const handleOpenLink = React.useCallback((url: string) => {
    Linking.openURL(url).catch((error) => {
      if (__DEV__) {
        console.warn('Failed to open link', error);
      }
      setSnackbarMessage('Unable to open link. Please try again later.');
    });
  }, []);

  const handleDismissSnackbar = React.useCallback(() => {
    setSnackbarMessage(null);
  }, []);

  const hasData = Boolean(profile) || scans.length > 0;

  const loadingContent = loading && !refreshing && !hasData;
  const showErrorFallback = !loadingContent && !hasData && errorMessage;

  const headerComponent = React.useMemo(() => {
    const appliedTheme = theme;
    const displayName = profile?.full_name ?? fullName ?? email ?? 'User';
    const initials = getInitials(profile?.full_name ?? fullName, email);

    return (
      <View style={styles.headerContainer}>
        <Surface style={styles.profileCard} elevation={2}>
          <View style={styles.profileRow}>
            <View
              style={[styles.avatar, { backgroundColor: appliedTheme.colors.primaryContainer }]}
              accessible
              accessibilityRole="image"
              accessibilityLabel={`Profile avatar, ${initials}`}
            >
              <Text variant="titleLarge" style={[styles.avatarText, { color: appliedTheme.colors.onPrimaryContainer }]}>
                {initials}
              </Text>
            </View>
            <View style={styles.profileInfo}>
              <Text variant="titleLarge" accessibilityRole="header">
                {displayName}
              </Text>
              {email ? (
                <Text variant="bodyMedium" style={{ color: appliedTheme.colors.onSurfaceVariant }}>
                  {email}
                </Text>
              ) : null}
            </View>
          </View>

          <View style={styles.reputationSection}>
            <View style={styles.reputationHeader}>
              <Text variant="titleSmall">Reputation score</Text>
              <Text variant="titleSmall">{stats.reputation}%</Text>
            </View>
            <ProgressBar
              progress={stats.reputation / 100}
              color={appliedTheme.colors.primary}
              style={styles.progressBar}
              accessibilityRole="progressbar"
              accessibilityValue={{ min: 0, max: 100, now: stats.reputation }}
            />
          </View>
        </Surface>

        <View style={styles.section}>
          <Text variant="titleMedium">Performance</Text>
          <View style={styles.statsGrid}>
            <Surface style={styles.statCard} elevation={1}>
              <Text variant="headlineSmall">{stats.totalScans}</Text>
              <Text variant="bodySmall" style={styles.statLabel}>
                Total scans
              </Text>
            </Surface>
            <Surface style={styles.statCard} elevation={1}>
              <Text variant="headlineSmall">{stats.accuracyRate}%</Text>
              <Text variant="bodySmall" style={styles.statLabel}>
                Accuracy rate
              </Text>
            </Surface>
            <Surface style={styles.statCard} elevation={1}>
              <Text variant="headlineSmall">{stats.streak}</Text>
              <Text variant="bodySmall" style={styles.statLabel}>
                Day streak
              </Text>
            </Surface>
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="titleMedium">Settings</Text>
          <Surface style={styles.sectionCard} elevation={1}>
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text variant="titleSmall">Push notifications</Text>
                <Text variant="bodySmall" style={styles.settingDescription}>
                  Receive instant alerts about suspicious activity.
                </Text>
              </View>
              <Switch
                value={pushEnabled}
                disabled={pushLoading || pushUpdating || pendingToggle === 'push'}
                onValueChange={handlePushToggle}
                accessibilityLabel={pushEnabled ? 'Disable push notifications' : 'Enable push notifications'}
              />
            </View>

            <View style={[styles.sectionDivider, { backgroundColor: appliedTheme.colors.outlineVariant }]} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text variant="titleSmall">Biometric login</Text>
                <Text variant="bodySmall" style={styles.settingDescription}>
                  {biometricAvailable
                    ? 'Use Face ID or Touch ID for quicker access.'
                    : 'Biometric authentication is not available on this device.'}
                </Text>
              </View>
              <Switch
                value={biometricAvailable && isBiometricEnabled}
                disabled={!biometricAvailable || pendingToggle === 'biometric'}
                onValueChange={handleBiometricToggle}
                accessibilityLabel={
                  biometricAvailable ? 'Toggle biometric authentication' : 'Biometric authentication unavailable'
                }
              />
            </View>

            <View style={[styles.sectionDivider, { backgroundColor: appliedTheme.colors.outlineVariant }]} />

            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text variant="titleSmall">Dark mode</Text>
                <Text variant="bodySmall" style={styles.settingDescription}>
                  {isDarkPreferred
                    ? 'Dark theme forced for this device.'
                    : isUsingSystem
                    ? 'Following system appearance (toggle to force dark).'
                    : 'Light theme forced for this device.'}
                </Text>
              </View>
              <Switch
                value={isDarkPreferred}
                disabled={pendingToggle === 'theme'}
                onValueChange={handleThemeToggle}
                accessibilityLabel={isDarkPreferred ? 'Disable forced dark mode' : 'Enable dark mode'}
              />
            </View>
          </Surface>
        </View>

        <View style={styles.section}>
          <Searchbar
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search scans"
            autoCorrect={false}
            accessibilityLabel="Search scan history"
          />
          <View style={styles.filterRow}>
            {STATUS_FILTERS.map((filter) => (
              <Chip
                key={filter.value}
                compact
                selected={statusFilter === filter.value}
                onPress={() => setStatusFilter(filter.value)}
                accessibilityRole="button"
                accessibilityState={{ selected: statusFilter === filter.value }}
              >
                {filter.label}
              </Chip>
            ))}
          </View>
        </View>

        <View style={styles.section}>
          <Text variant="titleMedium">Scan history</Text>
        </View>
      </View>
    );
  }, [
    theme,
    profile?.full_name,
    fullName,
    email,
    stats.reputation,
    stats.totalScans,
    stats.accuracyRate,
    stats.streak,
    pushEnabled,
    pushLoading,
    pushUpdating,
    pendingToggle,
    handlePushToggle,
    biometricAvailable,
    isBiometricEnabled,
    handleBiometricToggle,
    isDarkPreferred,
    isUsingSystem,
    handleThemeToggle,
    searchQuery,
    statusFilter,
  ]);

  const listEmptyComponent = React.useCallback(() => {
    if (loading) {
      return null;
    }

    if (scans.length === 0) {
      return (
        <View style={styles.emptyState}>
          <Text variant="titleMedium">No scans yet</Text>
          <Text variant="bodySmall" style={styles.emptyStateText}>
            Your scans will appear here once you capture them from the Scan tab.
          </Text>
        </View>
      );
    }

    return (
      <View style={styles.emptyState}>
        <Text variant="titleMedium">No results</Text>
        <Text variant="bodySmall" style={styles.emptyStateText}>
          Adjust your search or filters to find a specific scan.
        </Text>
      </View>
    );
  }, [loading, scans.length]);

  const renderScanItem = React.useCallback(
    ({ item }: { item: ScanListItem }) => {
      const riskLabel = getRiskLabel(item.metadata);
      return (
        <Surface style={styles.scanCard} elevation={1}>
          <Text variant="titleMedium" numberOfLines={1}>
            {getScanTitle(item)}
          </Text>
          <Text variant="bodySmall" style={styles.scanSubtitle}>
            {formatDateTime(item.created_at)} • {formatStatus(item.status)}
          </Text>
          <View style={styles.scanMeta}>
            {riskLabel ? (
              <View style={[styles.scanTag, { backgroundColor: theme.colors.secondaryContainer }]}
                accessible
                accessibilityLabel={`Risk level ${riskLabel}`}>
                <Text
                  variant="labelMedium"
                  style={[styles.scanTagText, { color: theme.colors.onSecondaryContainer }]}
                >
                  Risk: {riskLabel}
                </Text>
              </View>
            ) : null}
            <Text variant="bodySmall" style={styles.scanStorage} numberOfLines={1}>
              Storage: {item.storage_path}
            </Text>
          </View>
        </Surface>
      );
    },
    [theme.colors.onSecondaryContainer, theme.colors.secondaryContainer],
  );

  if (loadingContent) {
    return (
      <ThemedView style={{ flex: 1 }}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <ScrollView contentContainerStyle={styles.loadingContainer}>
            <ProfileSkeleton />
          </ScrollView>
        </SafeAreaView>
      </ThemedView>
    );
  }

  if (showErrorFallback) {
    return (
      <ThemedView style={{ flex: 1 }}>
        <SafeAreaView style={styles.safeArea} edges={['bottom']}>
          <View style={styles.errorContainer}>
            <Text variant="titleMedium">Unable to load profile</Text>
            <Text variant="bodyMedium" style={styles.errorSubtitle}>
              {errorMessage ?? 'Something went wrong while loading your profile.'}
            </Text>
            <Button mode="contained" onPress={() => loadData()}>
              Retry
            </Button>
          </View>
        </SafeAreaView>
      </ThemedView>
    );
  }

  return (
    <ThemedView style={{ flex: 1 }}>
      <SafeAreaView style={styles.safeArea} edges={['bottom']}>
        <FlatList
          data={filteredScans}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={renderScanItem}
          ListHeaderComponent={headerComponent}
          ListHeaderComponentStyle={styles.listHeader}
          ListEmptyComponent={listEmptyComponent}
          ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
          ListFooterComponent={
            <View style={styles.footerSection}>
              <Surface style={styles.sectionCard} elevation={1}>
                <List.Item
                  title="About Striide"
                  description="Learn more about the platform and mission."
                  onPress={() => handleOpenLink(ABOUT_LINK)}
                  left={(props) => <List.Icon {...props} icon="information" />}
                  right={(props) => <List.Icon {...props} icon="open-in-new" />}
                  accessibilityLabel="Open Striide about page"
                />
                <View style={[styles.sectionDivider, { backgroundColor: theme.colors.outlineVariant }]} />
                <List.Item
                  title="Help & Support"
                  description="Browse FAQs and contact our support team."
                  onPress={() => handleOpenLink(HELP_LINK)}
                  left={(props) => <List.Icon {...props} icon="lifebuoy" />}
                  right={(props) => <List.Icon {...props} icon="open-in-new" />}
                  accessibilityLabel="Open Striide help center"
                />
              </Surface>

              <Button
                mode="contained"
                onPress={handleSignOut}
                loading={signOutLoading}
                disabled={signOutLoading}
                accessibilityLabel="Sign out of your account"
              >
                Log out
              </Button>
            </View>
          }
        />
        <Snackbar
          visible={Boolean(snackbarMessage)}
          onDismiss={handleDismissSnackbar}
          duration={4000}
          accessibilityLiveRegion="polite"
        >
          {snackbarMessage}
        </Snackbar>
      </SafeAreaView>
    </ThemedView>
  );
}

function ProfileSkeleton() {
  const theme = useTheme();
  const surface = theme.colors.surfaceVariant;

  return (
    <View style={styles.skeletonContainer}>
      <View style={[styles.skeletonBlock, { backgroundColor: surface, height: 156 }]} />
      <View style={styles.skeletonRow}>
        <View style={[styles.skeletonCard, { backgroundColor: surface }]} />
        <View style={[styles.skeletonCard, { backgroundColor: surface }]} />
        <View style={[styles.skeletonCard, { backgroundColor: surface }]} />
      </View>
      <View style={[styles.skeletonBlock, { backgroundColor: surface, height: 200 }]} />
      <View style={[styles.skeletonBlock, { backgroundColor: surface, height: 52 }]} />
      <View style={[styles.skeletonBlock, { backgroundColor: surface, height: 72 }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  loadingContainer: {
    flexGrow: 1,
    paddingHorizontal: 24,
    paddingVertical: 32,
    gap: 24,
    justifyContent: 'center',
  },
  listContent: {
    paddingHorizontal: 24,
    paddingBottom: 32,
    gap: 16,
  },
  listHeader: {
    gap: 24,
    marginBottom: 24,
  },
  headerContainer: {
    gap: 24,
  },
  profileCard: {
    borderRadius: 20,
    padding: 20,
    gap: 20,
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontWeight: '600',
  },
  profileInfo: {
    flex: 1,
    gap: 4,
  },
  reputationSection: {
    gap: 12,
  },
  reputationHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressBar: {
    height: 10,
    borderRadius: 10,
  },
  section: {
    gap: 12,
  },
  statsGrid: {
    flexDirection: 'row',
    gap: 16,
    flexWrap: 'wrap',
  },
  statCard: {
    flex: 1,
    minWidth: 100,
    borderRadius: 16,
    padding: 16,
    gap: 8,
  },
  statLabel: {
    opacity: 0.7,
  },
  sectionCard: {
    borderRadius: 20,
    padding: 16,
    gap: 16,
  },
  settingRow: {
    flexDirection: 'row',
    gap: 16,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingInfo: {
    flex: 1,
    gap: 4,
  },
  settingDescription: {
    opacity: 0.7,
  },
  sectionDivider: {
    height: 1,
    borderRadius: 1,
  },
  filterRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  scanCard: {
    borderRadius: 18,
    padding: 16,
    gap: 8,
  },
  scanSubtitle: {
    opacity: 0.7,
  },
  scanMeta: {
    gap: 8,
  },
  scanTag: {
    alignSelf: 'flex-start',
    borderRadius: 14,
    paddingVertical: 4,
    paddingHorizontal: 12,
  },
  scanTagText: {
    fontWeight: '600',
  },
  scanStorage: {
    opacity: 0.6,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: 48,
    gap: 8,
  },
  emptyStateText: {
    textAlign: 'center',
    opacity: 0.7,
  },
  footerSection: {
    marginTop: 24,
    gap: 16,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 16,
  },
  errorSubtitle: {
    textAlign: 'center',
    opacity: 0.7,
  },
  skeletonContainer: {
    gap: 24,
  },
  skeletonBlock: {
    borderRadius: 20,
  },
  skeletonRow: {
    flexDirection: 'row',
    gap: 16,
  },
  skeletonCard: {
    flex: 1,
    height: 100,
    borderRadius: 16,
  },
});
