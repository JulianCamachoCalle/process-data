-- Kommo API v4 /leads/pipelines/{pipeline_id}/statuses
-- Normalized sink for pipeline stages.

create table if not exists public.kommo_pipeline_statuses (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null,
  pipeline_id bigint not null,
  name text,
  sort integer,
  is_editable boolean,
  color text,
  type integer,
  account_id bigint,
  description text,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create unique index if not exists kommo_pipeline_statuses_business_pipeline_unique
  on public.kommo_pipeline_statuses (business_id, pipeline_id);

create index if not exists kommo_pipeline_statuses_pipeline_id_idx
  on public.kommo_pipeline_statuses (pipeline_id);

create index if not exists kommo_pipeline_statuses_name_idx
  on public.kommo_pipeline_statuses (name);

create index if not exists kommo_pipeline_statuses_sort_idx
  on public.kommo_pipeline_statuses (sort);

create index if not exists kommo_pipeline_statuses_type_idx
  on public.kommo_pipeline_statuses (type);

drop trigger if exists set_kommo_pipeline_statuses_updated_at_db on public.kommo_pipeline_statuses;
create trigger set_kommo_pipeline_statuses_updated_at_db
before update on public.kommo_pipeline_statuses
for each row
execute function public.set_updated_at();
