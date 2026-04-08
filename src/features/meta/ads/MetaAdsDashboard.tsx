import { useMemo, useState } from 'react';
import { Activity, BadgeDollarSign, BarChart3, LineChart as LineChartIcon, Megaphone, MousePointerClick, PieChart as PieChartIcon, Target, Trophy } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumberEs } from '../../../lib/tableHelpers';
import { ChartCard, KpiCard, KpiGrid, MetaAdsFiltersPanel, MetaAdsPageHero, Section } from './metaAdsShared';
import {
  aggregateLeaderboard,
  aggregatePerformanceEntries,
  aggregateTrendRows,
  buildComparisonMetrics,
  formatCompactMetric,
  pickComparisonPair,
  safeDivide,
  sumBy,
  type MetaComparisonMetric,
  type MetaPerformanceEntry,
} from './metaAdsUtils';
import { useMetaAdsReporting } from './useMetaAdsReporting';

const HOURLY_COLORS = ['#dc2626', '#f97316', '#ea580c', '#b91c1c', '#7f1d1d'];

export function MetaAdsDashboard() {
  const [accountId, setAccountId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [draftAccountId, setDraftAccountId] = useState('');
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const [comparisonType, setComparisonType] = useState<'campaigns' | 'ads'>('campaigns');
  const [campaignCompareIds, setCampaignCompareIds] = useState({ left: '', right: '' });
  const [adCompareIds, setAdCompareIds] = useState({ left: '', right: '' });

  const reportingQuery = useMetaAdsReporting({ accountId, dateFrom, dateTo });

  const dashboard = useMemo(() => {
    const rows = reportingQuery.data?.rows ?? [];
    const hourlyRows = reportingQuery.data?.hourlyRows ?? [];
    const totalSpend = sumBy(rows, (row) => row.spend);
    const totalImpressions = sumBy(rows, (row) => row.impressions);
    const totalReach = sumBy(rows, (row) => row.reach);
    const totalClicks = sumBy(rows, (row) => row.clicks);
    const totalCampaigns = new Set(rows.map((row) => row.campaign_business_id).filter(Boolean)).size;
    const totalAdsets = new Set(rows.map((row) => row.adset_business_id).filter(Boolean)).size;
    const totalAds = new Set(rows.map((row) => row.ad_business_id).filter(Boolean)).size;
    const overallCtr = safeDivide(totalClicks * 100, totalImpressions);
    const overallCpc = safeDivide(totalSpend, totalClicks);

    const trend = aggregateTrendRows(rows);
    const trendEfficiency = trend.map((point) => ({
      ...point,
      ctr: safeDivide(point.clicks * 100, point.impressions),
      cpc: safeDivide(point.spend, point.clicks),
    }));

    const topCampaignsByClicks = aggregateLeaderboard(rows, {
      getId: (row) => row.campaign_business_id,
      getTitle: (row) => row.campaign_name,
      getSubtitle: (row) => row.account_name ?? row.account_business_id,
    })
      .sort((left, right) => {
        if (right.clicks !== left.clicks) return right.clicks - left.clicks;
        if (right.ctr !== left.ctr) return right.ctr - left.ctr;
        return left.cpc - right.cpc;
      })
      .slice(0, 5);

    const topAdsByClicks = aggregateLeaderboard(rows, {
      getId: (row) => row.ad_business_id,
      getTitle: (row) => row.ad_name ?? row.ad_business_id,
      getSubtitle: (row) => row.creative_name ?? row.creative_id ?? 'Sin creative',
    })
      .sort((left, right) => {
        if (right.clicks !== left.clicks) return right.clicks - left.clicks;
        if (right.ctr !== left.ctr) return right.ctr - left.ctr;
        return left.cpc - right.cpc;
      })
      .slice(0, 5);

    const campaignPerformance = aggregatePerformanceEntries(rows, {
      getId: (row) => row.campaign_business_id,
      getTitle: (row) => row.campaign_name,
      getSubtitle: (row) => row.account_name ?? row.account_business_id,
    });
    const adPerformance = aggregatePerformanceEntries(rows, {
      getId: (row) => row.ad_business_id,
      getTitle: (row) => row.ad_name ?? row.ad_business_id,
      getSubtitle: (row) => row.campaign_name ?? row.campaign_business_id,
      getCreativeName: (row) => row.creative_name ?? row.creative_id ?? 'Sin creative',
    });

    const adIdsInScope = new Set(rows.map((row) => row.ad_business_id).filter(Boolean));
    const scopedHourlyRows = hourlyRows.filter((row) => adIdsInScope.has(row.ad_business_id));

    const hourlyByDateMap = new Map<string, number[]>();
    for (const row of scopedHourlyRows) {
      const hour = parseHourFromBucket(row.hour_bucket);
      if (hour === null) continue;

      const date = row.date_start;
      const current = hourlyByDateMap.get(date) ?? Array<number>(24).fill(0);
      current[hour] += Number(row.clicks ?? 0);
      hourlyByDateMap.set(date, current);
    }

    const selectedHourlyDates = Array.from(hourlyByDateMap.keys())
      .sort()
      .slice(-5);

    const hourlyTrendByDay = Array.from({ length: 24 }).map((_, hour) => {
      const row: Record<string, string | number> = {
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
      };

      for (const date of selectedHourlyDates) {
        row[date] = hourlyByDateMap.get(date)?.[hour] ?? 0;
      }

      return row;
    });

    return {
      totalSpend,
      totalImpressions,
      totalReach,
      totalClicks,
      totalCampaigns,
      totalAdsets,
      totalAds,
      overallCtr,
      overallCpc,
      trend,
      trendEfficiency,
      topCampaignsByClicks,
      topAdsByClicks,
      campaignPerformance,
      adPerformance,
      hourlyTrendByDay,
      selectedHourlyDates,
    };
  }, [reportingQuery.data?.hourlyRows, reportingQuery.data?.rows]);

  const accounts = reportingQuery.data?.accounts ?? [];
  const isFiltersDirty = accountId !== draftAccountId || dateFrom !== draftDateFrom || dateTo !== draftDateTo;

  const resolvedCampaignCompareIds = useMemo(
    () => resolveComparisonSelection(dashboard.campaignPerformance, campaignCompareIds),
    [dashboard.campaignPerformance, campaignCompareIds],
  );

  const resolvedAdCompareIds = useMemo(
    () => resolveComparisonSelection(dashboard.adPerformance, adCompareIds),
    [dashboard.adPerformance, adCompareIds],
  );

  const selectedCampaignComparison = useMemo(
    () => resolveComparisonEntries(dashboard.campaignPerformance, resolvedCampaignCompareIds),
    [dashboard.campaignPerformance, resolvedCampaignCompareIds],
  );

  const selectedAdComparison = useMemo(
    () => resolveComparisonEntries(dashboard.adPerformance, resolvedAdCompareIds),
    [dashboard.adPerformance, resolvedAdCompareIds],
  );

  const selectedCampaignComparisonMetrics = useMemo(
    () => buildComparisonMetrics(selectedCampaignComparison[0], selectedCampaignComparison[1]),
    [selectedCampaignComparison],
  );

  const selectedAdComparisonMetrics = useMemo(
    () => buildComparisonMetrics(selectedAdComparison[0], selectedAdComparison[1]),
    [selectedAdComparison],
  );

  const activeComparison = comparisonType === 'campaigns'
    ? {
        title: 'Comparación directa',
        emptyMessage: 'Todavía no hay suficientes campañas con data para comparar.',
        leftLabel: 'Campaña A',
        rightLabel: 'Campaña B',
        options: dashboard.campaignPerformance,
        selection: resolvedCampaignCompareIds,
        left: selectedCampaignComparison[0],
        right: selectedCampaignComparison[1],
        metrics: selectedCampaignComparisonMetrics,
        onLeftChange: (value: string) => setCampaignCompareIds((current) => resolveComparisonSelection(dashboard.campaignPerformance, { ...current, left: value })),
        onRightChange: (value: string) => setCampaignCompareIds((current) => resolveComparisonSelection(dashboard.campaignPerformance, { ...current, right: value })),
      }
    : {
        title: 'Comparación directa',
        emptyMessage: 'Todavía no hay suficientes ads con data para comparar.',
        leftLabel: 'Ad A',
        rightLabel: 'Ad B',
        options: dashboard.adPerformance,
        selection: resolvedAdCompareIds,
        left: selectedAdComparison[0],
        right: selectedAdComparison[1],
        metrics: selectedAdComparisonMetrics,
        onLeftChange: (value: string) => setAdCompareIds((current) => resolveComparisonSelection(dashboard.adPerformance, { ...current, left: value })),
        onRightChange: (value: string) => setAdCompareIds((current) => resolveComparisonSelection(dashboard.adPerformance, { ...current, right: value })),
      };

  if (reportingQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mr-3"></div>
        Cargando dashboard de Meta Ads...
      </div>
    );
  }

  if (reportingQuery.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500 space-y-4">
        <Activity size={48} />
        <p className="text-lg font-medium">Error al cargar Meta Ads</p>
        <p className="text-sm text-red-400 max-w-xl text-center">
          {reportingQuery.error instanceof Error ? reportingQuery.error.message : 'Error desconocido'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MetaAdsPageHero
        title="Meta Ads Dashboard"
        description="Vista de performance y tendencia diaria."
        icon={<Megaphone className="text-red-600" size={24} />}
      />

      <MetaAdsFiltersPanel
        accounts={accounts}
        draftAccountId={draftAccountId}
        draftDateFrom={draftDateFrom}
        draftDateTo={draftDateTo}
        onDraftAccountIdChange={setDraftAccountId}
        onDraftDateFromChange={setDraftDateFrom}
        onDraftDateToChange={setDraftDateTo}
        onApply={() => {
          setAccountId(draftAccountId);
          setDateFrom(draftDateFrom);
          setDateTo(draftDateTo);
        }}
        onClear={() => {
          setAccountId('');
          setDateFrom('');
          setDateTo('');
          setDraftAccountId('');
          setDraftDateFrom('');
          setDraftDateTo('');
        }}
        isApplyDisabled={!isFiltersDirty}
      />

      <Section title="KPI">
        <KpiGrid>
          <KpiCard title="Gasto total" value={formatCompactMetric(dashboard.totalSpend, 'currency')} helper="Inversión agregada del rango" icon={<BadgeDollarSign className="text-red-600" size={18} />} />
          <KpiCard title="Impresiones" value={formatCompactMetric(dashboard.totalImpressions, 'number')} helper="Volumen total servido" icon={<Megaphone className="text-red-600" size={18} />} />
          <KpiCard title="Reach" value={formatCompactMetric(dashboard.totalReach, 'number')} helper="Usuarios alcanzados" icon={<Activity className="text-red-600" size={18} />} />
          <KpiCard title="Clicks" value={formatCompactMetric(dashboard.totalClicks, 'number')} helper="Interacciones principales" icon={<MousePointerClick className="text-red-600" size={18} />} />
          <KpiCard title="CTR global" value={formatCompactMetric(dashboard.overallCtr, 'percent')} helper="Clicks / impresiones" icon={<Target className="text-red-600" size={18} />} />
          <KpiCard title="CPC global" value={formatCompactMetric(dashboard.overallCpc, 'currency')} helper="Gasto / clicks" icon={<BadgeDollarSign className="text-red-600" size={18} />} />
          <KpiCard title="Campañas con data" value={formatNumberEs(dashboard.totalCampaigns)} helper="Campañas únicas en el rango" icon={<BarChart3 className="text-red-600" size={18} />} />
          <KpiCard title="Ads con data" value={formatNumberEs(dashboard.totalAds)} helper={`${formatNumberEs(dashboard.totalAdsets)} ad sets únicos`} icon={<Megaphone className="text-red-600" size={18} />} />
        </KpiGrid>
      </Section>

      <Section title="Tendencias y composición">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Tendencia diaria de gasto" icon={<LineChartIcon size={16} className="text-red-600" />}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dashboard.trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date_start" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCompactMetric(Number(value ?? 0), 'currency')} />
                <Line type="monotone" dataKey="spend" name="Gasto" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Tendencia diaria de CTR y CPC" icon={<PieChartIcon size={16} className="text-red-600" />}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dashboard.trendEfficiency}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date_start" tick={{ fontSize: 12 }} />
                <YAxis yAxisId="left" tick={{ fontSize: 12 }} tickFormatter={(value) => `${Number(value).toFixed(1)}%`} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={(value) => `S/ ${Number(value).toFixed(1)}`} />
                <Tooltip
                  formatter={(value, key) => {
                    const numeric = Number(value ?? 0);
                    if (key === 'ctr') return formatCompactMetric(numeric, 'percent');
                    return formatCompactMetric(numeric, 'currency');
                  }}
                />
                <Line yAxisId="left" type="monotone" dataKey="ctr" name="CTR" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 2 }} />
                <Line yAxisId="right" type="monotone" dataKey="cpc" name="CPC" stroke="#f97316" strokeWidth={2.2} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <ChartCard title="Tendencia por hora x día (Clicks)" icon={<LineChartIcon size={16} className="text-red-600" />}>
          {dashboard.selectedHourlyDates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
              Todavía no hay data horaria. Ejecutá sync de Meta Ads con breakdown horario.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={dashboard.hourlyTrendByDay}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                <Tooltip formatter={(value) => formatCompactMetric(Number(value ?? 0), 'number')} />
                {dashboard.selectedHourlyDates.map((date, index) => (
                  <Line
                    key={date}
                    type="monotone"
                    dataKey={date}
                    name={date}
                    stroke={HOURLY_COLORS[index % HOURLY_COLORS.length]}
                    strokeWidth={2.1}
                    dot={{ r: 1.8 }}
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </Section>

      <Section title="Top performers">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Campañas con mayor gasto" icon={<BarChart3 size={16} className="text-red-600" />}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dashboard.topCampaignsByClicks}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="title" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCompactMetric(Number(value ?? 0), 'number')} />
                <Bar dataKey="clicks" name="Clicks" fill="#dc2626" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Tendencia diaria de clicks" icon={<MousePointerClick size={16} className="text-red-600" />}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dashboard.trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date_start" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCompactMetric(Number(value ?? 0), 'number')} />
                <Bar dataKey="clicks" name="Clicks" fill="#f97316" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Top campañas" icon={<Megaphone size={16} className="text-red-600" />}>
            <TopPerformanceList items={dashboard.topCampaignsByClicks} emptyMessage="No hay campañas para mostrar con los filtros actuales." />
          </ChartCard>
          <ChartCard title="Top ads" icon={<Activity size={16} className="text-red-600" />}>
            <TopPerformanceList items={dashboard.topAdsByClicks} emptyMessage="No hay ads para mostrar con los filtros actuales." />
          </ChartCard>
        </div>
      </Section>

      <Section title="Comparativas directas">
        <UnifiedComparisonCard
          comparisonType={comparisonType}
          onComparisonTypeChange={setComparisonType}
          title={activeComparison.title}
          leftLabel={activeComparison.leftLabel}
          rightLabel={activeComparison.rightLabel}
          leftValue={activeComparison.selection.left}
          rightValue={activeComparison.selection.right}
          options={activeComparison.options}
          onLeftChange={activeComparison.onLeftChange}
          onRightChange={activeComparison.onRightChange}
          left={activeComparison.left}
          right={activeComparison.right}
          metrics={activeComparison.metrics}
          emptyMessage={activeComparison.emptyMessage}
        />
      </Section>

      {dashboard.trend.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-500">
          No hay datos de Meta Ads para los filtros actuales. Probá limpiarlos o ajustar el rango.
        </div>
      ) : null}
    </div>
  );
}

function TopPerformanceList({
  items,
  emptyMessage,
}: {
  items: Array<{ id: string; title: string; subtitle: string; clicks: number; ctr: number; cpc: number }>;
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">{emptyMessage}</div>;
  }

  return (
    <ul className="space-y-2">
      {items.slice(0, 5).map((item, index) => (
        <li key={item.id} className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">#{index + 1}</p>
              <p className="font-semibold text-gray-900 truncate">{item.title}</p>
              <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-right shrink-0">
              <Metric label="Clicks" value={formatNumberEs(item.clicks)} />
              <Metric label="CTR" value={`${item.ctr.toFixed(2)}%`} />
              <Metric label="CPC" value={formatCompactMetric(item.cpc, 'currency')} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function UnifiedComparisonCard({
  comparisonType,
  onComparisonTypeChange,
  title,
  leftLabel,
  rightLabel,
  leftValue,
  rightValue,
  options,
  onLeftChange,
  onRightChange,
  left,
  right,
  metrics,
  emptyMessage,
}: {
  comparisonType: 'campaigns' | 'ads';
  onComparisonTypeChange: (value: 'campaigns' | 'ads') => void;
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftValue: string;
  rightValue: string;
  options: MetaPerformanceEntry[];
  onLeftChange: (value: string) => void;
  onRightChange: (value: string) => void;
  left?: MetaPerformanceEntry;
  right?: MetaPerformanceEntry;
  metrics: MetaComparisonMetric[];
  emptyMessage: string;
}) {
  if (!left || !right) {
    return <ChartCard title={title} icon={<BarChart3 size={16} className="text-red-600" />}><EmptyState message={emptyMessage} /></ChartCard>;
  }

  return (
    <ChartCard title={title} icon={<Trophy size={16} className="text-red-600" />}>
      <ComparisonControls
        comparisonType={comparisonType}
        onComparisonTypeChange={onComparisonTypeChange}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
        leftValue={leftValue}
        rightValue={rightValue}
        options={options}
        onLeftChange={onLeftChange}
        onRightChange={onRightChange}
      />

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-[0_14px_30px_-24px_rgba(15,23,42,0.75)]">
        <table className="min-w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[40%]" />
            <col className="w-[40%]" />
          </colgroup>
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-gray-500 bg-gray-50 border-y border-gray-200">
              <th className="py-3.5 pr-3 pl-4">Métrica</th>
              <th className="py-3.5 px-3">A · {left.title}</th>
              <th className="py-3.5 px-3 pr-4">B · {right.title}</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric.label} className="border-t border-gray-100 text-gray-700 even:bg-gray-50/35">
                <td className="py-3.5 pr-3 pl-4 font-extrabold uppercase text-gray-700">{metric.label}</td>
                <td className={`py-3.5 px-3 text-base tabular-nums ${getComparisonCellClassName(metric, 'left')}`}>{formatCompactMetric(metric.leftValue, metric.format)}</td>
                <td className={`py-3.5 px-3 pr-4 text-base tabular-nums ${getComparisonCellClassName(metric, 'right')}`}>{formatCompactMetric(metric.rightValue, metric.format)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

function ComparisonControls({
  comparisonType,
  onComparisonTypeChange,
  leftLabel,
  rightLabel,
  leftValue,
  rightValue,
  options,
  onLeftChange,
  onRightChange,
}: {
  comparisonType: 'campaigns' | 'ads';
  onComparisonTypeChange: (value: 'campaigns' | 'ads') => void;
  leftLabel: string;
  rightLabel: string;
  leftValue: string;
  rightValue: string;
  options: MetaPerformanceEntry[];
  onLeftChange: (value: string) => void;
  onRightChange: (value: string) => void;
}) {
  return (
    <div className="space-y-4 rounded-[24px] border border-gray-200 bg-gradient-to-br from-gray-50/90 to-white p-4 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.8)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Tipo de comparativa</p>
        <div className="rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
          <div className="grid grid-cols-2 gap-1">
          {[
            { key: 'campaigns', label: 'Campañas' },
            { key: 'ads', label: 'Ads' },
          ].map((option) => {
            const isActive = option.key === comparisonType;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onComparisonTypeChange(option.key as 'campaigns' | 'ads')}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${isActive ? 'bg-red-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {option.label}
              </button>
            );
          })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-center gap-3 xl:grid-cols-[1fr_auto_1fr]">
        <ComparisonSelect
          label={leftLabel}
          value={leftValue}
          options={options}
          selectedPeer={rightValue}
          onChange={onLeftChange}
        />
        <div className="mx-auto hidden h-9 items-center rounded-full px-4 text-lg font-extrabold uppercase tracking-[0.1em] text-red-600 xl:inline-flex">
          VS
        </div>
        <ComparisonSelect
          label={rightLabel}
          value={rightValue}
          options={options}
          selectedPeer={leftValue}
          onChange={onRightChange}
        />
      </div>
    </div>
  );
}

function ComparisonSelect({
  label,
  value,
  options,
  selectedPeer,
  onChange,
}: {
  label: string;
  value: string;
  options: MetaPerformanceEntry[];
  selectedPeer: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-[inset_0_1px_0_rgba(255,255,255,0.85)]">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id} disabled={option.id === selectedPeer}>
            {option.title} · {option.subtitle}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">{message}</div>;
}

function getComparisonCellClassName(metric: MetaComparisonMetric, side: 'left' | 'right') {
  if (metric.winner === 'tie') return 'font-medium text-gray-700';
  if (metric.winner === side) return 'font-extrabold text-emerald-700 bg-emerald-50/90';
  return 'font-semibold text-red-600 bg-red-50/90';
}

function resolveComparisonEntries(
  entries: MetaPerformanceEntry[],
  selection: { left: string; right: string },
): [MetaPerformanceEntry | undefined, MetaPerformanceEntry | undefined] {
  const normalized = resolveComparisonSelection(entries, selection);
  const left = entries.find((entry) => entry.id === normalized.left);
  const right = entries.find((entry) => entry.id === normalized.right);
  return [left, right];
}

function resolveComparisonSelection(
  entries: MetaPerformanceEntry[],
  selection: { left: string; right: string },
) {
  const [defaultLeft, defaultRight] = pickComparisonPair(entries);
  const fallbackLeft = defaultLeft?.id ?? '';
  const fallbackRight = defaultRight?.id ?? '';
  const validIds = new Set(entries.map((entry) => entry.id));

  const left = validIds.has(selection.left) ? selection.left : fallbackLeft;
  const leftResolved = left || fallbackLeft;
  const rightCandidate = validIds.has(selection.right) ? selection.right : fallbackRight;
  const right = rightCandidate && rightCandidate !== leftResolved
    ? rightCandidate
    : entries.find((entry) => entry.id !== leftResolved)?.id ?? '';

  return {
    left: leftResolved,
    right,
  };
}

function parseHourFromBucket(hourBucket: string) {
  const match = String(hourBucket ?? '').trim().match(/^(\d{1,2})/);
  if (!match) return null;

  const hour = Number.parseInt(match[1] ?? '', 10);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return hour;
}
