-- Migration: add scan_stats jsonb column to profiles for tracking scan aggregates
begin;

alter table public.profiles
  add column if not exists scan_stats jsonb not null default '{}'::jsonb;

commit;
