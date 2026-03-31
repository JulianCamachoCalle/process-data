-- Kommo integration bootstrap for process-data
-- Run in Supabase SQL Editor (project DB)

create table if not exists public.kommo_connections (
  id uuid primary key default gen_random_uuid(),
  account_subdomain text not null unique,
  account_base_url text not null,
  client_id text not null,
  access_token text not null,
  refresh_token text not null,
  token_type text,
  scope text,
  expires_at timestamptz not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_kommo_connections_active
  on public.kommo_connections (active, updated_at desc);

create table if not exists public.kommo_webhook_events (
  id uuid primary key default gen_random_uuid(),
  account_base_url text,
  event_type text not null,
  dedupe_key text not null unique,
  payload jsonb not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'done', 'failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_kommo_events_status_created
  on public.kommo_webhook_events (status, created_at asc);

create table if not exists public.kommo_sync_cursor (
  id uuid primary key default gen_random_uuid(),
  account_subdomain text not null,
  resource text not null,
  cursor_updated_at timestamptz,
  updated_at timestamptz not null default now(),
  unique (account_subdomain, resource)
);

-- Optional updated_at helper trigger (reuse if already exists)
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_kommo_connections_updated_at on public.kommo_connections;
create trigger trg_kommo_connections_updated_at
before update on public.kommo_connections
for each row execute function public.set_updated_at();

drop trigger if exists trg_kommo_webhook_events_updated_at on public.kommo_webhook_events;
create trigger trg_kommo_webhook_events_updated_at
before update on public.kommo_webhook_events
for each row execute function public.set_updated_at();
