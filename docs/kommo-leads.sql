-- Kommo API v4 /leads
-- Primary sink for lead payloads pulled from GET /api/v4/leads.

create table if not exists public.kommo_leads (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  name text,
  price numeric,
  responsible_user_id bigint,
  group_id bigint,
  status_id bigint,
  pipeline_id bigint,
  loss_reason_id bigint,
  source_id bigint,
  created_by bigint,
  updated_by bigint,
  created_at timestamptz,
  updated_at timestamptz,
  closed_at timestamptz,
  closest_task_at timestamptz,
  score bigint,
  account_id bigint,
  labor_cost numeric,
  is_deleted boolean not null default false,
  is_price_modified_by_robot boolean,
  custom_fields_values jsonb,
  loss_reason jsonb,
  tags jsonb,
  contacts jsonb,
  companies jsonb,
  catalog_elements jsonb,
  source jsonb,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create unique index if not exists kommo_leads_business_id_unique
  on public.kommo_leads (business_id);

create index if not exists kommo_leads_pipeline_id_idx
  on public.kommo_leads (pipeline_id);

create index if not exists kommo_leads_status_id_idx
  on public.kommo_leads (status_id);

create index if not exists kommo_leads_responsible_user_id_idx
  on public.kommo_leads (responsible_user_id);

create index if not exists kommo_leads_source_id_idx
  on public.kommo_leads (source_id);

create index if not exists kommo_leads_updated_at_desc_idx
  on public.kommo_leads (updated_at desc);

create index if not exists kommo_leads_closed_at_desc_idx
  on public.kommo_leads (closed_at desc);

create index if not exists kommo_leads_is_deleted_idx
  on public.kommo_leads (is_deleted);

drop trigger if exists set_kommo_leads_updated_at_db on public.kommo_leads;
create trigger set_kommo_leads_updated_at_db
before update on public.kommo_leads
for each row
execute function public.set_updated_at();
