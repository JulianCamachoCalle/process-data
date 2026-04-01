-- Kommo API v4 links
-- Primary sink for link relationships pulled from links sync flow.

create table if not exists public.kommo_links (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  from_entity_type text not null,
  from_entity_id bigint not null,
  to_entity_type text not null,
  to_entity_id bigint not null,
  link_type text,
  created_at timestamptz,
  metadata jsonb,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create unique index if not exists kommo_links_stable_id_unique
  on public.kommo_links (stable_id);

create index if not exists kommo_links_from_idx
  on public.kommo_links (from_entity_type, from_entity_id);

create index if not exists kommo_links_to_idx
  on public.kommo_links (to_entity_type, to_entity_id);

create index if not exists kommo_links_link_type_idx
  on public.kommo_links (link_type);

create index if not exists kommo_links_created_at_desc_idx
  on public.kommo_links (created_at desc);

drop trigger if exists set_kommo_links_updated_at_db on public.kommo_links;
create trigger set_kommo_links_updated_at_db
before update on public.kommo_links
for each row
execute function public.set_updated_at();
