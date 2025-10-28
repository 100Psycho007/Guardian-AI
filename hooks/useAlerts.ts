import React from 'react';
import type { RealtimeChannel, RealtimePostgresChangesPayload } from '@supabase/supabase-js';

import { useAuth } from './useAuth';
import { supabase, type FraudAlert } from '../lib/supabase';
import { useAlertStore, type AlertStore } from '../store/alertStore';

export function useAlerts(): AlertStore;
export function useAlerts<T>(selector: (state: AlertStore) => T): T;
export function useAlerts<T>(selector?: (state: AlertStore) => T) {
  if (selector) {
    return useAlertStore(selector);
  }
  return useAlertStore();
}

export function useUnreadAlertCount() {
  return useAlertStore((state) => state.unreadCount);
}

export function useLatestRealtimeAlert() {
  return useAlertStore((state) => state.latestRealtimeAlert);
}

type AlertsLoaderOptions = {
  limit?: number;
};

export function useAlertsLoader({ limit = 50 }: AlertsLoaderOptions = {}) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const replaceAlerts = useAlertStore((state) => state.replaceAlerts);
  const reset = useAlertStore((state) => state.reset);

  const load = React.useCallback(
    async (overrideLimit?: number): Promise<{ error?: string }> => {
      if (!userId) {
        reset();
        return { error: 'NOT_AUTHENTICATED' };
      }

      const { data, error } = await supabase
        .from('fraud_alerts')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .limit(overrideLimit ?? limit);

      if (error) {
        return { error: error.message };
      }

      replaceAlerts((data ?? []) as FraudAlert[]);
      return {};
    },
    [userId, replaceAlerts, reset, limit],
  );

  return React.useMemo(
    () => ({
      load,
    }),
    [load],
  );
}

const realtimeListeners = new Set<(alert: FraudAlert) => void>();
let realtimeChannel: RealtimeChannel | null = null;
let realtimeUserId: string | null = null;
let realtimeSubscriberCount = 0;

function emitRealtimeAlert(alert: FraudAlert) {
  realtimeListeners.forEach((listener) => {
    try {
      listener(alert);
    } catch (error) {
      if (__DEV__) {
        console.warn('Alert realtime listener failed', error);
      }
    }
  });
}

function handleRealtimePayload(payload: RealtimePostgresChangesPayload<FraudAlert>) {
  const record = payload.new as FraudAlert | null;
  if (!record) {
    return;
  }
  useAlertStore.getState().upsertAlert(record, { fromRealtime: true });
  emitRealtimeAlert(record);
}

function disconnectRealtimeChannel() {
  if (realtimeChannel) {
    void supabase.removeChannel(realtimeChannel);
    realtimeChannel = null;
    realtimeUserId = null;
  }
}

function ensureRealtimeChannel(userId: string) {
  if (realtimeChannel && realtimeUserId === userId) {
    return;
  }

  disconnectRealtimeChannel();

  const channel = supabase
    .channel(`fraud_alerts:user:${userId}`)
    .on(
      'postgres_changes',
      { event: 'INSERT', schema: 'public', table: 'fraud_alerts', filter: `user_id=eq.${userId}` },
      handleRealtimePayload,
    )
    .on(
      'postgres_changes',
      { event: 'UPDATE', schema: 'public', table: 'fraud_alerts', filter: `user_id=eq.${userId}` },
      handleRealtimePayload,
    )
    .subscribe();

  realtimeChannel = channel;
  realtimeUserId = userId;
}

export function useAlertsRealtime(options?: { onAlert?: (alert: FraudAlert) => void }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const onAlertRef = React.useRef(options?.onAlert);
  React.useEffect(() => {
    onAlertRef.current = options?.onAlert;
  }, [options?.onAlert]);

  React.useEffect(() => {
    if (!userId) {
      realtimeListeners.clear();
      realtimeSubscriberCount = 0;
      disconnectRealtimeChannel();
      return;
    }

    realtimeSubscriberCount += 1;
    ensureRealtimeChannel(userId);

    const listener = (alert: FraudAlert) => {
      onAlertRef.current?.(alert);
    };

    realtimeListeners.add(listener);

    return () => {
      realtimeListeners.delete(listener);
      realtimeSubscriberCount = Math.max(0, realtimeSubscriberCount - 1);
      if (realtimeSubscriberCount === 0) {
        realtimeListeners.clear();
        disconnectRealtimeChannel();
      }
    };
  }, [userId]);
}
