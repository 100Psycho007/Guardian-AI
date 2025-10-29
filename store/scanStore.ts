import { create } from 'zustand';

import type { Scan } from '../lib/supabase';

export type ScanStats = {
  totalScans: number;
  accuracyRate: number;
  highRisk: number;
  streak: number;
  reputation: number;
  lastScanAt: string | null;
};

export type ScanStoreState = {
  scans: Scan[];
  stats: ScanStats | null;
  isLoading: boolean;
  isRefreshing: boolean;
  error: string | null;
  lastSyncedAt: string | null;
};

export type ScanStoreActions = {
  setScans: (scans: Scan[]) => void;
  addScan: (scan: Scan) => void;
  upsertScan: (scan: Scan) => void;
  removeScan: (scanId: string) => void;
  setStats: (stats: ScanStats | null) => void;
  setLoading: (loading: boolean) => void;
  setRefreshing: (refreshing: boolean) => void;
  setError: (error: string | null) => void;
  reset: () => void;
};

export type ScanStore = ScanStoreState & ScanStoreActions;

const initialState: ScanStoreState = {
  scans: [],
  stats: null,
  isLoading: false,
  isRefreshing: false,
  error: null,
  lastSyncedAt: null,
};

function createInitialState(): ScanStoreState {
  return { ...initialState };
}

function dedupeScans(scans: Scan[]): Scan[] {
  const map = new Map<string, Scan>();
  scans.forEach((scan) => {
    map.set(scan.id, scan);
  });
  return Array.from(map.values());
}

function sortScans(scans: Scan[]): Scan[] {
  return [...scans].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function ensureSorted(scans: Scan[]): Scan[] {
  return sortScans(dedupeScans(scans));
}

export const useScanStore = create<ScanStore>((set) => ({
  ...createInitialState(),
  setScans: (scans) => {
    const next = ensureSorted(scans);
    set({
      scans: next,
      lastSyncedAt: new Date().toISOString(),
    });
  },
  addScan: (scan) => {
    set((state) => {
      if (state.scans.some((item) => item.id === scan.id)) {
        return state;
      }
      const next = sortScans([scan, ...state.scans]);
      return {
        scans: next,
      };
    });
  },
  upsertScan: (scan) => {
    set((state) => {
      const index = state.scans.findIndex((item) => item.id === scan.id);
      if (index === -1) {
        const next = sortScans([scan, ...state.scans]);
        return {
          scans: next,
        };
      }
      const existing = state.scans[index];
      if (existing.updated_at === scan.updated_at) {
        return state;
      }
      const next = [...state.scans];
      next[index] = scan;
      return {
        scans: sortScans(next),
      };
    });
  },
  removeScan: (scanId) => {
    set((state) => {
      if (!state.scans.some((item) => item.id === scanId)) {
        return state;
      }
      const next = state.scans.filter((scan) => scan.id !== scanId);
      return {
        scans: next,
      };
    });
  },
  setStats: (stats) => set({ stats }),
  setLoading: (loading) => set({ isLoading: loading }),
  setRefreshing: (refreshing) => set({ isRefreshing: refreshing }),
  setError: (error) => set({ error }),
  reset: () => set(() => createInitialState()),
}));

export function resetScanStore() {
  useScanStore.getState().reset();
}

export const selectScanStats = (state: ScanStore) => state.stats;
export const selectScans = (state: ScanStore) => state.scans;
export const selectScanById = (scanId: string) => (state: ScanStore) =>
  state.scans.find((scan) => scan.id === scanId) ?? null;
export const selectLatestScan = (state: ScanStore) => state.scans[0] ?? null;
