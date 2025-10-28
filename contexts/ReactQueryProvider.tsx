import React from 'react';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient, focusManager } from '@tanstack/react-query';
import { PersistQueryClientProvider } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

const PERSIST_MAX_AGE = 1000 * 60 * 60 * 24; // 24 hours
const PERSIST_KEY = 'fraudshield:react-query-cache';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      networkMode: 'offlineFirst',
      retry: (failureCount, error) => {
        if (error instanceof Error && /401|403/.test(error.message)) {
          return false;
        }
        return failureCount < 3;
      },
      staleTime: 1000 * 30,
      gcTime: 1000 * 60 * 60 * 24,
      refetchOnReconnect: true,
      refetchOnMount: false,
      refetchOnWindowFocus: true,
    },
    mutations: {
      networkMode: 'online',
      retry: 1,
    },
  },
});

const asyncStoragePersister = createAsyncStoragePersister({
  key: PERSIST_KEY,
  storage: AsyncStorage,
  throttleTime: 1000,
});

let focusHandlersConfigured = false;

function configureFocusHandlers() {
  if (focusHandlersConfigured) {
    return;
  }
  focusHandlersConfigured = true;

  focusManager.setEventListener((handleFocus) => {
    const subscription = AppState.addEventListener('change', (status) => {
      handleFocus(status === 'active');
    });

    return () => {
      subscription.remove();
    };
  });
}

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  configureFocusHandlers();

  return (
    <PersistQueryClientProvider
      client={queryClient}
      persistOptions={{
        persister: asyncStoragePersister,
        maxAge: PERSIST_MAX_AGE,
        buster: 'v1',
        dehydrateOptions: {
          shouldDehydrateMutation: () => false,
        },
      }}
    >
      {children}
    </PersistQueryClientProvider>
  );
}
