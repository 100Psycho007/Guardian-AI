import AsyncStorage from '@react-native-async-storage/async-storage';
import { QueryClient } from '@tanstack/react-query';
import { persistQueryClient } from '@tanstack/react-query-persist-client';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';

const QUERY_CACHE_STORAGE_KEY = 'app-query-cache';
export const DEFAULT_QUERY_STALE_TIME_MS = 1000 * 60 * 5;
const DEFAULT_QUERY_GC_TIME_MS = 1000 * 60 * 60 * 24;

let queryClient: QueryClient | null = null;
let hydrationPromise: Promise<void> | null = null;

function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: DEFAULT_QUERY_STALE_TIME_MS,
        gcTime: DEFAULT_QUERY_GC_TIME_MS,
      },
      mutations: {
        gcTime: DEFAULT_QUERY_GC_TIME_MS,
      },
    },
  });
}

function getQueryPersister() {
  return createAsyncStoragePersister({
    storage: AsyncStorage,
    key: QUERY_CACHE_STORAGE_KEY,
  });
}

export function getQueryClient() {
  if (!queryClient) {
    queryClient = createQueryClient();
  }

  return queryClient;
}

export async function ensureQueryClientHydrated(): Promise<void> {
  if (!hydrationPromise) {
    hydrationPromise = persistQueryClient({
      queryClient: getQueryClient(),
      persister: getQueryPersister(),
      maxAge: DEFAULT_QUERY_GC_TIME_MS,
    }).catch((error) => {
      console.warn('Failed to hydrate React Query cache', error);
    });
  }

  await hydrationPromise;
}
