-- Kommo API v4 /leads/unsorted/summary
-- Snapshot summary by deterministic account+filters scope.

create table if not exists public.kommo_unsorted_summary (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  account_base_url text,
  total integer,
  accepted integer,
  declined integer,
  average_sort_time integer,
  categories jsonb,
  filters jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists kommo_unsorted_summary_account_base_url_idx
  on public.kommo_unsorted_summary (account_base_url);

create index if not exists kommo_unsorted_summary_created_at_db_desc_idx
  on public.kommo_unsorted_summary (created_at_db desc);

drop trigger if exists set_kommo_unsorted_summary_updated_at_db on public.kommo_unsorted_summary;
create trigger set_kommo_unsorted_summary_updated_at_db
before update on public.kommo_unsorted_summary
for each row
execute function public.set_updated_at();
