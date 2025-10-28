# Expo SDK 50 Router + TypeScript Bootstrap

This repository contains a minimal Expo SDK 50 app bootstrapped with:

- Expo Router (TypeScript)
- Directory structure: `app/`, `components/`, `lib/`, `store/`, `hooks/`
- React Native Paper theming (MD3)
- Safe Area + Gesture Handler + Reanimated setup in the root layout
- Global font loading (Inter via `@expo-google-fonts/inter`)
- Environment variable handling with `EXPO_PUBLIC_` keys
- ESLint + Prettier + TypeScript config
- Jest test setup and basic test

## Getting started

Prerequisites:
- Node.js 18 or newer
- npm (or yarn/pnpm)

Install dependencies:

```bash
npm install
```

Create your environment file:

```bash
cp .env.example .env
# Edit .env and set your values
```

Run the app:

```bash
npx expo start
```

Open on a simulator or device from the Expo Dev Tools.

## Project structure

- `app/` — Route-based file system navigation powered by Expo Router
  - `(auth)/` — Authentication stack with a placeholder Sign In screen
  - `(tabs)/` — Main app tabs (Home, Alerts, Scan, Settings) with Scan sub-routes
- `components/` — Reusable UI components (RiskMeter, AlertCard, AlertDetailsModal, etc.)
- `contexts/` — Shared providers such as `AuthContext` and the alerts store
- `lib/` — Theming, environment helpers, and Supabase client utilities
- `store/` — Placeholder global state store
- `hooks/` — Reusable hooks

## Environment variables

This project uses public Expo environment variables. Only variables prefixed with `EXPO_PUBLIC_` are accessible on the client.

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

See `.env.example` for the expected format. Create a `.env` file locally to run the app.

## Supabase backend

The Supabase schema, storage, and realtime configuration are documented in [docs/supabase-setup.md](docs/supabase-setup.md). Apply the initial schema by running the SQL from `supabase/migrations/20241028113000_initial_schema.sql` in the Supabase SQL Editor, or push it through the Supabase CLI after linking your project.

## Alerts feed

The Alerts tab surfaces Supabase `fraud_alerts` records for the signed-in user. It provides:

- Severity filter chips for All/Critical/High/Medium/Low views
- Pull-to-refresh, infinite scroll, and realtime updates for new or updated alerts
- A details modal with an accessible risk breakdown, contextual notes, and mark-as-read controls
- A tab badge that reflects the current unread count via the shared alerts store

Read state is tracked per session inside `AlertStoreProvider` so the UI can respond instantly without incurring extra round-trips or schema changes. The trade-off is that read markers reset when the app is restarted or the user signs out. Persisting this state across sessions would require introducing a dedicated Supabase table (or column) to capture per-user alert metadata.

## Tooling

- Lint: `npm run lint`
- Format (check): `npm run prettier:check`
- Format (write): `npm run prettier:write`
- Type check: `npm run typecheck`
- Tests: `npm test`

## Notes

- Gesture Handler and Reanimated are configured (Babel plugin included). The root layout wraps the app with `GestureHandlerRootView`, `SafeAreaProvider`, and `PaperProvider`.
- Fonts are loaded globally using the Inter family. The UI will render once fonts are available.
- The navigation skeleton demonstrates both a dedicated auth stack and a tabbed main app with nested Scan routes.
