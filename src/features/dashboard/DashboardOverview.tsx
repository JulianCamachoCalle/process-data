import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Activity, AlertCircle, Filter } from 'lucide-react';
import { DateRangePicker } from '../../components/DateRangePicker';
import { formatCurrencyPen, formatNumberEs, normalizeText, parseNumericValue } from '../../lib/tableHelpers';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

interface LeadRow {
  business_id: number | null;
  fecha_lead_ganado: string | null;
  distrito: string | null;
  ingreso_anulados_fullfilment: number | null;
  tienda_nombre_snapshot: string | null;
}

interface EnvioRow {
  id_lead_ganado: number | null;
  fecha_envio: string | null;
  ingreso_total_fila: number | null;
  costo_total_fila: number | null;
}

interface RecojoRow {
  id_lead_ganado: number | null;
  fecha: string | null;
  tipo_cobro: string | null;
  veces: number | null;
  cobro_a_tienda: number | null;
  ingreso_recojo_total: number | null;
  costo_recojo_total: number | null;
}

interface DashboardMetrics {
  periodo: string;
  tiendasRegistradas: number;
  leadsGanados: number;
  enviosTotales: number;
  promedioTE: number;
  ingresosAnuladosFullfilment: number;
  ingresoTotalOperativo: number;
  costoTotalOperativo: number;
  margenTotalOperativo: number;
  ticketPromedioMes: number;
  costoOperativoPorLeadGanado: number;
  ingresoPorLeadGanado: number;
  recojosCobrados: number;
  recojosGratis: number;
  pagoTotalMotorizadoRecojo: number;
  distritoLeadGanadoFrecuente: string;
}

const PAGE_SIZE = 1000;

function toIsoDate(date: Date) {
  return date.toISOString().slice(0, 10);
}

function safeDivide(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return numerator / denominator;
}

function getMostFrequent(values: string[]) {
  const countByNormalized = new Map<string, number>();
  const displayByNormalized = new Map<string, string>();

  for (const raw of values) {
    const value = String(raw ?? '').trim();
    if (!value) continue;
    const normalized = normalizeText(value);
    if (!normalized) continue;

    countByNormalized.set(normalized, (countByNormalized.get(normalized) ?? 0) + 1);
    if (!displayByNormalized.has(normalized)) {
      displayByNormalized.set(normalized, value);
    }
  }

  let winner = '';
  let winnerCount = 0;
  for (const [normalized, count] of countByNormalized.entries()) {
    if (count > winnerCount) {
      winner = normalized;
      winnerCount = count;
    }
  }

  return winner ? displayByNormalized.get(winner) ?? '' : '';
}

async function ensureSupabaseSession() {
  if (!supabase) throw new Error('Supabase no está configurado');

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    throw new Error(`No se pudo validar sesión Supabase: ${sessionError.message}`);
  }

  if (sessionData.session) return;

  const { error: anonError } = await supabase.auth.signInAnonymously();
  if (anonError) {
    throw new Error(`Falló signInAnonymously en Supabase: ${anonError.message}`);
  }
}

async function fetchAllPaged<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: { message?: string } | null }>,
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) {
      throw new Error(error.message || 'No se pudieron cargar datos desde Supabase');
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }

  return rows;
}

async function fetchDashboardMetrics(dateFrom: string, dateTo: string): Promise<DashboardMetrics> {
  if (!supabase || !isSupabaseConfigured()) {
    throw new Error('Supabase no está configurado para el dashboard');
  }

  const client = supabase;

  await ensureSupabaseSession();

  const leadsRows = await fetchAllPaged<LeadRow>(async (from, to) => {
    let query = client
      .from('leads_ganados')
      .select('business_id,fecha_lead_ganado,distrito,ingreso_anulados_fullfilment,tienda_nombre_snapshot')
      .order('business_id', { ascending: true })
      .range(from, to);

    if (dateFrom) query = query.gte('fecha_lead_ganado', dateFrom);
    if (dateTo) query = query.lte('fecha_lead_ganado', dateTo);

    const { data, error } = await query;

    return { data: (data ?? []) as LeadRow[], error };
  });

  const leadIds = new Set(
    leadsRows
      .map((row) => Number(row.business_id ?? 0))
      .filter((id) => Number.isFinite(id) && id > 0),
  );

  const [enviosRowsRaw, recojosRowsRaw] = await Promise.all([
    fetchAllPaged<EnvioRow>(async (from, to) => {
      let query = client
        .from('envios')
        .select('id_lead_ganado,fecha_envio,ingreso_total_fila,costo_total_fila')
        .order('business_id', { ascending: true })
        .range(from, to);

      if (dateFrom) query = query.gte('fecha_envio', dateFrom);
      if (dateTo) query = query.lte('fecha_envio', dateTo);

      const { data, error } = await query;

      return { data: (data ?? []) as EnvioRow[], error };
    }),
    fetchAllPaged<RecojoRow>(async (from, to) => {
      let query = client
        .from('recojos')
        .select('id_lead_ganado,fecha,tipo_cobro,veces,cobro_a_tienda,ingreso_recojo_total,costo_recojo_total')
        .order('business_id', { ascending: true })
        .range(from, to);

      if (dateFrom) query = query.gte('fecha', dateFrom);
      if (dateTo) query = query.lte('fecha', dateTo);

      const { data, error } = await query;

      return { data: (data ?? []) as RecojoRow[], error };
    }),
  ]);

  const enviosRows = enviosRowsRaw.filter((row) => leadIds.has(Number(row.id_lead_ganado ?? 0)));
  // Para KPIs de recojos se filtra SOLO por fecha de recojo (query SQL), sin cruce por fecha_lead_ganado.
  const recojosRows = recojosRowsRaw;

  const tiendasRegistradas = new Set(
    leadsRows
      .map((row) => normalizeText(row.tienda_nombre_snapshot ?? ''))
      .filter(Boolean),
  ).size;

  const leadsGanados = leadsRows.length;
  const enviosTotales = enviosRows.length;
  const promedioTE = safeDivide(enviosTotales, tiendasRegistradas);

  const ingresosAnuladosFullfilment = leadsRows.reduce(
    (acc, row) => acc + (parseNumericValue(row.ingreso_anulados_fullfilment) ?? 0),
    0,
  );

  const ingresoTotalEnvios = enviosRows.reduce((acc, row) => acc + (parseNumericValue(row.ingreso_total_fila) ?? 0), 0);
  const costoTotalEnvios = enviosRows.reduce((acc, row) => acc + (parseNumericValue(row.costo_total_fila) ?? 0), 0);

  const ingresoTotalRecojos = recojosRows.reduce((acc, row) => acc + (parseNumericValue(row.ingreso_recojo_total) ?? 0), 0);
  const costoTotalRecojos = recojosRows.reduce((acc, row) => acc + (parseNumericValue(row.costo_recojo_total) ?? 0), 0);

  const ingresoTotalOperativo = ingresoTotalEnvios + ingresoTotalRecojos + ingresosAnuladosFullfilment;
  const costoTotalOperativo = costoTotalEnvios + costoTotalRecojos;
  const margenTotalOperativo = ingresoTotalOperativo - costoTotalOperativo;
  const ticketPromedioMes = safeDivide(ingresoTotalOperativo, enviosTotales);
  const costoOperativoPorLeadGanado = safeDivide(costoTotalOperativo, leadsGanados);
  const ingresoPorLeadGanado = safeDivide(ingresoTotalOperativo, leadsGanados);

  const recojosCobrados = recojosRows.reduce((acc, row) => {
    const tipo = normalizeText(row.tipo_cobro ?? '');
    if (!tipo.includes('1 pedido')) return acc;
    return acc + (parseNumericValue(row.veces) ?? 0);
  }, 0);

  const recojosGratis = recojosRows.reduce((acc, row) => {
    const tipo = normalizeText(row.tipo_cobro ?? '');
    if (!tipo.includes('2+ pedido')) return acc;
    return acc + (parseNumericValue(row.veces) ?? 0);
  }, 0);

  const pagoTotalMotorizadoRecojo = recojosRows.reduce(
    (acc, row) => acc + (parseNumericValue(row.costo_recojo_total) ?? 0),
    0,
  );

  const distritoLeadGanadoFrecuente = getMostFrequent(
    leadsRows.map((row) => String(row.distrito ?? '').trim()).filter(Boolean),
  );

  return {
    periodo: dateFrom || dateTo ? `${dateFrom || '...'} → ${dateTo || '...'}` : 'Sin filtro (todo el periodo)',
    tiendasRegistradas,
    leadsGanados,
    enviosTotales,
    promedioTE,
    ingresosAnuladosFullfilment,
    ingresoTotalOperativo,
    costoTotalOperativo,
    margenTotalOperativo,
    ticketPromedioMes,
    costoOperativoPorLeadGanado,
    ingresoPorLeadGanado,
    recojosCobrados,
    recojosGratis,
    pagoTotalMotorizadoRecojo,
    distritoLeadGanadoFrecuente,
  };
}

export function DashboardOverview() {
  const today = toIsoDate(new Date());
  const monthStart = `${today.slice(0, 8)}01`;
  const [dateFrom, setDateFrom] = useState(monthStart);
  const [dateTo, setDateTo] = useState(today);

  const metricsQuery = useQuery({
    queryKey: ['dashboard-summary', dateFrom, dateTo],
    queryFn: () => fetchDashboardMetrics(dateFrom, dateTo),
    staleTime: 60 * 1000,
  });

  if (metricsQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mr-3"></div>
        Cargando datos del dashboard...
      </div>
    );
  }

  if (metricsQuery.error || !metricsQuery.data) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500 space-y-4">
        <AlertCircle size={48} />
        <p className="text-lg font-medium">Error al cargar el dashboard</p>
        <p className="text-sm text-red-400">
          {metricsQuery.error instanceof Error ? metricsQuery.error.message : 'Error desconocido'}
        </p>
      </div>
    );
  }

  const metrics = metricsQuery.data;

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-gray-200 bg-white/90 shadow-[0_24px_44px_-30px_rgba(15,23,42,0.65)] px-4 py-5 backdrop-blur-sm flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 uppercase tracking-[0.10em] inline-flex items-center gap-2">
            <Activity className="text-red-600" size={24} />
            Resumen General
          </h1>
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-[0.10em] mt-1 italic">KPI del periodo y métricas operativas.</p>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="inline-flex items-center gap-2 text-xs font-semibold text-gray-500 uppercase tracking-[0.22em]">
          <Filter size={14} />
          Filtros
        </p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end mt-2">
          <DateRangePicker
            startDate={dateFrom}
            endDate={dateTo}
            onStartDateChange={setDateFrom}
            onEndDateChange={setDateTo}
            className="md:col-span-2"
            layoutClassName="grid-cols-1 gap-3 md:grid-cols-2"
            fieldClassName="rounded-none border-0 bg-transparent px-0 py-0 text-xs font-semibold uppercase tracking-[0.22em] text-gray-500 shadow-none"
            labelClassName="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500"
            inputWrapperClassName="mt-1 rounded-xl border border-gray-300 px-3 py-2"
            inputClassName="text-sm"
          />
        </div>
      </div>

      <Section title="KPIS DEL PERIODO">
        <KpiGrid>
          <KpiCard title="Leads Ganados" value={formatNumberEs(metrics.leadsGanados)} />
          <KpiCard title="Envíos Totales" value={formatNumberEs(metrics.enviosTotales)} />
          <KpiCard title="Promedio T. E." value={formatNumberEs(metrics.promedioTE)} />
          <KpiCard title="Ingresos anulados fullfilment" value={formatCurrencyPen(metrics.ingresosAnuladosFullfilment)} />
          <KpiCard title="Ingreso total operativo" value={formatCurrencyPen(metrics.ingresoTotalOperativo)} />
          <KpiCard title="Costo total operativo" value={formatCurrencyPen(metrics.costoTotalOperativo)} />
          <KpiCard title="Margen total operativo" value={formatCurrencyPen(metrics.margenTotalOperativo)} />
          <KpiCard title="Ticket promedio del mes" value={formatCurrencyPen(metrics.ticketPromedioMes)} />
          <KpiCard title="Costo operativo por lead ganado" value={formatCurrencyPen(metrics.costoOperativoPorLeadGanado)} />
          <KpiCard title="Ingreso por lead ganado" value={formatCurrencyPen(metrics.ingresoPorLeadGanado)} />
        </KpiGrid>
      </Section>

      <Section title="RECOJOS">
        <KpiGrid>
          <KpiCard title="Recojos cobrados" value={formatNumberEs(metrics.recojosCobrados)} />
          <KpiCard title="Recojos gratis" value={formatNumberEs(metrics.recojosGratis)} />
          <KpiCard title="Pago total al motorizado por recojo" value={formatCurrencyPen(metrics.pagoTotalMotorizadoRecojo)} />
        </KpiGrid>
      </Section>

      <Section title="DISTRITO">
        <KpiGrid>
          <KpiCard
            title="Distrito lead ganado más frecuente"
            value={metrics.distritoLeadGanadoFrecuente || 'N/D'}
          />
        </KpiGrid>
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-xs font-bold text-gray-700 uppercase tracking-[0.22em]">{title}</h2>
      {children}
    </div>
  );
}

function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{children}</div>;
}

function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-[0_20px_42px_-34px_rgba(15,23,42,0.9)] border border-gray-200">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-[0.22em]">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
