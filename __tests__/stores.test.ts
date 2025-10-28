import type { Session } from '@supabase/supabase-js';

import type { Profile } from '../lib/supabase';
import { useAlertsStore, selectUnreadTotal } from '../store/alerts';
import { useAuthStore } from '../store/auth';
import type { PendingScan } from '../store/scans';
import { useScanStore } from '../store/scans';

jest.mock('expo-secure-store');

describe('auth store', () => {
  const mockSession = {
    access_token: 'access-token',
    refresh_token: 'refresh-token',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: 'bearer',
    user: { id: 'user-123' },
  } as unknown as Session;

  const mockProfile: Profile = {
    id: 'user-123',
    full_name: 'Test User',
    phone: null,
    avatar_url: null,
    scan_stats: {},
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  beforeEach(() => {
    useAuthStore.setState({
      session: null,
      profile: null,
      deviceToken: null,
      hasHydrated: true,
    });
  });

  it('updates session and profile data', () => {
    useAuthStore.getState().setSession(mockSession, mockProfile);

    expect(useAuthStore.getState().session).toBe(mockSession);
    expect(useAuthStore.getState().profile).toBe(mockProfile);
  });

  it('clears session when logging out', async () => {
    useAuthStore.getState().setSession(mockSession, mockProfile);
    useAuthStore.getState().setDeviceToken('device-token');

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
    expect(useAuthStore.getState().deviceToken).toBeNull();
  });

  it('resets profile when session is cleared', () => {
    useAuthStore.getState().setSession(mockSession, mockProfile);
    useAuthStore.getState().setSession(null);

    expect(useAuthStore.getState().session).toBeNull();
    expect(useAuthStore.getState().profile).toBeNull();
  });
});

describe('scan store', () => {
  const factory = (overrides: Partial<PendingScan> = {}): PendingScan => ({
    id: overrides.id ?? Math.random().toString(36).slice(2),
    uri: overrides.uri ?? 'file://scan.jpg',
    createdAt: overrides.createdAt ?? new Date().toISOString(),
    status: overrides.status ?? 'queued',
    retryCount: overrides.retryCount ?? 0,
    metadata: overrides.metadata,
  });

  beforeEach(() => {
    useScanStore.setState({
      pendingScans: [],
    });
  });

  it('enqueues scans and prevents duplicates', () => {
    const scan = factory({ id: 'scan-1' });

    useScanStore.getState().enqueueScan(scan);
    useScanStore.getState().enqueueScan({ ...scan, retryCount: 1 });

    expect(useScanStore.getState().pendingScans).toHaveLength(1);
    expect(useScanStore.getState().pendingScans[0].retryCount).toBe(1);
  });

  it('updates and removes pending scans', () => {
    const scan = factory({ id: 'scan-2' });

    useScanStore.getState().enqueueScan(scan);
    useScanStore.getState().updatePendingScan(scan.id, { status: 'uploading', retryCount: 3 });

    expect(useScanStore.getState().pendingScans[0].status).toBe('uploading');
    expect(useScanStore.getState().pendingScans[0].retryCount).toBe(3);

    useScanStore.getState().removePendingScan(scan.id);

    expect(useScanStore.getState().pendingScans).toHaveLength(0);
  });
});

describe('alerts store', () => {
  beforeEach(() => {
    useAlertsStore.setState({
      filters: {
        status: 'all',
        severity: 'all',
        searchTerm: '',
      },
      unreadBySeverity: {
        low: 0,
        medium: 0,
        high: 0,
        critical: 0,
      },
    });
  });

  it('updates alert filters', () => {
    useAlertsStore.getState().setFilters({ status: 'open', searchTerm: 'upi' });

    expect(useAlertsStore.getState().filters).toEqual({
      status: 'open',
      severity: 'all',
      searchTerm: 'upi',
    });

    useAlertsStore.getState().resetFilters();

    expect(useAlertsStore.getState().filters).toEqual({
      status: 'all',
      severity: 'all',
      searchTerm: '',
    });
  });

  it('tracks unread counts by severity', () => {
    useAlertsStore.getState().incrementUnread('high');
    useAlertsStore.getState().incrementUnread('critical');
    useAlertsStore.getState().setUnreadForSeverity('low', 4);

    expect(useAlertsStore.getState().unreadBySeverity).toEqual({
      low: 4,
      medium: 0,
      high: 1,
      critical: 1,
    });
    expect(selectUnreadTotal(useAlertsStore.getState())).toBe(6);

    useAlertsStore.getState().markSeverityAsRead('low');
    expect(useAlertsStore.getState().unreadBySeverity.low).toBe(0);

    useAlertsStore.getState().clearUnread();
    expect(useAlertsStore.getState().unreadBySeverity).toEqual({
      low: 0,
      medium: 0,
      high: 0,
      critical: 0,
    });
  });
});
