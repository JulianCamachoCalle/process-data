-- Kommo API v4 /users
-- Primary sink for user payloads pulled from GET /api/v4/users and /api/v4/users/{id}.

create table if not exists public.kommo_users (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  name text,
  email text,
  lang text,
  rights jsonb,
  is_admin boolean,
  is_active boolean,
  is_free boolean,
  group_id bigint,
  role_id bigint,
  role jsonb,
  group_data jsonb,
  uuid text,
  amojo_id text,
  user_rank text,
  phone_number text,
  status_rights jsonb,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create unique index if not exists kommo_users_business_id_unique
  on public.kommo_users (business_id);

create index if not exists kommo_users_email_idx
  on public.kommo_users (email);

create index if not exists kommo_users_name_idx
  on public.kommo_users (name);

create index if not exists kommo_users_is_admin_idx
  on public.kommo_users (is_admin);

create index if not exists kommo_users_is_active_idx
  on public.kommo_users (is_active);

create index if not exists kommo_users_group_id_idx
  on public.kommo_users (group_id);

create index if not exists kommo_users_role_id_idx
  on public.kommo_users (role_id);

drop trigger if exists set_kommo_users_updated_at_db on public.kommo_users;
create trigger set_kommo_users_updated_at_db
before update on public.kommo_users
for each row
execute function public.set_updated_at();
