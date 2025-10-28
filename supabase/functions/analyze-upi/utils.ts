import {
  type AnalyzeUpiRequest,
  type ClaudeAnalysis,
  type ProfileScanStats,
  type RiskAssessment,
  type RiskLevel,
  type UpiDetails,
} from './types.ts';

const suspiciousKeywords = [
  'kyc',
  'blocked',
  'freeze',
  'urgent',
  'immediate action',
  'suspended',
  'verification fee',
  'refund',
  'otp',
  'pin',
  'lottery',
  'prize',
  'investment',
  'double your money',
  'earnings',
  'commission',
  'processing fee',
  'pan update',
  'link account',
  'fraud',
  'scam',
  'warning',
  'risk',
  'cashback',
  'scratch card',
  'gift',
  'jackpot',
  'call helpline',
];

const highRiskKeywords = ['urgent', 'otp', 'pin', 'verify', 'blocked', 'freeze', 'warning', 'scam'];

export function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

export function normalizeWhitespace(value: string): string {
  return value.replace(/\r\n?/g, '\n').replace(/\u00a0/g, ' ').replace(/[\t ]+/g, ' ').trim();
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function cleanName(value: string): string {
  return normalizeWhitespace(value.replace(/[^A-Za-z0-9\s.&'-]/g, ' '));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((entry) => normalizeWhitespace(entry)))).filter(Boolean);
}

function extractAmount(text: string): { amount: number | null; raw: string | null } {
  const amountRegex = /(amount|rs\.?|inr|amt|paid|payment)\s*(?:[:=#-]?\s*)?[₹rs\.]?\s*([0-9]{1,3}(?:[,\s][0-9]{3})*(?:\.[0-9]{1,2})?|[0-9]+(?:\.[0-9]{1,2})?)/i;
  const match = text.match(amountRegex);
  if (!match) {
    return { amount: null, raw: null };
  }

  const numeric = match[2].replace(/[,\s]/g, '');
  const parsed = Number.parseFloat(numeric);
  if (Number.isNaN(parsed)) {
    return { amount: null, raw: null };
  }

  return { amount: parsed, raw: match[0] };
}

function extractReference(text: string): { referenceId: string | null; raw: string | null } {
  const referenceRegex =
    /(utr|ref(?:erence)?(?:\s?no)?|txn(?:\s?id)?|transaction(?:\s?id)?|order(?:\s?id)?)\s*(?:[:=#-]?\s*)([A-Z0-9\-]{6,})/i;
  const match = text.match(referenceRegex);
  if (!match) {
    return { referenceId: null, raw: null };
  }

  return { referenceId: match[2].trim(), raw: match[0] };
}

function extractName(text: string, labels: string[]): { name: string | null; raw: string | null } {
  for (const label of labels) {
    const regex = new RegExp(`${label}[\t :\-]*([A-Z][A-Za-z0-9\s.&'-]{2,})`, 'i');
    const match = text.match(regex);
    if (match) {
      return { name: cleanName(match[1]), raw: match[0] };
    }
  }

  return { name: null, raw: null };
}

function extractNote(text: string): { note: string | null; raw: string | null } {
  const noteRegex = /(note|remarks|narration)\s*(?:[:=#-]?\s*)([A-Za-z0-9\s,.&'-]{4,})/i;
  const match = text.match(noteRegex);
  if (!match) {
    return { note: null, raw: null };
  }

  return { note: normalizeWhitespace(match[2]), raw: match[0] };
}

export function parseUpiDetails(rawText: string): UpiDetails {
  const sanitized = rawText.replace(/\r\n?/g, '\n');
  const lowered = sanitized.toLowerCase();
  const rawMatches: string[] = [];
  const extractedFields: Record<string, string> = {};

  const labelledUpiRegex = /(upi(?:\s?id)?|vpa|virtual payment address)\s*(?:[:=#-]?\s*)([a-z0-9._-]{2,}@[a-z][a-z0-9]+)/i;
  let upiId: string | null = null;
  const labelledMatch = sanitized.match(labelledUpiRegex);
  if (labelledMatch) {
    upiId = labelledMatch[2].toLowerCase();
    rawMatches.push(labelledMatch[0]);
    extractedFields[labelledMatch[1].toLowerCase()] = labelledMatch[2];
  }

  if (!upiId) {
    const genericMatch = sanitized.match(/([a-z0-9._-]{2,}@[a-z][a-z0-9]+)/i);
    if (genericMatch) {
      upiId = genericMatch[1].toLowerCase();
      rawMatches.push(genericMatch[0]);
    }
  }

  const { amount, raw: amountRaw } = extractAmount(sanitized);
  if (amountRaw) {
    rawMatches.push(amountRaw);
    extractedFields.amount = amountRaw;
  }

  const { referenceId, raw: referenceRaw } = extractReference(sanitized);
  if (referenceRaw) {
    rawMatches.push(referenceRaw);
    extractedFields.reference = referenceRaw;
  }

  const payer = extractName(sanitized, ['payer', 'from', 'sender', 'paid by', 'debited from']);
  if (payer.raw) {
    rawMatches.push(payer.raw);
    extractedFields.payer = payer.raw;
  }

  const payee = extractName(sanitized, ['payee', 'beneficiary', 'to', 'merchant', 'pay to', 'credit to']);
  if (payee.raw) {
    rawMatches.push(payee.raw);
    extractedFields.payee = payee.raw;
  }

  const note = extractNote(sanitized);
  if (note.raw) {
    rawMatches.push(note.raw);
    extractedFields.note = note.raw;
  }

  const hasInr = lowered.includes(' inr') || lowered.includes(' rs ') || lowered.includes(' rs.') || lowered.includes(' ₹') || lowered.includes('currency inr');
  const currency = hasInr ? 'INR' : null;

  const confidenceParts = [upiId ? 0.4 : 0, amount !== null ? 0.2 : 0, referenceId ? 0.2 : 0, payee.name ? 0.1 : 0, payer.name ? 0.1 : 0];
  const confidence = clamp(
    Number(confidenceParts.reduce((total, score) => total + score, 0).toFixed(2)),
    0,
    1,
  );

  return {
    upiId,
    payerName: payer.name,
    payeeName: payee.name,
    amount,
    currency,
    referenceId,
    note: note.note,
    rawMatches: uniqueStrings(rawMatches),
    confidence,
    extractedFields,
  };
}

export function deriveRiskLevel(score: number): RiskLevel {
  if (score >= 90) {
    return 'critical';
  }
  if (score >= 80) {
    return 'high';
  }
  if (score >= 60) {
    return 'medium';
  }
  return 'low';
}

function detectFlags(text: string, upiDetails: UpiDetails): string[] {
  const lowered = text.toLowerCase();
  const flags = new Set<string>();

  if (!upiDetails.upiId) {
    flags.add('missing_upi_id');
  }

  if (!upiDetails.referenceId) {
    flags.add('missing_reference_id');
  }

  if (upiDetails.amount !== null && upiDetails.amount >= 50000) {
    flags.add('amount_gt_50k');
  } else if (upiDetails.amount !== null && upiDetails.amount >= 20000) {
    flags.add('amount_gt_20k');
  }

  if (upiDetails.confidence < 0.4) {
    flags.add('low_confidence_extraction');
  }

  for (const keyword of suspiciousKeywords) {
    if (lowered.includes(keyword)) {
      flags.add(`keyword:${keyword}`);
    }
  }

  return Array.from(flags);
}

function heuristicRiskScore(text: string, upiDetails: UpiDetails): { score: number; flags: string[] } {
  let score = 30;
  const lowered = text.toLowerCase();
  const flags = detectFlags(text, upiDetails);

  if (!upiDetails.upiId) {
    score += 20;
  }

  if (!upiDetails.referenceId) {
    score += 8;
  }

  if (upiDetails.amount !== null && upiDetails.amount >= 50000) {
    score += 25;
  } else if (upiDetails.amount !== null && upiDetails.amount >= 20000) {
    score += 15;
  }

  if (upiDetails.confidence < 0.4) {
    score += 10;
  }

  const keywordMatches = suspiciousKeywords.filter((keyword) => lowered.includes(keyword)).length;
  score += keywordMatches * 6;

  const highRiskMatches = highRiskKeywords.filter((keyword) => lowered.includes(keyword)).length;
  score += highRiskMatches * 8;

  return { score: clamp(Math.round(score), 0, 100), flags };
}

export function deriveRiskAssessment(
  input: {
    upiDetails: UpiDetails;
    ocrText: string;
    claudeAnalysis?: ClaudeAnalysis | null;
  },
): RiskAssessment {
  const { upiDetails, ocrText, claudeAnalysis } = input;
  const { score: heuristicScore, flags } = heuristicRiskScore(ocrText, upiDetails);

  let riskScore = heuristicScore;
  let fraudProbability = heuristicScore / 100;
  let riskLevel = deriveRiskLevel(riskScore);

  if (claudeAnalysis) {
    if (Number.isFinite(claudeAnalysis.riskScore)) {
      riskScore = clamp(Math.round((claudeAnalysis.riskScore * 0.6) + (heuristicScore * 0.4)), 0, 100);
    } else if (Number.isFinite(claudeAnalysis.fraudProbability)) {
      riskScore = clamp(Math.round(claudeAnalysis.fraudProbability * 100), 0, 100);
    }

    if (Number.isFinite(claudeAnalysis.fraudProbability)) {
      fraudProbability = clamp(Number(claudeAnalysis.fraudProbability.toFixed(4)), 0, 1);
    } else {
      fraudProbability = clamp(Number((riskScore / 100).toFixed(4)), 0, 1);
    }

    riskLevel = claudeAnalysis.riskLevel ?? deriveRiskLevel(riskScore);

    for (const factor of claudeAnalysis.riskFactors ?? []) {
      if (typeof factor === 'string' && factor.trim().length) {
        flags.push(`llm:${factor.trim()}`);
      }
    }
  } else {
    fraudProbability = clamp(Number((riskScore / 100).toFixed(4)), 0, 1);
    riskLevel = deriveRiskLevel(riskScore);
  }

  return {
    riskScore,
    fraudProbability,
    riskLevel,
    flags: Array.from(new Set(flags)),
  };
}

export function parseProfileScanStats(value: unknown): ProfileScanStats {
  if (!isRecord(value)) {
    return {
      total_scans: 0,
      high_risk_scans: 0,
    };
  }

  return {
    total_scans: typeof value.total_scans === 'number' && Number.isFinite(value.total_scans) ? value.total_scans : 0,
    high_risk_scans:
      typeof value.high_risk_scans === 'number' && Number.isFinite(value.high_risk_scans) ? value.high_risk_scans : 0,
    last_scan_id: typeof value.last_scan_id === 'string' ? value.last_scan_id : undefined,
    last_scan_at: typeof value.last_scan_at === 'string' ? value.last_scan_at : undefined,
    last_risk_score:
      typeof value.last_risk_score === 'number' && Number.isFinite(value.last_risk_score)
        ? value.last_risk_score
        : undefined,
    last_fraud_probability:
      typeof value.last_fraud_probability === 'number' && Number.isFinite(value.last_fraud_probability)
        ? value.last_fraud_probability
        : undefined,
  };
}

export function coerceRequestBody(body: AnalyzeUpiRequest): {
  storagePath: string | null;
  bucket: string;
  scanId: string | null;
  hints: string[];
  metadata: Record<string, unknown> | null;
  forceRefresh: boolean;
} {
  const rawStoragePath = typeof body.storagePath === 'string' ? body.storagePath : body.storage_path;
  const storagePath = typeof rawStoragePath === 'string' ? rawStoragePath.trim() : null;

  const bucket = typeof body.bucket === 'string' && body.bucket.trim().length ? body.bucket.trim() : 'scans';

  const rawScanId = typeof body.scanId === 'string' ? body.scanId : body.scan_id;
  const scanId = typeof rawScanId === 'string' && rawScanId.trim().length ? rawScanId.trim() : null;

  const hints = Array.isArray(body.hints)
    ? body.hints.filter((hint): hint is string => typeof hint === 'string' && hint.trim().length).map((hint) => hint.trim())
    : [];

  const metadata = isRecord(body.metadata) ? (body.metadata as Record<string, unknown>) : null;

  return {
    storagePath,
    bucket,
    scanId,
    hints,
    metadata,
    forceRefresh: Boolean(body.forceRefresh),
  };
}
