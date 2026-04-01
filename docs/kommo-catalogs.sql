-- Kommo API v4 /catalogs
-- Primary sink for catalogs pulled from GET /api/v4/catalogs.

create table if not exists public.kommo_catalogs (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  name text,
  created_by bigint,
  updated_by bigint,
  created_at timestamptz,
  updated_at timestamptz,
  sort integer,
  type text,
  can_link_multiple boolean,
  can_be_deleted boolean,
  account_id bigint,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create unique index if not exists kommo_catalogs_business_id_unique
  on public.kommo_catalogs (business_id);

create index if not exists kommo_catalogs_name_idx
  on public.kommo_catalogs (name);

create index if not exists kommo_catalogs_type_idx
  on public.kommo_catalogs (type);

create index if not exists kommo_catalogs_sort_idx
  on public.kommo_catalogs (sort);

create index if not exists kommo_catalogs_updated_at_desc_idx
  on public.kommo_catalogs (updated_at desc);

create index if not exists kommo_catalogs_account_id_idx
  on public.kommo_catalogs (account_id);

drop trigger if exists set_kommo_catalogs_updated_at_db on public.kommo_catalogs;
create trigger set_kommo_catalogs_updated_at_db
before update on public.kommo_catalogs
for each row
execute function public.set_updated_at();
