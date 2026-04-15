import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateRangePicker } from '../../components/DateRangePicker';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';

type SellerOption = {
  value: string;
  pipelineId: number;
  label: string;
};

type LeadGanadoForSeller = {
  business_id: number;
  pipeline_id_snapshot: number | null;
  kommo_lead_id: number | null;
  tienda_nombre_snapshot: string | null;
};

type EnvioRow = {
  id_lead_ganado: number | null;
  id_resultado: number | null;
  ingreso_total_fila: number | null;
  costo_total_fila: number | null;
};

type RecojoRow = {
  id_lead_ganado: number | null;
  ingreso_recojo_total: number | null;
  costo_recojo_total: number | null;
};

type SellerStats = {
  seller: string;
  enviosTotales: number;
  totalLeads: number;
  leadsGanados: number;
  efectividad: number;
  ingresoTotal: number;
  costoMotoTotal: number;
  margenVsMoto: number;
  ingresoPorLeadGanado: number;
  ticketPromedio: number;
  topTiendas: Array<{ tienda: string; enviosEntregados: number }>;
};

type QueryError = { message?: string } | null;

const EXCLUDED_PIPELINE_NAMES = new Set([
  'data de leads',
  'leads entrantes principal',
]);

function parseNumeric(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function formatDecimal(value: number, digits = 2) {
  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

function chunkArray<T>(items: T[], size: number) {
  if (size <= 0) return [items];
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

async function fetchAllRowsPaged<T>(
  fetchPage: (from: number, to: number) => Promise<{ data: T[] | null; error: QueryError }>,
  pageSize = 1000,
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + pageSize - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) {
      throw new Error(error.message || 'No se pudieron cargar datos desde Supabase.');
    }

    const page = data ?? [];
    rows.push(...page);

    if (page.length < pageSize) break;
    from += pageSize;
  }

  return rows;
}

async function fetchDeliveredResultIds() {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase no está configurado.');
  }
  const client = supabase;

  const rows = await fetchAllRowsPaged<{ business_id: number; resultado: string | null }>(
    async (from, to) => {
      const response = await client
        .from('resultados')
        .select('business_id,resultado')
        .range(from, to);

      return {
        data: (response.data ?? []) as Array<{ business_id: number; resultado: string | null }>,
        error: response.error,
      };
    },
    500,
  );

  return new Set(
    rows
      .filter((row) => normalizeText(String(row.resultado ?? '')).includes('entregado'))
      .map((row) => Number(row.business_id))
      .filter((id) => Number.isFinite(id) && id > 0),
  );
}

async function fetchSellerOptions() {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase no está configurado.');
  }

  const client = supabase;
  const leads = await fetchAllRowsPaged<{ vendedor_nombre_snapshot: string | null; pipeline_id_snapshot: number | null }>(
    async (from, to) => {
      const response = await client
        .from('leads_ganados')
        .select('vendedor_nombre_snapshot,pipeline_id_snapshot')
        .range(from, to);

      return {
        data: (response.data ?? []) as Array<{ vendedor_nombre_snapshot: string | null; pipeline_id_snapshot: number | null }>,
        error: response.error,
      };
    },
    1000,
  );

  const bySeller = new Map<string, { label: string; pipelineCounts: Map<number, number> }>();
  for (const row of leads) {
    const label = String(row.vendedor_nombre_snapshot ?? '').trim();
    if (!label) continue;
    if (EXCLUDED_PIPELINE_NAMES.has(normalizeText(label))) continue;

    const sellerKey = normalizeText(label);
    const pipelineId = Number(row.pipeline_id_snapshot ?? 0);
    if (!Number.isFinite(pipelineId) || pipelineId <= 0) continue;

    const entry = bySeller.get(sellerKey) ?? { label, pipelineCounts: new Map<number, number>() };
    entry.pipelineCounts.set(pipelineId, (entry.pipelineCounts.get(pipelineId) ?? 0) + 1);
    bySeller.set(sellerKey, entry);
  }

  const options: SellerOption[] = [];
  for (const entry of bySeller.values()) {
    let bestPipelineId: number | null = null;
    let bestCount = -1;
    for (const [pipelineId, count] of entry.pipelineCounts.entries()) {
      if (count > bestCount) {
        bestPipelineId = pipelineId;
        bestCount = count;
      }
    }

    if (!bestPipelineId) continue;
    options.push({
      value: String(bestPipelineId),
      pipelineId: bestPipelineId,
      label: entry.label,
    });
  }

  return options.sort((a, b) => a.label.localeCompare(b.label, 'es'));
}

async function fetchEnviosByLeadIds(input: {
  leadIds: number[];
  startDate: string;
  endDate: string;
  deliveredResultIds?: number[];
}) {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase no está configurado.');
  }
  const client = supabase;

  const leadIdChunks = chunkArray(input.leadIds, 200);
  const rows: EnvioRow[] = [];

  for (const leadIdsChunk of leadIdChunks) {
    const chunkRows = await fetchAllRowsPaged<EnvioRow>(async (from, to) => {
      let query = client
        .from('envios')
        .select('id_lead_ganado,id_resultado,ingreso_total_fila,costo_total_fila')
        .in('id_lead_ganado', leadIdsChunk)
        .range(from, to);

      if (input.deliveredResultIds && input.deliveredResultIds.length > 0) {
        query = query.in('id_resultado', input.deliveredResultIds);
      }

      if (input.startDate) {
        query = query.gte('fecha_envio', input.startDate);
      }

      if (input.endDate) {
        query = query.lte('fecha_envio', input.endDate);
      }

      const response = await query;

      return {
        data: (response.data ?? []) as EnvioRow[],
        error: response.error,
      };
    });

    rows.push(...chunkRows);
  }

  return rows;
}

async function fetchRecojosByLeadIds(input: { leadIds: number[]; startDate: string; endDate: string }) {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase no está configurado.');
  }
  const client = supabase;

  const leadIdChunks = chunkArray(input.leadIds, 200);
  const rows: RecojoRow[] = [];

  for (const leadIdsChunk of leadIdChunks) {
    const chunkRows = await fetchAllRowsPaged<RecojoRow>(async (from, to) => {
      let query = client
        .from('recojos')
        .select('id_lead_ganado,ingreso_recojo_total,costo_recojo_total')
        .in('id_lead_ganado', leadIdsChunk)
        .range(from, to);

      if (input.startDate) {
        query = query.gte('fecha', input.startDate);
      }

      if (input.endDate) {
        query = query.lte('fecha', input.endDate);
      }

      const response = await query;

      return {
        data: (response.data ?? []) as RecojoRow[],
        error: response.error,
      };
    });

    rows.push(...chunkRows);
  }

  return rows;
}

async function fetchSellerStats(input: {
  sellerName: string;
  pipelineId: number;
  startDate: string;
  endDate: string;
  deliveredResultIds: Set<number>;
}) {
  if (!isSupabaseConfigured() || !supabase) {
    throw new Error('Supabase no está configurado.');
  }
  const client = supabase;

  const leadsGanados = await fetchAllRowsPaged<LeadGanadoForSeller>(async (from, to) => {
    let query = client
      .from('leads_ganados')
      .select('business_id,pipeline_id_snapshot,kommo_lead_id,tienda_nombre_snapshot')
      .eq('vendedor_nombre_snapshot', input.sellerName)
      .range(from, to);

    if (input.startDate) {
      query = query.gte('fecha_lead_ganado', input.startDate);
    }

    if (input.endDate) {
      query = query.lte('fecha_lead_ganado', input.endDate);
    }

    const response = await query;
    return {
      data: (response.data ?? []) as LeadGanadoForSeller[],
      error: response.error,
    };
  });

  const leadsGanadosTotal = leadsGanados.length;
  const leadIds = Array.from(
    new Set(
      leadsGanados
        .map((lead) => Number(lead.business_id))
        .filter((id) => Number.isFinite(id) && id > 0),
    ),
  );

  const normalizedPipelineId = Number(input.pipelineId);

  const fetchKommoLeadCount = async () => {
    if (!Number.isFinite(normalizedPipelineId) || normalizedPipelineId <= 0) {
      return 0;
    }

    const countBy = async (field: 'updated_at' | 'updated_at_db') => {
      let query = client
        .from('kommo_leads')
        .select('business_id', { head: true, count: 'exact' })
        .eq('pipeline_id', normalizedPipelineId);

      if (input.startDate) {
        query = query.gte(field, input.startDate);
      }

      if (input.endDate) {
        query = query.lt(field, `${input.endDate}T23:59:59.999Z`);
      }

      const { count, error } = await query;
      if (error) {
        throw new Error(error.message || `No se pudo calcular leads totales por ${field}.`);
      }

      return Number(count ?? 0);
    };

    const updatedAtCount = await countBy('updated_at');
    if (updatedAtCount > 0) return updatedAtCount;

    return countBy('updated_at_db');
  };

  const deliveredResultIds = Array.from(input.deliveredResultIds);
  const [envios, enviosEntregados, recojos, totalLeads] = await Promise.all([
    leadIds.length
      ? fetchEnviosByLeadIds({
          leadIds,
          startDate: input.startDate,
          endDate: input.endDate,
        })
      : Promise.resolve([] as EnvioRow[]),
    deliveredResultIds.length
      ? (leadIds.length
        ? fetchEnviosByLeadIds({
          leadIds,
          deliveredResultIds,
          startDate: input.startDate,
          endDate: input.endDate,
        })
        : Promise.resolve([] as EnvioRow[]))
      : Promise.resolve([] as EnvioRow[]),
    leadIds.length
      ? fetchRecojosByLeadIds({
          leadIds,
          startDate: input.startDate,
          endDate: input.endDate,
        })
      : Promise.resolve([] as RecojoRow[]),
    fetchKommoLeadCount(),
  ]);

  const enviosTotales = envios.length;

  const ingresoEnvios = envios.reduce((acc, row) => acc + parseNumeric(row.ingreso_total_fila), 0);
  const costoEnvios = envios.reduce((acc, row) => acc + parseNumeric(row.costo_total_fila), 0);
  const ingresoRecojos = recojos.reduce((acc, row) => acc + parseNumeric(row.ingreso_recojo_total), 0);
  const costoRecojos = recojos.reduce((acc, row) => acc + parseNumeric(row.costo_recojo_total), 0);

  const ingresoTotal = ingresoEnvios + ingresoRecojos;
  const costoMotoTotal = costoEnvios + costoRecojos;
  const margenVsMoto = ingresoTotal - costoMotoTotal;
  const efectividad = totalLeads > 0 ? (leadsGanadosTotal / totalLeads) * 100 : 0;
  const ingresoPorLeadGanado = leadsGanadosTotal > 0 ? ingresoTotal / leadsGanadosTotal : 0;
  const ticketPromedio = enviosTotales > 0 ? ingresoTotal / enviosTotales : 0;

  const tiendaByLeadId = new Map<number, string>();
  for (const lead of leadsGanados) {
    const leadId = Number(lead.business_id);
    if (!Number.isFinite(leadId) || leadId <= 0) continue;
    const tienda = String(lead.tienda_nombre_snapshot ?? '').trim() || `Lead #${leadId}`;
    tiendaByLeadId.set(leadId, tienda);
  }

  const topTiendaCounter = new Map<string, number>();
  for (const envio of enviosEntregados) {
    const leadId = Number(envio.id_lead_ganado ?? 0);
    const tienda = tiendaByLeadId.get(leadId) ?? `Lead #${leadId}`;
    topTiendaCounter.set(tienda, (topTiendaCounter.get(tienda) ?? 0) + 1);
  }

  const topTiendas = Array.from(topTiendaCounter.entries())
    .map(([tienda, enviosEntregados]) => ({ tienda, enviosEntregados }))
    .sort((a, b) => b.enviosEntregados - a.enviosEntregados)
    .slice(0, 3);

  return {
    seller: input.sellerName,
    enviosTotales,
    totalLeads,
    leadsGanados: leadsGanadosTotal,
    efectividad,
    ingresoTotal,
    costoMotoTotal,
    margenVsMoto,
    ingresoPorLeadGanado,
    ticketPromedio,
    topTiendas,
  } satisfies SellerStats;
}

export function EstadisticasVendedorPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSeller, setSelectedSeller] = useState('');

  const deliveredResultIdsQuery = useQuery({
    queryKey: ['operativas', 'estadisticas-vendedor', 'delivered-result-ids'],
    queryFn: fetchDeliveredResultIds,
    staleTime: 10 * 60_000,
    refetchOnWindowFocus: false,
  });

  const sellersQuery = useQuery({
    queryKey: ['operativas', 'estadisticas-vendedor', 'sellers'],
    queryFn: fetchSellerOptions,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const sellerOptions = sellersQuery.data ?? [];
  const selectedOption = sellerOptions.find((option) => option.value === selectedSeller) ?? null;
  const selectedSellerIsValid = !!selectedOption;

  const statsQuery = useQuery({
    queryKey: [
      'operativas',
      'estadisticas-vendedor',
      'stats',
      selectedSeller || 'none',
      startDate || 'none',
      endDate || 'none',
    ],
    queryFn: () => {
      if (!deliveredResultIdsQuery.data) {
        throw new Error('No se pudieron cargar los resultados entregados.');
      }

      if (!selectedOption) {
        throw new Error('Seleccioná un vendedor válido.');
      }

      return fetchSellerStats({
        sellerName: selectedOption.label,
        pipelineId: selectedOption.pipelineId,
        startDate,
        endDate,
        deliveredResultIds: deliveredResultIdsQuery.data,
      });
    },
    enabled: selectedSellerIsValid && !!deliveredResultIdsQuery.data,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-gray-200/80 bg-white/90 p-4 shadow-sm sm:p-5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500 font-semibold">Tablas operativas</p>
        <h1 className="mt-2 text-xl sm:text-2xl font-extrabold text-gray-900">Estadísticas de Vendedor</h1>
        <p className="mt-2 text-sm text-gray-600">Se calculan las estadísticas para cada vendedor.</p>
      </header>

      <div className="rounded-2xl border border-gray-200/80 bg-white/90 p-4 shadow-sm sm:p-5">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[260px] flex-1">
            <DateRangePicker
              startDate={startDate}
              endDate={endDate}
              onStartDateChange={setStartDate}
              onEndDateChange={setEndDate}
              startLabel="Desde"
              endLabel="Hasta"
              showPresets
            />
          </div>
          <div className="w-full sm:w-[360px]">
            <label htmlFor="seller-select" className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              Vendedor
            </label>
            <select
              id="seller-select"
              value={selectedSeller}
              onChange={(event) => setSelectedSeller(event.target.value)}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
            >
              <option value="">
                {sellersQuery.isLoading ? 'Cargando vendedores…' : 'Seleccioná un vendedor…'}
              </option>
              {sellerOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200/80 bg-white/90 shadow-sm overflow-hidden">
        {sellersQuery.isError ? (
          <div className="p-6 text-sm text-red-600">No se pudo cargar la lista de vendedores. {(sellersQuery.error as Error)?.message ?? ''}</div>
        ) : !selectedSellerIsValid ? (
          <div className="p-6 text-sm text-gray-500">Seleccioná un vendedor para ver las estadísticas del periodo.</div>
        ) : statsQuery.isLoading || deliveredResultIdsQuery.isLoading ? (
          <div className="p-6 text-sm text-gray-500">Calculando estadísticas…</div>
        ) : statsQuery.isError ? (
          <div className="p-6 text-sm text-red-600">No se pudo cargar la estadística de vendedor. {(statsQuery.error as Error)?.message ?? ''}</div>
        ) : !statsQuery.data ? (
          <div className="p-6 text-sm text-gray-500">No hay datos para el vendedor seleccionado.</div>
        ) : (
          <div className="space-y-6 p-4 sm:p-5">
            <div className="rounded-xl border border-red-100 bg-red-50/50 px-3 py-2 text-sm text-red-800"><strong>{statsQuery.data.seller}</strong></div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard title="Leads totales" value={String(statsQuery.data.totalLeads)} />
              <MetricCard title="Leads ganados" value={String(statsQuery.data.leadsGanados)} />
              <MetricCard title="Envíos totales" value={String(statsQuery.data.enviosTotales)} />
              <MetricCard title="Efectividad" value={`${formatDecimal(statsQuery.data.efectividad, 2)}%`} />
              <MetricCard title="Ingreso total" value={`S/ ${formatDecimal(statsQuery.data.ingresoTotal, 2)}`} />
              <MetricCard title="Costo moto total" value={`S/ ${formatDecimal(statsQuery.data.costoMotoTotal, 2)}`} />
              <MetricCard title="Margen vs moto" value={`S/ ${formatDecimal(statsQuery.data.margenVsMoto, 2)}`} />
              <MetricCard title="Ingreso por lead ganado" value={`S/ ${formatDecimal(statsQuery.data.ingresoPorLeadGanado, 2)}`} />
              <MetricCard title="Ticket promedio" value={`S/ ${formatDecimal(statsQuery.data.ticketPromedio, 2)}`} />
            </div>

            <div className="rounded-xl border border-gray-200 overflow-hidden">
              <div className="border-b border-gray-200 bg-gray-50 px-4 py-3">
                <h3 className="text-sm font-semibold text-gray-800">Top 3 tiendas con más envíos entregados</h3>
                <p className="text-xs text-gray-500 mt-1">Filtrado por periodo (fecha del lead ganado + fecha del envío) y vendedor seleccionado.</p>
              </div>
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-white">
                  <tr>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Ranking</th>
                    <th className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Tienda</th>
                    <th className="px-4 py-3 text-right text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500">Envíos entregados</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 bg-white">
                  {statsQuery.data.topTiendas.length === 0 ? (
                    <tr>
                      <td className="px-4 py-4 text-sm text-gray-500" colSpan={3}>Sin envíos entregados para este filtro.</td>
                    </tr>
                  ) : (
                    statsQuery.data.topTiendas.map((row, index) => (
                      <tr key={`${row.tienda}-${index}`} className="hover:bg-red-50/40">
                        <td className="px-4 py-3 text-sm font-semibold text-gray-700">#{index + 1}</td>
                        <td className="px-4 py-3 text-sm text-gray-800">{row.tienda}</td>
                        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-800">{row.enviosEntregados}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function MetricCard({ title, value }: { title: string; value: string }) {
  return (
    <article className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <p className="text-[11px] uppercase tracking-[0.12em] text-gray-500 font-semibold">{title}</p>
      <p className="mt-2 text-xl font-extrabold text-gray-900">{value}</p>
    </article>
  );
}
