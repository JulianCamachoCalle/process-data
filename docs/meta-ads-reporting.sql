-- Meta Marketing API (Ads only) reporting baseline.
-- Minimal phase-1 schema for read-only reporting in Supabase.

create table if not exists public.meta_ad_accounts (
  id uuid primary key default gen_random_uuid(),
  business_id text not null unique,
  account_id text,
  name text,
  account_status text,
  currency text,
  timezone_name text,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists meta_ad_accounts_name_idx
  on public.meta_ad_accounts (name);

drop trigger if exists set_meta_ad_accounts_updated_at_db on public.meta_ad_accounts;
create trigger set_meta_ad_accounts_updated_at_db
before update on public.meta_ad_accounts
for each row
execute function public.set_updated_at();

create table if not exists public.meta_campaigns (
  id uuid primary key default gen_random_uuid(),
  business_id text not null unique,
  account_business_id text not null references public.meta_ad_accounts (business_id),
  name text,
  status text,
  effective_status text,
  objective text,
  start_time timestamptz,
  stop_time timestamptz,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists meta_campaigns_account_business_id_idx
  on public.meta_campaigns (account_business_id);

create index if not exists meta_campaigns_objective_idx
  on public.meta_campaigns (objective);

drop trigger if exists set_meta_campaigns_updated_at_db on public.meta_campaigns;
create trigger set_meta_campaigns_updated_at_db
before update on public.meta_campaigns
for each row
execute function public.set_updated_at();

create table if not exists public.meta_adsets (
  id uuid primary key default gen_random_uuid(),
  business_id text not null unique,
  campaign_business_id text not null references public.meta_campaigns (business_id),
  account_business_id text not null references public.meta_ad_accounts (business_id),
  name text,
  status text,
  effective_status text,
  optimization_goal text,
  billing_event text,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists meta_adsets_campaign_business_id_idx
  on public.meta_adsets (campaign_business_id);

create index if not exists meta_adsets_account_business_id_idx
  on public.meta_adsets (account_business_id);

drop trigger if exists set_meta_adsets_updated_at_db on public.meta_adsets;
create trigger set_meta_adsets_updated_at_db
before update on public.meta_adsets
for each row
execute function public.set_updated_at();

create table if not exists public.meta_ads (
  id uuid primary key default gen_random_uuid(),
  business_id text not null unique,
  adset_business_id text not null references public.meta_adsets (business_id),
  campaign_business_id text not null references public.meta_campaigns (business_id),
  account_business_id text not null references public.meta_ad_accounts (business_id),
  name text,
  status text,
  effective_status text,
  creative_id text,
  creative_name text,
  object_story_id text,
  effective_object_story_id text,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists meta_ads_account_business_id_idx
  on public.meta_ads (account_business_id);

create index if not exists meta_ads_campaign_business_id_idx
  on public.meta_ads (campaign_business_id);

create index if not exists meta_ads_adset_business_id_idx
  on public.meta_ads (adset_business_id);

create index if not exists meta_ads_creative_id_idx
  on public.meta_ads (creative_id);

drop trigger if exists set_meta_ads_updated_at_db on public.meta_ads;
create trigger set_meta_ads_updated_at_db
before update on public.meta_ads
for each row
execute function public.set_updated_at();

create table if not exists public.meta_ad_insights_daily (
  id uuid primary key default gen_random_uuid(),
  ad_business_id text not null references public.meta_ads (business_id),
  date_start date not null,
  date_stop date not null,
  spend numeric(14, 2) not null default 0,
  impressions bigint not null default 0,
  reach bigint not null default 0,
  clicks bigint not null default 0,
  ctr numeric(10, 4),
  cpc numeric(14, 4),
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now(),
  constraint meta_ad_insights_daily_ad_date_unique unique (ad_business_id, date_start, date_stop)
);

create index if not exists meta_ad_insights_daily_date_start_idx
  on public.meta_ad_insights_daily (date_start desc);

create index if not exists meta_ad_insights_daily_ad_business_id_idx
  on public.meta_ad_insights_daily (ad_business_id);

drop trigger if exists set_meta_ad_insights_daily_updated_at_db on public.meta_ad_insights_daily;
create trigger set_meta_ad_insights_daily_updated_at_db
before update on public.meta_ad_insights_daily
for each row
execute function public.set_updated_at();

create table if not exists public.meta_sync_runs (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  resource text not null,
  sync_type text not null default 'manual',
  account_business_id text,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  duration_ms integer,
  success boolean,
  early_stop jsonb,
  totals jsonb,
  resources jsonb,
  request_params jsonb,
  error_message text,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create index if not exists meta_sync_runs_provider_resource_started_at_idx
  on public.meta_sync_runs (provider, resource, started_at desc);

create index if not exists meta_sync_runs_account_business_id_started_at_idx
  on public.meta_sync_runs (account_business_id, started_at desc);

create index if not exists meta_sync_runs_success_idx
  on public.meta_sync_runs (success);

drop trigger if exists set_meta_sync_runs_updated_at_db on public.meta_sync_runs;
create trigger set_meta_sync_runs_updated_at_db
before update on public.meta_sync_runs
for each row
execute function public.set_updated_at();

create or replace view public.meta_ads_reporting_daily as
select
  insight.id as insight_row_id,
  insight.date_start,
  insight.date_stop,
  account.business_id as account_business_id,
  account.name as account_name,
  account.account_status,
  campaign.business_id as campaign_business_id,
  campaign.name as campaign_name,
  campaign.status as campaign_status,
  campaign.effective_status as campaign_effective_status,
  campaign.objective,
  adset.business_id as adset_business_id,
  adset.name as adset_name,
  adset.status as adset_status,
  adset.effective_status as adset_effective_status,
  ad.business_id as ad_business_id,
  ad.name as ad_name,
  ad.status as ad_status,
  ad.effective_status as ad_effective_status,
  ad.creative_id,
  ad.creative_name,
  ad.object_story_id,
  ad.effective_object_story_id,
  insight.spend,
  insight.impressions,
  insight.reach,
  insight.clicks,
  insight.ctr,
  insight.cpc
from public.meta_ad_insights_daily insight
join public.meta_ads ad
  on ad.business_id = insight.ad_business_id
join public.meta_adsets adset
  on adset.business_id = ad.adset_business_id
join public.meta_campaigns campaign
  on campaign.business_id = ad.campaign_business_id
join public.meta_ad_accounts account
  on account.business_id = ad.account_business_id;
