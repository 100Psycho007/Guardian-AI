import React from 'react';

import type { FraudAlert } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';

export type AlertWithRead = FraudAlert & { read: boolean };

export type AlertStoreContextValue = {
  alerts: AlertWithRead[];
  unreadCount: number;
  replaceAlerts: (alerts: FraudAlert[]) => void;
  appendAlerts: (alerts: FraudAlert[]) => void;
  upsertAlert: (alert: FraudAlert) => void;
  markAlertRead: (alertId: string) => void;
  markAlertsRead: (alertIds: string[]) => void;
  reset: () => void;
};

type AlertStoreState = {
  alerts: FraudAlert[];
  readAlertIds: Record<string, true>;
};

const AlertStoreContext = React.createContext<AlertStoreContextValue | undefined>(undefined);

function createInitialState(): AlertStoreState {
  return {
    alerts: [],
    readAlertIds: {},
  };
}

function sortAlerts(alerts: FraudAlert[]): FraudAlert[] {
  return [...alerts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
}

function dedupeAlerts(alerts: FraudAlert[]): FraudAlert[] {
  const map = new Map<string, FraudAlert>();

  alerts.forEach((alert) => {
    map.set(alert.id, alert);
  });

  return sortAlerts(Array.from(map.values()));
}

export function AlertStoreProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [state, setState] = React.useState<AlertStoreState>(() => createInitialState());

  React.useEffect(() => {
    setState(createInitialState());
  }, [userId]);

  const replaceAlerts = React.useCallback((alerts: FraudAlert[]) => {
    setState((previous) => ({
      alerts: dedupeAlerts(alerts),
      readAlertIds: previous.readAlertIds,
    }));
  }, []);

  const appendAlerts = React.useCallback((alerts: FraudAlert[]) => {
    if (alerts.length === 0) {
      return;
    }

    setState((previous) => {
      const existingIds = new Set(previous.alerts.map((alert) => alert.id));
      const filtered = alerts.filter((alert) => !existingIds.has(alert.id));

      if (filtered.length === 0) {
        return previous;
      }

      return {
        alerts: sortAlerts([...previous.alerts, ...filtered]),
        readAlertIds: previous.readAlertIds,
      };
    });
  }, []);

  const upsertAlert = React.useCallback((alert: FraudAlert) => {
    setState((previous) => {
      const index = previous.alerts.findIndex((item) => item.id === alert.id);
      if (index === -1) {
        return {
          alerts: sortAlerts([alert, ...previous.alerts]),
          readAlertIds: previous.readAlertIds,
        };
      }

      const nextAlerts = [...previous.alerts];
      const existing = nextAlerts[index];

      if (existing.updated_at === alert.updated_at) {
        return previous;
      }

      nextAlerts[index] = alert;

      return {
        alerts: sortAlerts(nextAlerts),
        readAlertIds: previous.readAlertIds,
      };
    });
  }, []);

  const markAlertRead = React.useCallback((alertId: string) => {
    setState((previous) => {
      if (previous.readAlertIds[alertId]) {
        return previous;
      }

      return {
        alerts: previous.alerts,
        readAlertIds: {
          ...previous.readAlertIds,
          [alertId]: true,
        },
      };
    });
  }, []);

  const markAlertsRead = React.useCallback((alertIds: string[]) => {
    if (alertIds.length === 0) {
      return;
    }

    setState((previous) => {
      const next = { ...previous.readAlertIds };
      let changed = false;

      alertIds.forEach((id) => {
        if (!next[id]) {
          next[id] = true;
          changed = true;
        }
      });

      if (!changed) {
        return previous;
      }

      return {
        alerts: previous.alerts,
        readAlertIds: next,
      };
    });
  }, []);

  const reset = React.useCallback(() => {
    setState(createInitialState());
  }, []);

  const alertsWithRead = React.useMemo<AlertWithRead[]>(
    () =>
      state.alerts.map((alert) => ({
        ...alert,
        read: Boolean(state.readAlertIds[alert.id]),
      })),
    [state.alerts, state.readAlertIds],
  );

  const unreadCount = React.useMemo(
    () => alertsWithRead.reduce((count, alert) => (alert.read ? count : count + 1), 0),
    [alertsWithRead],
  );

  const value = React.useMemo<AlertStoreContextValue>(
    () => ({
      alerts: alertsWithRead,
      unreadCount,
      replaceAlerts,
      appendAlerts,
      upsertAlert,
      markAlertRead,
      markAlertsRead,
      reset,
    }),
    [alertsWithRead, unreadCount, replaceAlerts, appendAlerts, upsertAlert, markAlertRead, markAlertsRead, reset],
  );

  return <AlertStoreContext.Provider value={value}>{children}</AlertStoreContext.Provider>;
}

export function useAlertStore() {
  const context = React.useContext(AlertStoreContext);

  if (!context) {
    throw new Error('useAlertStore must be used within an AlertStoreProvider');
  }

  return context;
}
