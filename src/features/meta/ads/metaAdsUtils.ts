import { formatCurrencyPen, formatNumberEs } from '../../../lib/tableHelpers';
import type { MetaAdsReportingRow, MetaSyncRunResourceSummary } from './types';

export type MetaDailyTrendPoint = {
  date_start: string;
  spend: number;
  clicks: number;
  impressions: number;
};

export type MetaLeaderboardEntry = {
  id: string;
  title: string;
  subtitle: string;
  spend: number;
  clicks: number;
  impressions: number;
  ctr: number;
  cpc: number;
};

export type MetaPerformanceEntry = MetaLeaderboardEntry & {
  reach: number;
  creativeName: string;
  labels: string[];
};

export type MetaComparisonMetric = {
  label: string;
  format: 'currency' | 'number' | 'percent';
  better: 'higher' | 'lower';
  leftValue: number;
  rightValue: number;
  winner: 'left' | 'right' | 'tie';
};

export type MetaComparisonNarrative = {
  efficiencyWinner: 'left' | 'right' | 'tie';
  volumeWinner: 'left' | 'right' | 'tie';
  summary: string;
  tradeoff: string;
  recommendation: string;
  recommendationTone: 'positive' | 'warning' | 'neutral';
};

export type MetaDecisionSignal = {
  title: string;
  helper: string;
  entry: MetaPerformanceEntry | null;
  tone: 'positive' | 'warning' | 'neutral';
  metricLabel: string;
  metricValue: number;
  metricFormat: 'currency' | 'number' | 'percent';
};

export type MetaBreakdownPoint = {
  name: string;
  value: number;
};

export function safeDivide(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return numerator / denominator;
}

export function sumBy<T>(rows: T[], selector: (row: T) => number | null) {
  return rows.reduce((acc, row) => acc + (selector(row) ?? 0), 0);
}

export function formatPercent(value: number) {
  return `${new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)}%`;
}

export function formatStatus(value: string | null) {
  if (!value) return 'N/D';
  return value.replaceAll('_', ' ');
}

export function formatDateRangeLabel(dateFrom: string, dateTo: string) {
  if (!dateFrom && !dateTo) return 'Todo el histórico disponible';
  return `${dateFrom || '...'} → ${dateTo || '...'}`;
}

export function formatDateTime(value: string | null) {
  if (!value) return 'N/D';

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;

  return new Intl.DateTimeFormat('es-PE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

export function formatDurationMs(value: number | null) {
  if (value === null || value < 0) return 'N/D';
  if (value < 1000) return `${value} ms`;

  return `${new Intl.NumberFormat('es-PE', {
    minimumFractionDigits: value < 10_000 ? 2 : 1,
    maximumFractionDigits: value < 10_000 ? 2 : 1,
  }).format(value / 1000)} s`;
}

export function formatSyncResourceSummary(summary: MetaSyncRunResourceSummary | undefined) {
  if (!summary) return 'Sin data';

  return `${formatNumberEs(summary.upserted ?? 0)} upsertados · ${formatNumberEs(summary.pulled ?? 0)} traídos`;
}

export function aggregateTrendRows(rows: MetaAdsReportingRow[]): MetaDailyTrendPoint[] {
  const map = new Map<string, MetaDailyTrendPoint>();

  for (const row of rows) {
    const key = row.date_start;
    const current = map.get(key) ?? { date_start: key, spend: 0, clicks: 0, impressions: 0 };
    current.spend += row.spend ?? 0;
    current.clicks += row.clicks ?? 0;
    current.impressions += row.impressions ?? 0;
    map.set(key, current);
  }

  return Array.from(map.values()).sort((left, right) => left.date_start.localeCompare(right.date_start));
}

export function aggregateLeaderboard(
  rows: MetaAdsReportingRow[],
  options: {
    getId: (row: MetaAdsReportingRow) => string | null;
    getTitle: (row: MetaAdsReportingRow) => string | null;
    getSubtitle: (row: MetaAdsReportingRow) => string | null;
  },
) {
  const grouped = new Map<string, MetaLeaderboardEntry>();

  for (const row of rows) {
    const id = options.getId(row);
    if (!id) continue;

    const current = grouped.get(id) ?? {
      id,
      title: options.getTitle(row) ?? id,
      subtitle: options.getSubtitle(row) ?? 'N/D',
      spend: 0,
      clicks: 0,
      impressions: 0,
      ctr: 0,
      cpc: 0,
    };

    current.spend += row.spend ?? 0;
    current.clicks += row.clicks ?? 0;
    current.impressions += row.impressions ?? 0;
    current.ctr = safeDivide(current.clicks * 100, current.impressions);
    current.cpc = safeDivide(current.spend, current.clicks);
    grouped.set(id, current);
  }

  return Array.from(grouped.values()).sort((left, right) => right.spend - left.spend);
}

export function aggregatePerformanceEntries(
  rows: MetaAdsReportingRow[],
  options: {
    getId: (row: MetaAdsReportingRow) => string | null;
    getTitle: (row: MetaAdsReportingRow) => string | null;
    getSubtitle: (row: MetaAdsReportingRow) => string | null;
    getCreativeName?: (row: MetaAdsReportingRow) => string | null;
  },
) {
  const grouped = new Map<string, MetaPerformanceEntry>();

  for (const row of rows) {
    const id = options.getId(row);
    if (!id) continue;

    const current = grouped.get(id) ?? {
      id,
      title: options.getTitle(row) ?? id,
      subtitle: options.getSubtitle(row) ?? 'N/D',
      creativeName: options.getCreativeName?.(row) ?? row.creative_name ?? 'Sin creative',
      spend: 0,
      clicks: 0,
      impressions: 0,
      reach: 0,
      ctr: 0,
      cpc: 0,
      labels: [],
    };

    current.spend += row.spend ?? 0;
    current.clicks += row.clicks ?? 0;
    current.impressions += row.impressions ?? 0;
    current.reach += row.reach ?? 0;
    current.ctr = safeDivide(current.clicks * 100, current.impressions);
    current.cpc = safeDivide(current.spend, current.clicks);

    if (!current.creativeName || current.creativeName === 'Sin creative') {
      current.creativeName = options.getCreativeName?.(row) ?? row.creative_name ?? 'Sin creative';
    }

    grouped.set(id, current);
  }

  const entries = Array.from(grouped.values());
  const averages = {
    spend: safeDivide(sumBy(entries, (entry) => entry.spend), entries.length),
    clicks: safeDivide(sumBy(entries, (entry) => entry.clicks), entries.length),
    ctr: safeDivide(sumBy(entries, (entry) => entry.ctr), entries.length),
    cpc: safeDivide(sumBy(entries, (entry) => entry.cpc), entries.length),
  };

  return entries
    .map((entry) => ({
      ...entry,
      labels: buildHeuristicLabels(entry, averages),
    }))
    .sort((left, right) => right.spend - left.spend);
}

export function pickComparisonPair(entries: MetaPerformanceEntry[]) {
  return entries.slice(0, 2);
}

export function buildComparisonMetrics(left?: MetaPerformanceEntry, right?: MetaPerformanceEntry): MetaComparisonMetric[] {
  if (!left || !right) return [];

  return [
    createComparisonMetric('Spend', left.spend, right.spend, 'currency', 'higher'),
    createComparisonMetric('Clicks', left.clicks, right.clicks, 'number', 'higher'),
    createComparisonMetric('CTR', left.ctr, right.ctr, 'percent', 'higher'),
    createComparisonMetric('CPC', left.cpc, right.cpc, 'currency', 'lower'),
  ];
}

export function buildComparisonNarrative(left?: MetaPerformanceEntry, right?: MetaPerformanceEntry): MetaComparisonNarrative | null {
  if (!left || !right) return null;

  const ctrWinner = pickWinner(left.ctr, right.ctr, 'higher');
  const cpcWinner = pickWinner(left.cpc, right.cpc, 'lower');
  const clicksWinner = pickWinner(left.clicks, right.clicks, 'higher');
  const impressionWinner = pickWinner(left.impressions, right.impressions, 'higher');

  const efficiencyWinner = ctrWinner === cpcWinner ? ctrWinner : 'tie';
  const volumeWinner = clicksWinner !== 'tie' ? clicksWinner : impressionWinner;

  const efficiencyLabel = describeEntrySide(efficiencyWinner, left, right);
  const volumeLabel = describeEntrySide(volumeWinner, left, right);
  const ctrLabel = describeEntrySide(ctrWinner, left, right);
  const cpcLabel = describeEntrySide(cpcWinner, left, right);

  const summary = efficiencyWinner === 'tie'
    ? 'En eficiencia no hay un ganador absoluto: la comparación está partida entre atracción y costo.'
    : `${efficiencyLabel} gana en eficiencia porque combina mejor respuesta del público con clicks más baratos.`;

  const tradeoff = volumeWinner === 'tie'
    ? 'En volumen están muy parejos, así que la decisión depende más de la calidad del tráfico que del alcance.'
    : efficiencyWinner === volumeWinner
      ? `${volumeLabel} también lidera en volumen, así que hoy es la apuesta más sólida para concentrar inversión.`
      : efficiencyWinner === 'tie'
        ? `${ctrLabel} muestra mejor CTR, pero ${cpcLabel} consigue clicks más baratos; conviene leerlo como un trade-off antes de mover presupuesto.`
        : `${volumeLabel} trae más volumen, pero ${efficiencyLabel} es más eficiente; ahí está la tensión principal de la comparación.`;

  const recommendation = efficiencyWinner !== 'tie' && efficiencyWinner === volumeWinner
    ? `Recomendación: escalar ${efficiencyLabel} de forma gradual mientras sostenés seguimiento de CTR y CPC para validar que no se degrade.`
    : efficiencyWinner !== 'tie' && volumeWinner !== 'tie' && efficiencyWinner !== volumeWinner
      ? `Recomendación: iterar ${volumeLabel} para bajar costo o mover una parte del presupuesto hacia ${efficiencyLabel}, que hoy convierte mejor la inversión.`
      : ctrWinner !== 'tie' && cpcWinner !== 'tie' && ctrWinner !== cpcWinner
        ? `Recomendación: revisar antes de escalar. ${ctrLabel} llama mejor la atención, pero ${cpcLabel} está resolviendo el costo de forma más sana.`
        : 'Recomendación: mantener la inversión estable y seguir testeando mensaje, segmentación o creative antes de tomar una decisión más agresiva.';

  const hasSplitLeaders = efficiencyWinner !== 'tie' && volumeWinner !== 'tie' && efficiencyWinner !== volumeWinner;

  const recommendationTone = efficiencyWinner !== 'tie' && efficiencyWinner === volumeWinner
    ? 'positive'
    : efficiencyWinner === 'tie' || hasSplitLeaders
      ? 'warning'
      : 'neutral';

  return {
    efficiencyWinner,
    volumeWinner,
    summary,
    tradeoff,
    recommendation,
    recommendationTone,
  };
}

export function buildDecisionSignals(entries: MetaPerformanceEntry[]): MetaDecisionSignal[] {
  const significant = entries.filter((entry) => entry.impressions >= 1000 && entry.clicks >= 5);
  const pool = significant.length > 0 ? significant : entries;
  const weakest = getWeakPerformers(entries)[0] ?? null;

  const bestCtr = [...pool].sort((left, right) => right.ctr - left.ctr)[0] ?? null;
  const bestCpc = [...pool].filter((entry) => entry.clicks > 0).sort((left, right) => left.cpc - right.cpc)[0] ?? null;
  const mostClicks = [...entries].sort((left, right) => right.clicks - left.clicks)[0] ?? null;
  const highestSpend = [...entries].sort((left, right) => right.spend - left.spend)[0] ?? null;

  return [
    {
      title: 'Mejor CTR',
      helper: 'La pieza que mejor convierte impresiones en clicks.',
      entry: bestCtr,
      tone: 'positive',
      metricLabel: 'CTR',
      metricValue: bestCtr?.ctr ?? 0,
      metricFormat: 'percent',
    },
    {
      title: 'Mejor CPC',
      helper: 'El activo que consigue clicks más baratos.',
      entry: bestCpc,
      tone: 'positive',
      metricLabel: 'CPC',
      metricValue: bestCpc?.cpc ?? 0,
      metricFormat: 'currency',
    },
    {
      title: 'Más clicks',
      helper: 'La unidad que más tráfico aportó al negocio.',
      entry: mostClicks,
      tone: 'neutral',
      metricLabel: 'Clicks',
      metricValue: mostClicks?.clicks ?? 0,
      metricFormat: 'number',
    },
    {
      title: 'Mayor spend',
      helper: 'Donde hoy está concentrada la inversión.',
      entry: highestSpend,
      tone: 'neutral',
      metricLabel: 'Spend',
      metricValue: highestSpend?.spend ?? 0,
      metricFormat: 'currency',
    },
    {
      title: 'Alto gasto, baja eficiencia',
      helper: 'Prioridad para revisar mensaje, segmentación o pieza.',
      entry: weakest,
      tone: 'warning',
      metricLabel: 'CPC',
      metricValue: weakest?.cpc ?? 0,
      metricFormat: 'currency',
    },
  ];
}

export function getWeakPerformers(entries: MetaPerformanceEntry[]) {
  if (entries.length === 0) return [];

  const avgSpend = safeDivide(sumBy(entries, (entry) => entry.spend), entries.length);
  const spendHeavy = entries.filter((entry) => entry.spend >= avgSpend && entry.clicks > 0);
  const pool = spendHeavy.length > 0 ? spendHeavy : entries.filter((entry) => entry.clicks > 0);

  return [...pool].sort((left, right) => {
    if (right.cpc !== left.cpc) return right.cpc - left.cpc;
    if (left.ctr !== right.ctr) return left.ctr - right.ctr;
    return right.spend - left.spend;
  });
}

export function getCreativeInsightEntries(entries: MetaPerformanceEntry[], limit = 4) {
  return [...entries]
    .filter((entry) => entry.clicks > 0 || entry.impressions > 0)
    .sort((left, right) => {
      if (right.clicks !== left.clicks) return right.clicks - left.clicks;
      if (right.ctr !== left.ctr) return right.ctr - left.ctr;
      return right.spend - left.spend;
    })
    .slice(0, limit);
}

export function aggregateBreakdown(
  rows: MetaAdsReportingRow[],
  selector: (row: MetaAdsReportingRow) => string | null,
) {
  const grouped = new Map<string, number>();

  for (const row of rows) {
    const label = selector(row) ?? 'Sin dato';
    grouped.set(label, (grouped.get(label) ?? 0) + (row.spend ?? 0));
  }

  return Array.from(grouped.entries())
    .map(([name, value]) => ({ name, value }))
    .sort((left, right) => right.value - left.value);
}

export function formatCompactMetric(value: number, type: 'currency' | 'number' | 'percent') {
  if (type === 'currency') return formatCurrencyPen(value);
  if (type === 'percent') return formatPercent(value);
  return formatNumberEs(value);
}

function createComparisonMetric(
  label: string,
  leftValue: number,
  rightValue: number,
  format: MetaComparisonMetric['format'],
  better: MetaComparisonMetric['better'],
): MetaComparisonMetric {
  let winner: MetaComparisonMetric['winner'] = 'tie';

  if (leftValue !== rightValue) {
    const leftWins = better === 'higher' ? leftValue > rightValue : leftValue < rightValue;
    winner = leftWins ? 'left' : 'right';
  }

  return {
    label,
    format,
    better,
    leftValue,
    rightValue,
    winner,
  };
}

function pickWinner(
  leftValue: number,
  rightValue: number,
  better: MetaComparisonMetric['better'],
): MetaComparisonMetric['winner'] {
  if (leftValue === rightValue) return 'tie';
  const leftWins = better === 'higher' ? leftValue > rightValue : leftValue < rightValue;
  return leftWins ? 'left' : 'right';
}

function describeEntrySide(
  winner: MetaComparisonMetric['winner'],
  left: MetaPerformanceEntry,
  right: MetaPerformanceEntry,
) {
  if (winner === 'left') return left.title;
  if (winner === 'right') return right.title;
  return 'Ambos';
}

function buildHeuristicLabels(
  entry: MetaPerformanceEntry,
  averages: { spend: number; clicks: number; ctr: number; cpc: number },
) {
  const labels: string[] = [];

  if (entry.ctr >= averages.ctr && entry.cpc > 0 && entry.cpc <= averages.cpc) {
    labels.push('Ganador en eficiencia');
  }

  if (entry.spend >= averages.spend && (entry.ctr < averages.ctr || entry.cpc > averages.cpc)) {
    labels.push('Alto gasto, baja eficiencia');
  }

  if (entry.clicks >= averages.clicks && entry.ctr >= averages.ctr) {
    labels.push('Mensaje que atrae clicks');
  }

  return labels.slice(0, 2);
}
