-- Kommo API v4 /leads/pipelines
-- Primary sink for pipeline payloads pulled from GET /api/v4/leads/pipelines.

create table if not exists public.kommo_pipelines (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  name text,
  sort integer,
  is_main boolean,
  is_unsorted_on boolean,
  is_archive boolean,
  account_id text,
  statuses jsonb,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create unique index if not exists kommo_pipelines_business_id_unique
  on public.kommo_pipelines (business_id);

create index if not exists kommo_pipelines_name_idx
  on public.kommo_pipelines (name);

create index if not exists kommo_pipelines_sort_idx
  on public.kommo_pipelines (sort);

create index if not exists kommo_pipelines_is_main_idx
  on public.kommo_pipelines (is_main);

create index if not exists kommo_pipelines_is_archive_idx
  on public.kommo_pipelines (is_archive);

drop trigger if exists set_kommo_pipelines_updated_at_db on public.kommo_pipelines;
create trigger set_kommo_pipelines_updated_at_db
before update on public.kommo_pipelines
for each row
execute function public.set_updated_at();
