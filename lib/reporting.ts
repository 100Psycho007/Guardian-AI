import { supabase, type FraudAlertSeverity, type Json } from './supabase';

export type ScanReportPayload = {
  scanId: string;
  userId: string;
  riskLevel?: string | null;
  riskScore?: number | null;
  fraudProbability?: number | null;
  flags?: string[];
  reason?: string;
};

function normalizeRiskLevel(level?: string | null) {
  if (!level) return null;
  return level.toLowerCase();
}

function determineSeverity(level?: string | null, score?: number | null): FraudAlertSeverity {
  const normalizedLevel = normalizeRiskLevel(level);

  switch (normalizedLevel) {
    case 'critical':
    case 'severe':
      return 'critical';
    case 'high':
      return 'high';
    case 'medium':
    case 'moderate':
      return 'medium';
    case 'low':
      return 'low';
    default:
      break;
  }

  if (typeof score === 'number' && Number.isFinite(score)) {
    if (score >= 90) return 'critical';
    if (score >= 70) return 'high';
    if (score >= 40) return 'medium';
    if (score >= 0) return 'low';
  }

  return 'medium';
}

export async function reportScanToSupabase({
  scanId,
  userId,
  riskLevel,
  riskScore,
  fraudProbability,
  flags,
  reason,
}: ScanReportPayload) {
  const metadata: Record<string, Json> = {};

  if (riskLevel) {
    metadata.riskLevel = riskLevel;
  }

  if (typeof riskScore === 'number' && Number.isFinite(riskScore)) {
    metadata.riskScore = riskScore;
  }

  if (typeof fraudProbability === 'number' && Number.isFinite(fraudProbability)) {
    metadata.fraudProbability = fraudProbability;
  }

  if (flags && flags.length > 0) {
    metadata.flags = flags;
  }

  const severity = determineSeverity(riskLevel, riskScore);

  const { error } = await supabase
    .from('fraud_alerts')
    .upsert(
      {
        scan_id: scanId,
        user_id: userId,
        reason: reason ?? 'User reported suspicious UPI transaction from mobile app',
        metadata: (Object.keys(metadata).length > 0 ? metadata : null) as Json | null,
        status: 'investigating',
        severity,
      },
      { onConflict: 'scan_id' },
    );

  if (error) {
    throw new Error(error.message);
  }
}
