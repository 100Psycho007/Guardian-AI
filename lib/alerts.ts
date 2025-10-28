import type { FraudAlert, FraudAlertSeverity } from './supabase';

export type ParsedAlertMetadata = {
  riskLevel: string | null;
  riskScore: number | null;
  fraudProbability: number | null;
  flags: string[];
};

function getNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === 'string') {
    const parsed = parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }

  return null;
}

function getString(value: unknown): string | null {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    return String(value);
  }

  return null;
}

export function parseAlertMetadata(metadata: FraudAlert['metadata']): ParsedAlertMetadata {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
    return {
      riskLevel: null,
      riskScore: null,
      fraudProbability: null,
      flags: [],
    };
  }

  const source = metadata as Record<string, unknown>;

  const riskLevel = getString(source.riskLevel ?? source.risk_level);
  const riskScore = getNumber(source.riskScore ?? source.risk_score);
  const fraudProbability = getNumber(source.fraudProbability ?? source.fraud_probability);

  const flagsSource = source.flags;
  const flags: string[] = [];

  if (Array.isArray(flagsSource)) {
    flagsSource.forEach((item) => {
      if (typeof item === 'string') {
        flags.push(item);
        return;
      }

      if (!item || typeof item !== 'object') {
        return;
      }

      const label = getString((item as Record<string, unknown>).label ?? (item as Record<string, unknown>).name);
      if (label) {
        flags.push(label);
      }
    });
  }

  return {
    riskLevel: riskLevel ? riskLevel.toLowerCase() : null,
    riskScore,
    fraudProbability,
    flags,
  };
}

export function getSeverityColor(severity: FraudAlertSeverity | string): string {
  switch (severity.toLowerCase()) {
    case 'low':
      return '#22C55E';
    case 'medium':
    case 'moderate':
      return '#FACC15';
    case 'high':
      return '#F97316';
    case 'critical':
    case 'severe':
      return '#EF4444';
    default:
      return '#3B82F6';
  }
}

export function getSeverityLabel(severity: FraudAlertSeverity | string): string {
  const lower = severity.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function formatRiskLevel(riskLevel: string | null | undefined): string | null {
  if (!riskLevel) {
    return null;
  }

  const lower = riskLevel.toLowerCase();
  return lower.charAt(0).toUpperCase() + lower.slice(1);
}

export function normalizeProbability(value: number | null | undefined): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return null;
  }

  if (value <= 1) {
    return Math.round(Math.max(0, value) * 100);
  }

  return Math.round(Math.min(100, Math.max(0, value)));
}
