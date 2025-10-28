import type { Profile } from './supabase';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

function getNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string') {
    const parsed = Number.parseFloat(value);
    if (!Number.isNaN(parsed)) {
      return parsed;
    }
  }
  return null;
}

function clamp(value: number, min = 0, max = 100) {
  return Math.min(Math.max(value, min), max);
}

export type ProfileStats = {
  totalScans: number;
  accuracyRate: number;
  streak: number;
  reputation: number;
  highRisk: number;
};

export function parseScanStats(stats: Profile['scan_stats']): ProfileStats {
  if (!isRecord(stats)) {
    return { totalScans: 0, accuracyRate: 100, streak: 0, reputation: 75, highRisk: 0 };
  }

  const total = getNumber(stats.totalScans ?? stats.total_scans ?? stats.total) ?? 0;
  const highRisk = getNumber(stats.highRiskScans ?? stats.high_risk_scans ?? stats.highRisk ?? stats.high_risk) ?? 0;

  const streak = Math.max(0, Math.round(getNumber(stats.streak ?? stats.currentStreak ?? stats.streak_days) ?? 0));

  const rawAccuracy = getNumber(stats.accuracyRate ?? stats.accuracy_rate ?? stats.successRate ?? stats.success_rate);
  let accuracy = rawAccuracy ?? (total > 0 ? ((total - highRisk) / total) * 100 : 100);
  if (accuracy <= 1) {
    accuracy *= 100;
  }
  accuracy = clamp(Math.round(accuracy));

  const rawReputation =
    getNumber(stats.reputationScore ?? stats.reputation ?? stats.reputation_score ?? stats.trustScore ?? stats.trust_score) ??
    null;
  let reputation = rawReputation ?? accuracy;
  if (reputation <= 1) {
    reputation *= 100;
  }
  reputation = clamp(Math.round(reputation));

  return {
    totalScans: Math.max(0, Math.round(total)),
    accuracyRate: accuracy,
    streak,
    reputation,
    highRisk: Math.max(0, Math.round(highRisk)),
  };
}
