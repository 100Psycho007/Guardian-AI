import { assert, assertEquals } from 'https://deno.land/std@0.224.0/testing/asserts.ts';

import {
  coerceRequestBody,
  deriveRiskAssessment,
  parseProfileScanStats,
  parseUpiDetails,
} from './utils.ts';

Deno.test('parseUpiDetails extracts key UPI fields', () => {
  const sample = `Payment Confirmation\nUPI ID: john.doe@upi\nPayee: ABC Super Store\nAmount: ₹12,345.50\nReference No: TXN-12345678`;
  const details = parseUpiDetails(sample);

  assertEquals(details.upiId, 'john.doe@upi');
  assertEquals(details.payeeName, 'ABC Super Store');
  assertEquals(details.amount, 12345.5);
  assertEquals(details.referenceId, 'TXN-12345678');
  assert(details.confidence >= 0.6);
});

Deno.test('deriveRiskAssessment escalates obvious fraud cues', () => {
  const text = `URGENT ACTION REQUIRED! Your account is blocked. Pay ₹55,000 now via upi Fraudster@okaxis. Share OTP to unlock.`;
  const details = parseUpiDetails(text);
  const assessment = deriveRiskAssessment({ upiDetails: details, ocrText: text, claudeAnalysis: null });

  assert(assessment.riskScore >= 70);
  assertEquals(assessment.riskLevel === 'high' || assessment.riskLevel === 'critical', true);
  assert(assessment.flags.includes('keyword:urgent'));
});

Deno.test('coerceRequestBody normalizes payload', () => {
  const payload = {
    storage_path: 'scans/receipt.png',
    bucket: ' evidence ',
    scan_id: '1234',
    hints: ['en', null, 42, 'hi'],
    metadata: { source: 'mobile', extra: true },
    forceRefresh: '1',
  } as unknown as Parameters<typeof coerceRequestBody>[0];

  const normalized = coerceRequestBody(payload);

  assertEquals(normalized.storagePath, 'scans/receipt.png');
  assertEquals(normalized.bucket, 'evidence');
  assertEquals(normalized.scanId, '1234');
  assertEquals(normalized.hints, ['en', 'hi']);
  assertEquals(normalized.metadata?.source, 'mobile');
  assertEquals(normalized.forceRefresh, true);
});

Deno.test('parseProfileScanStats falls back to defaults', () => {
  const stats = parseProfileScanStats({
    total_scans: 3,
    high_risk_scans: 1,
    last_scan_id: 'abc',
    last_risk_score: 85,
    last_fraud_probability: 0.92,
  });

  assertEquals(stats.total_scans, 3);
  assertEquals(stats.high_risk_scans, 1);
  assertEquals(stats.last_scan_id, 'abc');
  assertEquals(stats.last_risk_score, 85);
  assertEquals(stats.last_fraud_probability, 0.92);

  const fallback = parseProfileScanStats(null);
  assertEquals(fallback.total_scans, 0);
  assertEquals(fallback.high_risk_scans, 0);
});
