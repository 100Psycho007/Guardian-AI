import type { Json } from './supabase';

export type AnalyticsEvent = {
  name: string;
  properties?: Record<string, Json>;
  timestamp: number;
};

export type AnalyticsErrorEvent = {
  name: string;
  message: string;
  stack?: string;
  context?: Record<string, Json>;
  fatal?: boolean;
  timestamp: number;
};

export type AnalyticsListener = (event: AnalyticsEvent) => void;
export type AnalyticsErrorListener = (event: AnalyticsErrorEvent) => void;

const eventListeners = new Set<AnalyticsListener>();
const errorListeners = new Set<AnalyticsErrorListener>();

export function addAnalyticsListener(listener: AnalyticsListener) {
  eventListeners.add(listener);
  return () => {
    eventListeners.delete(listener);
  };
}

export function addAnalyticsErrorListener(listener: AnalyticsErrorListener) {
  errorListeners.add(listener);
  return () => {
    errorListeners.delete(listener);
  };
}

function emitEvent(event: AnalyticsEvent) {
  eventListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (listenerError) {
      if (__DEV__) {
        console.warn('[analytics] listener error', listenerError);
      }
    }
  });
}

function emitError(event: AnalyticsErrorEvent) {
  errorListeners.forEach((listener) => {
    try {
      listener(event);
    } catch (listenerError) {
      if (__DEV__) {
        console.warn('[analytics] error listener error', listenerError);
      }
    }
  });
}

function normalizeProperties(properties?: Record<string, unknown>): Record<string, Json> | undefined {
  if (!properties) return undefined;
  const normalized: Record<string, Json> = {};
  for (const [key, value] of Object.entries(properties)) {
    if (value === undefined) continue;
    if (value === null) {
      normalized[key] = null;
      continue;
    }
    if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
      normalized[key] = value;
      continue;
    }
    if (Array.isArray(value)) {
      normalized[key] = value
        .map((entry) => {
          if (entry === null) return null;
          if (typeof entry === 'number' || typeof entry === 'string' || typeof entry === 'boolean') {
            return entry;
          }
          if (typeof entry === 'object' && entry !== null) {
            return normalizeProperties(entry as Record<string, unknown>) ?? null;
          }
          return String(entry);
        })
        .slice(0, 20) as Json[];
      continue;
    }
    if (typeof value === 'object') {
      normalized[key] = normalizeProperties(value as Record<string, unknown>) ?? null;
      continue;
    }
    normalized[key] = String(value);
  }
  return normalized;
}

export function trackEvent(name: string, properties?: Record<string, unknown>) {
  const payload: AnalyticsEvent = {
    name,
    properties: normalizeProperties(properties),
    timestamp: Date.now(),
  };

  if (__DEV__) {
    console.log('[analytics]', payload);
  }

  emitEvent(payload);
}

function parseError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack,
    };
  }
  if (typeof error === 'string') {
    return { message: error };
  }
  try {
    return { message: JSON.stringify(error) };
  } catch (_jsonError) {
    return { message: String(error) };
  }
}

export function trackError(name: string, error: unknown, context?: Record<string, unknown>, fatal = false) {
  const parsed = parseError(error);
  const payload: AnalyticsErrorEvent = {
    name,
    message: parsed.message,
    stack: parsed.stack,
    context: normalizeProperties(context),
    fatal,
    timestamp: Date.now(),
  };

  if (__DEV__) {
    console.error('[analytics:error]', payload);
  }

  emitError(payload);
}

export function withAnalytics<TArgs extends unknown[], TResult>(
  name: string,
  handler: (...args: TArgs) => Promise<TResult>,
  properties?: Record<string, unknown>,
) {
  return async (...args: TArgs) => {
    try {
      const result = await handler(...args);
      trackEvent(name, properties);
      return result;
    } catch (error) {
      trackError(`${name}:failed`, error, properties);
      throw error;
    }
  };
}
