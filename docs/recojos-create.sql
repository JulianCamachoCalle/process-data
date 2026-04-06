create extension if not exists pgcrypto;

drop table if exists public.recojos cascade;

create table public.recojos (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique default ('recojo-' || gen_random_uuid()::text),
  business_id bigint generated always as identity unique,
  fecha date not null,
  id_lead_ganado bigint not null,
  tipo_cobro text not null,
  veces integer not null default 0,
  cobro_a_tienda numeric(12,2) not null default 0,
  pago_a_moto numeric(12,2) not null default 0,
  ingreso_recojo_total numeric(12,2) not null default 0,
  costo_recojo_total numeric(12,2) not null default 0,
  observaciones text,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now(),
  constraint recojos_id_lead_ganado_fkey
    foreign key (id_lead_ganado) references public.leads_ganados (business_id)
);

create index if not exists recojos_business_id_idx
  on public.recojos (business_id);

create index if not exists recojos_fecha_idx
  on public.recojos (fecha desc);

create index if not exists recojos_id_lead_ganado_idx
  on public.recojos (id_lead_ganado);

create index if not exists recojos_tipo_cobro_idx
  on public.recojos (tipo_cobro);

drop trigger if exists set_recojos_updated_at_db on public.recojos;
create trigger set_recojos_updated_at_db
before update on public.recojos
for each row
execute function public.set_updated_at();

-- Requiere que exista previamente la función `public.set_updated_at()`.
