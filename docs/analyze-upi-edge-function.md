# `analyze-upi` Supabase Edge Function

The `analyze-upi` function processes stored UPI screenshot uploads end-to-end. It performs OCR, extracts structured UPI details, evaluates fraud risk (including an optional Claude 3.5 Sonnet rationale), persists results to the `scans` table, updates profile statistics, and upserts a `fraud_alert` when the computed `risk_score` exceeds 70.

## Responsibilities

1. Validate an authenticated request that references an image stored in Supabase Storage.
2. Download and base64 encode the image before invoking the Google Vision API for OCR.
3. Parse UPI metadata (UPI ID, payee/payer names, reference ID, notes, and amount) using layered regular expressions and fallbacks.
4. Call Claude 3.5 Sonnet (if an API key is configured) to obtain qualitative risk reasoning.
5. Blend heuristic scoring with the Claude response to compute `risk_score`, `fraud_probability`, `risk_level`, and risk flags.
6. Store the final metadata on the scan record, update the parent profile’s aggregated `scan_stats`, and upsert a `fraud_alert` when the `risk_score` ≥ 70.
7. Invoke the `send-notification` edge function to deliver high-priority pushes when a fraud alert reaches high/critical severity and the profile has a registered `device_token`.
8. Return a structured JSON payload reporting results, timings, risk metrics, and any upserted alert details.
9. Log request metadata and apply retry/backoff logic for outbound API calls.

## Runtime configuration

Set the following environment variables via Supabase secrets (production) or a local `.env` file when using `supabase functions serve`:

| Key | Description |
| --- | --- |
| `SUPABASE_URL` | Supabase project URL (injected automatically in Supabase Cloud). |
| `SUPABASE_SERVICE_ROLE_KEY` | Service role key used by the function to access Storage and tables. |
| `GOOGLE_VISION_API_KEY` | Google Cloud Vision `images:annotate` API key. Required. |
| `ANTHROPIC_API_KEY` | Claude API key. Optional – omit to skip LLM reasoning. |
| `ANTHROPIC_MODEL` | Optional Claude model override (defaults to `claude-3-5-sonnet-20240620`). |

To configure secrets in Supabase:

```bash
supabase functions secrets set \
  SUPABASE_SERVICE_ROLE_KEY=your-service-role-key \
  GOOGLE_VISION_API_KEY=your-google-vision-key \
  ANTHROPIC_API_KEY=your-optional-claude-key \
  --project-ref "$SUPABASE_PROJECT_ID"
```

For local development, create `supabase/functions/.env.local` (gitignored) with the same keys and run:

```bash
supabase functions serve analyze-upi --env-file supabase/functions/.env.local
```

Sign in with a Supabase JWT before invoking the function locally:

```bash
curl \
  -X POST "http://localhost:54321/functions/v1/analyze-upi" \
  -H "Authorization: Bearer $SUPABASE_AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "storage_path": "scans/user-123/upi-receipt.png",
    "bucket": "scans",
    "hints": ["en"],
    "metadata": { "source": "mobile" }
  }'
```

## Request payload

```json
{
  "storage_path": "scans/<user>/<object>.png",    // or "storagePath"
  "bucket": "scans",                              // optional, defaults to "scans"
  "scan_id": "uuid",                             // optional existing scan UUID
  "hints": ["en"],                                // OCR language hints
  "metadata": { "source": "mobile" },           // stored in scan metadata
  "forceRefresh": false                            // re-run even if already complete
}
```

- `scan_id` allows reprocessing a `pending`/`failed` scan. When omitted the function inserts a new row in `scans`.
- Requests must include a valid Supabase Auth bearer token so the function can resolve the current user.

## Response shape

On success (`200`):

```json
{
  "request_id": "uuid",
  "scan_id": "uuid",
  "user_id": "auth-user-id",
  "status": "complete",
  "risk_score": 82,
  "fraud_probability": 0.83,
  "risk_level": "high",
  "upi_details": { "upiId": "merchant@upi", ... },
  "ocr_text": "...",
  "claude_analysis": { "summary": "...", "riskLevel": "high", ... },
  "flags": ["keyword:urgent", "llm:Suspicious language"],
  "profile_stats": {
    "total_scans": 5,
    "high_risk_scans": 2,
    "last_scan_id": "uuid"
  },
  "fraud_alert": { "id": "uuid", "status": "investigating", "severity": "high" },
  "timings": { "total_ms": 1420, "ocr_ms": 630, "reasoning_ms": 480 }
}
```

Error responses include `request_id`, a descriptive `message`, and a `500` or `4xx` status code. When the handler throws after creating a scan row it sets the scan status to `failed` before returning.

## Storage and database side effects

- The function downloads the object from `bucket`/`storage_path` using the Supabase Storage API.
- Scan metadata persisted to `scans.metadata` follows the `ScanMetadata` interface (`risk`, `upi_details`, `claude_analysis`, timings, and optional request metadata).
- `profiles.scan_stats` aggregates total/high-risk scan counts and the most recent scan summary.
- A `fraud_alerts` row is inserted or updated when `risk_score ≥ 70`, with severity mapped from the score (≥90 critical, ≥80 high, ≥70 medium).
- If a profile has a `device_token` on file and the alert severity is `high` or `critical`, the function calls `send-notification` to dispatch a high-priority Expo push (alert + badge).

## Testing helpers

The OCR/LLM integrations are mocked in unit tests. Run the utility tests with Deno:

```bash
deno test supabase/functions/analyze-upi
```

These tests cover UPI parsing heuristics, request normalization, and stats coercion without requiring external services.

## Logging & retries

- All outbound Vision and Claude requests use exponential backoff with jitter (3× for Vision, 2× for Claude).
- Structured logs include `source: "analyze-upi"` and the `requestId` so Cloud logs can be correlated with database rows.
- Google Vision failures, Claude errors, and downstream Supabase errors are surfaced to the caller while ensuring the scan row is marked `failed`.
