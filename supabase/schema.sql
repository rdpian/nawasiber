-- Nawasiber Community Intelligence v1.0
-- Run this file in Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  category text not null check (category in ('phone','account','email','domain','judol','phishing','other')),
  identifier text not null,
  identifier_normalized text not null,
  title text not null,
  description text not null,
  evidence_url text,
  source_url text,
  status text not null default 'pending' check (status in ('pending','review','verified','rejected')),
  severity text not null default 'unassessed' check (severity in ('unassessed','low','medium','high')),
  admin_note text,
  reviewed_by text,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists reports_identifier_idx on public.reports(identifier_normalized);
create index if not exists reports_status_created_idx on public.reports(status, created_at desc);
create index if not exists reports_category_idx on public.reports(category);

alter table public.reports enable row level security;

-- No direct anonymous/authenticated table access. All reads/writes go through
-- the Netlify function using the service-role key, which must remain server-side.
revoke all on public.reports from anon, authenticated;
grant all on public.reports to service_role;

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists reports_updated_at on public.reports;
create trigger reports_updated_at before update on public.reports
for each row execute function public.set_updated_at();
