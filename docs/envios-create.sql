create extension if not exists pgcrypto;

drop table if exists public.envios cascade;

create table public.envios (
  id uuid primary key default gen_random_uuid(),
  stable_id text not null unique default ('envio-' || gen_random_uuid()::text),
  business_id bigint generated always as identity unique,
  fecha_envio date not null,
  id_lead_ganado bigint not null,
  id_destino bigint not null,
  id_resultado bigint not null,
  cobro_entrega numeric(12,2) not null default 0,
  pago_moto numeric(12,2) not null default 0,
  excedente_pagado_moto numeric(12,2) not null default 0,
  ingreso_total_fila numeric(12,2) not null default 0,
  costo_total_fila numeric(12,2) not null default 0,
  observaciones text,
  id_tipo_punto bigint not null,
  extra_punto_moto numeric(12,2) not null default 0,
  extra_punto_empresa numeric(12,2) not null default 0,
  created_at_db timestamptz not null default now(),
  updated_at_db timestamptz not null default now(),
  constraint envios_id_lead_ganado_fkey
    foreign key (id_lead_ganado) references public.leads_ganados (business_id),
  constraint envios_id_destino_fkey
    foreign key (id_destino) references public.destinos (business_id),
  constraint envios_id_resultado_fkey
    foreign key (id_resultado) references public.resultados (business_id),
  constraint envios_id_tipo_punto_fkey
    foreign key (id_tipo_punto) references public.tipo_punto (business_id)
);

create index if not exists envios_business_id_idx
  on public.envios (business_id);

create index if not exists envios_fecha_envio_idx
  on public.envios (fecha_envio desc);

create index if not exists envios_id_lead_ganado_idx
  on public.envios (id_lead_ganado);

create index if not exists envios_id_destino_idx
  on public.envios (id_destino);

create index if not exists envios_id_resultado_idx
  on public.envios (id_resultado);

create index if not exists envios_id_tipo_punto_idx
  on public.envios (id_tipo_punto);

drop trigger if exists set_envios_updated_at_db on public.envios;
create trigger set_envios_updated_at_db
before update on public.envios
for each row
execute function public.set_updated_at();

-- Requiere que exista previamente la función `public.set_updated_at()`.
