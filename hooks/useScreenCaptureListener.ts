import React from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Android 14+ (API 34) requires DETECT_SCREEN_CAPTURE
const MIN_ANDROID_API_LEVEL = 34;

function getAndroidApiLevel() {
  const version = Platform.Version;
  if (typeof version === 'number') return version;
  const parsed = parseInt(version as string, 10);
  return Number.isNaN(parsed) ? null : parsed;
}

export function useScreenCaptureListener(listener?: () => void) {
  React.useEffect(() => {
    // 🚫 Skip everything in Expo Go
    if (Constants.appOwnership === 'expo') {
      console.log('[ScreenCapture] Skipping listener in Expo Go');
      return;
    }

    // 🚫 Skip on Android 14+ (API 34+) to avoid DETECT_SCREEN_CAPTURE crash
    if (Platform.OS === 'android' && getAndroidApiLevel()! >= MIN_ANDROID_API_LEVEL) {
      console.log('[ScreenCapture] Skipping listener: Android 14+ requires permission.');
      return;
    }

    let subscription: any;

    (async () => {
      try {
        // 🧩 Dynamically import only if not in Expo Go
        const ScreenCapture = await import('expo-screen-capture');
        if (typeof ScreenCapture.addScreenshotListener === 'function') {
          subscription = ScreenCapture.addScreenshotListener(() => {
            listener?.();
          });
        } else {
          console.log('[ScreenCapture] addScreenshotListener not available');
        }
      } catch (error) {
        console.log('[ScreenCapture] Disabled:', error);
      }
    })();

    return () => {
      try {
        if (subscription?.remove) {
          subscription.remove();
        }
      } catch (err) {
        console.log('[ScreenCapture] cleanup error:', err);
      }
    };
  }, [listener]);
}
