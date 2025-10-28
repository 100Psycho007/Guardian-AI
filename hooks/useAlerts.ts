import { useQuery, type UseQueryResult } from '@tanstack/react-query';

import type { FraudAlert } from '../lib/supabase';
import {
  selectAlertFilters,
  selectUnreadBySeverity,
  selectUnreadTotal,
  useAlertsStore,
} from '../store/alerts';
import type { AlertFilters } from '../store/alerts';

export type UseAlertsResult = {
  alerts: FraudAlert[];
  alertsQuery: UseQueryResult<FraudAlert[]>;
  filters: AlertFilters;
  unreadBySeverity: Record<FraudAlert['severity'], number>;
  totalUnread: number;
  setFilters: (filters: Partial<AlertFilters>) => void;
  resetFilters: () => void;
  setUnreadForSeverity: (severity: FraudAlert['severity'], count: number) => void;
  incrementUnread: (severity: FraudAlert['severity']) => void;
  markSeverityAsRead: (severity: FraudAlert['severity']) => void;
  clearUnread: () => void;
};

export function useAlerts(): UseAlertsResult {
  const filters = useAlertsStore(selectAlertFilters);
  const unreadBySeverity = useAlertsStore(selectUnreadBySeverity);
  const totalUnread = useAlertsStore(selectUnreadTotal);

  const setFilters = useAlertsStore((state) => state.setFilters);
  const resetFilters = useAlertsStore((state) => state.resetFilters);
  const setUnreadForSeverity = useAlertsStore((state) => state.setUnreadForSeverity);
  const incrementUnread = useAlertsStore((state) => state.incrementUnread);
  const markSeverityAsRead = useAlertsStore((state) => state.markSeverityAsRead);
  const clearUnread = useAlertsStore((state) => state.clearUnread);

  const alertsQuery = useQuery({
    queryKey: ['alerts', filters.status, filters.severity, filters.searchTerm],
    queryFn: async (): Promise<FraudAlert[]> => [],
    enabled: false,
    initialData: [] as FraudAlert[],
  });

  return {
    alerts: alertsQuery.data ?? [],
    alertsQuery,
    filters,
    unreadBySeverity,
    totalUnread,
    setFilters,
    resetFilters,
    setUnreadForSeverity,
    incrementUnread,
    markSeverityAsRead,
    clearUnread,
  };
}
