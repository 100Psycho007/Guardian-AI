import React from 'react';
import { Platform } from 'react-native';

type ScreenCaptureModule = typeof import('expo-screen-capture');
type ScreenshotSubscription = ReturnType<ScreenCaptureModule['addScreenshotListener']> | null;

type Listener = (() => void) | null | undefined;

type UseScreenCaptureListenerOptions = {
  enabled?: boolean;
  requestPermission?: boolean;
};

const MIN_ANDROID_API_LEVEL = 34;

function getAndroidApiLevel() {
  const version = Platform.Version;
  if (typeof version === 'number') {
    return version;
  }
  if (typeof version === 'string') {
    const parsed = Number.parseInt(version, 10);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

function isFunction<T extends (...args: any[]) => any>(value: unknown): value is T {
  return typeof value === 'function';
}

function shouldEnableListener(enabled: boolean) {
  if (!enabled) {
    return false;
  }

  if (Platform.OS === 'ios') {
    return true;
  }

  if (Platform.OS === 'android') {
    const apiLevel = getAndroidApiLevel();
    return apiLevel === null ? true : apiLevel >= MIN_ANDROID_API_LEVEL;
  }

  return false;
}

async function ensureAndroidPermission(module: ScreenCaptureModule, shouldRequest: boolean) {
  if (Platform.OS !== 'android') {
    return true;
  }

  const getPermissions = module.getPermissionsAsync;
  const requestPermissions = module.requestPermissionsAsync;

  if (!isFunction(getPermissions)) {
    return true;
  }

  try {
    const status = await getPermissions();
    if (status.granted) {
      return true;
    }

    if (!shouldRequest || !status.canAskAgain || !isFunction(requestPermissions)) {
      if (__DEV__) {
        console.info('[screen-capture] Screenshot permission not granted. Screen capture listener disabled.');
      }
      return false;
    }

    const result = await requestPermissions();
    if (!result.granted && __DEV__) {
      console.info('[screen-capture] Screenshot permission request denied. Screen capture listener disabled.');
    }
    return result.granted;
  } catch (error) {
    if (__DEV__) {
      console.info('[screen-capture] Failed to get screenshot permissions.', error);
    }
    return false;
  }
}

export function useScreenCaptureListener(listener: Listener, options?: UseScreenCaptureListenerOptions) {
  const listenerRef = React.useRef<Listener>(listener);
  listenerRef.current = listener;

  const enabled = options?.enabled ?? true;
  const requestPermission = options?.requestPermission ?? true;

  React.useEffect(() => {
    if (!shouldEnableListener(enabled)) {
      return undefined;
    }

    let isMounted = true;
    let module: ScreenCaptureModule | null = null;
    let subscription: ScreenshotSubscription = null;

    const setup = async () => {
      try {
        const ScreenCapture = await import('expo-screen-capture');
        if (!isMounted) {
          return;
        }

        module = ScreenCapture;

        if (!isFunction(ScreenCapture.addScreenshotListener)) {
          if (__DEV__) {
            console.info('[screen-capture] addScreenshotListener is unavailable on this platform.');
          }
          return;
        }

        const hasPermission = await ensureAndroidPermission(ScreenCapture, requestPermission);
        if (!hasPermission) {
          return;
        }

        subscription = ScreenCapture.addScreenshotListener(() => {
          if (!isMounted) {
            return;
          }
          listenerRef.current?.();
        });
      } catch (error) {
        if (__DEV__) {
          console.info('[screen-capture] Failed to initialize screen capture listener.', error);
        }
      }
    };

    if (Platform.OS === 'android' || Platform.OS === 'ios') {
      setup().catch((error) => {
        if (__DEV__) {
          console.info('[screen-capture] Unexpected error during listener setup.', error);
        }
      });
    }

    return () => {
      isMounted = false;
      if (!subscription) {
        return;
      }

      try {
        if (module && isFunction(module.removeScreenshotListener)) {
          module.removeScreenshotListener(subscription);
        } else if (isFunction(subscription.remove)) {
          subscription.remove();
        }
      } catch (error) {
        if (__DEV__) {
          console.info('[screen-capture] Failed to remove screen capture listener.', error);
        }
      }
    };
  }, [enabled, requestPermission]);
}
