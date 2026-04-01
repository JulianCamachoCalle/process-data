-- Kommo API v4 /roles
-- Primary sink for role payloads pulled from GET /api/v4/roles and /api/v4/roles/{id}.

create table if not exists public.kommo_roles (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  name text,
  rights jsonb,
  is_admin boolean,
  is_active boolean,
  is_free boolean,
  group_id bigint,
  role_id bigint,
  status_rights jsonb,
  users jsonb,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create unique index if not exists kommo_roles_business_id_unique
  on public.kommo_roles (business_id);

create index if not exists kommo_roles_name_idx
  on public.kommo_roles (name);

create index if not exists kommo_roles_is_admin_idx
  on public.kommo_roles (is_admin);

create index if not exists kommo_roles_is_active_idx
  on public.kommo_roles (is_active);

create index if not exists kommo_roles_group_id_idx
  on public.kommo_roles (group_id);

create index if not exists kommo_roles_role_id_idx
  on public.kommo_roles (role_id);

drop trigger if exists set_kommo_roles_updated_at_db on public.kommo_roles;
create trigger set_kommo_roles_updated_at_db
before update on public.kommo_roles
for each row
execute function public.set_updated_at();
