# `send-notification` Supabase Edge Function

The `send-notification` function delivers Expo push notifications to mobile clients. It validates incoming webhook payloads, promotes critical fraud alerts to high-priority pushes, batches requests to the Expo Push API, and retries transient failures with exponential backoff so important alerts are not lost.

## Responsibilities

1. Accept JSON requests containing a device token (or list of tokens), notification title, body, metadata payload, and an optional priority flag.
2. Validate that every token matches the Expo push token format and that title/body strings are present.
3. Automatically escalate notifications tagged as critical fraud alerts (explicit priority flag, `riskLevel`/`severity` === `"critical"`, or `isCritical` boolean) to `high` priority.
4. Chunk outbound notifications into batches of at most 100 messages and send them to the Expo Push API.
5. Apply exponential backoff for 429/5xx responses and capture ticket-level failures returned by Expo so callers can inspect partial delivery issues.
6. Respond with a structured JSON payload that reports successes, failures, and the derived priority used for the request.

## Runtime configuration

Configure the following secrets for the function via Supabase or a local `.env` file when using `supabase functions serve`:

| Key | Description |
| --- | --- |
| `EXPO_ACCESS_TOKEN` | Optional – Bearer token used to authenticate with the Expo Push API. Provide this if your project uses Expo push security tokens. |

> The Supabase platform automatically injects `SUPABASE_URL` and `SUPABASE_ANON_KEY`, but they are not required for this function.

Set secrets in Supabase with:

```bash
supabase functions secrets set \
  EXPO_ACCESS_TOKEN=your-expo-access-token \
  --project-ref "$SUPABASE_PROJECT_ID"
```

For local invocation, create `supabase/functions/.env.local` (gitignored) with the same secret and run:

```bash
supabase functions serve send-notification --env-file supabase/functions/.env.local
```

## Request payload

```json
{
  "deviceToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]", // string or array of tokens
  "title": "Fraud alert",
  "body": "We detected suspicious activity",
  "data": {"riskLevel": "critical", "alertId": "uuid"},      // optional object
  "priority": "high",                                             // optional string/boolean flag
  "badge": 1                                                       // optional integer (iOS badge count)
}
```

Rules:

- `deviceToken` must be a valid Expo push token (either a single string or an array of strings).
- `data` must be an object when provided. The function inspects `riskLevel`, `severity`, `critical`, or `isCritical` to decide whether critical alerts should be sent with `high` priority.
- `priority` accepts booleans or strings (`"high"`, `"critical"`, `"urgent"`, `"default"`, `"normal"`).
- `badge` is optional. Provide a non-negative integer to set the iOS app badge count.

## Response shape

On success (`200`) or partial success (`207`):

```json
{
  "requestId": "uuid",
  "success": true,
  "priority": "high",
  "tickets": [
    { "to": "ExponentPushToken[xxxxxxxx]", "status": "ok", "id": "ExpoTicket" }
  ],
  "failures": []
}
```

Failures are returned with:

```json
{
  "requestId": "uuid",
  "success": false,
  "priority": null,
  "tickets": [],
  "failures": [
    { "to": "ExponentPushToken[xxxxxxxx]", "status": "error", "message": "DeviceNotRegistered", "details": { "error": "DeviceNotRegistered" } }
  ],
  "error": "Internal server error"      // present on 4xx/5xx responses
}
```

The function uses HTTP status `207` when at least one ticket succeeds and one fails, `200` for full success, `400`/`415`/`405` for validation problems, and `500` for unexpected errors.

## Local testing

Use `curl` to send a request to the locally served function:

```bash
curl \
  -X POST "http://localhost:54321/functions/v1/send-notification" \
  -H "Content-Type: application/json" \
  -d '{
        "deviceToken": "ExponentPushToken[xxxxxxxxxxxxxxxxxxxxxx]",
        "title": "Fraud alert",
        "body": "We detected suspicious activity",
        "data": { "riskLevel": "critical", "alertId": "123" }
      }'
```

The response lists successful tickets and any failures returned by Expo.

## Tests & mocks

Lightweight unit tests cover payload validation, priority derivation, and chunking logic. Run them with the project test suite:

```bash
npm test -- send-notification
```

These tests do not hit the real Expo Push API; they only exercise the pure utility helpers used by the edge function.
