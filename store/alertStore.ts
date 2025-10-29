import { create } from 'zustand';

import type { FraudAlert } from '../lib/supabase';

export type AlertWithRead = FraudAlert & { read: boolean };

export type AlertStoreState = {
  alerts: AlertWithRead[];
  readAlertIds: Record<string, true>;
  unreadCount: number;
  latestRealtimeAlert: AlertWithRead | null;
};

export type AlertStoreActions = {
  replaceAlerts: (alerts: FraudAlert[]) => void;
  appendAlerts: (alerts: FraudAlert[]) => void;
  upsertAlert: (alert: FraudAlert, options?: { fromRealtime?: boolean }) => void;
  markAlertRead: (alertId: string) => void;
  markAlertsRead: (alertIds: string[]) => void;
  acknowledgeRealtimeAlert: (alertId?: string) => void;
  reset: () => void;
};

export type AlertStore = AlertStoreState & AlertStoreActions;

const initialState: AlertStoreState = {
  alerts: [],
  readAlertIds: {},
  unreadCount: 0,
  latestRealtimeAlert: null,
};

function createInitialState(): AlertStoreState {
  return {
    alerts: [],
    readAlertIds: {},
    unreadCount: 0,
    latestRealtimeAlert: null,
  };
}

function dedupeAlerts(alerts: FraudAlert[]): FraudAlert[] {
  const map = new Map<string, FraudAlert>();
  alerts.forEach((alert) => {
    map.set(alert.id, alert);
  });
  return Array.from(map.values());
}

function sortAlerts<T extends { created_at: string }>(alerts: T[]): T[] {
  return [...alerts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function hydrateAlerts(alerts: FraudAlert[], readAlertIds: Record<string, true>): AlertWithRead[] {
  return sortAlerts(dedupeAlerts(alerts)).map((alert) => ({
    ...alert,
    read: Boolean(readAlertIds[alert.id]),
  }));
}

function updateUnreadCount(alerts: AlertWithRead[]): number {
  return alerts.reduce((count, alert) => (alert.read ? count : count + 1), 0);
}

export const useAlertStore = create<AlertStore>((set) => ({
  ...createInitialState(),
  replaceAlerts: (alerts) => {
    set((state) => {
      const hydrated = hydrateAlerts(alerts, state.readAlertIds);
      const latestRealtimeAlert = state.latestRealtimeAlert
        ? hydrated.find((alert) => alert.id === state.latestRealtimeAlert?.id) ?? null
        : null;

      return {
        alerts: hydrated,
        unreadCount: updateUnreadCount(hydrated),
        latestRealtimeAlert,
      };
    });
  },
  appendAlerts: (alerts) => {
    if (alerts.length === 0) {
      return;
    }

    set((state) => {
      const existing = new Map(state.alerts.map((alert) => [alert.id, alert]));
      alerts.forEach((alert) => {
        if (!existing.has(alert.id)) {
          existing.set(alert.id, {
            ...alert,
            read: Boolean(state.readAlertIds[alert.id]),
          });
        }
      });

      const merged = sortAlerts(Array.from(existing.values()));

      return {
        alerts: merged,
        unreadCount: updateUnreadCount(merged),
      };
    });
  },
  upsertAlert: (alert, options) => {
    set((state) => {
      const index = state.alerts.findIndex((item) => item.id === alert.id);
      let nextAlerts: AlertWithRead[];

      if (index === -1) {
        nextAlerts = sortAlerts([
          {
            ...alert,
            read: Boolean(state.readAlertIds[alert.id]),
          },
          ...state.alerts,
        ]);
      } else {
        const existing = state.alerts[index];
        if (existing.updated_at === alert.updated_at) {
          return state;
        }

        nextAlerts = [...state.alerts];
        nextAlerts[index] = {
          ...alert,
          read: existing.read,
        };
        nextAlerts = sortAlerts(nextAlerts);
      }

      const unreadCount = updateUnreadCount(nextAlerts);
      const latestAlertCandidate = nextAlerts.find((item) => item.id === alert.id) ?? null;

      const shouldHighlight = Boolean(options?.fromRealtime) && !state.readAlertIds[alert.id];
      const latestRealtimeAlert = shouldHighlight ? latestAlertCandidate : state.latestRealtimeAlert;

      return {
        alerts: nextAlerts,
        unreadCount,
        latestRealtimeAlert,
      };
    });
  },
  markAlertRead: (alertId) => {
    set((state) => {
      if (state.readAlertIds[alertId]) {
        if (state.latestRealtimeAlert?.id === alertId && !state.latestRealtimeAlert.read) {
          const latestRealtimeAlert = { ...state.latestRealtimeAlert, read: true };
          return {
            latestRealtimeAlert,
          };
        }
        return state;
      }

      const nextReadIds = {
        ...state.readAlertIds,
        [alertId]: true as const,
      };

      const alerts = state.alerts.map((alert) => (alert.id === alertId ? { ...alert, read: true } : alert));

      const latestRealtimeAlert =
        state.latestRealtimeAlert?.id === alertId && !state.latestRealtimeAlert.read
          ? { ...state.latestRealtimeAlert, read: true }
          : state.latestRealtimeAlert;

      return {
        readAlertIds: nextReadIds,
        alerts,
        unreadCount: updateUnreadCount(alerts),
        latestRealtimeAlert,
      };
    });
  },
  markAlertsRead: (alertIds) => {
    if (alertIds.length === 0) {
      return;
    }

    set((state) => {
      let changed = false;
      const nextReadIds = { ...state.readAlertIds };
      alertIds.forEach((id) => {
        if (!nextReadIds[id]) {
          nextReadIds[id] = true;
          changed = true;
        }
      });

      if (!changed) {
        const latestRealtimeAlert = state.latestRealtimeAlert && alertIds.includes(state.latestRealtimeAlert.id)
          ? { ...state.latestRealtimeAlert, read: true }
          : state.latestRealtimeAlert;
        if (latestRealtimeAlert === state.latestRealtimeAlert) {
          return state;
        }
        return { latestRealtimeAlert };
      }

      const alerts = state.alerts.map((alert) =>
        alertIds.includes(alert.id) ? { ...alert, read: true } : alert,
      );

      const latestRealtimeAlert =
        state.latestRealtimeAlert && alertIds.includes(state.latestRealtimeAlert.id)
          ? { ...state.latestRealtimeAlert, read: true }
          : state.latestRealtimeAlert;

      return {
        readAlertIds: nextReadIds,
        alerts,
        unreadCount: updateUnreadCount(alerts),
        latestRealtimeAlert,
      };
    });
  },
  acknowledgeRealtimeAlert: (alertId) => {
    set((state) => {
      if (!state.latestRealtimeAlert) {
        return state;
      }

      if (alertId && state.latestRealtimeAlert.id !== alertId) {
        return state;
      }

      return {
        latestRealtimeAlert: null,
      };
    });
  },
  reset: () => set(() => createInitialState()),
}));

export function resetAlertStore() {
  useAlertStore.getState().reset();
}
