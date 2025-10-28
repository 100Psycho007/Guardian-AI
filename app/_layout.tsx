import 'react-native-gesture-handler';
import React from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { Stack } from 'expo-router';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import NetInfo from '@react-native-community/netinfo';
import { QueryClient, QueryClientProvider, focusManager, onlineManager } from '@tanstack/react-query';
import { useFonts, Inter_400Regular, Inter_600SemiBold } from '@expo-google-fonts/inter';
import { getTheme } from '../lib/theme';
import { useThemePreference } from '../hooks/useThemePreference';
import { assertEnv } from '../lib/env';
import { AuthProvider } from '../contexts/AuthContext';

export default function RootLayout() {
  assertEnv();
  const colorScheme = useThemePreference();
  const theme = React.useMemo(() => getTheme(colorScheme), [colorScheme]);

  const queryClientRef = React.useRef<QueryClient>();
  if (!queryClientRef.current) {
    queryClientRef.current = new QueryClient({
      defaultOptions: {
        queries: {
          staleTime: 30_000,
          refetchOnReconnect: true,
          refetchOnWindowFocus: true,
          retry: 1,
        },
        mutations: {
          retry: 1,
        },
      },
    });
  }
  const queryClient = queryClientRef.current;

  React.useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const online = Boolean(state.isConnected && state.isInternetReachable !== false);
      onlineManager.setOnline(online);
    });

    NetInfo.fetch()
      .then((state) => {
        const online = Boolean(state.isConnected && state.isInternetReachable !== false);
        onlineManager.setOnline(online);
      })
      .catch(() => undefined);

    return unsubscribe;
  }, []);

  React.useEffect(() => {
    const onAppStateChange = (status: AppStateStatus) => {
      focusManager.setFocused(status === 'active');
    };

    const subscription = AppState.addEventListener('change', onAppStateChange);
    return () => subscription.remove();
  }, []);

  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_600SemiBold,
  });

  if (!fontsLoaded || !queryClient) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <QueryClientProvider client={queryClient}>
          <PaperProvider theme={theme}>
            <AuthProvider>
              <StatusBar style={colorScheme === 'dark' ? 'light' : 'dark'} />
              <Stack screenOptions={{ headerShown: false }} />
            </AuthProvider>
          </PaperProvider>
        </QueryClientProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
