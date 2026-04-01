-- Kommo API v4 /{entity_type}/custom_fields/groups
-- Contract-aligned sink for custom field groups from list and by-id endpoints.

create table if not exists public.kommo_custom_field_groups (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null,
  entity_type text not null,
  name text,
  sort text,
  is_predefined boolean,
  type text,
  fields jsonb,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now(),
  constraint kommo_custom_field_groups_business_entity_unique unique (business_id, entity_type)
);

create unique index if not exists kommo_custom_field_groups_stable_id_unique
  on public.kommo_custom_field_groups (stable_id);

create unique index if not exists kommo_custom_field_groups_business_entity_unique_idx
  on public.kommo_custom_field_groups (business_id, entity_type);

create index if not exists kommo_custom_field_groups_entity_type_idx
  on public.kommo_custom_field_groups (entity_type);

create index if not exists kommo_custom_field_groups_name_idx
  on public.kommo_custom_field_groups (name);

create index if not exists kommo_custom_field_groups_type_idx
  on public.kommo_custom_field_groups (type);

create index if not exists kommo_custom_field_groups_sort_idx
  on public.kommo_custom_field_groups (sort);

drop trigger if exists set_kommo_custom_field_groups_updated_at_db on public.kommo_custom_field_groups;
create trigger set_kommo_custom_field_groups_updated_at_db
before update on public.kommo_custom_field_groups
for each row
execute function public.set_updated_at();
