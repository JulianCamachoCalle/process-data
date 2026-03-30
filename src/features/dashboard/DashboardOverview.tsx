import { useMemo, useState } from 'react';
import { Activity, AlertCircle, ChartColumnBig } from 'lucide-react';
import { useSheetData } from '../../hooks/useSheetData';
import { formatCurrencyPen, formatNumberEs, normalizeText, parseDateValue, parseNumericValue } from '../../lib/tableHelpers';

type Row = Record<string, unknown>;

function getColumnByCandidates(columns: string[], candidates: string[]) {
  return (
    columns.find((column) => {
      const normalizedColumn = normalizeText(column);
      return candidates.some((candidate) => normalizeText(candidate) === normalizedColumn);
    }) ?? null
  );
}

function getDateColumn(columns: string[]) {
  return getColumnByCandidates(columns, [
    'Fecha',
    'Fecha de envio',
    'Fecha envío',
    'Fecha de recojo',
    'Fecha registro',
    'Fecha de registro',
  ]);
}

function getStringValue(row: Row, column: string | null) {
  if (!column) return '';
  return String(row[column] ?? '').trim();
}

function getNumericValue(row: Row, column: string | null) {
  if (!column) return 0;
  return parseNumericValue(row[column]) ?? 0;
}

function filterRowsByRange(rows: Row[], dateColumn: string | null, from: string, to: string) {
  if (!dateColumn || (!from && !to)) return rows;

  const fromDate = from ? parseDateValue(from) : null;
  const toDateRaw = to ? parseDateValue(to) : null;
  const toDate = toDateRaw ? new Date(toDateRaw) : null;

  if (toDate) {
    toDate.setHours(23, 59, 59, 999);
  }

  return rows.filter((row) => {
    const value = row[dateColumn];
    const parsed = parseDateValue(value);
    if (!parsed) return false;

    if (fromDate && parsed < fromDate) return false;
    if (toDate && parsed > toDate) return false;

    return true;
  });
}

function isDateWithinRange(value: unknown, from: string, to: string) {
  const parsed = parseDateValue(value);
  if (!parsed) return false;

  const fromDate = from ? parseDateValue(from) : null;
  const toDateRaw = to ? parseDateValue(to) : null;
  const toDate = toDateRaw ? new Date(toDateRaw) : null;

  if (toDate) {
    toDate.setHours(23, 59, 59, 999);
  }

  if (fromDate && parsed < fromDate) return false;
  if (toDate && parsed > toDate) return false;

  return true;
}

function safeDivide(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return numerator / denominator;
}

function getMostFrequent(values: string[]) {
  const count = new Map<string, number>();

  for (const value of values) {
    const key = value.trim();
    if (!key) continue;
    count.set(key, (count.get(key) ?? 0) + 1);
  }

  let winner = '';
  let winnerCount = 0;
  for (const [value, currentCount] of count) {
    if (currentCount > winnerCount) {
      winner = value;
      winnerCount = currentCount;
    }
  }

  return winner;
}

function findTipoRecojoBusinessId(rows: Row[], labelCandidates: string[]) {
  if (!rows.length) return null;
  const columns = Object.keys(rows[0]);
  const idColumn = getColumnByCandidates(columns, ['idTipoRecojo', 'business_id', 'id']);
  const textColumn = getColumnByCandidates(columns, ['tipo de recojo', 'Tipo de Recojo', 'tipo_recojo', 'nombre']);
  if (!idColumn || !textColumn) return null;

  for (const row of rows) {
    const text = normalizeText(String(row[textColumn] ?? ''));
    if (labelCandidates.some((candidate) => text === normalizeText(candidate))) {
      return parseNumericValue(row[idColumn]);
    }
  }

  return null;
}

export function DashboardOverview() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const enviosQuery = useSheetData('ENVIOS');
  const recojosQuery = useSheetData('RECOJOS');
  const leadsQuery = useSheetData('LEADS GANADOS');
  const tiendasQuery = useSheetData('TIENDAS');
  const fullfilmentQuery = useSheetData('FULLFILMENT');
  const tipoRecojoQuery = useSheetData('TIPO DE RECOJO');

  const isLoading =
    enviosQuery.isLoading ||
    recojosQuery.isLoading ||
    leadsQuery.isLoading ||
    tiendasQuery.isLoading ||
    fullfilmentQuery.isLoading ||
    tipoRecojoQuery.isLoading;

  const error =
    enviosQuery.error ||
    recojosQuery.error ||
    leadsQuery.error ||
    tiendasQuery.error ||
    fullfilmentQuery.error ||
    tipoRecojoQuery.error;

  const metrics = useMemo(() => {
    const enviosColumns = enviosQuery.data?.columns ?? [];
    const enviosRows = (enviosQuery.data?.rows ?? []) as Row[];
    const recojosColumns = recojosQuery.data?.columns ?? [];
    const recojosRows = (recojosQuery.data?.rows ?? []) as Row[];
    const leadsColumns = leadsQuery.data?.columns ?? [];
    const leadsRows = (leadsQuery.data?.rows ?? []) as Row[];
    const tiendasColumns = tiendasQuery.data?.columns ?? [];
    const tiendasRows = (tiendasQuery.data?.rows ?? []) as Row[];
    const fullfilmentColumns = fullfilmentQuery.data?.columns ?? [];
    const fullfilmentRows = (fullfilmentQuery.data?.rows ?? []) as Row[];
    const tipoRecojoRows = (tipoRecojoQuery.data?.rows ?? []) as Row[];

    const enviosDateColumn = getDateColumn(enviosColumns);
    const recojosDateColumn = getDateColumn(recojosColumns);
    const leadsDateColumn = getDateColumn(leadsColumns);
    const tiendasDateColumn = getDateColumn(tiendasColumns);
    const fullfilmentDateColumn = getDateColumn(fullfilmentColumns);

    const enviosInRange = filterRowsByRange(enviosRows, enviosDateColumn, dateFrom, dateTo);
    const recojosInRange = filterRowsByRange(recojosRows, recojosDateColumn, dateFrom, dateTo);
    const leadsInRange = filterRowsByRange(leadsRows, leadsDateColumn, dateFrom, dateTo);
    const tiendasInRange = filterRowsByRange(tiendasRows, tiendasDateColumn, dateFrom, dateTo);
    const fullfilmentInRange = filterRowsByRange(fullfilmentRows, fullfilmentDateColumn, dateFrom, dateTo);

    const leadFechaGanadoCol = getColumnByCandidates(leadsColumns, ['Fecha Lead Ganado', 'fecha_lead_ganado']);
    const cantidadEnviosCol = getColumnByCandidates(leadsColumns, ['Cantidad de envios', 'cantidad de envíos']);

    const tiendasRegistradas = leadsRows.filter((row) => isDateWithinRange(row[leadFechaGanadoCol ?? ''], dateFrom, dateTo)).length;

    const leadsGanados = leadsInRange.filter((row) => getNumericValue(row, cantidadEnviosCol) > 0).length;

    const enviosTotales = enviosInRange.length;
    const promedioTE = safeDivide(enviosTotales, tiendasRegistradas);

    const anuladosFullfilmentCol = getColumnByCandidates(fullfilmentColumns, [
      'anulados full filment',
      'ingresos anulados fullfilment',
      'ingresos anulados full filment',
      'anulados fullfilment',
    ]);
    const ingresosAnuladosFullfilment = fullfilmentInRange.reduce(
      (acc, row) => acc + getNumericValue(row, anuladosFullfilmentCol),
      0,
    );

    const ingresoTotalEnviosCol = getColumnByCandidates(enviosColumns, ['Ingreso total fila', 'Ingreso total', 'ingreso total']);
    const costoTotalEnviosCol = getColumnByCandidates(enviosColumns, ['Costo total fila', 'Costo total', 'costo total']);

    const ingresoRecojoTotalCol = getColumnByCandidates(recojosColumns, ['Ingreso recojo total', 'ingreso recojo total']);
    const costoRecojoTotalCol = getColumnByCandidates(recojosColumns, ['Costo recojo total', 'costo recojo total']);

    const costeAplicativosCol = getColumnByCandidates(fullfilmentColumns, [
      'Coste aplicativos',
      'Costo aplicativos',
      'coste aplicativos',
      'costo aplicativos',
    ]);

    const ingresoTotalEnvios = enviosInRange.reduce((acc, row) => acc + getNumericValue(row, ingresoTotalEnviosCol), 0);
    const ingresoTotalRecojos = recojosInRange.reduce((acc, row) => acc + getNumericValue(row, ingresoRecojoTotalCol), 0);
    const ingresoTotalOperativo = ingresoTotalEnvios + ingresoTotalRecojos + ingresosAnuladosFullfilment;

    const costoTotalEnvios = enviosInRange.reduce((acc, row) => acc + getNumericValue(row, costoTotalEnviosCol), 0);
    const costoTotalRecojos = recojosInRange.reduce((acc, row) => acc + getNumericValue(row, costoRecojoTotalCol), 0);
    const costeAplicativos = fullfilmentInRange.reduce((acc, row) => acc + getNumericValue(row, costeAplicativosCol), 0);
    const costoTotalOperativo = costoTotalEnvios + costoTotalRecojos + costeAplicativos;

    const margenTotalOperativo = ingresoTotalOperativo - costoTotalOperativo;
    const ticketPromedioMes = safeDivide(ingresoTotalOperativo, enviosTotales);
    const costoOperativoPorLeadGanado = safeDivide(costoTotalOperativo, tiendasRegistradas);
    const ingresoPorLeadGanado = safeDivide(ingresoTotalOperativo, tiendasRegistradas);

    const recojoCobradoId = findTipoRecojoBusinessId(tipoRecojoRows, ['cobrado', 'recojo cobrado']) ?? 1;
    const recojoGratisId = findTipoRecojoBusinessId(tipoRecojoRows, ['gratis', 'recojo gratis']) ?? 2;

    const idTipoRecojoColumn = getColumnByCandidates(recojosColumns, ['idTipoRecojo', 'id tipo recojo']);

    const recojosCobrados = recojosInRange.filter(
      (row) => getNumericValue(row, idTipoRecojoColumn) === recojoCobradoId,
    ).length;
    const recojosGratis = recojosInRange.filter(
      (row) => getNumericValue(row, idTipoRecojoColumn) === recojoGratisId,
    ).length;

    const pagoTotalMotorizadoRecojo = recojosInRange.reduce(
      (acc, row) => acc + getNumericValue(row, costoRecojoTotalCol),
      0,
    );

    const distritoColumn = getColumnByCandidates(tiendasColumns, ['Distrito', 'distrito']);
    const distritoLeadGanadoFrecuente = getMostFrequent(
      tiendasInRange.map((row) => getStringValue(row, distritoColumn)).filter(Boolean),
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
  }, [
    enviosQuery.data,
    recojosQuery.data,
    leadsQuery.data,
    tiendasQuery.data,
    fullfilmentQuery.data,
    tipoRecojoQuery.data,
    dateFrom,
    dateTo,
  ]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mr-3"></div>
        Cargando datos del dashboard...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500 space-y-4">
        <AlertCircle size={48} />
        <p className="text-lg font-medium">Error al cargar el dashboard</p>
        <p className="text-sm text-red-400">{error instanceof Error ? error.message : 'Error desconocido'}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white/90 shadow-[0_24px_44px_-30px_rgba(15,23,42,0.65)] px-6 py-5 backdrop-blur-sm flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-extrabold text-gray-900 inline-flex items-center gap-2">
            <Activity className="text-red-600" size={24} />
            Resumen General
          </h1>
          <p className="text-sm text-gray-500 mt-1">KPI del periodo y métricas operativas.</p>
        </div>
        <div className="hidden md:inline-flex items-center gap-2 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
          <ChartColumnBig size={14} />
          Vista ejecutiva
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Filtro de periodo</p>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 items-end">
          <label className="text-sm text-gray-600">
            Fecha inicio
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="text-sm text-gray-600">
            Fecha fin
            <input
              type="date"
              value={dateTo}
              onChange={(event) => setDateTo(event.target.value)}
              className="mt-1 w-full rounded-xl border border-gray-300 px-3 py-2"
            />
          </label>
          <div className="text-sm text-gray-500">Periodo: <span className="font-semibold text-gray-800">{metrics.periodo}</span></div>
        </div>
      </div>

      <Section title="KPIS DEL PERIODO">
        <KpiGrid>
          <KpiCard title="Tiendas Registradas" value={formatNumberEs(metrics.tiendasRegistradas)} />
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
      <h2 className="text-sm font-extrabold tracking-wide text-gray-700 uppercase">{title}</h2>
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
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
