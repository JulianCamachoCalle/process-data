-- Kommo Pipelines table (API v4 /api/v4/leads/pipelines)
-- Used by event_type: pipeline.pull

create table if not exists public.kommo_pipelines (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  name text,
  sort integer,
  is_main boolean,
  is_archive boolean,
  is_unsorted_on boolean,
  is_deleted boolean default false,
  -- Store statuses as returned by Kommo (embedded)
  statuses jsonb,
  -- Raw pipeline JSON for future mapping/extensibility
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists idx_kommo_pipelines_business_id on public.kommo_pipelines (business_id);
create index if not exists idx_kommo_pipelines_is_deleted on public.kommo_pipelines (is_deleted);

drop trigger if exists trg_kommo_pipelines_updated_at on public.kommo_pipelines;
create trigger trg_kommo_pipelines_updated_at
before update on public.kommo_pipelines
for each row execute function public.set_updated_at();
