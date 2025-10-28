import AsyncStorage from '@react-native-async-storage/async-storage';

export const SCAN_QUEUE_STORAGE_KEY = 'scan:pending_queue';
export const SCAN_RESULTS_STORAGE_KEY = 'scan:results';

export type PendingScan = {
  id: string;
  userId: string;
  storagePath: string;
  bucket: string;
  localUri: string;
  createdAt: number;
  metadata?: Record<string, unknown>;
  attempts: number;
  lastError?: string | null;
  nextRetryAt?: number | null;
};

export type StoredScanResult = {
  id: string;
  userId: string;
  storagePath: string;
  bucket: string;
  createdAt: number;
  processedAt: number;
  response: unknown;
};

const RETRY_BASE_DELAY_MS = 5000;
const RETRY_MAX_DELAY_MS = 120000;

type StoredPendingScan = Omit<PendingScan, 'attempts' | 'lastError' | 'nextRetryAt'> &
  Partial<Pick<PendingScan, 'attempts' | 'lastError' | 'nextRetryAt'>>;

export function getScanRetryDelay(attempt: number): number {
  if (!Number.isFinite(attempt) || attempt <= 0) {
    return RETRY_BASE_DELAY_MS;
  }

  const exponent = Math.max(0, attempt - 1);
  const delay = RETRY_BASE_DELAY_MS * 2 ** exponent;
  return Math.min(delay, RETRY_MAX_DELAY_MS);
}

function normalizePendingScan(item: StoredPendingScan): PendingScan {
  const attempts = Number.isFinite(item.attempts) ? Number(item.attempts) : 0;
  const nextRetryAt = Number.isFinite(item.nextRetryAt ?? undefined) ? Number(item.nextRetryAt) : null;

  return {
    ...item,
    attempts,
    lastError: item.lastError ?? null,
    nextRetryAt,
  } as PendingScan;
}

async function readJson<T>(key: string): Promise<T | null> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return null;

  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    await AsyncStorage.removeItem(key);
    if (__DEV__) {
      console.warn(`Failed to parse persisted data for ${key}`, error);
    }
    return null;
  }
}

async function writeJson<T>(key: string, value: T) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function loadPendingScans(): Promise<PendingScan[]> {
  const queue = await readJson<StoredPendingScan[]>(SCAN_QUEUE_STORAGE_KEY);
  if (!queue) return [];

  return queue.map((item) => normalizePendingScan(item)).sort((a, b) => a.createdAt - b.createdAt);
}

export async function savePendingScans(queue: PendingScan[]): Promise<PendingScan[]> {
  const normalized = queue
    .map((item) => normalizePendingScan(item))
    .sort((a, b) => a.createdAt - b.createdAt);
  await writeJson(SCAN_QUEUE_STORAGE_KEY, normalized);
  return normalized;
}

export async function addPendingScan(item: PendingScan): Promise<PendingScan[]> {
  const queue = await loadPendingScans();
  const filtered = queue.filter((existing) => existing.id !== item.id);
  const next = [...filtered, normalizePendingScan(item)];
  return savePendingScans(next);
}

export async function updatePendingScan(id: string, updates: Partial<PendingScan>): Promise<PendingScan[]> {
  const queue = await loadPendingScans();
  const next = queue.map((item) => (item.id === id ? { ...item, ...updates } : item));
  return savePendingScans(next);
}

export async function removePendingScan(id: string): Promise<PendingScan[]> {
  const queue = await loadPendingScans();
  const next = queue.filter((item) => item.id !== id);
  return savePendingScans(next);
}

export async function loadStoredResults(): Promise<StoredScanResult[]> {
  const results = await readJson<StoredScanResult[]>(SCAN_RESULTS_STORAGE_KEY);
  if (!results) return [];
  return results;
}

const MAX_STORED_RESULTS = 50;

export async function addStoredResult(result: StoredScanResult): Promise<StoredScanResult[]> {
  const results = await loadStoredResults();
  const filtered = results.filter((item) => item.id !== result.id);
  const next = [result, ...filtered].sort((a, b) => b.processedAt - a.processedAt).slice(0, MAX_STORED_RESULTS);
  await writeJson(SCAN_RESULTS_STORAGE_KEY, next);
  return next;
}

export async function getStoredResultById(id: string): Promise<StoredScanResult | null> {
  const results = await loadStoredResults();
  return results.find((item) => item.id === id) ?? null;
}

export async function overwriteStoredResults(results: StoredScanResult[]) {
  await writeJson(SCAN_RESULTS_STORAGE_KEY, results.slice(0, MAX_STORED_RESULTS));
}
