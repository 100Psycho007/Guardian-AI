import React from 'react';

import { useAuth } from './useAuth';
import { parseScanStats } from '../lib/scanStats';
import { fetchProfileById, listScansForUser, type Profile as SupabaseProfile, type Scan } from '../lib/supabase';
import { useScanStore, type ScanStore } from '../store/scanStore';

export function useScans(): ScanStore;
export function useScans<T>(selector: (state: ScanStore) => T): T;
export function useScans<T>(selector?: (state: ScanStore) => T) {
  if (selector) {
    return useScanStore(selector);
  }
  return useScanStore();
}

export function useScansLoader() {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const setScans = useScanStore((state) => state.setScans);
  const setStats = useScanStore((state) => state.setStats);
  const setLoading = useScanStore((state) => state.setLoading);
  const setRefreshing = useScanStore((state) => state.setRefreshing);
  const setError = useScanStore((state) => state.setError);
  const reset = useScanStore((state) => state.reset);

  const load = React.useCallback(
    async ({ background = false }: { background?: boolean } = {}): Promise<{ error?: string }> => {
      if (!userId) {
        reset();
        setLoading(false);
        setRefreshing(false);
        setError(null);
        return { error: 'NOT_AUTHENTICATED' };
      }

      if (background) {
        setRefreshing(true);
      } else {
        setLoading(true);
      }

      try {
        const [scansResult, profileResult] = await Promise.all([
          listScansForUser(userId),
          fetchProfileById(userId),
        ]);

        if (scansResult.error) {
          throw scansResult.error;
        }

        if (profileResult.error) {
          throw profileResult.error;
        }

        const scans = (scansResult.data ?? []) as Scan[];
        const profile = (profileResult.data ?? null) as SupabaseProfile | null;

        setScans(scans);
        const stats = parseScanStats(profile?.scan_stats ?? null);
        const lastScanAt = scans[0]?.created_at ?? null;
        setStats({ ...stats, lastScanAt });
        setError(null);
        return {};
      } catch (error) {
        const message =
          error instanceof Error ? error.message : 'Unable to load scan data right now. Please try again later.';
        setError(message);
        return { error: message };
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [userId, reset, setLoading, setRefreshing, setScans, setStats, setError],
  );

  const refresh = React.useCallback(() => load({ background: true }), [load]);

  React.useEffect(() => {
    if (!userId) {
      reset();
      setError(null);
      setLoading(false);
      setRefreshing(false);
    }
  }, [userId, reset, setError, setLoading, setRefreshing]);

  return React.useMemo(
    () => ({
      load,
      refresh,
    }),
    [load, refresh],
  );
}

export function useScanStats() {
  return useScanStore((state) => state.stats);
}

export function useLatestScan() {
  return useScanStore((state) => state.scans[0] ?? null);
}
