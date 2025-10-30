# Guardian AI - Production Startup Build

This repo includes:
- Supabase schema with RLS: `supabase/schema.sql`
- Edge Functions: `supabase/functions/analyze-upi/`, `supabase/functions/send-notification/`
- Expo mobile app: `guardian-mobile/`

## Quick Start

### Supabase
```bash
# Deploy functions
supabase functions deploy analyze-upi
supabase functions deploy send-notification

# Set secrets
supabase secrets set CLAUDE_API_KEY=sk-ant-xxxxx
supabase secrets set GOOGLE_VISION_KEY=xxxxx
supabase secrets set SUPABASE_URL=<your-supabase-url>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```
Run SQL in `supabase/schema.sql` via the SQL Editor.

### Mobile
```bash
cd guardian-mobile
npm install
npx expo start
```
Set the following envs (EAS/CI or local `.env`):
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

## Features
- Auth (email/password) with Supabase Auth
- Camera scanner → preview → Edge Function analysis → results
- Risk meter, flags, and details
- Realtime alerts feed
- Push notification registration to store Expo token in `profiles.device_token`
