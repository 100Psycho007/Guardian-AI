# Supabase backend setup

Follow the steps below to provision the Supabase project for this application.

## 1. Apply the SQL migration

1. Open the Supabase dashboard and choose your project.
2. Go to **SQL Editor → New query**.
3. Copy the contents of [`supabase/migrations/20241028113000_initial_schema.sql`](../supabase/migrations/20241028113000_initial_schema.sql) into the editor.
4. Review the statements, then click **Run**. The script creates the `profiles`, `scans`, and `fraud_alerts` tables, prime indexes, triggers, and row level security (RLS) policies.
5. Repeat for [`supabase/migrations/20241028153000_add_device_token_to_profiles.sql`](../supabase/migrations/20241028153000_add_device_token_to_profiles.sql) to add the `profiles.device_token` column used for Expo push registration.
6. Confirm each migration completes without errors. If Supabase prompts to save the query, store them for traceability.

> Tip: You can also execute the file locally with the Supabase CLI or any Postgres client for syntax validation before pasting it into the SQL Editor.

## 2. Configure Storage for scans

1. Navigate to **Storage → Buckets → New bucket**.
2. Name the bucket `scans` (keep the name lowercase to match the `storage_path` convention).
3. Disable "Public bucket" so files require signed URLs or service role access.
4. Create the bucket. Record the bucket name in your product documentation if automated uploads will reference it.
5. In **Policies**, grant authenticated users the ability to upload and read objects they own, or manage access through the backend service role. (Leave bucket-wide public access disabled.)

## 3. Enable Realtime on fraud alerts

1. Open **Database → Replication** in the Supabase dashboard.
2. Locate the `public.fraud_alerts` table and enable **Realtime**.
3. Choose "Operations: Inserts, Updates" to stream alert lifecycle changes to subscribers.
4. Save the replication configuration.

The Expo app can now subscribe to `fraud_alerts` updates with the Supabase client exported from `lib/supabase.ts`.

## 4. Validate RLS policies

1. In **Authentication → Users**, create or select a test user.
2. Open the SQL Editor and run queries with the "Run as" switch set to the test user to confirm:
   - The user can only select, insert, or update rows in `profiles` and `scans` where `id`/`user_id` equals their auth UID.
   - The user can read `fraud_alerts` rows related to their scans.
3. Switch to the `service_role` (available only via server-side usage) to ensure alert management works end-to-end.

## 5. Environment configuration recap

- Client-side code uses the public URL (`EXPO_PUBLIC_SUPABASE_URL`) and anon key (`EXPO_PUBLIC_SUPABASE_ANON_KEY`).
- Service role keys and database passwords stay in secure server environments or Supabase Edge Functions. Do not expose them in the Expo app.

## 6. Edge functions

- Refer to [`docs/analyze-upi-edge-function.md`](./analyze-upi-edge-function.md) for runtime secrets, local testing instructions, and the request/response schema required to deploy the `analyze-upi` Supabase Edge Function.
- Refer to [`docs/send-notification-edge-function.md`](./send-notification-edge-function.md) for configuration, local testing instructions, and the payload schema for the `send-notification` Supabase Edge Function.

With these steps complete, the Supabase backend is aligned with the Expo client and ready for development.
