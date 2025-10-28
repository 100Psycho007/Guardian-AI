import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { Scan } from '../lib/supabase';
import { selectAuthSession, useAuthStore } from '../store/auth';
import {
  selectPendingScanCount,
  selectPendingScans,
  type PendingScan,
  useScanStore,
} from '../store/scans';

export type UseScansResult = {
  pendingScans: PendingScan[];
  pendingCount: number;
  scans: Scan[];
  scansQuery: UseQueryResult<Scan[]>;
  enqueueScan: (scan: PendingScan) => void;
  updatePendingScan: (id: string, updates: Partial<Omit<PendingScan, 'id'>>) => void;
  removePendingScan: (id: string) => void;
  clearPendingScans: () => void;
};

export function useScans(): UseScansResult {
  const session = useAuthStore(selectAuthSession);
  const pendingScans = useScanStore(selectPendingScans);
  const pendingCount = useScanStore(selectPendingScanCount);

  const enqueueScan = useScanStore((state) => state.enqueueScan);
  const updatePendingScan = useScanStore((state) => state.updatePendingScan);
  const removePendingScan = useScanStore((state) => state.removePendingScan);
  const clearPendingScans = useScanStore((state) => state.clearPendingScans);

  const scansQuery = useQuery({
    queryKey: ['scans', session?.user?.id],
    queryFn: async (): Promise<Scan[]> => [],
    enabled: Boolean(session?.user?.id),
    initialData: [] as Scan[],
  });

  return {
    pendingScans,
    pendingCount,
    scans: scansQuery.data ?? [],
    scansQuery,
    enqueueScan,
    updatePendingScan,
    removePendingScan,
    clearPendingScans,
  };
}
