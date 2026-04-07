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

export type MetaBreakdownPoint = {
  name: string;
  value: number;
};

export function safeDivide(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return numerator / denominator;
}

export function sumBy(rows: MetaAdsReportingRow[], selector: (row: MetaAdsReportingRow) => number | null) {
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
