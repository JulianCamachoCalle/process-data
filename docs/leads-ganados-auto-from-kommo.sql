create extension if not exists pgcrypto;
create table if not exists public.leads_ganados (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique default ('lead-ganado-' || gen_random_uuid()::text),
  business_id bigint generated always as identity unique,
  -- vínculo automático con Kommo
  kommo_lead_id bigint unique,
  -- snapshots (histórico)
  tienda_nombre_snapshot text,            -- editable (auto-sync no pisa valor manual no vacío)
  vendedor_nombre_snapshot text,          -- snapshot pipeline name
  pipeline_id_snapshot bigint,
  origen_snapshot text not null default 'Entrante',
  fullfilment_snapshot boolean not null default false,
  -- fechas
  fecha_ingreso_lead date,
  fecha_registro_lead date,
  fecha_lead_ganado date,
  -- derivados
  dias_lead_a_registro integer not null default 0,
  dias_registro_a_ganado integer not null default 0,
  dias_lead_a_ganado integer not null default 0,
  -- operación
  cantidad_envios integer not null default 0,
  distrito text,                          -- editable (auto-sync solo autocompleta si está vacío)
  anulados_fullfilment numeric(12,2) not null default 0,
  ingreso_anulados_fullfilment numeric(12,2) not null default 0,
  notas text,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now()
);
create index if not exists leads_ganados_pipeline_id_snapshot_idx
  on public.leads_ganados (pipeline_id_snapshot);
create index if not exists leads_ganados_business_id_idx
  on public.leads_ganados (business_id);
create index if not exists leads_ganados_fecha_ganado_idx
  on public.leads_ganados (fecha_lead_ganado desc);
drop trigger if exists set_leads_ganados_updated_at_db on public.leads_ganados;
create trigger set_leads_ganados_updated_at_db
before update on public.leads_ganados
for each row
execute function public.set_updated_at();
