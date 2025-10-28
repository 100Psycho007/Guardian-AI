import {
  chunkArray,
  deriveExpoPriority,
  type ExpoPriority,
  ValidationError,
  validateNotificationPayload,
} from '../supabase/functions/send-notification/shared';

describe('validateNotificationPayload', () => {
  const sampleToken = 'ExponentPushToken[AbCdEf1234567890]';

  it('normalizes a valid payload', () => {
    const result = validateNotificationPayload({
      deviceToken: sampleToken,
      title: 'Fraud alert',
      body: 'Suspicious activity detected',
      data: { riskLevel: 'high' },
    });

    expect(result.tokens).toEqual([sampleToken]);
    expect(result.title).toBe('Fraud alert');
    expect(result.body).toBe('Suspicious activity detected');
    expect(result.data).toEqual({ riskLevel: 'high' });
    expect(result.badge).toBeNull();
  });

  it('accepts multiple tokens', () => {
    const tokens = [sampleToken, sampleToken.replace('1234567890', '0987654321')];
    const payload = validateNotificationPayload({
      deviceToken: tokens,
      title: 'Test',
      body: 'Hello',
    });

    expect(payload.tokens).toEqual(tokens);
  });

  it('normalizes optional badge values', () => {
    const payload = validateNotificationPayload({
      deviceToken: sampleToken,
      title: 'Badge',
      body: 'Testing badge',
      badge: '4',
    });

    expect(payload.badge).toBe(4);

    expect(() =>
      validateNotificationPayload({
        deviceToken: sampleToken,
        title: 'Invalid badge',
        body: 'Test',
        badge: -1,
      }),
    ).toThrow(ValidationError);
  });

  it('rejects invalid tokens', () => {
    expect(() =>
      validateNotificationPayload({
        deviceToken: 'invalid-token',
        title: 'Test',
        body: 'Invalid',
      }),
    ).toThrow(ValidationError);
  });

  it('requires title and body strings', () => {
    expect(() =>
      validateNotificationPayload({
        deviceToken: sampleToken,
        title: '',
        body: 'Body',
      }),
    ).toThrow(ValidationError);

    expect(() =>
      validateNotificationPayload({
        deviceToken: sampleToken,
        title: 'Title',
        body: null,
      }),
    ).toThrow(ValidationError);
  });
});

describe('deriveExpoPriority', () => {
  it('honors explicit high priority flag', () => {
    let priority: ExpoPriority = deriveExpoPriority(true, {});
    expect(priority).toBe('high');
    priority = deriveExpoPriority('high', {});
    expect(priority).toBe('high');
  });

  it('downgrades to default for non-critical input', () => {
    let priority: ExpoPriority = deriveExpoPriority('normal', {});
    expect(priority).toBe('default');
    priority = deriveExpoPriority(false, {});
    expect(priority).toBe('default');
  });

  it('promotes critical fraud payloads to high priority', () => {
    let priority: ExpoPriority = deriveExpoPriority(undefined, { riskLevel: 'critical' });
    expect(priority).toBe('high');
    priority = deriveExpoPriority(undefined, { severity: 'critical' });
    expect(priority).toBe('high');
    priority = deriveExpoPriority(undefined, { isCritical: true });
    expect(priority).toBe('high');
  });
});

describe('chunkArray', () => {
  it('splits arrays into chunks of the provided size', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkArray([], 3)).toEqual([]);
  });

  it('throws for invalid chunk sizes', () => {
    expect(() => chunkArray([1], 0)).toThrow('chunkSize must be a positive number');
  });
});
