-- Kommo Events table (API v4 /api/v4/events)
create table if not exists public.kommo_events (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  type text,
  entity_type text,
  entity_id bigint,
  user_id bigint,
  user_name text,
  created_at timestamptz,
  created_by bigint,
  responsible_user_id bigint,
  metadata jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists idx_kommo_events_business_id on public.kommo_events (business_id);
create index if not exists idx_kommo_events_entity on public.kommo_events (entity_type, entity_id);
create index if not exists idx_kommo_events_type on public.kommo_events (type);
create index if not exists idx_kommo_events_created_at on public.kommo_events (created_at desc);

drop trigger if exists trg_kommo_events_updated_at on public.kommo_events;
create trigger trg_kommo_events_updated_at before update on public.kommo_events for each row execute function public.set_updated_at();

-- Kommo Catalogs table (API v4 /api/v4/catalogs)
create table if not exists public.kommo_catalogs (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  name text,
  catalog_type text,
  has_products boolean,
  can_show_in_menu boolean,
  sort_by integer,
  custom_fields jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists idx_kommo_catalogs_business_id on public.kommo_catalogs (business_id);
create index if not exists idx_kommo_catalogs_type on public.kommo_catalogs (catalog_type);

drop trigger if exists trg_kommo_catalogs_updated_at on public.kommo_catalogs;
create trigger trg_kommo_catalogs_updated_at before update on public.kommo_catalogs for each row execute function public.set_updated_at();

-- Kommo Catalog Elements (products within catalogs)
create table if not exists public.kommo_catalog_elements (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null,
  catalog_id bigint not null,
  name text,
  price numeric,
  custom_fields jsonb,
  metadata jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists idx_kommo_catalog_elements_business_id on public.kommo_catalog_elements (business_id);
create index if not exists idx_kommo_catalog_elements_catalog_id on public.kommo_catalog_elements (catalog_id);

drop trigger if exists trg_kommo_catalog_elements_updated_at on public.kommo_catalog_elements;
create trigger trg_kommo_catalog_elements_updated_at before update on public.kommo_catalog_elements for each row execute function public.set_updated_at();

-- Kommo Unsorted Leads table (API v4 /api/v4/leads/unsorted)
create table if not exists public.kommo_unsorted_leads (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  name text,
  price numeric,
  responsible_user_id bigint,
  group_id bigint,
  status_id bigint,
  pipeline_id bigint,
  source_id bigint,
  original_creation_date timestamptz,
  created_at timestamptz,
  updated_at timestamptz,
  custom_fields_values jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists idx_kommo_unsorted_business_id on public.kommo_unsorted_leads (business_id);
create index if not exists idx_kommo_unsorted_responsible_user_id on public.kommo_unsorted_leads (responsible_user_id);
create index if not exists idx_kommo_unsorted_created_at on public.kommo_unsorted_leads (created_at desc);

drop trigger if exists trg_kommo_unsorted_updated_at on public.kommo_unsorted_leads;
create trigger trg_kommo_unsorted_updated_at before update on public.kommo_unsorted_leads for each row execute function public.set_updated_at();

-- Kommo Links table (links between entities: lead-contact-company)
create table if not exists public.kommo_links (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  from_entity_type text not null,
  from_entity_id bigint not null,
  to_entity_type text not null,
  to_entity_id bigint not null,
  link_type text,
  created_at timestamptz,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists idx_kommo_links_from_entity on public.kommo_links (from_entity_type, from_entity_id);
create index if not exists idx_kommo_links_to_entity on public.kommo_links (to_entity_type, to_entity_id);
create unique index if not exists idx_kommo_links_unique on public.kommo_links (from_entity_type, from_entity_id, to_entity_type, to_entity_id);

drop trigger if exists trg_kommo_links_updated_at on public.kommo_links;
create trigger trg_kommo_links_updated_at before update on public.kommo_links for each row execute function public.set_updated_at();

-- Kommo Custom Fields table (API v4 /api/v4/{entity_type}/custom_fields)
create table if not exists public.kommo_custom_fields (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  entity_type text not null,
  name text,
  code text,
  field_type text,
  sort integer,
  is_predefined boolean,
  is_required boolean,
  is_deletable boolean,
  is_filter_enabled boolean,
  default_value jsonb,
  values jsonb,
  checkboxes jsonb,
  created_at timestamptz,
  updated_at timestamptz,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists idx_kommo_custom_fields_business_id on public.kommo_custom_fields (business_id);
create index if not exists idx_kommo_custom_fields_entity_type on public.kommo_custom_fields (entity_type);
create index if not exists idx_kommo_custom_fields_code on public.kommo_custom_fields (code);

drop trigger if exists trg_kommo_custom_fields_updated_at on public.kommo_custom_fields;
create trigger trg_kommo_custom_fields_updated_at before update on public.kommo_custom_fields for each row execute function public.set_updated_at();

-- Kommo Webhooks table (API v4 /api/v4/webhooks)
create table if not exists public.kommo_webhooks (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  url text,
  name text,
  events jsonb,
  settings jsonb,
  is_active boolean,
  created_at timestamptz,
  updated_at timestamptz,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists idx_kommo_webhooks_business_id on public.kommo_webhooks (business_id);
create index if not exists idx_kommo_webhooks_active on public.kommo_webhooks (is_active);

drop trigger if exists trg_kommo_webhooks_updated_at on public.kommo_webhooks;
create trigger trg_kommo_webhooks_updated_at before update on public.kommo_webhooks for each row execute function public.set_updated_at();

-- Kommo Talks (Chat/Messages) - API v4 /api/v4/talks/{id}
create table if not exists public.kommo_talks (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  talk_type text,
  conversation_id text,
  participant_id bigint,
  request_id text,
  status text,
  created_at timestamptz,
  updated_at timestamptz,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists idx_kommo_talks_business_id on public.kommo_talks (business_id);
create index if not exists idx_kommo_talks_conversation_id on public.kommo_talks (conversation_id);

drop trigger if exists trg_kommo_talks_updated_at on public.kommo_talks;
create trigger trg_kommo_talks_updated_at before update on public.kommo_talks for each row execute function public.set_updated_at();

-- Kommo Talk Messages (messages within talks)
create table if not exists public.kommo_talk_messages (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  talk_id bigint not null,
  message text,
  sender_type text,
  sender_id bigint,
  recipient_id bigint,
  is_read boolean,
  created_at timestamptz,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists idx_kommo_talk_messages_business_id on public.kommo_talk_messages (business_id);
create index if not exists idx_kommo_talk_messages_talk_id on public.kommo_talk_messages (talk_id);
create index if not exists idx_kommo_talk_messages_created_at on public.kommo_talk_messages (created_at desc);

drop trigger if exists trg_kommo_talk_messages_updated_at on public.kommo_talk_messages;
create trigger trg_kommo_talk_messages_updated_at before update on public.kommo_talk_messages for each row execute function public.set_updated_at();