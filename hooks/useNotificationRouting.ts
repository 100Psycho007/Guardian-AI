import React from 'react';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

import { useAuth } from './useAuth';

type NotificationData = Record<string, unknown> | undefined | null;

type PendingNotification = {
  identifier: string;
  data: Record<string, unknown>;
};

function isString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function normalizeData(data: NotificationData): Record<string, unknown> {
  if (data && typeof data === 'object' && !Array.isArray(data)) {
    return data as Record<string, unknown>;
  }
  return {};
}

export function useNotificationRouting() {
  const router = useRouter();
  const { session } = useAuth();

  const processedNotificationsRef = React.useRef<Set<string>>(new Set());
  const pendingNotificationRef = React.useRef<PendingNotification | null>(null);

  const navigateToTarget = React.useCallback(
    (data: Record<string, unknown>) => {
      const type = isString(data.type) ? data.type.toLowerCase() : null;
      const alertId = isString(data.alertId) ? data.alertId : null;
      const scanId = isString(data.scanId) ? data.scanId : null;

      if (type === 'fraud_alert' && alertId) {
        router.push({ pathname: '/(tabs)/alerts', params: { alertId } });
        return true;
      }

      if (type === 'scan_result' && scanId) {
        router.push({ pathname: '/(tabs)/scan/result/[id]', params: { id: scanId } });
        return true;
      }

      if (alertId) {
        router.push({ pathname: '/(tabs)/alerts', params: { alertId } });
        return true;
      }

      if (scanId) {
        router.push({ pathname: '/(tabs)/scan/result/[id]', params: { id: scanId } });
        return true;
      }

      return false;
    },
    [router],
  );

  const handleNotificationResponse = React.useCallback(
    (response: Notifications.NotificationResponse | null) => {
      if (!response) {
        return;
      }

      const identifier = response.notification.request.identifier;
      if (processedNotificationsRef.current.has(identifier)) {
        return;
      }

      const data = normalizeData(response.notification.request.content.data);

      if (!session) {
        pendingNotificationRef.current = { identifier, data };
        return;
      }

      processedNotificationsRef.current.add(identifier);
      const handled = navigateToTarget(data);

      if (!handled && __DEV__) {
        console.warn('Notification payload did not map to a navigation target.', data);
      }
    },
    [navigateToTarget, session],
  );

  React.useEffect(() => {
    const subscription = Notifications.addNotificationResponseReceivedListener(handleNotificationResponse);
    return () => {
      subscription.remove();
    };
  }, [handleNotificationResponse]);

  React.useEffect(() => {
    let active = true;
    Notifications.getLastNotificationResponseAsync()
      .then((response) => {
        if (!active) {
          return;
        }
        handleNotificationResponse(response ?? null);
      })
      .catch((error) => {
        if (__DEV__) {
          console.warn('Failed to fetch last notification response', error);
        }
      });

    return () => {
      active = false;
    };
  }, [handleNotificationResponse]);

  React.useEffect(() => {
    if (!session) {
      return;
    }

    if (!pendingNotificationRef.current) {
      return;
    }

    const pending = pendingNotificationRef.current;
    pendingNotificationRef.current = null;

    processedNotificationsRef.current.add(pending.identifier);
    const handled = navigateToTarget(pending.data);

    if (!handled && __DEV__) {
      console.warn('Pending notification payload did not map to a navigation target.', pending.data);
    }
  }, [session, navigateToTarget]);
}
