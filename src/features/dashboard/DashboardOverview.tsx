import { useMemo, useState } from 'react';
import { Activity, AlertCircle, ChartColumnBig } from 'lucide-react';
import { useSheetData } from '../../hooks/useSheetData';
import { formatCurrencyPen, formatNumberEs, normalizeText, parseDateValue, parseNumericValue } from '../../lib/tableHelpers';

type Row = Record<string, unknown>;

// Función para encontrar la primera columna que coincida con alguna de las opciones dadas, ignorando mayúsculas, espacios y caracteres especiales.
function getColumnByCandidates(columns: string[], candidates: string[]) {
  return (
    columns.find((column) => {
      const normalizedColumn = normalizeText(column);
      return candidates.some((candidate) => normalizeText(candidate) === normalizedColumn);
    }) ?? null
  );
}

// Función para obtener un valor de una fila y columna dada, devolviendo una cadena vacía si la columna no existe o el valor es nulo/indefinido.
function getStringValue(row: Row, column: string | null) {
  if (!column) return '';
  return String(row[column] ?? '').trim();
}

// Función para obtener un valor numérico de una fila y columna dada, devolviendo 0 si la columna no existe o el valor no es un número válido.
function getNumericValue(row: Row, column: string | null) {
  if (!column) return 0;
  return parseNumericValue(row[column]) ?? 0;
}

// Función para filtrar filas por un rango de fechas en una columna específica. Si no se proporciona una columna de fecha o ambos límites del rango están vacíos, devuelve las filas sin filtrar.
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

// Función para realizar una división segura, devolviendo 0 si el denominador es 0 o no es un número válido.
function safeDivide(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return numerator / denominator;
}

// Función para encontrar el valor más frecuente en un array de strings, ignorando mayúsculas, espacios y caracteres especiales. Devuelve una cadena vacía si no hay valores válidos.
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

// Función para encontrar el ID de negocio de tipo de recojo basado en etiquetas candidatas, buscando en las filas de la hoja de "TIPO DE RECOJO". Devuelve null si no encuentra una coincidencia o si no puede determinar las columnas relevantes.
function findTipoRecojoBusinessId(rows: Row[], labelCandidates: string[]) {
  if (!rows.length) return null;
  const columns = Object.keys(rows[0]);
  const idColumn = getColumnByCandidates(columns, ['idTipoRecojo', 'business_id', 'id']);
  const textColumn = getColumnByCandidates(columns, ['tipo de recojo', 'Tipo de Recojo', 'tipo_recojo', 'nombre']);
  if (!idColumn || !textColumn) return null;

  for (const row of rows) {
    const text = normalizeText(String(row[textColumn] ?? ''));
    if (labelCandidates.some((candidate) => text.includes(normalizeText(candidate)))) {
      return parseNumericValue(row[idColumn]);
    }
  }

  return null;
}

// Componente principal del dashboard que muestra un resumen general de KPIs y métricas operativas, con la capacidad de filtrar por rango de fechas. Utiliza datos de varias hojas (envíos, recojos, leads, tipo de recojo) para calcular las métricas y mostrarlas en tarjetas.
export function DashboardOverview() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const enviosQuery = useSheetData('ENVIOS');
  const recojosQuery = useSheetData('RECOJOS');
  const leadsQuery = useSheetData('LEADS GANADOS');
  const tipoRecojoQuery = useSheetData('TIPO DE RECOJO');

  const isLoading =
    enviosQuery.isLoading ||
    recojosQuery.isLoading ||
    leadsQuery.isLoading ||
    tipoRecojoQuery.isLoading;

  const error =
    enviosQuery.error ||
    recojosQuery.error ||
    leadsQuery.error ||
    tipoRecojoQuery.error;

  const metrics = useMemo(() => {
    const enviosColumns = enviosQuery.data?.columns ?? [];
    const enviosRows = (enviosQuery.data?.rows ?? []) as Row[];
    const recojosColumns = recojosQuery.data?.columns ?? [];
    const recojosRows = (recojosQuery.data?.rows ?? []) as Row[];
    const leadsColumns = leadsQuery.data?.columns ?? [];
    const leadsRows = (leadsQuery.data?.rows ?? []) as Row[];
    const tipoRecojoRows = (tipoRecojoQuery.data?.rows ?? []) as Row[];

    const enviosDateColumn = getColumnByCandidates(enviosColumns, ['Mes', 'mes', 'Fecha', 'Fecha de envio', 'Fecha envío']);
    const recojosDateColumn = getColumnByCandidates(recojosColumns, ['Mes', 'mes', 'Fecha', 'Fecha de recojo']);
    const leadsDateColumn = getColumnByCandidates(leadsColumns, ['Fecha Lead Ganado', 'fecha_lead_ganado', 'Fecha registro lead']);

    const enviosInRange = filterRowsByRange(enviosRows, enviosDateColumn, dateFrom, dateTo);
    const recojosInRange = filterRowsByRange(recojosRows, recojosDateColumn, dateFrom, dateTo);
    const leadsInRange = filterRowsByRange(leadsRows, leadsDateColumn, dateFrom, dateTo);

    const tiendaLeadCol = getColumnByCandidates(leadsColumns, ['Tienda', 'tienda']);
    const ingresosAnuladosCol = getColumnByCandidates(leadsColumns, [
      'Ingreso anulados fullfilment',
      'Ingresos anulados fullfilment',
      'ingreso anulados fullfilment',
      'ingreso anulados full filment',
    ]);
    const distritoLeadCol = getColumnByCandidates(leadsColumns, ['Distrito', 'distrito']);

    const tiendasRegistradas = new Set(
      leadsInRange.map((row) => normalizeText(getStringValue(row, tiendaLeadCol))).filter(Boolean),
    ).size;

    const leadsGanados = leadsInRange.length;

    const enviosTotales = enviosInRange.length;
    const promedioTE = safeDivide(enviosTotales, tiendasRegistradas);

    const ingresosAnuladosFullfilment = leadsInRange.reduce(
      (acc, row) => acc + getNumericValue(row, ingresosAnuladosCol),
      0,
    );

    const ingresoTotalEnviosCol = getColumnByCandidates(enviosColumns, ['Ingreso total fila', 'Ingreso total', 'ingreso total']);
    const costoTotalEnviosCol = getColumnByCandidates(enviosColumns, ['Costo total fila', 'Costo total', 'costo total']);

    const ingresoRecojoTotalCol = getColumnByCandidates(recojosColumns, ['Ingreso recojo total', 'ingreso recojo total']);
    const costoRecojoTotalCol = getColumnByCandidates(recojosColumns, ['Costo recojo total', 'costo recojo total']);

    const ingresoTotalEnvios = enviosInRange.reduce((acc, row) => acc + getNumericValue(row, ingresoTotalEnviosCol), 0);
    const ingresoTotalRecojos = recojosInRange.reduce((acc, row) => acc + getNumericValue(row, ingresoRecojoTotalCol), 0);
    const ingresoTotalOperativo = ingresoTotalEnvios + ingresoTotalRecojos + ingresosAnuladosFullfilment;

    const costoTotalEnvios = enviosInRange.reduce((acc, row) => acc + getNumericValue(row, costoTotalEnviosCol), 0);
    const costoTotalRecojos = recojosInRange.reduce((acc, row) => acc + getNumericValue(row, costoRecojoTotalCol), 0);
    const costoTotalOperativo = costoTotalEnvios + costoTotalRecojos;

    const margenTotalOperativo = ingresoTotalOperativo - costoTotalOperativo;
    const ticketPromedioMes = safeDivide(ingresoTotalOperativo, enviosTotales);
    const costoOperativoPorLeadGanado = safeDivide(costoTotalOperativo, leadsGanados);
    const ingresoPorLeadGanado = safeDivide(ingresoTotalOperativo, leadsGanados);

    const recojoCobradoId = findTipoRecojoBusinessId(tipoRecojoRows, ['cobrado', 'recojo cobrado']) ?? 1;
    const recojoGratisId = findTipoRecojoBusinessId(tipoRecojoRows, ['gratis', 'recojo gratis']) ?? 2;

    const idTipoRecojoColumn = getColumnByCandidates(recojosColumns, ['idTipoRecojo', 'id tipo recojo']);
    const tipoRecojoColumn = getColumnByCandidates(recojosColumns, ['Tipo de Recojo', 'tipo de recojo']);
    const vecesRecojoColumn = getColumnByCandidates(recojosColumns, ['Veces', 'veces']);

    const recojoRowsByType = recojosInRange.map((row) => {
      const veces = Math.max(0, getNumericValue(row, vecesRecojoColumn));
      const tipoById = getNumericValue(row, idTipoRecojoColumn);
      const tipoByLabel = normalizeText(getStringValue(row, tipoRecojoColumn));

      const isGratisById = tipoById > 0 && tipoById === recojoGratisId;
      const isCobradoById = tipoById > 0 && tipoById === recojoCobradoId;
      const isGratisByLabel = tipoByLabel.includes('gratis');
      const isCobradoByLabel = tipoByLabel.includes('cobra') || tipoByLabel.includes('pedido');

      return {
        veces,
        isGratis: isGratisById || (!isCobradoById && isGratisByLabel),
        isCobrado: isCobradoById || (!isGratisById && isCobradoByLabel),
      };
    });

    const recojosCobrados = recojoRowsByType.reduce((acc, row) => (row.isCobrado ? acc + row.veces : acc), 0);
    const recojosGratis = recojoRowsByType.reduce((acc, row) => (row.isGratis ? acc + row.veces : acc), 0);

    const pagoTotalMotorizadoRecojo = recojosInRange.reduce(
      (acc, row) => acc + getNumericValue(row, costoRecojoTotalCol),
      0,
    );

    const distritoLeadGanadoFrecuente = getMostFrequent(leadsInRange.map((row) => getStringValue(row, distritoLeadCol)).filter(Boolean));

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

// Sección genérica con título y contenido, utilizada para organizar el dashboard en bloques temáticos.
function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <h2 className="text-sm font-extrabold tracking-wide text-gray-700 uppercase">{title}</h2>
      {children}
    </div>
  );
}

// Componente para mostrar una cuadrícula de tarjetas de KPI, adaptándose a diferentes tamaños de pantalla.
function KpiGrid({ children }: { children: React.ReactNode }) {
  return <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">{children}</div>;
}

// Componente para mostrar una tarjeta de KPI con título y valor, formateando el valor según corresponda (número o moneda) y aplicando estilos visuales.
function KpiCard({ title, value }: { title: string; value: string }) {
  return (
    <div className="bg-white p-4 rounded-2xl shadow-[0_20px_42px_-34px_rgba(15,23,42,0.9)] border border-gray-200">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{title}</p>
      <p className="text-2xl font-bold text-gray-900 mt-1">{value}</p>
    </div>
  );
}
