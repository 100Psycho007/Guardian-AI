# Supabase CLI Configuration

This directory stores project-specific metadata for the Supabase CLI and serverless Functions.

## Structure

- `config.toml` – Local CLI configuration. Update `project_id` with your Supabase project reference before running CLI commands.
- `migrations/` – SQL files that can be executed through the Supabase SQL Editor or the CLI. Migrations should be committed.
- `functions/` – Placeholder directory for edge functions. Add new functions here via `supabase functions new <name>`.

A `.gitkeep` file is committed so the empty `functions/` directory remains in version control until the first function is added.

## Environment variables

The Supabase CLI reads environment variables from your shell and optional `.env` files. Recommended variables to export:

- `SUPABASE_ACCESS_TOKEN` – Personal access token used for CLI authentication.
- `SUPABASE_PROJECT_ID` – The project reference (e.g. `abcd1234`) used when deploying migrations or functions.
- `SUPABASE_DB_PASSWORD` – Database password required for operations that connect directly to Postgres.

Store these values securely. Do **not** commit secrets to the repository. Use 1Password, Bitwarden, or your team's vault solution to share credentials.

For local development, create a `.env.local` (gitignored) file at the repository root and source it before invoking the CLI:

```bash
# .env.local
export SUPABASE_ACCESS_TOKEN=...
export SUPABASE_PROJECT_ID=...
export SUPABASE_DB_PASSWORD=...
```

```bash
source .env.local
supabase login --token "$SUPABASE_ACCESS_TOKEN"
```

## Secret management

- Production secrets live exclusively in Supabase (Database passwords, service role keys, storage keys).
- Runtime environment variables for the Expo app must be prefixed with `EXPO_PUBLIC_` and live in `.env` locally and in your Expo project configuration.
- Server-side keys such as the Supabase service role key should only appear in secure runtime environments (Supabase Edge Functions, backend services, CI secrets). Do **not** add them to `.env.example`.

## Helpful commands

```bash
# Pull project configuration
supabase link --project-ref "$SUPABASE_PROJECT_ID"

# Create a new migration
supabase migration new add-new-table

# Deploy migrations to the linked project
supabase db push

# Generate a new edge function
supabase functions new verify-scan
```

Refer to the official documentation for additional CLI options: <https://supabase.com/docs/reference/cli>.
