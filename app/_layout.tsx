import 'react-native-gesture-handler';
import React from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { useFonts, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { getQueryClient, ensureQueryClientHydrated } from '../lib/query-client';
import { getTheme } from '../lib/theme';
import { useThemePreference } from '../hooks/useThemePreference';
import { assertEnv } from '../lib/env';

export default function RootLayout() {
  assertEnv();
  const colorScheme = useThemePreference();
  const theme = React.useMemo(() => getTheme(colorScheme), [colorScheme]);
  const queryClient = React.useMemo(() => getQueryClient(), []);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
  });
  const [isQueryHydrated, setIsQueryHydrated] = React.useState(false);

  React.useEffect(() => {
    let isMounted = true;

    ensureQueryClientHydrated().finally(() => {
      if (isMounted) {
        setIsQueryHydrated(true);
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (!fontsLoaded || !isQueryHydrated) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <PaperProvider theme={theme}>
            <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
            <Stack screenOptions={{ headerShown: false }} />
          </PaperProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
