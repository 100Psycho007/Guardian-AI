import 'react-native-gesture-handler';
import React from 'react';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';

import { assertEnv } from '../lib/env';
import { ThemeProvider, useThemeController } from '../contexts/ThemeContext';
import { AuthProvider } from '../contexts/AuthContext';
import { AlertStoreProvider } from '../contexts/AlertStoreContext';
import { NotificationPreferencesProvider } from '../contexts/NotificationPreferencesContext';
import { useNotificationRouting } from '../hooks/useNotificationRouting';

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
        <ThemeProvider>
          <AuthProvider>
            <NotificationPreferencesProvider>
              <AlertStoreProvider>
                <AppContent />
              </AlertStoreProvider>
            </NotificationPreferencesProvider>
          </AuthProvider>
        </ThemeProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function AppContent() {
  const { colorScheme } = useThemeController();
  useNotificationRouting();

  return (
    <>
      <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
