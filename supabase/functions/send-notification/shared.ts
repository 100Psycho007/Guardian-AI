export type ExpoPriority = 'default' | 'high';

export interface NormalizedNotificationPayload {
  tokens: string[];
  title: string;
  body: string;
  data: Record<string, unknown>;
  rawPriority: unknown;
  badge: number | null;
}

export class ValidationError extends Error {
  readonly status = 400;

  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

const EXPO_PUSH_TOKEN_PATTERN = /^(Expo|Exponent)PushToken\[[A-Za-z0-9+\-=._]{8,}\]$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== 'string') {
    throw new ValidationError(`Invalid ${field}: expected string`);
  }

  const trimmed = value.trim();

  if (!trimmed) {
    throw new ValidationError(`Invalid ${field}: cannot be empty`);
  }

  return trimmed;
}

function normalizeTokens(value: unknown): string[] {
  if (typeof value === 'string') {
    const token = value.trim();
    if (!token) {
      throw new ValidationError('Invalid deviceToken: cannot be empty');
    }
    return [token];
  }

  if (Array.isArray(value)) {
    const tokens = value
      .map((entry) => {
        if (typeof entry !== 'string') {
          throw new ValidationError('Invalid deviceToken: entries must be strings');
        }
        return entry.trim();
      })
      .filter(Boolean);

    if (tokens.length === 0) {
      throw new ValidationError('Invalid deviceToken: no valid tokens provided');
    }

    return tokens;
  }

  throw new ValidationError('Invalid deviceToken: expected string or array of strings');
}

function ensureExpoTokens(tokens: string[]): void {
  const invalid = tokens.filter((token) => !EXPO_PUSH_TOKEN_PATTERN.test(token));
  if (invalid.length > 0) {
    throw new ValidationError(`Invalid deviceToken: ${invalid.join(', ')} is not a valid Expo push token`);
  }
}

function normalizeBadge(value: unknown): number | null {
  if (value === undefined || value === null) {
    return null;
  }

  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new ValidationError('Invalid badge: expected a non-negative integer');
    }
    return Math.floor(value);
  }

  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed) {
      return null;
    }
    const parsed = Number.parseFloat(trimmed);
    if (!Number.isFinite(parsed) || parsed < 0) {
      throw new ValidationError('Invalid badge: expected a non-negative integer');
    }
    return Math.floor(parsed);
  }

  throw new ValidationError('Invalid badge: expected a non-negative integer');
}

export function validateNotificationPayload(input: unknown): NormalizedNotificationPayload {
  if (!isRecord(input)) {
    throw new ValidationError('Request body must be a JSON object');
  }

  const { deviceToken, title, body, data, priority, badge } = input;

  const tokens = normalizeTokens(deviceToken);
  ensureExpoTokens(tokens);

  const normalizedTitle = assertNonEmptyString(title, 'title');
  const normalizedBody = assertNonEmptyString(body, 'body');

  if (data !== undefined && data !== null && !isRecord(data)) {
    throw new ValidationError('Invalid data: expected an object');
  }

  return {
    tokens,
    title: normalizedTitle,
    body: normalizedBody,
    data: isRecord(data) ? data : {},
    rawPriority: priority,
    badge: normalizeBadge(badge),
  };
}

function extractString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim().toLowerCase() : null;
}

function extractBoolean(value: unknown): boolean | null {
  if (typeof value === 'boolean') {
    return value;
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase();
    if (normalized === 'true' || normalized === '1' || normalized === 'yes') {
      return true;
    }
    if (normalized === 'false' || normalized === '0' || normalized === 'no') {
      return false;
    }
  }
  return null;
}

function isCriticalValue(value: unknown): boolean {
  const stringValue = extractString(value);
  if (stringValue) {
    return stringValue === 'critical' || stringValue === 'high' || stringValue === 'urgent' || stringValue === 'emergency';
  }
  return extractBoolean(value) === true;
}

export function deriveExpoPriority(rawPriority: unknown, data: Record<string, unknown>): ExpoPriority {
  const priorityString = extractString(rawPriority);

  if (priorityString) {
    if (priorityString === 'high' || priorityString === 'critical' || priorityString === 'urgent' || priorityString === 'emergency') {
      return 'high';
    }
    if (priorityString === 'default' || priorityString === 'normal' || priorityString === 'low' || priorityString === 'standard') {
      return 'default';
    }
  } else if (extractBoolean(rawPriority) === true) {
    return 'high';
  }

  if (isCriticalValue(data.riskLevel) || isCriticalValue(data.risk_level) || isCriticalValue(data.severity) || isCriticalValue(data.alertSeverity)) {
    return 'high';
  }

  if (extractBoolean(data.isCritical) === true || extractBoolean(data.critical) === true) {
    return 'high';
  }

  return 'default';
}

export function chunkArray<T>(items: T[], chunkSize: number): T[][] {
  if (!Number.isFinite(chunkSize) || chunkSize <= 0) {
    throw new Error('chunkSize must be a positive number');
  }

  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += chunkSize) {
    chunks.push(items.slice(index, index + chunkSize));
  }

  return chunks;
}
