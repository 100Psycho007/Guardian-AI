import React from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { useAuth } from '../hooks/useAuth';
import {
  clearNotificationPreference,
  readNotificationPreference,
  readNotificationToken,
  saveNotificationPreference,
  saveNotificationToken,
} from '../lib/storage';

export type NotificationPreferencesContextValue = {
  isLoading: boolean;
  updating: boolean;
  pushEnabled: boolean;
  deviceToken: string | null;
  setPushEnabled: (enabled: boolean) => Promise<{ error?: string }>;
  refresh: () => Promise<void>;
};

const NotificationPreferencesContext = React.createContext<NotificationPreferencesContextValue | undefined>(
  undefined,
);

async function registerForPushNotifications(): Promise<string> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const permission = await Notifications.requestPermissionsAsync();
    finalStatus = permission.status;
  }

  if (finalStatus !== 'granted') {
    throw new Error('Push notification permissions were not granted.');
  }

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Default',
      importance: Notifications.AndroidImportance.MAX,
    });
  }

  const projectId = Constants.expoConfig?.extra?.eas?.projectId ?? Constants.expoConfig?.slug ?? undefined;

  const token = await Notifications.getExpoPushTokenAsync(projectId ? { projectId } : undefined);
  if (!token?.data) {
    throw new Error('Device push token is unavailable. Try again on a physical device.');
  }

  return token.data;
}

export function NotificationPreferencesProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const userId = session?.user?.id ?? null;

  const [pushEnabled, setPushEnabledState] = React.useState(false);
  const [deviceToken, setDeviceToken] = React.useState<string | null>(null);
  const [isLoading, setIsLoading] = React.useState(false);
  const [updating, setUpdating] = React.useState(false);

  const hydrate = React.useCallback(
    async (targetUserId: string | null) => {
      if (!targetUserId) {
        setPushEnabledState(false);
        setDeviceToken(null);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      try {
        const [enabled, token] = await Promise.all([
          readNotificationPreference(targetUserId),
          readNotificationToken(targetUserId),
        ]);
        setPushEnabledState(Boolean(enabled && token));
        setDeviceToken(enabled && token ? token : null);
      } catch (error) {
        if (__DEV__) {
          console.warn('Failed to load notification preferences', error);
        }
        setPushEnabledState(false);
        setDeviceToken(null);
      } finally {
        setIsLoading(false);
      }
    },
    [],
  );

  React.useEffect(() => {
    hydrate(userId).catch((error) => {
      if (__DEV__) {
        console.warn('Notification preference hydration failed', error);
      }
    });
  }, [hydrate, userId]);

  const setPushEnabled = React.useCallback(
    async (enabled: boolean) => {
      if (!userId) {
        return { error: 'Sign in to manage notification preferences.' };
      }

      if (updating) {
        return { error: 'Notification preference update in progress. Please wait.' };
      }

      setUpdating(true);
      try {
        if (enabled) {
          const token = await registerForPushNotifications();
          await Promise.all([
            saveNotificationPreference(userId, true),
            saveNotificationToken(userId, token),
          ]);
          setPushEnabledState(true);
          setDeviceToken(token);
          return {};
        }

        await clearNotificationPreference(userId);
        setPushEnabledState(false);
        setDeviceToken(null);
        return {};
      } catch (error) {
        if (__DEV__) {
          console.warn('Failed to update push notification preference', error);
        }
        const message =
          error instanceof Error
            ? error.message
            : 'Unable to update notification settings. Please try again later.';
        return { error: message };
      } finally {
        setUpdating(false);
      }
    },
    [updating, userId],
  );

  const refresh = React.useCallback(async () => {
    await hydrate(userId);
  }, [hydrate, userId]);

  const value = React.useMemo<NotificationPreferencesContextValue>(
    () => ({
      isLoading,
      updating,
      pushEnabled,
      deviceToken,
      setPushEnabled,
      refresh,
    }),
    [isLoading, updating, pushEnabled, deviceToken, setPushEnabled, refresh],
  );

  return <NotificationPreferencesContext.Provider value={value}>{children}</NotificationPreferencesContext.Provider>;
}

export function useNotificationPreferences() {
  const context = React.useContext(NotificationPreferencesContext);

  if (!context) {
    throw new Error('useNotificationPreferences must be used within a NotificationPreferencesProvider');
  }

  return context;
}
