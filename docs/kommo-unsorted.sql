-- Kommo API v4 /leads/unsorted
-- UID-centric contract for incoming unsorted leads.

create table if not exists public.kommo_unsorted_leads (
  id bigint generated always as identity primary key,
  stable_id text not null unique,
  uid text not null unique,
  source_uid text,
  source_name text,
  category text,
  pipeline_id bigint,
  created_at timestamptz,
  account_id bigint,
  metadata jsonb,
  lead_id bigint,
  contact_id bigint,
  company_id bigint,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create unique index if not exists kommo_unsorted_leads_uid_unique
  on public.kommo_unsorted_leads (uid);

create index if not exists kommo_unsorted_leads_pipeline_id_idx
  on public.kommo_unsorted_leads (pipeline_id);

create index if not exists kommo_unsorted_leads_created_at_desc_idx
  on public.kommo_unsorted_leads (created_at desc);

create index if not exists kommo_unsorted_leads_lead_id_idx
  on public.kommo_unsorted_leads (lead_id);

create index if not exists kommo_unsorted_leads_contact_id_idx
  on public.kommo_unsorted_leads (contact_id);

create index if not exists kommo_unsorted_leads_company_id_idx
  on public.kommo_unsorted_leads (company_id);

create index if not exists kommo_unsorted_leads_category_idx
  on public.kommo_unsorted_leads (category);

drop trigger if exists set_kommo_unsorted_leads_updated_at_db on public.kommo_unsorted_leads;
create trigger set_kommo_unsorted_leads_updated_at_db
before update on public.kommo_unsorted_leads
for each row
execute function public.set_updated_at();
