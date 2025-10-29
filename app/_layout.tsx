import 'react-native-gesture-handler';
import 'react-native-reanimated';
import React from 'react';
import { Platform } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';

import { assertEnv } from '../lib/env';
import { trackEvent } from '../lib/analytics';
import { ThemeProvider, useThemeController } from '../contexts/ThemeContext';
import { ToastProvider } from '../contexts/ToastContext';
import { AuthProvider } from '../contexts/AuthContext';
import { AlertStoreProvider } from '../contexts/AlertStoreContext';
import { NotificationPreferencesProvider } from '../contexts/NotificationPreferencesContext';
import { useScreenCaptureListener } from '../hooks/useScreenCaptureListener';
import { useNotificationRouting } from '../hooks/useNotificationRouting';
import { useToast } from '../hooks/useToast';
import { ReactQueryProvider } from '../contexts/ReactQueryProvider';
import { ConnectivityProvider } from '../contexts/ConnectivityContext';
import { OfflineBanner } from '../components/OfflineBanner';
import { AppErrorBoundary } from '../components/AppErrorBoundary';

export default function RootLayout() {
  assertEnv();

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
  });

  if (!fontsLoaded) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <ReactQueryProvider>
          <ConnectivityProvider>
            <ThemeProvider>
              <AppErrorBoundary>
                <ToastProvider>
                  <AuthProvider>
                    <NotificationPreferencesProvider>
                      <AlertStoreProvider>
                        <AppContent />
                      </AlertStoreProvider>
                    </NotificationPreferencesProvider>
                  </AuthProvider>
                </ToastProvider>
              </AppErrorBoundary>
            </ThemeProvider>
          </ConnectivityProvider>
        </ReactQueryProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const { colorScheme } = useThemeController();
  const { showToast } = useToast();
  const lastCaptureRef = React.useRef(0);

  useNotificationRouting();

  const handleScreenCapture = React.useCallback(() => {
    const now = Date.now();
    if (now - lastCaptureRef.current < 5000) {
      return;
    }

    lastCaptureRef.current = now;

    trackEvent('security.screen_capture_detected', {
      platform: Platform.OS,
    });

    showToast({
      message: 'Screen capture detected. Sensitive information may be exposed.',
      type: 'info',
      source: 'screen_capture',
    });
  }, [showToast]);

  useScreenCaptureListener(handleScreenCapture);

  return (
    <>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <OfflineBanner />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
