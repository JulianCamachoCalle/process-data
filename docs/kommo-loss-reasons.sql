-- Kommo API v4 /leads/loss_reasons
-- Catalog sink for loss reasons pulled from GET /api/v4/leads/loss_reasons.

create table if not exists public.kommo_loss_reasons (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  name text,
  sort integer,
  created_at timestamptz,
  updated_at timestamptz,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now(),
  raw_payload jsonb
);

create unique index if not exists kommo_loss_reasons_business_id_unique
  on public.kommo_loss_reasons (business_id);

create index if not exists kommo_loss_reasons_name_idx
  on public.kommo_loss_reasons (name);

create index if not exists kommo_loss_reasons_sort_idx
  on public.kommo_loss_reasons (sort);

create index if not exists kommo_loss_reasons_updated_at_desc_idx
  on public.kommo_loss_reasons (updated_at desc);

drop trigger if exists set_kommo_loss_reasons_updated_at_db on public.kommo_loss_reasons;
create trigger set_kommo_loss_reasons_updated_at_db
before update on public.kommo_loss_reasons
for each row
execute function public.set_updated_at();
