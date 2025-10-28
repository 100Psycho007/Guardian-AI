import React from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';

import { useAuth } from '../hooks/useAuth';
import {
  clearNotificationPreference,
  clearNotificationOptOut,
  hasNotificationPermissionBeenRequested,
  hasNotificationOptOut,
  markNotificationOptOut,
  markNotificationPermissionRequested,
  readNotificationPreference,
  readNotificationToken,
  saveNotificationPreference,
  saveNotificationToken,
} from '../lib/storage';
import { supabase } from '../lib/supabase';

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

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function registerForPushNotifications(): Promise<string> {
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const permission = await Notifications.requestPermissionsAsync();
    finalStatus = permission.status;
  }

  await markNotificationPermissionRequested();

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
  const [permissionRequested, setPermissionRequested] = React.useState<boolean | null>(null);

  const autoEnableAttemptedRef = React.useRef(false);

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
        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('device_token')
          .eq('id', targetUserId)
          .maybeSingle();

        if (profileError) {
          throw profileError;
        }

        const token = (profile?.device_token ?? null) as string | null;

        if (token) {
          setPushEnabledState(true);
          setDeviceToken(token);
          await Promise.all([
            saveNotificationPreference(targetUserId, true),
            saveNotificationToken(targetUserId, token),
          ]);
        } else {
          setPushEnabledState(false);
          setDeviceToken(null);
          await clearNotificationPreference(targetUserId);
        }
      } catch (error) {
        if (__DEV__) {
          console.warn('Failed to load notification preferences', error);
        }

        try {
          const [enabled, token] = await Promise.all([
            readNotificationPreference(targetUserId),
            readNotificationToken(targetUserId),
          ]);
          setPushEnabledState(Boolean(enabled && token));
          setDeviceToken(enabled && token ? token : null);
        } catch (storageError) {
          if (__DEV__) {
            console.warn('Failed to read cached notification preferences', storageError);
          }
          setPushEnabledState(false);
          setDeviceToken(null);
        }
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

  React.useEffect(() => {
    hasNotificationPermissionBeenRequested()
      .then((value) => {
        setPermissionRequested(value);
      })
      .catch(() => {
        setPermissionRequested(false);
      });
  }, []);

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
          let token: string;
          try {
            token = await registerForPushNotifications();
            setPermissionRequested(true);
          } catch (error) {
            setPermissionRequested(true);
            throw error;
          }

          const { error: upsertError } = await supabase
            .from('profiles')
            .upsert({ id: userId, device_token: token }, { onConflict: 'id' });

          if (upsertError) {
            throw new Error(upsertError.message);
          }

          await Promise.all([
            saveNotificationPreference(userId, true),
            saveNotificationToken(userId, token),
          ]);
          setPushEnabledState(true);
          setDeviceToken(token);
          return {};
        }

        const { error: disableError } = await supabase
          .from('profiles')
          .upsert({ id: userId, device_token: null }, { onConflict: 'id' });

        if (disableError) {
          throw new Error(disableError.message);
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
    [registerForPushNotifications, setPermissionRequested, supabase, updating, userId],
  );

  React.useEffect(() => {
    if (!userId) {
      autoEnableAttemptedRef.current = false;
      return;
    }

    if (permissionRequested === null || isLoading || updating) {
      return;
    }

    if (pushEnabled) {
      return;
    }

    if (autoEnableAttemptedRef.current) {
      return;
    }

    if (permissionRequested) {
      autoEnableAttemptedRef.current = true;
      return;
    }

    autoEnableAttemptedRef.current = true;
    setPushEnabled(true).then((result) => {
      if (result.error && __DEV__) {
        console.warn('Automatic push enable failed', result.error);
      }
    });
  }, [userId, permissionRequested, pushEnabled, setPushEnabled, isLoading, updating]);

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
