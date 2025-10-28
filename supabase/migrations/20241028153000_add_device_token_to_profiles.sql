-- Migration: Add device token storage to profiles for push notifications
-- Execute this script in the Supabase SQL Editor or via the Supabase CLI.

begin;

alter table public.profiles
  add column if not exists device_token text;

create index if not exists profiles_device_token_idx
  on public.profiles (device_token)
  where device_token is not null;

commit;
