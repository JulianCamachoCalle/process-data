-- Kommo API v4 /tasks
-- Primary sink for task payloads pulled from GET /api/v4/tasks and GET /api/v4/tasks/{id}.

create table if not exists public.kommo_tasks (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique,
  business_id bigint not null unique,
  created_by bigint,
  updated_by bigint,
  created_at timestamptz,
  updated_at timestamptz,
  responsible_user_id bigint,
  group_id bigint,
  entity_id bigint,
  entity_type text,
  is_completed boolean,
  task_type_id bigint,
  text text,
  duration bigint,
  complete_till timestamptz,
  result jsonb,
  account_id bigint,
  raw_payload jsonb,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);

create unique index if not exists kommo_tasks_business_id_unique
  on public.kommo_tasks (business_id);

create index if not exists kommo_tasks_responsible_user_id_idx
  on public.kommo_tasks (responsible_user_id);

create index if not exists kommo_tasks_entity_type_entity_id_idx
  on public.kommo_tasks (entity_type, entity_id);

create index if not exists kommo_tasks_task_type_id_idx
  on public.kommo_tasks (task_type_id);

create index if not exists kommo_tasks_is_completed_idx
  on public.kommo_tasks (is_completed);

create index if not exists kommo_tasks_complete_till_desc_idx
  on public.kommo_tasks (complete_till desc);

create index if not exists kommo_tasks_updated_at_desc_idx
  on public.kommo_tasks (updated_at desc);

drop trigger if exists set_kommo_tasks_updated_at_db on public.kommo_tasks;
create trigger set_kommo_tasks_updated_at_db
before update on public.kommo_tasks
for each row
execute function public.set_updated_at();
