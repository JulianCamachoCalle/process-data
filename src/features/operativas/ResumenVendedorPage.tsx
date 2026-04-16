import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DateRangePicker } from '../../components/DateRangePicker';

type SellerOption = {
  value: string;
  label: string;
};

type SellerLeadSummaryRow = {
  lead_id: number;
  vendedor_nombre: string;
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

function formatDateRange(values: Array<string | null>) {
  const valid = values.filter((value): value is string => Boolean(value)).sort((a, b) => a.localeCompare(b));
  if (valid.length === 0) return '—';
  if (valid.length === 1) return formatDate(valid[0]);
  return `${formatDate(valid[0])} → ${formatDate(valid[valid.length - 1])}`;
}

function getMostFrequentLabel(values: string[]) {
  const counter = new Map<string, { label: string; count: number }>();

  for (const value of values) {
    const label = String(value ?? '').trim();
    if (!label) continue;
    const key = normalizeText(label);
    if (!key) continue;
    const current = counter.get(key);
    if (current) {
      current.count += 1;
    } else {
      counter.set(key, { label, count: 1 });
    }
  }

  let winner: { label: string; count: number } | null = null;
  for (const entry of counter.values()) {
    if (!winner || entry.count > winner.count) {
      winner = entry;
    }
  }

  return winner?.label ?? '—';
}

async function fetchSellerOptions() {
  const response = await fetch('/api/kommo/leads-insights?mode=store_lead_summary_options', {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success || !Array.isArray(payload?.options)) {
    throw new Error(payload?.error || 'No se pudo cargar la lista de tiendas.');
  }

  return payload.options as SellerOption[];
}

async function fetchSellerLeadSummary(input: { storeName: string; startDate: string; endDate: string }) {
  const params = new URLSearchParams();
  params.set('mode', 'store_lead_summary');
  params.set('store_name', input.storeName);
  if (input.startDate) params.set('start_date', input.startDate);
  if (input.endDate) params.set('end_date', input.endDate);

  const response = await fetch(`/api/kommo/leads-insights?${params.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok || !payload?.success || !Array.isArray(payload?.rows)) {
    throw new Error(payload?.error || 'No se pudo cargar el resumen de tienda.');
  }

  return payload.rows as SellerLeadSummaryRow[];
}

export function ResumenTiendaPage() {
  const [storeInput, setStoreInput] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  const sellersQuery = useQuery({
    queryKey: ['operativas', 'resumen-tienda', 'stores'],
    queryFn: fetchSellerOptions,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const sellerOptions = useMemo(() => sellersQuery.data ?? [], [sellersQuery.data]);
  const selectedOption = useMemo(() => {
    const target = normalizeText(storeInput);
    if (!target) return null;
    return sellerOptions.find((option) => normalizeText(option.label) === target) ?? null;
  }, [storeInput, sellerOptions]);

  const summaryQuery = useQuery({
    queryKey: ['operativas', 'resumen-tienda', 'rows', selectedOption?.label ?? 'none', startDate || 'none', endDate || 'none'],
    queryFn: () => {
      if (!selectedOption) throw new Error('Seleccioná una tienda válida.');
      return fetchSellerLeadSummary({
        storeName: selectedOption.label,
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
    const fechaIngresoValues = rows.map((row) => row.fecha_ingreso_lead);
    const fechaGanadoValues = rows.map((row) => row.fecha_lead_ganado);
    const vendedorValues = rows.map((row) => row.vendedor_nombre);
    const diasTotal = rows.reduce((acc, row) => acc + row.dias_lead_a_ganado, 0);

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
        fechaIngresoLead: formatDateRange(fechaIngresoValues),
        fechaLeadGanado: formatDateRange(fechaGanadoValues),
        vendedor: getMostFrequentLabel(vendedorValues),
        diasLeadAGanado: rows.length > 0 ? diasTotal / rows.length : 0,
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
        <h1 className="mt-2 text-xl sm:text-2xl font-extrabold text-gray-900">Resumen Tienda</h1>
        <p className="mt-2 text-sm text-gray-600">Detalle por lead ganado para la tienda seleccionada con filtro de fecha aplicado a leads ganados, envíos y recojos.</p>
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
            <label htmlFor="store-summary-input" className="mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-gray-500">
              Tienda
            </label>
            <input
              id="store-summary-input"
              list="store-summary-options"
              value={storeInput}
              onChange={(event) => setStoreInput(event.target.value)}
              placeholder={sellersQuery.isLoading ? 'Cargando tiendas…' : 'Escribí o seleccioná una tienda'}
              className="w-full rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm text-gray-800 shadow-sm focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-100"
            />
            <datalist id="store-summary-options">
              {sellerOptions.map((option) => (
                <option key={option.value} value={option.label} />
              ))}
            </datalist>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200/80 bg-white/90 shadow-sm overflow-hidden">
        {sellersQuery.isError ? (
          <div className="p-6 text-sm text-red-600">No se pudo cargar la lista de tiendas. {(sellersQuery.error as Error)?.message ?? ''}</div>
        ) : !selectedOption ? (
          <div className="p-6 text-sm text-gray-500">Escribí o seleccioná una tienda válida para ver el resumen.</div>
        ) : summaryQuery.isLoading ? (
          <div className="p-6 text-sm text-gray-500">Calculando resumen de tienda…</div>
        ) : summaryQuery.isError ? (
          <div className="p-6 text-sm text-red-600">No se pudo cargar el resumen. {(summaryQuery.error as Error)?.message ?? ''}</div>
        ) : !summaryQuery.data || summaryQuery.data.length === 0 ? (
          <div className="p-6 text-sm text-gray-500">No hay leads ganados para la tienda seleccionada.</div>
        ) : (
          <div className="space-y-4 p-4 sm:p-5">
            <div className="rounded-xl border border-red-100 bg-red-50/50 px-3 py-2 text-sm text-red-800"><strong>{selectedOption.label}</strong></div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <MetricCard title="Vendedor" value={totals.vendedor} />
              <MetricCard title="Fecha de ingreso lead" value={totals.fechaIngresoLead} />
              <MetricCard title="Fecha de lead ganado" value={totals.fechaLeadGanado} />
              <MetricCard title="Días de lead a ganado" value={formatNumber(Number(totals.diasLeadAGanado.toFixed(2)))} />
              <MetricCard title="Envíos entregados" value={formatNumber(totals.enviosEntregados)} />
              <MetricCard title="Envíos rechazados" value={formatNumber(totals.enviosRechazados)} />
              <MetricCard title="Ingreso envíos" value={formatCurrency(totals.ingresoEnvios)} />
              <MetricCard title="Costo envíos" value={formatCurrency(totals.costoEnvios)} />
              <MetricCard title="Margen envíos" value={formatCurrency(totals.ingresoEnvios - totals.costoEnvios)} />
              <MetricCard title="Recojos cobrados (veces)" value={formatNumber(totals.recojosCobrados)} />
              <MetricCard title="Recojos gratis (veces)" value={formatNumber(totals.recojosGratis)} />
              <MetricCard title="Ingreso recojos" value={formatCurrency(totals.ingresoRecojos)} />
              <MetricCard title="Costo recojos" value={formatCurrency(totals.costoRecojos)} />
              <MetricCard title="Ingreso total" value={formatCurrency(totals.ingresoTotal)} />
              <MetricCard title="Costo total" value={formatCurrency(totals.costoTotal)} />
              <MetricCard title="Margen total" value={formatCurrency(totals.margenTotal)} />
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
