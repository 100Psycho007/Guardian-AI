import { useAlertStore, resetAlertStore } from '../store/alertStore';
import { resetScanStore, selectLatestScan, useScanStore } from '../store/scanStore';
import type { FraudAlert, Scan } from '../lib/supabase';

describe('alert store selectors', () => {
  beforeEach(() => {
    resetAlertStore();
  });

  function createAlert(id: string, createdAt: string): FraudAlert {
    return {
      id,
      created_at: createdAt,
      updated_at: createdAt,
      metadata: {},
      notes: null,
      reason: `Reason ${id}`,
      resolved_at: null,
      scan_id: 'scan-id',
      severity: 'high',
      status: 'open',
      user_id: 'user-id',
    };
  }

  it('orders alerts by most recent when replacing', () => {
    const store = useAlertStore.getState();
    const older = createAlert('older', '2024-01-01T00:00:00Z');
    const newer = createAlert('newer', '2024-02-01T00:00:00Z');

    store.replaceAlerts([older, newer]);

    const alerts = useAlertStore.getState().alerts;
    expect(alerts).toHaveLength(2);
    expect(alerts[0].id).toBe('newer');
    expect(alerts[1].id).toBe('older');
  });

  it('flags realtime alert as latest when upserted', () => {
    const store = useAlertStore.getState();
    const realtime = createAlert('realtime', '2024-03-01T00:00:00Z');

    store.upsertAlert(realtime, { fromRealtime: true });

    const { latestRealtimeAlert } = useAlertStore.getState();
    expect(latestRealtimeAlert).not.toBeNull();
    expect(latestRealtimeAlert?.id).toBe('realtime');
  });

  it('acknowledges realtime alert', () => {
    const store = useAlertStore.getState();
    const realtime = createAlert('realtime', '2024-03-01T00:00:00Z');

    store.upsertAlert(realtime, { fromRealtime: true });
    store.acknowledgeRealtimeAlert('realtime');

    expect(useAlertStore.getState().latestRealtimeAlert).toBeNull();
  });
});

describe('scan store selectors', () => {
  beforeEach(() => {
    resetScanStore();
  });

  function createScan(id: string, createdAt: string, status: Scan['status'] = 'complete'): Scan {
    return {
      id,
      created_at: createdAt,
      updated_at: createdAt,
      metadata: {},
      checksum: null,
      processed_at: createdAt,
      status,
      storage_path: `storage/${id}.pdf`,
      user_id: 'user-id',
    };
  }

  it('selectLatestScan returns the newest scan', () => {
    const store = useScanStore.getState();
    const older = createScan('a', '2024-01-01T00:00:00Z');
    const newer = createScan('b', '2024-02-01T00:00:00Z');

    store.setScans([older, newer]);

    const latest = selectLatestScan(useScanStore.getState());
    expect(latest?.id).toBe('b');
  });

  it('updates stats with last scan timestamp', () => {
    const store = useScanStore.getState();
    const scan = createScan('scan-1', '2024-03-05T12:00:00Z');

    store.setScans([scan]);
    store.setStats({
      totalScans: 10,
      accuracyRate: 95,
      highRisk: 1,
      streak: 3,
      reputation: 88,
      lastScanAt: scan.created_at,
    });

    const state = useScanStore.getState();
    expect(state.stats).not.toBeNull();
    expect(state.stats?.lastScanAt).toBe('2024-03-05T12:00:00Z');
    expect(state.stats?.highRisk).toBe(1);
  });
});
