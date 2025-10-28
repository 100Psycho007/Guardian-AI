import React from 'react';

import { useAuth } from '../hooks/useAuth';
import { resetAlertStore, useAlertStore, type AlertStore, type AlertWithRead } from '../store/alertStore';

export type AlertStoreContextValue = AlertStore;

export function AlertStoreProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  React.useEffect(() => {
    resetAlertStore();
    return () => {
      resetAlertStore();
    };
  }, [userId]);

  return <>{children}</>;
}

export { useAlertStore };
export type { AlertWithRead };
