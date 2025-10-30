# Guardian AI - Setup Guide

This adds the production-ready Supabase schema, Edge Functions, and a bootstrap Expo app.

## Paths
- Schema: `supabase/schema.sql`
- Edge Functions: `supabase/functions/analyze-upi/index.ts`, `supabase/functions/send-notification/index.ts`
- Mobile app: `guardian-mobile/`

## Supabase
1. Run `supabase/schema.sql` in SQL Editor.
2. Deploy functions:
```bash
supabase functions deploy analyze-upi
supabase functions deploy send-notification
```
3. Set secrets:
```bash
supabase secrets set CLAUDE_API_KEY=sk-ant-xxxxx
supabase secrets set GOOGLE_VISION_KEY=xxxxx
supabase secrets set SUPABASE_URL=<your-supabase-url>
supabase secrets set SUPABASE_SERVICE_ROLE_KEY=<your-service-role-key>
```

CLI quickstart (if you haven't installed/linked):
```bash
npm i -g supabase
supabase login
supabase link --project-ref <YOUR_PROJECT_REF>
```

## Mobile
```bash
cd guardian-mobile
npm install
npx expo start
```

Env vars required:
- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`
