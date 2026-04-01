-- Kommo API v4 /contacts
-- Primary sink for contact payloads pulled from GET /api/v4/contacts.

create table if not exists public.kommo_contacts (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  name text,
  first_name text,
  last_name text,
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
  is_unsorted boolean not null default false,
  tags jsonb,
  companies jsonb,
  leads jsonb,
  catalog_elements jsonb,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create unique index if not exists kommo_contacts_business_id_unique
  on public.kommo_contacts (business_id);

create index if not exists kommo_contacts_responsible_user_id_idx
  on public.kommo_contacts (responsible_user_id);

create index if not exists kommo_contacts_updated_at_desc_idx
  on public.kommo_contacts (updated_at desc);

create index if not exists kommo_contacts_closest_task_at_idx
  on public.kommo_contacts (closest_task_at);

create index if not exists kommo_contacts_account_id_idx
  on public.kommo_contacts (account_id);

create index if not exists kommo_contacts_name_idx
  on public.kommo_contacts (name);

drop trigger if exists set_kommo_contacts_updated_at_db on public.kommo_contacts;
create trigger set_kommo_contacts_updated_at_db
before update on public.kommo_contacts
for each row
execute function public.set_updated_at();
