import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { encode as encodeBase64 } from 'https://deno.land/std@0.224.0/encoding/base64.ts';
import { createClient, type SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.3';

import {
  clamp,
  coerceRequestBody,
  deriveRiskAssessment,
  deriveRiskLevel,
  isRecord,
  parseProfileScanStats,
  parseUpiDetails,
} from './utils.ts';
import type {
  AnalyzeUpiRequest,
  ClaudeAnalysis,
  Database,
  ProfileScanStats,
  RiskAssessment,
  RiskLevel,
  ScanMetadata,
  UpiDetails,
} from './types.ts';

interface VisionAnnotation {
  fullTextAnnotation?: { text?: string };
  textAnnotations?: Array<{ description?: string }>;
}

interface VisionAnnotateResponse {
  responses?: VisionAnnotation[];
}

interface AnthropicContentBlock {
  type: string;
  text?: string;
}

interface AnthropicMessageResponse {
  id: string;
  type: string;
  content?: AnthropicContentBlock[];
}

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

type SupabaseDbClient = SupabaseClient<Database>;

type WithRetryOptions = {
  attempts?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  factor?: number;
  jitter?: boolean;
  onRetry?: (error: unknown, attempt: number) => void;
};

function log(level: LogLevel, message: string, context: Record<string, unknown> = {}) {
  const entry = {
    level,
    message,
    ...context,
    ts: new Date().toISOString(),
    source: 'analyze-upi',
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
    baseDelayMs = 300,
    maxDelayMs = 2_000,
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

function ensureEnvironment(requestId: string) {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const visionApiKey = Deno.env.get('GOOGLE_VISION_API_KEY') ?? Deno.env.get('GOOGLE_CLOUD_VISION_API_KEY');
  const anthropicApiKey = Deno.env.get('ANTHROPIC_API_KEY') ?? Deno.env.get('CLAUDE_API_KEY') ?? null;
  const anthropicModel = Deno.env.get('ANTHROPIC_MODEL') ?? 'claude-3-5-sonnet-20240620';

  if (!supabaseUrl || !supabaseKey) {
    log('error', 'Missing Supabase service role configuration', { requestId });
    throw new Error('Supabase service role environment variables are not configured');
  }

  if (!visionApiKey) {
    log('error', 'Missing Google Vision API key', { requestId });
    throw new Error('GOOGLE_VISION_API_KEY (or GOOGLE_CLOUD_VISION_API_KEY) is not configured');
  }

  return { supabaseUrl, supabaseKey, visionApiKey, anthropicApiKey, anthropicModel };
}

function createSupabaseClient(
  url: string,
  serviceRoleKey: string,
  authorization: string | null,
): SupabaseDbClient {
  return createClient<Database>(url, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
    global: authorization
      ? {
          headers: {
            Authorization: authorization,
          },
        }
      : undefined,
  });
}

async function downloadImageAsBase64(
  client: SupabaseDbClient,
  bucket: string,
  storagePath: string,
  requestId: string,
): Promise<{ base64: string; bytes: number }> {
  const { data, error } = await client.storage.from(bucket).download(storagePath);
  if (error || !data) {
    log('error', 'Failed to download image from storage', {
      requestId,
      bucket,
      storagePath,
      error: error?.message,
    });
    throw new Error('Unable to download image from storage');
  }

  const arrayBuffer = await data.arrayBuffer();
  const bytes = arrayBuffer.byteLength;
  const base64 = encodeBase64(new Uint8Array(arrayBuffer));

  return { base64, bytes };
}

async function annotateWithVision(
  params: {
    base64Image: string;
    hints: string[];
    apiKey: string;
    requestId: string;
  },
): Promise<{ text: string; annotation: VisionAnnotation | null }> {
  const { base64Image, hints, apiKey, requestId } = params;
  const url = `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`;

  const payload = {
    requests: [
      {
        image: {
          content: base64Image,
        },
        features: [{ type: 'TEXT_DETECTION' }],
        imageContext: hints.length > 0 ? { languageHints: hints } : undefined,
      },
    ],
  };

  const response = await withRetry<VisionAnnotateResponse>(
    async (attempt) => {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`Vision API request failed (status ${res.status}): ${errorText}`);
      }

      return (await res.json()) as VisionAnnotateResponse;
    },
    {
      attempts: 3,
      baseDelayMs: 400,
      maxDelayMs: 3_000,
      onRetry: (error, attempt) =>
        log('warn', 'Vision API retry', {
          requestId,
          attempt,
          error: error instanceof Error ? error.message : String(error),
        }),
    },
  );

  const annotation = response.responses?.[0] ?? null;
  const text = annotation?.fullTextAnnotation?.text ?? annotation?.textAnnotations?.[0]?.description ?? '';

  return { text, annotation };
}

function extractJsonContent(text: string): Record<string, unknown> | null {
  const fencedMatch = text.match(/```json\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');

  if (start === -1 || end === -1 || start >= end) {
    return null;
  }

  try {
    const jsonString = candidate.slice(start, end + 1);
    return JSON.parse(jsonString) as Record<string, unknown>;
  } catch (_error) {
    return null;
  }
}

function toClaudeAnalysis(raw: string, fallbackScore: number): ClaudeAnalysis | null {
  if (!raw || !raw.trim().length) {
    return null;
  }

  const data = extractJsonContent(raw);

  if (!data || !isRecord(data)) {
    return {
      summary: raw.trim().slice(0, 400),
      riskLevel: deriveRiskLevel(fallbackScore),
      riskScore: fallbackScore,
      fraudProbability: clamp(fallbackScore / 100, 0, 1),
      riskFactors: [],
      recommendedActions: [],
      rawText: raw,
    };
  }

  const summary = typeof data.summary === 'string' ? data.summary.trim() : '';
  const riskLevelInput =
    typeof data.risk_level === 'string'
      ? data.risk_level.toLowerCase()
      : typeof data.riskLevel === 'string'
        ? data.riskLevel.toLowerCase()
        : null;

  const riskScoreValueRaw =
    typeof data.risk_score === 'number'
      ? data.risk_score
      : typeof data.riskScore === 'number'
        ? data.riskScore
        : typeof data.risk_score === 'string'
          ? Number.parseFloat(data.risk_score)
          : typeof data.riskScore === 'string'
            ? Number.parseFloat(data.riskScore)
            : Number.NaN;

  const fraudProbabilityRaw =
    typeof data.fraud_probability === 'number'
      ? data.fraud_probability
      : typeof data.fraudProbability === 'number'
        ? data.fraudProbability
        : typeof data.fraud_probability === 'string'
          ? Number.parseFloat(data.fraud_probability)
          : typeof data.fraudProbability === 'string'
            ? Number.parseFloat(data.fraudProbability)
            : Number.NaN;

  const riskFactors = Array.isArray(data.risk_factors ?? data.riskFactors)
    ? (data.risk_factors ?? data.riskFactors)!
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];

  const recommendedActions = Array.isArray(data.recommended_actions ?? data.recommendations)
    ? (data.recommended_actions ?? data.recommendations)!
        .filter((entry): entry is string => typeof entry === 'string' && entry.trim().length > 0)
        .map((entry) => entry.trim())
    : [];

  const confidenceValue =
    typeof data.confidence === 'number'
      ? clamp(data.confidence, 0, 1)
      : typeof data.confidence === 'string'
        ? clamp(Number.parseFloat(data.confidence), 0, 1)
        : undefined;

  const normalizedRiskScore = Number.isFinite(riskScoreValueRaw)
    ? clamp(Math.round(riskScoreValueRaw), 0, 100)
    : fallbackScore;
  const normalizedFraudProbability = Number.isFinite(fraudProbabilityRaw)
    ? clamp(Number(fraudProbabilityRaw.toFixed(4)), 0, 1)
    : clamp(normalizedRiskScore / 100, 0, 1);

  const normalizedRiskLevel = ((): RiskLevel => {
    if (riskLevelInput === 'critical' || riskLevelInput === 'high' || riskLevelInput === 'medium' || riskLevelInput === 'low') {
      return riskLevelInput;
    }
    return deriveRiskLevel(normalizedRiskScore);
  })();

  return {
    summary: summary || raw.trim().slice(0, 400) || 'Claude analysis did not provide a summary.',
    riskLevel: normalizedRiskLevel,
    riskScore: normalizedRiskScore,
    fraudProbability: normalizedFraudProbability,
    riskFactors,
    recommendedActions,
    rawText: raw,
    confidence: confidenceValue,
  };
}

async function analyzeWithClaude(
  params: {
    apiKey: string | null;
    model: string;
    ocrText: string;
    upiDetails: UpiDetails;
    requestId: string;
  },
  heuristicScore: number,
): Promise<ClaudeAnalysis | null> {
  const { apiKey, model, ocrText, upiDetails, requestId } = params;

  if (!apiKey) {
    log('info', 'Skipping Claude analysis (API key not configured)', { requestId });
    return null;
  }

  const payload = {
    model,
    max_tokens: 400,
    temperature: 0,
    top_p: 0.95,
    messages: [
      {
        role: 'system',
        content: [
          {
            type: 'text',
            text: 'You are an expert fraud detection analyst. You review OCR text and UPI payment details to determine if a screenshot is fraudulent.',
          },
        ],
      },
      {
        role: 'user',
        content: [
          {
            type: 'text',
            text: `Review the following OCR text from a potential fraudulent UPI screenshot and the parsed UPI details. Respond ONLY with JSON containing the keys: summary (string), risk_level (low|medium|high|critical), risk_score (0-100), fraud_probability (0-1), risk_factors (array of strings), recommended_actions (array of strings), confidence (0-1 optional).\n\nOCR_TEXT:\n${ocrText}\n\nPARSED_UPI_DETAILS:\n${JSON.stringify(upiDetails, null, 2)}`,
          },
        ],
      },
    ],
  };

  try {
    const response = await withRetry<AnthropicMessageResponse>(
      async (attempt) => {
        const res = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'x-api-key': apiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          const errorText = await res.text();
          throw new Error(`Claude API request failed (status ${res.status}): ${errorText}`);
        }

        return (await res.json()) as AnthropicMessageResponse;
      },
      {
        attempts: 2,
        baseDelayMs: 600,
        maxDelayMs: 2_500,
        onRetry: (error, attempt) =>
          log('warn', 'Anthropic retry', {
            requestId,
            attempt,
            error: error instanceof Error ? error.message : String(error),
          }),
      },
    );

    const textContent = response.content?.find((block) => block.type === 'text')?.text ?? '';

    if (!textContent) {
      log('warn', 'Claude response missing text content', { requestId, response });
      return null;
    }

    return toClaudeAnalysis(textContent, heuristicScore);
  } catch (error) {
    log('error', 'Claude analysis failed', {
      requestId,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

function mapRiskToSeverity(riskScore: number): { severity: 'low' | 'medium' | 'high' | 'critical'; status: 'open' | 'investigating' } {
  if (riskScore >= 90) {
    return { severity: 'critical', status: 'investigating' };
  }
  if (riskScore >= 80) {
    return { severity: 'high', status: 'investigating' };
  }
  return { severity: 'medium', status: 'open' };
}

async function dispatchHighRiskNotification(params: {
  supabase: SupabaseDbClient;
  requestId: string;
  deviceToken: string;
  alertId: string;
  scanId: string;
  severity: 'high' | 'critical';
  riskScore: number;
  riskLevel: RiskLevel;
  upiDetails: UpiDetails;
}) {
  const { supabase, requestId, deviceToken, alertId, scanId, severity, riskScore, riskLevel, upiDetails } = params;

  const entityLabel = upiDetails.payeeName ?? upiDetails.payerName ?? upiDetails.upiId ?? null;
  const title = severity === 'critical' ? 'Critical fraud alert' : 'High risk fraud alert';
  const messageSubject = entityLabel ? `${entityLabel}` : 'A recent scan';
  const severityLabel = severity === 'critical' ? 'critical' : 'high';
  const body = `${messageSubject} was flagged as ${severityLabel} risk (score ${Math.round(riskScore)}). Tap to review the details.`;

  try {
    const { data, error } = await supabase.functions.invoke('send-notification', {
      body: {
        deviceToken,
        title,
        body,
        priority: 'high',
        badge: 1,
        data: {
          type: 'fraud_alert',
          alertId,
          scanId,
          severity,
          riskScore,
          riskLevel,
        },
      },
    });

    if (error) {
      log('warn', 'Failed to dispatch high risk notification', {
        requestId,
        scanId,
        alertId,
        error: error.message ?? error.name ?? 'Unknown error',
      });
      return;
    }

    log('info', 'High risk notification dispatched', {
      requestId,
      scanId,
      alertId,
      severity,
      response: data,
    });
  } catch (error) {
    log('warn', 'High risk notification threw during dispatch', {
      requestId,
      scanId,
      alertId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

function buildScanMetadata(params: {
  requestId: string;
  bucket: string;
  storagePath: string;
  ocrText: string;
  upiDetails: UpiDetails;
  risk: RiskAssessment;
  claude: ClaudeAnalysis | null;
  hints: string[];
  totalMs: number;
  ocrMs?: number;
  reasoningMs?: number;
  downloadBytes?: number;
  downloadMs?: number;
  extraMetadata?: Record<string, unknown> | null;
}): ScanMetadata {
  const {
    requestId,
    bucket,
    storagePath,
    ocrText,
    upiDetails,
    risk,
    claude,
    hints,
    totalMs,
    ocrMs,
    reasoningMs,
    downloadBytes,
    downloadMs,
    extraMetadata,
  } = params;

  const flags = Array.from(new Set([...(risk.flags ?? []), ...(claude?.riskFactors ?? [])]));
  const extra: Record<string, unknown> = {};

  if (extraMetadata && Object.keys(extraMetadata).length > 0) {
    extra.request_metadata = extraMetadata;
  }

  if (typeof downloadBytes === 'number') {
    extra.download_bytes = downloadBytes;
  }

  if (typeof downloadMs === 'number') {
    extra.download_ms = Math.round(downloadMs);
  }

  return {
    request_id: requestId,
    bucket,
    storage_path: storagePath,
    ocr_text: ocrText,
    upi_details: upiDetails,
    risk,
    claude_analysis: claude,
    hints,
    flags,
    timings: {
      total_ms: Math.round(totalMs),
      ocr_ms: ocrMs ? Math.round(ocrMs) : undefined,
      reasoning_ms: reasoningMs ? Math.round(reasoningMs) : undefined,
    },
    extra: Object.keys(extra).length > 0 ? extra : undefined,
  };
}

function updateStats(
  previous: ProfileScanStats,
  params: {
    incrementTotals: boolean;
    highRisk: boolean;
    scanId: string;
    processedAt: string;
    risk: RiskAssessment;
  },
): ProfileScanStats {
  const { incrementTotals, highRisk, scanId, processedAt, risk } = params;
  return {
    total_scans: (previous.total_scans ?? 0) + (incrementTotals ? 1 : 0),
    high_risk_scans: (previous.high_risk_scans ?? 0) + (incrementTotals && highRisk ? 1 : 0),
    last_scan_id: scanId,
    last_scan_at: processedAt,
    last_risk_score: risk.riskScore,
    last_fraud_probability: risk.fraudProbability,
  };
}

serve(async (req) => {
  const requestId = crypto.randomUUID();
  const startedAt = performance.now();

  if (req.method !== 'POST') {
    return jsonResponse(405, { error: 'Method not allowed', request_id: requestId });
  }

  let body: AnalyzeUpiRequest = {};

  try {
    const rawBody = await req.text();
    body = rawBody ? (JSON.parse(rawBody) as AnalyzeUpiRequest) : {};
  } catch (_error) {
    log('warn', 'Invalid JSON payload', { requestId });
    return jsonResponse(400, { error: 'Invalid JSON payload', request_id: requestId });
  }

  const { storagePath, bucket, scanId: providedScanId, hints, metadata: extraMetadata, forceRefresh } =
    coerceRequestBody(body);

  if (!storagePath) {
    return jsonResponse(400, { error: 'storagePath is required', request_id: requestId });
  }

  const authorization = req.headers.get('authorization') ?? req.headers.get('Authorization');
  if (!authorization) {
    return jsonResponse(401, { error: 'Missing Authorization header', request_id: requestId });
  }

  let supabase: SupabaseDbClient | null = null;
  let activeScanId: string | null = null;
  let incrementStats = false;
  let processedAt = new Date().toISOString();
  let profileDeviceToken: string | null = null;

  try {
    const env = ensureEnvironment(requestId);
    supabase = createSupabaseClient(env.supabaseUrl, env.supabaseKey, authorization);

    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser();

    if (userError) {
      log('error', 'Auth getUser failed', { requestId, error: userError.message });
      return jsonResponse(401, { error: 'Unable to verify user', request_id: requestId });
    }

    if (!user) {
      return jsonResponse(401, { error: 'User not found for token', request_id: requestId });
    }

    log('info', 'Analyze request received', {
      requestId,
      userId: user.id,
      bucket,
      storagePath,
      scanId: providedScanId,
      hintsCount: hints.length,
    });

    // Fetch existing profile stats for later update
    const { data: profileRow, error: profileError } = await supabase
      .from('profiles')
      .select('scan_stats, device_token')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      log('warn', 'Failed to load profile stats', { requestId, error: profileError.message });
    }

    profileDeviceToken = typeof profileRow?.device_token === 'string' ? profileRow.device_token : null;

    const previousStats = parseProfileScanStats(profileRow?.scan_stats ?? null);

    if (providedScanId) {
      const { data: existingScan, error: fetchScanError } = await supabase
        .from('scans')
        .select('id, status, metadata, storage_path')
        .eq('id', providedScanId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (fetchScanError) {
        log('error', 'Failed to fetch existing scan', { requestId, error: fetchScanError.message });
        return jsonResponse(404, { error: 'Scan not found', request_id: requestId });
      }

      if (!existingScan) {
        return jsonResponse(404, { error: 'Scan not found', request_id: requestId });
      }

      if (!forceRefresh && existingScan.status === 'complete') {
        log('info', 'Scan already completed and forceRefresh is false', {
          requestId,
          scanId: existingScan.id,
        });
        return jsonResponse(200, {
          message: 'Scan already completed',
          scan_id: existingScan.id,
          request_id: requestId,
        });
      }

      const { error: updateProcessingError } = await supabase
        .from('scans')
        .update({ status: 'processing', processed_at: null })
        .eq('id', existingScan.id);

      if (updateProcessingError) {
        log('error', 'Failed to mark scan as processing', {
          requestId,
          error: updateProcessingError.message,
        });
        return jsonResponse(500, { error: 'Unable to update scan status', request_id: requestId });
      }

      activeScanId = existingScan.id;
      incrementStats = existingScan.status !== 'complete';
    } else {
      const { data: newScan, error: insertScanError } = await supabase
        .from('scans')
        .insert({
          user_id: user.id,
          storage_path: storagePath,
          status: 'processing',
          metadata: {
            request_id: requestId,
            bucket,
            storage_path: storagePath,
            hints,
            stage: 'processing',
          },
        })
        .select('id')
        .single();

      if (insertScanError || !newScan) {
        log('error', 'Failed to create scan row', {
          requestId,
          error: insertScanError?.message,
        });
        return jsonResponse(500, { error: 'Unable to create scan record', request_id: requestId });
      }

      activeScanId = newScan.id;
      incrementStats = true;
    }

    if (!activeScanId) {
      throw new Error('Scan ID was not established');
    }

    // Fetch and encode image
    const downloadStartedAt = performance.now();
    const { base64: base64Image, bytes } = await downloadImageAsBase64(supabase, bucket, storagePath, requestId);
    const downloadDuration = performance.now() - downloadStartedAt;

    log('info', 'Downloaded image for OCR', {
      requestId,
      bytes,
      downloadMs: Math.round(downloadDuration),
    });

    // Run OCR
    const ocrStartedAt = performance.now();
    const { text: ocrText } = await annotateWithVision({
      base64Image,
      hints,
      apiKey: env.visionApiKey,
      requestId,
    });
    const ocrDuration = performance.now() - ocrStartedAt;

    log('info', 'OCR completed', {
      requestId,
      characters: ocrText.length,
      ocrMs: Math.round(ocrDuration),
    });

    // Parse UPI details
    const upiDetails = parseUpiDetails(ocrText);

    // Heuristic risk before Claude
    const heuristicAssessment = deriveRiskAssessment({
      upiDetails,
      ocrText,
      claudeAnalysis: null,
    });

    const claudeStartedAt = performance.now();
    const claudeAnalysis = await analyzeWithClaude(
      {
        apiKey: env.anthropicApiKey,
        model: env.anthropicModel,
        ocrText,
        upiDetails,
        requestId,
      },
      heuristicAssessment.riskScore,
    );
    const claudeDuration = performance.now() - claudeStartedAt;

    const finalAssessment = deriveRiskAssessment({
      upiDetails,
      ocrText,
      claudeAnalysis: claudeAnalysis ?? undefined,
    });

    processedAt = new Date().toISOString();

    const totalDuration = performance.now() - startedAt;

    const scanMetadata = buildScanMetadata({
      requestId,
      bucket,
      storagePath,
      ocrText,
      upiDetails,
      risk: finalAssessment,
      claude: claudeAnalysis,
      hints,
      totalMs: totalDuration,
      ocrMs: ocrDuration,
      reasoningMs: claudeAnalysis ? claudeDuration : undefined,
      downloadBytes: bytes,
      downloadMs: downloadDuration,
      extraMetadata: extraMetadata,
    });

    const { error: completeError } = await supabase
      .from('scans')
      .update({
        status: 'complete',
        processed_at: processedAt,
        metadata: scanMetadata as Record<string, unknown>,
      })
      .eq('id', activeScanId);

    if (completeError) {
      log('error', 'Failed to finalize scan', { requestId, error: completeError.message });
      throw new Error('Unable to finalize scan');
    }

    // Update profile stats
    const updatedStats = updateStats(previousStats, {
      incrementTotals: incrementStats,
      highRisk: finalAssessment.riskScore >= 70,
      scanId: activeScanId,
      processedAt,
      risk: finalAssessment,
    });

    const { error: statsError } = await supabase
      .from('profiles')
      .upsert({
        id: user.id,
        scan_stats: updatedStats,
      })
      .eq('id', user.id);

    if (statsError) {
      log('warn', 'Failed to update profile stats', {
        requestId,
        error: statsError.message,
      });
    }

    // Upsert fraud alert if necessary
    let alertSummary: Record<string, unknown> | null = null;
    if (finalAssessment.riskScore >= 70) {
      const { severity, status } = mapRiskToSeverity(finalAssessment.riskScore);
      const reason =
        claudeAnalysis?.summary ??
        `High fraud risk detected (score ${finalAssessment.riskScore}) for UPI ID ${upiDetails.upiId ?? 'unknown'}.`;

      const alertMetadata = {
        request_id: requestId,
        risk: finalAssessment,
        claude: claudeAnalysis,
        hints,
      };

      const { data: existingAlert, error: existingAlertError } = await supabase
        .from('fraud_alerts')
        .select('id, status, severity')
        .eq('scan_id', activeScanId)
        .maybeSingle();

      if (existingAlertError) {
        log('warn', 'Failed to fetch existing fraud alert', {
          requestId,
          error: existingAlertError.message,
        });
      }

      let previousAlertSeverity: 'low' | 'medium' | 'high' | 'critical' | null = null;

      if (existingAlert) {
        previousAlertSeverity = existingAlert.severity;

        const { data: updatedAlert, error: updateAlertError } = await supabase
          .from('fraud_alerts')
          .update({
            status,
            severity,
            reason,
            metadata: alertMetadata,
          })
          .eq('id', existingAlert.id)
          .select('id, status, severity')
          .maybeSingle();

        if (updateAlertError) {
          log('error', 'Failed to update fraud alert', {
            requestId,
            error: updateAlertError.message,
          });
        } else if (updatedAlert) {
          alertSummary = updatedAlert;
        }
      } else {
        const { data: insertedAlert, error: insertAlertError } = await supabase
          .from('fraud_alerts')
          .insert({
            scan_id: activeScanId,
            user_id: user.id,
            status,
            severity,
            reason,
            metadata: alertMetadata,
          })
          .select('id, status, severity')
          .single();

        if (insertAlertError) {
          log('error', 'Failed to insert fraud alert', {
            requestId,
            error: insertAlertError.message,
          });
        } else {
          alertSummary = insertedAlert;
        }
      }

      if (
        alertSummary &&
        profileDeviceToken &&
        (alertSummary.severity === 'high' || alertSummary.severity === 'critical')
      ) {
        const previouslyHigh = previousAlertSeverity === 'high' || previousAlertSeverity === 'critical';
        if (!previouslyHigh || previousAlertSeverity !== alertSummary.severity) {
          await dispatchHighRiskNotification({
            supabase: supabase!,
            requestId,
            deviceToken: profileDeviceToken,
            alertId: alertSummary.id,
            scanId: activeScanId,
            severity: alertSummary.severity,
            riskScore: finalAssessment.riskScore,
            riskLevel: finalAssessment.riskLevel,
            upiDetails,
          });
        }
      }
    }

    log('info', 'Analyze request completed', {
      requestId,
      scanId: activeScanId,
      totalMs: Math.round(totalDuration),
      riskScore: finalAssessment.riskScore,
      fraudProbability: finalAssessment.fraudProbability,
      highRisk: finalAssessment.riskScore >= 70,
    });

    return jsonResponse(200, {
      request_id: requestId,
      scan_id: activeScanId,
      user_id: user.id,
      status: 'complete',
      risk_score: finalAssessment.riskScore,
      fraud_probability: finalAssessment.fraudProbability,
      risk_level: finalAssessment.riskLevel,
      upi_details: upiDetails,
      ocr_text: ocrText,
      claude_analysis: claudeAnalysis,
      flags: finalAssessment.flags,
      profile_stats: updatedStats,
      fraud_alert: alertSummary,
      timings: {
        total_ms: Math.round(totalDuration),
        ocr_ms: Math.round(ocrDuration),
        reasoning_ms: claudeAnalysis ? Math.round(claudeDuration) : undefined,
      },
    });
  } catch (error) {
    log('error', 'Analyze request failed', {
      requestId,
      scanId: activeScanId,
      error: error instanceof Error ? error.message : String(error),
    });

    if (supabase && activeScanId) {
      const { error: failUpdateError } = await supabase
        .from('scans')
        .update({ status: 'failed' })
        .eq('id', activeScanId);

      if (failUpdateError) {
        log('warn', 'Failed to mark scan as failed after error', {
          requestId,
          scanId: activeScanId,
          error: failUpdateError.message,
        });
      }
    }

    return jsonResponse(500, {
      error: 'Analyze request failed',
      request_id: requestId,
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});
