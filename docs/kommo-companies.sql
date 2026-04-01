-- Kommo API v4 /companies
-- Primary sink for company payloads pulled from GET /api/v4/companies.

create table if not exists public.kommo_companies (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  name text,
  responsible_user_id bigint,
  group_id bigint,
  created_by bigint,
  updated_by bigint,
  created_at timestamptz,
  updated_at timestamptz,
  closest_task_at timestamptz,
  custom_fields_values jsonb,
  account_id bigint,
  is_deleted boolean not null default false,
  tags jsonb,
  contacts jsonb,
  leads jsonb,
  catalog_elements jsonb,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create unique index if not exists kommo_companies_business_id_unique
  on public.kommo_companies (business_id);

create index if not exists kommo_companies_responsible_user_id_idx
  on public.kommo_companies (responsible_user_id);

create index if not exists kommo_companies_updated_at_desc_idx
  on public.kommo_companies (updated_at desc);

create index if not exists kommo_companies_closest_task_at_idx
  on public.kommo_companies (closest_task_at);

create index if not exists kommo_companies_account_id_idx
  on public.kommo_companies (account_id);

create index if not exists kommo_companies_name_idx
  on public.kommo_companies (name);

drop trigger if exists set_kommo_companies_updated_at_db on public.kommo_companies;
create trigger set_kommo_companies_updated_at_db
before update on public.kommo_companies
for each row
execute function public.set_updated_at();
