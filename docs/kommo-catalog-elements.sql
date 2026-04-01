-- Kommo API v4 /catalogs/{list_id}/elements
-- Primary sink for catalog elements pulled from GET /api/v4/catalogs/{list_id}/elements.

create table if not exists public.kommo_catalog_elements (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null,
  catalog_id bigint not null,
  name text,
  created_by bigint,
  updated_by bigint,
  created_at timestamptz,
  updated_at timestamptz,
  is_deleted boolean,
  custom_fields_values jsonb,
  account_id bigint,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now(),
  constraint kommo_catalog_elements_business_catalog_unique unique (business_id, catalog_id)
);

create index if not exists kommo_catalog_elements_catalog_id_idx
  on public.kommo_catalog_elements (catalog_id);

create index if not exists kommo_catalog_elements_name_idx
  on public.kommo_catalog_elements (name);

create index if not exists kommo_catalog_elements_updated_at_desc_idx
  on public.kommo_catalog_elements (updated_at desc);

create index if not exists kommo_catalog_elements_is_deleted_idx
  on public.kommo_catalog_elements (is_deleted);

drop trigger if exists set_kommo_catalog_elements_updated_at_db on public.kommo_catalog_elements;
create trigger set_kommo_catalog_elements_updated_at_db
before update on public.kommo_catalog_elements
for each row
execute function public.set_updated_at();
