-- Kommo Tags table (updated: added entity_type to differentiate tags across entity types)
-- NOTE: If table exists, run kommo-tags-migration.sql first
create table if not exists public.kommo_tags (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null,
  entity_type text not null default 'leads',
  name text,
  color text,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now(),
  unique (business_id, entity_type)
);

create index if not exists idx_kommo_tags_business_id on public.kommo_tags (business_id, entity_type);
create index if not exists idx_kommo_tags_entity_type on public.kommo_tags (entity_type);
drop trigger if exists trg_kommo_tags_updated_at on public.kommo_tags;
create trigger trg_kommo_tags_updated_at before update on public.kommo_tags for each row execute function public.set_updated_at();

-- Kommo Tasks table
create table if not exists public.kommo_tasks (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  name text,
  text text,
  task_type_id bigint,
  status text,
  group_id bigint,
  created_by bigint,
  duration numeric,
  complete_till bigint,
  is_completed boolean,
  result text,
  responsible_user_id bigint,
  created_at timestamptz,
  updated_at timestamptz,
  closest_task_at timestamptz,
  completed_at timestamptz,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists idx_kommo_tasks_business_id on public.kommo_tasks (business_id);
create index if not exists idx_kommo_tasks_responsible_user_id on public.kommo_tasks (responsible_user_id);
drop trigger if exists trg_kommo_tasks_updated_at on public.kommo_tasks;
create trigger trg_kommo_tasks_updated_at before update on public.kommo_tasks for each row execute function public.set_updated_at();

-- Kommo Notes table
create table if not exists public.kommo_notes (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  note_type text,
  body text,
  element_type text,
  element_id bigint,
  created_by bigint,
  created_at timestamptz,
  updated_at timestamptz,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists idx_kommo_notes_business_id on public.kommo_notes (business_id);
create index if not exists idx_kommo_notes_element on public.kommo_notes (element_type, element_id);
drop trigger if exists trg_kommo_notes_updated_at on public.kommo_notes;
create trigger trg_kommo_notes_updated_at before update on public.kommo_notes for each row execute function public.set_updated_at();

-- Kommo Calls table
create table if not exists public.kommo_calls (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  call_type text,
  call_status text,
  phone text,
  caller_id text,
  direction text,
  duration numeric,
  source text,
  link text,
  element_type text,
  element_id bigint,
  created_by bigint,
  responsible_user_id bigint,
  created_at timestamptz,
  updated_at timestamptz,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists idx_kommo_calls_business_id on public.kommo_calls (business_id);
create index if not exists idx_kommo_calls_responsible_user_id on public.kommo_calls (responsible_user_id);
drop trigger if exists trg_kommo_calls_updated_at on public.kommo_calls;
create trigger trg_kommo_calls_updated_at before update on public.kommo_calls for each row execute function public.set_updated_at();