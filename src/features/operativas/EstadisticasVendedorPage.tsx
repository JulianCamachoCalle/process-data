import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateRangePicker } from '../../components/DateRangePicker';

type SellerOption = {
  value: string;
  pipelineId: number;
  label: string;
};

type SellerStats = {
  seller: string;
  pipeline_id: number;
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

function formatDecimal(value: number, digits = 2) {
  return new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value);
}

async function fetchSellerOptions() {
  const response = await fetch('/api/kommo/leads-insights?mode=seller_options', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success || !Array.isArray(payload?.options)) {
    throw new Error(payload?.error || 'No se pudo cargar la lista de vendedores.');
  }

  return payload.options as SellerOption[];
}

async function fetchSellerStats(input: { sellerName: string; pipelineId: number; startDate: string; endDate: string }) {
  const params = new URLSearchParams();
  params.set('mode', 'seller_stats');
  params.set('seller_name', input.sellerName);
  params.set('pipeline_id', String(input.pipelineId));
  if (input.startDate) params.set('start_date', input.startDate);
  if (input.endDate) params.set('end_date', input.endDate);

  const response = await fetch(`/api/kommo/leads-insights?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success || !payload?.data) {
    throw new Error(payload?.error || 'No se pudo cargar la estadística de vendedor.');
  }

  return payload.data as SellerStats;
}

export function EstadisticasVendedorPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedSeller, setSelectedSeller] = useState('');

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
      if (!selectedOption) {
        throw new Error('Seleccioná un vendedor válido.');
      }

      return fetchSellerStats({
        sellerName: selectedOption.label,
        pipelineId: selectedOption.pipelineId,
        startDate,
        endDate,
      });
    },
    enabled: selectedSellerIsValid,
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
              <option value="">{sellersQuery.isLoading ? 'Cargando vendedores…' : 'Seleccioná un vendedor…'}</option>
              {sellerOptions.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
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
        ) : statsQuery.isLoading ? (
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
              <MetricCard title="Leads ganados (total)" value={String(statsQuery.data.leadsGanados)} />
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
