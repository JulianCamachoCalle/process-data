-- Kommo API v4 /{entity_type}/custom_fields
-- Contract-aligned sink for custom fields from list and by-id endpoints.

create table if not exists public.kommo_custom_fields (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null,
  entity_type text not null,
  catalog_id bigint,
  name text,
  code text,
  sort integer,
  type text,
  is_predefined boolean,
  is_deletable boolean,
  remind text,
  enums jsonb,
  is_api_only boolean,
  group_id text,
  required_statuses jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now(),
  constraint kommo_custom_fields_business_entity_unique unique (business_id, entity_type)
);

create unique index if not exists kommo_custom_fields_stable_id_unique
  on public.kommo_custom_fields (stable_id);

create unique index if not exists kommo_custom_fields_business_entity_unique_idx
  on public.kommo_custom_fields (business_id, entity_type);

create index if not exists kommo_custom_fields_entity_type_idx
  on public.kommo_custom_fields (entity_type);

create index if not exists kommo_custom_fields_catalog_id_idx
  on public.kommo_custom_fields (catalog_id);

create index if not exists kommo_custom_fields_name_idx
  on public.kommo_custom_fields (name);

create index if not exists kommo_custom_fields_code_idx
  on public.kommo_custom_fields (code);

create index if not exists kommo_custom_fields_updated_at_desc_idx
  on public.kommo_custom_fields (updated_at desc);

drop trigger if exists set_kommo_custom_fields_updated_at_db on public.kommo_custom_fields;
create trigger set_kommo_custom_fields_updated_at_db
before update on public.kommo_custom_fields
for each row
execute function public.set_updated_at();
