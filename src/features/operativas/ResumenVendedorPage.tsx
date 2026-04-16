import { useMemo, useState, type ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateRangePicker } from '../../components/DateRangePicker';

type SellerOption = {
  value: string;
  label: string;
};

type SellerLeadSummaryRow = {
  lead_id: number;
  fecha_ingreso_lead: string | null;
  fecha_lead_ganado: string | null;
  dias_lead_a_ganado: number;
  envios_entregados: number;
  envios_rechazados: number;
  ingreso_envios: number;
  costo_envios: number;
  margen_envios: number;
  recojos_cobrados_veces: number;
  recojos_gratis_veces: number;
  ingreso_recojos: number;
  costo_recojos: number;
  ingreso_total: number;
  costo_total: number;
  margen_total: number;
};

function normalizeText(value: string) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

function formatDate(value: string | null) {
  if (!value) return '—';
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) return value;

  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(date);
}

function formatCurrency(value: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat('es-PE').format(value);
}

async function fetchSellerOptions() {
  const response = await fetch('/api/kommo/leads-insights?mode=seller_lead_summary_options', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success || !Array.isArray(payload?.options)) {
    throw new Error(payload?.error || 'No se pudo cargar la lista de vendedores.');
  }

  return payload.options as SellerOption[];
}

async function fetchSellerLeadSummary(input: { sellerName: string; startDate: string; endDate: string }) {
  const params = new URLSearchParams();
  params.set('mode', 'seller_lead_summary');
  params.set('seller_name', input.sellerName);
  if (input.startDate) params.set('start_date', input.startDate);
  if (input.endDate) params.set('end_date', input.endDate);

  const response = await fetch(`/api/kommo/leads-insights?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success || !Array.isArray(payload?.rows)) {
    throw new Error(payload?.error || 'No se pudo cargar el resumen de vendedor.');
  }

  return payload.rows as SellerLeadSummaryRow[];
}

export function ResumenVendedorPage() {
  const [sellerInput, setSellerInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const sellersQuery = useQuery({
    queryKey: ['operativas', 'resumen-vendedor', 'sellers'],
    queryFn: fetchSellerOptions,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const sellerOptions = useMemo(() => sellersQuery.data ?? [], [sellersQuery.data]);
  const selectedOption = useMemo(() => {
    const target = normalizeText(sellerInput);
    if (!target) return null;
    return sellerOptions.find((option) => normalizeText(option.label) === target) ?? null;
  }, [sellerInput, sellerOptions]);

  const summaryQuery = useQuery({
    queryKey: ['operativas', 'resumen-vendedor', 'rows', selectedOption?.label ?? 'none', startDate || 'none', endDate || 'none'],
    queryFn: () => {
      if (!selectedOption) throw new Error('Seleccioná un vendedor válido.');
      return fetchSellerLeadSummary({
        sellerName: selectedOption.label,
        startDate,
        endDate,
      });
    },
    enabled: Boolean(selectedOption),
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });

  const totals = useMemo(() => {
    const rows = summaryQuery.data ?? [];
    return rows.reduce(
      (acc, row) => {
        acc.enviosEntregados += row.envios_entregados;
        acc.enviosRechazados += row.envios_rechazados;
        acc.ingresoEnvios += row.ingreso_envios;
        acc.costoEnvios += row.costo_envios;
        acc.recojosCobrados += row.recojos_cobrados_veces;
        acc.recojosGratis += row.recojos_gratis_veces;
        acc.ingresoRecojos += row.ingreso_recojos;
        acc.costoRecojos += row.costo_recojos;
        acc.ingresoTotal += row.ingreso_total;
        acc.costoTotal += row.costo_total;
        acc.margenTotal += row.margen_total;
        return acc;
      },
      {
        enviosEntregados: 0,
        enviosRechazados: 0,
        ingresoEnvios: 0,
        costoEnvios: 0,
        recojosCobrados: 0,
        recojosGratis: 0,
        ingresoRecojos: 0,
        costoRecojos: 0,
        ingresoTotal: 0,
        costoTotal: 0,
        margenTotal: 0,
      },
    );
  }, [summaryQuery.data]);

  return (
    <section className="space-y-6">
      <header className="rounded-2xl border border-gray-200/80 bg-white/90 p-4 shadow-sm sm:p-5">
        <p className="text-[11px] uppercase tracking-[0.16em] text-gray-500 font-semibold">Tablas operativas</p>
        <h1 className="mt-2 text-xl sm:text-2xl font-extrabold text-gray-900">Resumen Vendedor</h1>
        <p className="mt-2 text-sm text-gray-600">Detalle por lead ganado para el vendedor seleccionado con filtro de fecha aplicado a leads ganados, envíos y recojos.</p>
      </header>

      <div className="rounded-2xl border border-gray-200/80 bg-white/90 p-4 shadow-sm sm:p-5">
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-3 lg:items-end">
          <DateRangePicker
            startDate={startDate}
            endDate={endDate}
            onStartDateChange={setStartDate}
            onEndDateChange={setEndDate}
            startLabel="Desde"
            endLabel="Hasta"
            className="lg:col-span-2"
          />

          <div>
            <label htmlFor="seller-summary-input" className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              Vendedor
            </label>
            <input
              id="seller-summary-input"
              list="seller-summary-options"
              value={sellerInput}
              onChange={(event) => setSellerInput(event.target.value)}
              placeholder={sellersQuery.isLoading ? 'Cargando vendedores…' : 'Escribí o seleccioná un vendedor'}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
            />
            <datalist id="seller-summary-options">
              {sellerOptions.map((option) => (
                <option key={option.value} value={option.label} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200/80 bg-white/90 shadow-sm overflow-hidden">
        {sellersQuery.isError ? (
          <div className="p-6 text-sm text-red-600">No se pudo cargar la lista de vendedores. {(sellersQuery.error as Error)?.message ?? ''}</div>
        ) : !selectedOption ? (
          <div className="p-6 text-sm text-gray-500">Escribí o seleccioná un vendedor válido para ver el resumen.</div>
        ) : summaryQuery.isLoading ? (
          <div className="p-6 text-sm text-gray-500">Calculando resumen de vendedor…</div>
        ) : summaryQuery.isError ? (
          <div className="p-6 text-sm text-red-600">No se pudo cargar el resumen. {(summaryQuery.error as Error)?.message ?? ''}</div>
        ) : !summaryQuery.data || summaryQuery.data.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No hay leads ganados para el vendedor seleccionado.</div>
        ) : (
          <div className="space-y-4 p-4 sm:p-5">
            <div className="rounded-xl border border-red-100 bg-red-50/50 px-3 py-2 text-sm text-red-800"><strong>{selectedOption.label}</strong></div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              <MetricCard title="Envíos entregados" value={formatNumber(totals.enviosEntregados)} />
              <MetricCard title="Envíos rechazados" value={formatNumber(totals.enviosRechazados)} />
              <MetricCard title="Recojos cobrados (veces)" value={formatNumber(totals.recojosCobrados)} />
              <MetricCard title="Recojos gratis (veces)" value={formatNumber(totals.recojosGratis)} />
              <MetricCard title="Ingreso total" value={formatCurrency(totals.ingresoTotal)} />
              <MetricCard title="Costo total" value={formatCurrency(totals.costoTotal)} />
              <MetricCard title="Margen total" value={formatCurrency(totals.margenTotal)} />
            </div>

            <div className="overflow-x-auto rounded-xl border border-gray-200">
              <table className="min-w-[1700px] divide-y divide-gray-200 bg-white">
                <thead className="bg-gray-50">
                  <tr>
                    <HeaderCell>Lead</HeaderCell>
                    <HeaderCell>Fecha ingreso lead</HeaderCell>
                    <HeaderCell>Fecha lead ganado</HeaderCell>
                    <HeaderCell align="right">Días lead a ganado</HeaderCell>
                    <HeaderCell align="right">Envíos entregados</HeaderCell>
                    <HeaderCell align="right">Envíos rechazados</HeaderCell>
                    <HeaderCell align="right">Ingreso envíos</HeaderCell>
                    <HeaderCell align="right">Costo envíos</HeaderCell>
                    <HeaderCell align="right">Margen envíos</HeaderCell>
                    <HeaderCell align="right">Recojos cobrados (veces)</HeaderCell>
                    <HeaderCell align="right">Recojos gratis (veces)</HeaderCell>
                    <HeaderCell align="right">Ingreso recojos</HeaderCell>
                    <HeaderCell align="right">Costo recojos</HeaderCell>
                    <HeaderCell align="right">Ingreso total</HeaderCell>
                    <HeaderCell align="right">Costo total</HeaderCell>
                    <HeaderCell align="right">Margen total</HeaderCell>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {summaryQuery.data.map((row) => (
                    <tr key={row.lead_id} className="hover:bg-red-50/40">
                      <BodyCell className="font-semibold text-gray-800">{row.lead_id}</BodyCell>
                      <BodyCell>{formatDate(row.fecha_ingreso_lead)}</BodyCell>
                      <BodyCell>{formatDate(row.fecha_lead_ganado)}</BodyCell>
                      <BodyCell align="right">{formatNumber(row.dias_lead_a_ganado)}</BodyCell>
                      <BodyCell align="right">{formatNumber(row.envios_entregados)}</BodyCell>
                      <BodyCell align="right">{formatNumber(row.envios_rechazados)}</BodyCell>
                      <BodyCell align="right">{formatCurrency(row.ingreso_envios)}</BodyCell>
                      <BodyCell align="right">{formatCurrency(row.costo_envios)}</BodyCell>
                      <BodyCell align="right">{formatCurrency(row.margen_envios)}</BodyCell>
                      <BodyCell align="right">{formatNumber(row.recojos_cobrados_veces)}</BodyCell>
                      <BodyCell align="right">{formatNumber(row.recojos_gratis_veces)}</BodyCell>
                      <BodyCell align="right">{formatCurrency(row.ingreso_recojos)}</BodyCell>
                      <BodyCell align="right">{formatCurrency(row.costo_recojos)}</BodyCell>
                      <BodyCell align="right">{formatCurrency(row.ingreso_total)}</BodyCell>
                      <BodyCell align="right">{formatCurrency(row.costo_total)}</BodyCell>
                      <BodyCell align="right" className="font-semibold text-gray-900">{formatCurrency(row.margen_total)}</BodyCell>
                    </tr>
                  ))}
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

function HeaderCell({ children, align = 'left' }: { children: ReactNode; align?: 'left' | 'right' }) {
  return (
    <th className={`px-3 py-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gray-500 ${align === 'right' ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  );
}

function BodyCell({ children, align = 'left', className = '' }: { children: ReactNode; align?: 'left' | 'right'; className?: string }) {
  return (
    <td className={`px-3 py-2.5 text-sm text-gray-700 ${align === 'right' ? 'text-right' : 'text-left'} ${className}`}>
      {children}
    </td>
  );
}
