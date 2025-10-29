import { useAuthStore, resetAuthStore } from '../store/authStore';
import { useAlertStore, resetAlertStore } from '../store/alertStore';
import {
  useScanStore,
  resetScanStore,
  selectScanById,
  selectLatestScan,
  selectScanStats,
} from '../store/scanStore';
import type { Scan } from '../lib/supabase';

describe('store shape integrity', () => {
  beforeEach(() => {
    resetAuthStore();
    resetAlertStore();
    resetScanStore();
  });

  afterEach(() => {
    resetAuthStore();
    resetAlertStore();
    resetScanStore();
  });

  it('ensures auth store exposes expected defaults and actions', () => {
    const state = useAuthStore.getState();

    expect(state).toMatchObject({
      session: null,
      initializing: true,
      biometricAvailable: false,
      isBiometricEnabled: false,
      lastSignInEmail: null,
    });

    expect(typeof state.setSession).toBe('function');
    expect(typeof state.setInitializing).toBe('function');
    expect(typeof state.setBiometricAvailable).toBe('function');
    expect(typeof state.setBiometricEnabled).toBe('function');
    expect(typeof state.setLastSignInEmail).toBe('function');

    state.setInitializing(false);
    state.setBiometricAvailable(true);
    state.setBiometricEnabled(true);
    state.setLastSignInEmail('user@example.com');

    expect(useAuthStore.getState()).toMatchObject({
      initializing: false,
      biometricAvailable: true,
      isBiometricEnabled: true,
      lastSignInEmail: 'user@example.com',
    });

    resetAuthStore();
    expect(useAuthStore.getState()).toMatchObject({
      initializing: true,
      biometricAvailable: false,
      isBiometricEnabled: false,
      lastSignInEmail: null,
    });
  });

  it('ensures alert store maintains consistent shape', () => {
    const state = useAlertStore.getState();

    expect(state).toMatchObject({
      alerts: [],
      readAlertIds: {},
      unreadCount: 0,
      latestRealtimeAlert: null,
    });

    expect(typeof state.replaceAlerts).toBe('function');
    expect(typeof state.appendAlerts).toBe('function');
    expect(typeof state.upsertAlert).toBe('function');
    expect(typeof state.markAlertRead).toBe('function');
    expect(typeof state.markAlertsRead).toBe('function');
    expect(typeof state.acknowledgeRealtimeAlert).toBe('function');

    const alert = {
      id: 'alert-1',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
      metadata: {},
      notes: null,
      reason: 'Test alert',
      resolved_at: null,
      scan_id: 'scan-1',
      severity: 'high' as const,
      status: 'open' as const,
      user_id: 'user-1',
    };

    state.replaceAlerts([alert]);
    expect(useAlertStore.getState().alerts).toHaveLength(1);
    expect(useAlertStore.getState().alerts[0].id).toBe('alert-1');

    resetAlertStore();
    expect(useAlertStore.getState()).toMatchObject({
      alerts: [],
      unreadCount: 0,
      latestRealtimeAlert: null,
    });
  });

  it('ensures scan store exposes selectors and actions consistently', () => {
    const state = useScanStore.getState();

    expect(state).toMatchObject({
      scans: [],
      stats: null,
      isLoading: false,
      isRefreshing: false,
      error: null,
      lastSyncedAt: null,
    });

    expect(typeof state.setScans).toBe('function');
    expect(typeof state.addScan).toBe('function');
    expect(typeof state.upsertScan).toBe('function');
    expect(typeof state.removeScan).toBe('function');
    expect(typeof state.setStats).toBe('function');
    expect(typeof state.setLoading).toBe('function');
    expect(typeof state.setRefreshing).toBe('function');
    expect(typeof state.setError).toBe('function');

    const scan = createScan('scan-1', '2024-01-01T00:00:00Z');
    const newerScan = createScan('scan-2', '2024-02-01T00:00:00Z');

    state.setScans([scan, newerScan]);
    const latest = selectLatestScan(useScanStore.getState());
    expect(latest?.id).toBe('scan-2');

    const fetched = selectScanById('scan-1')(useScanStore.getState());
    expect(fetched?.id).toBe('scan-1');

    const stats = {
      totalScans: 12,
      accuracyRate: 94,
      highRisk: 1,
      streak: 5,
      reputation: 87,
      lastScanAt: '2024-01-01T00:00:00Z',
    };

    state.setStats(stats);
    const selectedStats = selectScanStats(useScanStore.getState());
    expect(selectedStats).toEqual(stats);

    resetScanStore();
    expect(useScanStore.getState()).toMatchObject({
      scans: [],
      stats: null,
      lastSyncedAt: null,
    });
  });
});

function createScan(id: string, createdAt: string): Scan {
  return {
    id,
    created_at: createdAt,
    updated_at: createdAt,
    metadata: {},
    checksum: null,
    processed_at: createdAt,
    status: 'complete',
    storage_path: `${id}.pdf`,
    user_id: 'user-id',
  };
}
