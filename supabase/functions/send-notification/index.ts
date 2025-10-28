import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';

import {
  chunkArray,
  deriveExpoPriority,
  type ExpoPriority,
  type NormalizedNotificationPayload,
  ValidationError,
  validateNotificationPayload,
} from './shared.ts';

const EXPO_PUSH_ENDPOINT = 'https://exp.host/--/api/v2/push/send';
const MAX_EXPO_CHUNK_SIZE = 100;

type LogLevel = 'info' | 'warn' | 'error';

type LogContext = Record<string, unknown>;

interface ExpoMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  priority: ExpoPriority;
  sound: 'default';
  badge?: number;
}

interface ExpoTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: Record<string, unknown>;
}

interface ExpoPushError {
  message: string;
  code?: string;
  details?: Record<string, unknown>;
}

interface ExpoBatchResponse {
  data?: ExpoTicket[];
  errors?: ExpoPushError[];
}

interface ExpoSuccessTicket {
  to: string;
  status: 'ok';
  id?: string;
}

interface ExpoFailureTicket {
  to: string | null;
  status: 'error';
  message: string;
  details?: Record<string, unknown>;
}

type WithRetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: boolean;
  onRetry?: (error: unknown, attempt: number) => void;
};

function log(level: LogLevel, message: string, context: LogContext = {}) {
  const entry = {
    level,
    message,
    source: 'send-notification',
    ts: new Date().toISOString(),
    ...context,
  };

  if (level === 'error') {
    console.error(entry);
  } else if (level === 'warn') {
    console.warn(entry);
  } else {
    console.log(entry);
  }
}

function jsonResponse(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

async function wait(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry<T>(operation: (attempt: number) => Promise<T>, options: WithRetryOptions = {}): Promise<T> {
  const {
    attempts = 3,
    baseDelayMs = 350,
    maxDelayMs = 3_000,
    factor = 2,
    jitter = true,
    onRetry,
  } = options;

  let attempt = 0;
  let lastError: unknown;

  while (attempt < attempts) {
    attempt += 1;
    try {
      return await operation(attempt);
    } catch (error) {
      lastError = error;
      if (attempt >= attempts) {
        break;
      }

      onRetry?.(error, attempt);

      const delayBase = Math.min(maxDelayMs, baseDelayMs * Math.pow(factor, attempt - 1));
      const delay = jitter ? delayBase * (0.7 + Math.random() * 0.6) : delayBase;
      await wait(delay);
    }
  }

  throw lastError ?? new Error('Operation failed after retry attempts');
}

function getExpoHeaders() {
  const headers = new Headers({ 'content-type': 'application/json' });
  const accessToken = Deno.env.get('EXPO_ACCESS_TOKEN');
  if (accessToken) {
    headers.set('authorization', `Bearer ${accessToken}`);
  }
  return headers;
}

function toExpoMessages(payload: NormalizedNotificationPayload, priority: ExpoPriority): ExpoMessage[] {
  return payload.tokens.map((token) => ({
    to: token,
    title: payload.title,
    body: payload.body,
    data: Object.keys(payload.data).length > 0 ? payload.data : undefined,
    priority,
    sound: 'default',
    badge: typeof payload.badge === 'number' ? payload.badge : undefined,
  }));
}

function errorToMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return typeof error === 'string' ? error : JSON.stringify(error);
}

async function dispatchExpoMessages(messages: ExpoMessage[], requestId: string) {
  const tickets: ExpoSuccessTicket[] = [];
  const failures: ExpoFailureTicket[] = [];

  if (messages.length === 0) {
    return { tickets, failures };
  }

  const headers = getExpoHeaders();
  const chunks = chunkArray(messages, MAX_EXPO_CHUNK_SIZE);

  for (const chunk of chunks) {
    try {
      const response = await withRetry(
        async () => {
          const res = await fetch(EXPO_PUSH_ENDPOINT, {
            method: 'POST',
            headers,
            body: JSON.stringify(chunk),
          });

          if (res.status === 429 || res.status >= 500) {
            const text = await res.text();
            throw new Error(`Expo push request failed (status ${res.status}): ${text}`);
          }

          return res;
        },
        {
          attempts: 3,
          baseDelayMs: 400,
          maxDelayMs: 4_000,
          onRetry: (error, attempt) =>
            log('warn', 'Expo push retry', {
              requestId,
              attempt,
              error: errorToMessage(error),
            }),
        },
      );

      const payload = (await response.json()) as ExpoBatchResponse;

      if (!response.ok) {
        const statusMessage = `Expo push request returned ${response.status}`;
        log('error', statusMessage, { requestId, payload });
        for (const { to } of chunk) {
          failures.push({
            to,
            status: 'error',
            message: statusMessage,
            details: payload.errors ? { errors: payload.errors, httpStatus: response.status } : { httpStatus: response.status },
          });
        }
        continue;
      }

      if (Array.isArray(payload.errors) && payload.errors.length > 0) {
        log('error', 'Expo push request reported errors', { requestId, errors: payload.errors });
        for (const { to } of chunk) {
          failures.push({
            to,
            status: 'error',
            message: payload.errors[0]?.message ?? 'Expo push request error',
            details: { errors: payload.errors },
          });
        }
        continue;
      }

      const ticketItems = Array.isArray(payload.data) ? payload.data : [];

      ticketItems.forEach((ticket, index) => {
        const token = chunk[index]?.to ?? null;
        if (ticket.status === 'ok') {
          if (token) {
            tickets.push({
              to: token,
              status: 'ok',
              id: ticket.id,
            });
          }
        } else {
          failures.push({
            to: token,
            status: 'error',
            message: ticket.message ?? 'Expo push ticket reported error',
            details: ticket.details,
          });
        }
      });

      if (ticketItems.length < chunk.length) {
        const missing = chunk.slice(ticketItems.length);
        for (const { to } of missing) {
          failures.push({
            to,
            status: 'error',
            message: 'Expo push ticket missing from response',
          });
        }
      }
    } catch (error) {
      const message = errorToMessage(error);
      log('error', 'Expo push delivery failed', { requestId, error: message });
      for (const { to } of chunk) {
        failures.push({
          to,
          status: 'error',
          message,
        });
      }
    }
  }

  return { tickets, failures };
}

serve(async (request) => {
  const requestId = crypto.randomUUID();

  try {
    if (request.method !== 'POST') {
      return jsonResponse(405, {
        requestId,
        success: false,
        error: 'Method not allowed',
        priority: null,
        tickets: [],
        failures: [],
      });
    }

    const contentType = request.headers.get('content-type') ?? '';
    if (!contentType.toLowerCase().includes('application/json')) {
      return jsonResponse(415, {
        requestId,
        success: false,
        error: 'Unsupported content type, expected application/json',
        priority: null,
        tickets: [],
        failures: [],
      });
    }

    let body: unknown;

    try {
      body = await request.json();
    } catch (error) {
      const message = errorToMessage(error);
      log('error', 'Failed to parse JSON body', { requestId, error: message });
      return jsonResponse(400, {
        requestId,
        success: false,
        error: 'Invalid JSON payload',
        priority: null,
        tickets: [],
        failures: [],
      });
    }

    let payload: NormalizedNotificationPayload;

    try {
      payload = validateNotificationPayload(body);
    } catch (error) {
      if (error instanceof ValidationError) {
        log('warn', 'Payload validation failed', { requestId, error: error.message });
        return jsonResponse(error.status, {
          requestId,
          success: false,
          error: error.message,
          priority: null,
          tickets: [],
          failures: [],
        });
      }

      throw error;
    }

    const priority = deriveExpoPriority(payload.rawPriority, payload.data);

    log('info', 'Dispatching Expo push notification', {
      requestId,
      tokens: payload.tokens.length,
      priority,
    });

    const messages = toExpoMessages(payload, priority);
    const result = await dispatchExpoMessages(messages, requestId);

    const success = result.failures.length === 0;
    const status = success ? 200 : result.tickets.length > 0 ? 207 : 502;

    if (success) {
      log('info', 'Expo push delivered successfully', {
        requestId,
        tickets: result.tickets.length,
      });
    } else {
      log('warn', 'Expo push completed with failures', {
        requestId,
        tickets: result.tickets.length,
        failures: result.failures.length,
      });
    }

    return jsonResponse(status, {
      requestId,
      success,
      priority,
      tickets: result.tickets,
      failures: result.failures,
    });
  } catch (error) {
    const message = errorToMessage(error);
    log('error', 'Unexpected error while processing notification', {
      requestId,
      error: message,
    });

    return jsonResponse(500, {
      requestId,
      success: false,
      error: 'Internal server error',
      priority: null,
      tickets: [],
      failures: [],
    });
  }
});
