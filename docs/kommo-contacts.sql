-- Kommo Contacts table
create table if not exists public.kommo_contacts (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  name text,
  first_name text,
  last_name text,
  responsible_user_id bigint,
  group_id bigint,
  created_at timestamptz,
  updated_at timestamptz,
  closest_task_at timestamptz,
  is_deleted boolean default false,
  is_unsorted boolean default false,
  custom_fields_values jsonb,
  account_id bigint,
  embedded_data jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists idx_kommo_contacts_business_id on public.kommo_contacts (business_id);
create index if not exists idx_kommo_contacts_responsible_user_id on public.kommo_contacts (responsible_user_id);
create index if not exists idx_kommo_contacts_updated_at on public.kommo_contacts (updated_at desc);

-- Trigger for updated_at
drop trigger if exists trg_kommo_contacts_updated_at on public.kommo_contacts;
create trigger trg_kommo_contacts_updated_at
before update on public.kommo_contacts
for each row execute function public.set_updated_at();