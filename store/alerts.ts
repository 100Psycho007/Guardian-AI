import { create } from 'zustand';

import type { FraudAlertSeverity, FraudAlertStatus } from '../lib/supabase';

export type AlertFilters = {
  status: FraudAlertStatus | 'all';
  severity: FraudAlertSeverity | 'all';
  searchTerm: string;
};

export type AlertsState = {
  filters: AlertFilters;
  unreadBySeverity: Record<FraudAlertSeverity, number>;
};

export type AlertsActions = {
  setFilters: (updates: Partial<AlertFilters>) => void;
  resetFilters: () => void;
  setUnreadForSeverity: (severity: FraudAlertSeverity, count: number) => void;
  incrementUnread: (severity: FraudAlertSeverity) => void;
  markSeverityAsRead: (severity: FraudAlertSeverity) => void;
  clearUnread: () => void;
};

export type AlertsStore = AlertsState & AlertsActions;

const defaultFilters: AlertFilters = {
  status: 'all',
  severity: 'all',
  searchTerm: '',
};

const defaultUnreadBySeverity: Record<FraudAlertSeverity, number> = {
  low: 0,
  medium: 0,
  high: 0,
  critical: 0,
};

export const useAlertsStore = create<AlertsStore>()((set) => ({
  filters: { ...defaultFilters },
  unreadBySeverity: { ...defaultUnreadBySeverity },
  setFilters: (updates) =>
    set((state) => ({
      filters: { ...state.filters, ...updates },
    })),
  resetFilters: () => set({ filters: { ...defaultFilters } }),
  setUnreadForSeverity: (severity, count) =>
    set((state) => ({
      unreadBySeverity: {
        ...state.unreadBySeverity,
        [severity]: Math.max(0, Math.floor(count)),
      },
    })),
  incrementUnread: (severity) =>
    set((state) => ({
      unreadBySeverity: {
        ...state.unreadBySeverity,
        [severity]: state.unreadBySeverity[severity] + 1,
      },
    })),
  markSeverityAsRead: (severity) =>
    set((state) => ({
      unreadBySeverity: {
        ...state.unreadBySeverity,
        [severity]: 0,
      },
    })),
  clearUnread: () => set({ unreadBySeverity: { ...defaultUnreadBySeverity } }),
}));

export const selectAlertFilters = (state: AlertsStore) => state.filters;
export const selectUnreadBySeverity = (state: AlertsStore) => state.unreadBySeverity;
export const selectUnreadTotal = (state: AlertsStore) =>
  Object.values(state.unreadBySeverity).reduce((total, count) => total + count, 0);
