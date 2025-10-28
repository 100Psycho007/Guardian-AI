-- Migration: Initial schema for profiles, scans, and fraud alerts
-- Execute this script in the Supabase SQL Editor or via the Supabase CLI.

begin;

-- Ensure UUID generation is available
create extension if not exists "pgcrypto";

-- Helper to keep updated_at columns in sync
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

-- User profile metadata tied to Supabase Auth users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  phone text,
  avatar_url text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists profiles_updated_at_idx on public.profiles (updated_at desc);

create trigger set_profiles_updated_at
before update on public.profiles
for each row
execute function public.set_updated_at();

-- Stored document scans uploaded by users
create table if not exists public.scans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  storage_path text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'complete', 'failed')),
  checksum text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  processed_at timestamptz
);

create index if not exists scans_user_created_idx on public.scans (user_id, created_at desc);
create index if not exists scans_status_idx on public.scans (status);

create trigger set_scans_updated_at
before update on public.scans
for each row
execute function public.set_updated_at();

-- Fraud alerts generated during scan evaluation
create table if not exists public.fraud_alerts (
  id uuid primary key default gen_random_uuid(),
  scan_id uuid not null references public.scans(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  status text not null default 'open' check (status in ('open', 'investigating', 'dismissed', 'resolved')),
  severity text not null default 'medium' check (severity in ('low', 'medium', 'high', 'critical')),
  reason text not null,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  resolved_at timestamptz
);

create index if not exists fraud_alerts_scan_idx on public.fraud_alerts (scan_id);
create index if not exists fraud_alerts_user_status_idx on public.fraud_alerts (user_id, status);
create index if not exists fraud_alerts_created_idx on public.fraud_alerts (created_at desc);

create trigger set_fraud_alerts_updated_at
before update on public.fraud_alerts
for each row
execute function public.set_updated_at();

-- Enable and enforce row level security
alter table public.profiles enable row level security;
alter table public.profiles force row level security;

alter table public.scans enable row level security;
alter table public.scans force row level security;

alter table public.fraud_alerts enable row level security;
alter table public.fraud_alerts force row level security;

-- RLS policies for profiles
create policy "Profiles are viewable by owners" on public.profiles
  for select
  to authenticated
  using (auth.uid() = id);

create policy "Profiles are insertable by owners" on public.profiles
  for insert
  to authenticated
  with check (auth.uid() = id);

create policy "Profiles are updatable by owners" on public.profiles
  for update
  to authenticated
  using (auth.uid() = id);

-- RLS policies for scans
create policy "Users can view own scans" on public.scans
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own scans" on public.scans
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own scans" on public.scans
  for update
  to authenticated
  using (auth.uid() = user_id);

-- RLS policies for fraud alerts
create policy "Users can view alerts for their scans" on public.fraud_alerts
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Service role can manage fraud alerts" on public.fraud_alerts
  for all
  to service_role
  using (true)
  with check (true);

commit;
