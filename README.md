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
  - `(tabs)/` — Main app tabs (Home, Scan, Settings) with Scan sub-routes
- `components/` — Reusable UI components
- `lib/` — Theming, environment helpers, and shared utilities
- `store/` — Zustand stores for auth, scans, and alerts
- `hooks/` — Reusable hooks (auth, scans, alerts, theme)

## State management

- React Query is configured with default stale times and an AsyncStorage-backed persister in `lib/query-client.ts`, and the provider is mounted in `app/_layout.tsx`.
- `store/auth.ts` persists Supabase session, profile, and push token details with Zustand + Expo Secure Store.
- `store/scans.ts` keeps a local queue of pending scans for offline handling.
- `store/alerts.ts` manages alert feed filters and severity-based unread counters.
- The `useAuth`, `useScans`, and `useAlerts` hooks expose typed access to these stores and scaffold future data fetching.

## Environment variables

This project uses public Expo environment variables. Only variables prefixed with `EXPO_PUBLIC_` are accessible on the client.

- `EXPO_PUBLIC_SUPABASE_URL`
- `EXPO_PUBLIC_SUPABASE_ANON_KEY`

See `.env.example` for the expected format. Create a `.env` file locally to run the app.

## Supabase backend

The Supabase schema, storage, and realtime configuration are documented in [docs/supabase-setup.md](docs/supabase-setup.md). Apply the initial schema by running the SQL from `supabase/migrations/20241028113000_initial_schema.sql` in the Supabase SQL Editor, or push it through the Supabase CLI after linking your project.

## Tooling

- Lint: `npm run lint`
- Format (check): `npm run prettier:check`
- Format (write): `npm run prettier:write`
- Type check: `npm run typecheck`
- Tests: `npm test`

## Notes

- Gesture Handler and Reanimated are configured (Babel plugin included). The root layout now also mounts the React Query client alongside `GestureHandlerRootView`, `SafeAreaProvider`, and `PaperProvider`.
- Fonts are loaded globally using the Inter family. The UI will render once fonts are available.
- The navigation skeleton demonstrates both a dedicated auth stack and a tabbed main app with nested Scan routes.
