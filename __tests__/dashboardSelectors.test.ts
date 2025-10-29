import { afterEach, beforeEach, describe, expect, it } from '@jest/globals';
import {
  resetScanStore,
  selectLatestScan,
  selectScanById,
  selectScanStats,
  useScanStore,
} from '../store/scanStore';
import { resetAlertStore, useAlertStore } from '../store/alertStore';
import type { FraudAlert, Scan } from '../lib/supabase';

function createScan(id: string, createdAt: string): Scan {
  return {
    id,
    created_at: createdAt,
    updated_at: createdAt,
    metadata: {},
    checksum: null,
    processed_at: createdAt,
    status: 'complete',
    storage_path: `scans/${id}.pdf`,
    user_id: 'user-id',
  };
}

function createAlert(id: string, createdAt: string): FraudAlert {
  return {
    id,
    created_at: createdAt,
    updated_at: createdAt,
    metadata: {},
    notes: null,
    reason: `Reason ${id}`,
    resolved_at: null,
    scan_id: `scan-${id}`,
    severity: 'high',
    status: 'open',
    user_id: 'user-id',
  };
}

describe('dashboard selectors', () => {
  beforeEach(() => {
    resetScanStore();
    resetAlertStore();
  });

  afterEach(() => {
    resetScanStore();
    resetAlertStore();
  });

  it('selectScanStats returns the stored stats snapshot', () => {
    const stats = {
      totalScans: 24,
      accuracyRate: 97,
      highRisk: 2,
      streak: 6,
      reputation: 90,
      lastScanAt: '2024-03-05T12:00:00Z',
    };

    useScanStore.getState().setStats(stats);

    const selected = selectScanStats(useScanStore.getState());
    expect(selected).toEqual(stats);
  });

  it('selectLatestScan and selectScanById resolve scans consistently', () => {
    const early = createScan('early', '2024-01-01T00:00:00Z');
    const recent = createScan('recent', '2024-04-01T12:00:00Z');

    useScanStore.getState().setScans([early, recent]);

    const latest = selectLatestScan(useScanStore.getState());
    expect(latest?.id).toBe('recent');

    const fetched = selectScanById('early')(useScanStore.getState());
    expect(fetched?.id).toBe('early');
  });

  it('alert store exposes unread counts and realtime banner state', () => {
    const alertA = createAlert('a', '2024-05-01T08:00:00Z');
    const alertB = createAlert('b', '2024-05-01T09:00:00Z');

    const alertStore = useAlertStore.getState();
    alertStore.replaceAlerts([alertA, alertB]);

    expect(useAlertStore.getState().unreadCount).toBe(2);

    alertStore.markAlertRead(alertA.id);
    expect(useAlertStore.getState().unreadCount).toBe(1);

    const realtime = createAlert('realtime', '2024-05-01T10:00:00Z');
    alertStore.upsertAlert(realtime, { fromRealtime: true });

    expect(useAlertStore.getState().latestRealtimeAlert?.id).toBe('realtime');

    alertStore.acknowledgeRealtimeAlert('realtime');
    expect(useAlertStore.getState().latestRealtimeAlert).toBeNull();
  });
});
