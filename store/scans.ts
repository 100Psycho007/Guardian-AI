import { create } from 'zustand';

export type PendingScanStatus = 'queued' | 'uploading' | 'failed';

export type PendingScan = {
  id: string;
  uri: string;
  createdAt: string;
  status: PendingScanStatus;
  retryCount: number;
  metadata?: Record<string, unknown>;
};

export type ScanQueueState = {
  pendingScans: PendingScan[];
};

export type ScanQueueActions = {
  enqueueScan: (scan: PendingScan) => void;
  updatePendingScan: (id: string, updates: Partial<Omit<PendingScan, 'id'>>) => void;
  removePendingScan: (id: string) => void;
  clearPendingScans: () => void;
};

export type ScanStore = ScanQueueState & ScanQueueActions;

export const useScanStore = create<ScanStore>()((set) => ({
  pendingScans: [],
  enqueueScan: (scan) =>
    set((state) => {
      const existing = state.pendingScans.find((item) => item.id === scan.id);

      if (existing) {
        return {
          pendingScans: state.pendingScans.map((item) => (item.id === scan.id ? { ...item, ...scan } : item)),
        };
      }

      return { pendingScans: [...state.pendingScans, scan] };
    }),
  updatePendingScan: (id, updates) =>
    set((state) => ({
      pendingScans: state.pendingScans.map((scan) => (scan.id === id ? { ...scan, ...updates } : scan)),
    })),
  removePendingScan: (id) =>
    set((state) => ({
      pendingScans: state.pendingScans.filter((scan) => scan.id !== id),
    })),
  clearPendingScans: () => set({ pendingScans: [] }),
}));

export const selectPendingScans = (state: ScanStore) => state.pendingScans;
export const selectPendingScanById = (id: string) => (state: ScanStore) =>
  state.pendingScans.find((scan) => scan.id === id) ?? null;
export const selectPendingScanCount = (state: ScanStore) => state.pendingScans.length;
