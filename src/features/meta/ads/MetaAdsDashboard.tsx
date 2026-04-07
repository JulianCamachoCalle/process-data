import { useMemo, useState } from 'react';
import { Activity, BadgeDollarSign, BarChart3, LineChart as LineChartIcon, Megaphone, MousePointerClick, PieChart as PieChartIcon, Sparkles, Target, Trophy } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumberEs } from '../../../lib/tableHelpers';
import { ChartCard, InsightBadge, KpiCard, KpiGrid, LeaderboardList, MetaAdsFiltersPanel, MetaAdsPageHero, Section } from './metaAdsShared';
import {
  aggregateBreakdown,
  aggregateLeaderboard,
  aggregatePerformanceEntries,
  aggregateTrendRows,
  buildComparisonMetrics,
  buildDecisionSignals,
  formatCompactMetric,
  getCreativeInsightEntries,
  getWeakPerformers,
  pickComparisonPair,
  safeDivide,
  sumBy,
  type MetaComparisonMetric,
  type MetaDecisionSignal,
  type MetaPerformanceEntry,
} from './metaAdsUtils';
import { useMetaAdsReporting } from './useMetaAdsReporting';

const COLORS = ['#dc2626', '#ef4444', '#f97316', '#f59e0b', '#8b5cf6', '#14b8a6', '#22c55e'];

export function MetaAdsDashboard() {
  const [accountId, setAccountId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [draftAccountId, setDraftAccountId] = useState('');
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');

  const reportingQuery = useMetaAdsReporting({ accountId, dateFrom, dateTo });

  const dashboard = useMemo(() => {
    const rows = reportingQuery.data?.rows ?? [];
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
    const objectiveBreakdown = aggregateBreakdown(rows, (row) => row.objective).slice(0, 6);
    const topCampaigns = aggregateLeaderboard(rows, {
      getId: (row) => row.campaign_business_id,
      getTitle: (row) => row.campaign_name,
      getSubtitle: (row) => row.account_name ?? row.account_business_id,
    }).slice(0, 5);
    const topAdsets = aggregateLeaderboard(rows, {
      getId: (row) => row.adset_business_id,
      getTitle: (row) => row.adset_name,
      getSubtitle: (row) => row.campaign_name ?? row.campaign_business_id,
    }).slice(0, 5);
    const topAds = aggregateLeaderboard(rows, {
      getId: (row) => row.ad_business_id,
      getTitle: (row) => row.ad_name ?? row.ad_business_id,
      getSubtitle: (row) => row.creative_name ?? row.creative_id ?? 'Sin creative',
    }).slice(0, 5);

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
    const campaignComparison = pickComparisonPair(campaignPerformance);
    const adComparison = pickComparisonPair(adPerformance);
    const campaignComparisonMetrics = buildComparisonMetrics(campaignComparison[0], campaignComparison[1]);
    const adComparisonMetrics = buildComparisonMetrics(adComparison[0], adComparison[1]);
    const adDecisionSignals = buildDecisionSignals(adPerformance);
    const weakAds = getWeakPerformers(adPerformance).slice(0, 5);
    const creativeInsights = getCreativeInsightEntries(adPerformance, 5);

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
      objectiveBreakdown,
      topCampaigns,
      topAdsets,
      topAds,
      campaignPerformance,
      adPerformance,
      campaignComparison,
      adComparison,
      campaignComparisonMetrics,
      adComparisonMetrics,
      adDecisionSignals,
      weakAds,
      creativeInsights,
    };
  }, [reportingQuery.data?.rows]);

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

  const accounts = reportingQuery.data?.accounts ?? [];
  const isFiltersDirty = accountId !== draftAccountId || dateFrom !== draftDateFrom || dateTo !== draftDateTo;

  return (
    <div className="space-y-6">
      <MetaAdsPageHero
        title="Meta Ads Dashboard"
        description="Vista ejecutiva de performance y tendencia diaria con filtros aplicados de forma intencional."
        badge="Dashboard ejecutivo"
        icon={<Megaphone className="text-red-600" size={24} />}
      />

      <MetaAdsFiltersPanel
        accounts={accounts}
        appliedAccountId={accountId}
        appliedDateFrom={dateFrom}
        appliedDateTo={dateTo}
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

          <ChartCard title="Gasto por objetivo" icon={<PieChartIcon size={16} className="text-red-600" />}>
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={dashboard.objectiveBreakdown}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={105}
                  label={(entry) => String(entry.name ?? '')}
                >
                  {dashboard.objectiveBreakdown.map((entry, index) => (
                    <Cell key={`${entry.name}-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip formatter={(value) => formatCompactMetric(Number(value ?? 0), 'currency')} />
              </PieChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </Section>

      <Section title="Top performers">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Campañas con mayor gasto" icon={<BarChart3 size={16} className="text-red-600" />}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dashboard.topCampaigns}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="title" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCompactMetric(Number(value ?? 0), 'currency')} />
                <Bar dataKey="spend" name="Gasto" fill="#dc2626" radius={[8, 8, 0, 0]} />
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

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          <ChartCard title="Top campañas" icon={<Megaphone size={16} className="text-red-600" />}>
            <LeaderboardList items={dashboard.topCampaigns} emptyMessage="No hay campañas para mostrar con los filtros actuales." />
          </ChartCard>
          <ChartCard title="Top ad sets" icon={<Target size={16} className="text-red-600" />}>
            <LeaderboardList items={dashboard.topAdsets} emptyMessage="No hay ad sets para mostrar con los filtros actuales." />
          </ChartCard>
          <ChartCard title="Top ads" icon={<Activity size={16} className="text-red-600" />}>
            <LeaderboardList items={dashboard.topAds} emptyMessage="No hay ads para mostrar con los filtros actuales." />
          </ChartCard>
        </div>
      </Section>

      <Section title="Comparativas directas">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <HeadToHeadCard
            title="Campaña vs campaña"
            description="Compará las dos campañas con mayor inversión para entender dónde ganó la eficiencia y dónde sólo ganó el presupuesto."
            left={dashboard.campaignComparison[0]}
            right={dashboard.campaignComparison[1]}
            metrics={dashboard.campaignComparisonMetrics}
            emptyMessage="Todavía no hay suficientes campañas con data para comparar."
          />
          <HeadToHeadCard
            title="Ad vs ad"
            description="Poné frente a frente las dos piezas con más peso para ver cuál conviene escalar y cuál revisar."
            left={dashboard.adComparison[0]}
            right={dashboard.adComparison[1]}
            metrics={dashboard.adComparisonMetrics}
            emptyMessage="Todavía no hay suficientes ads con data para comparar."
          />
        </div>
      </Section>

      <Section title="Señales para decidir">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-5">
          {dashboard.adDecisionSignals.map((signal) => (
            <DecisionSignalCard key={signal.title} signal={signal} />
          ))}
        </div>
      </Section>

      <Section title="Rankings accionables">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <PerformanceTableCard
            title="Ranking de campañas"
            description="Ordenadas por spend para revisar dónde conviene defender presupuesto y dónde reasignar."
            rows={dashboard.campaignPerformance.slice(0, 5)}
            emptyMessage="No hay campañas para rankear con los filtros actuales."
            showCreative={false}
          />
          <PerformanceTableCard
            title="Ranking de ads"
            description="Lectura rápida para detectar qué pieza gana clicks y qué pieza se queda cara."
            rows={dashboard.adPerformance.slice(0, 5)}
            emptyMessage="No hay ads para rankear con los filtros actuales."
            showCreative
          />
        </div>
      </Section>

      <Section title="Contenido e insights">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.15fr_0.85fr]">
          <ChartCard title="Creatividades que están empujando resultados" icon={<Sparkles size={16} className="text-red-600" />}>
            <InsightList entries={dashboard.creativeInsights} emptyMessage="No hay ads suficientes para extraer insights de contenido." />
          </ChartCard>
          <ChartCard title="Ads para revisar primero" icon={<BadgeDollarSign size={16} className="text-red-600" />}>
            <InsightList entries={dashboard.weakAds} emptyMessage="No hay señales claras de debilidad con los filtros actuales." emphasis="warning" />
          </ChartCard>
        </div>
      </Section>

      {dashboard.trend.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-500">
          No hay datos de Meta Ads para los filtros actuales. Probá limpiarlos o ajustar el rango.
        </div>
      ) : null}
    </div>
  );
}

function HeadToHeadCard({
  title,
  description,
  left,
  right,
  metrics,
  emptyMessage,
}: {
  title: string;
  description: string;
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
      <p className="text-sm text-gray-500">{description}</p>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {[left, right].map((entry, index) => (
          <div key={entry.id} className="rounded-2xl border border-gray-200 bg-gray-50/70 px-4 py-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{index === 0 ? 'Lado A' : 'Lado B'}</p>
            <p className="mt-2 text-base font-bold text-gray-900">{entry.title}</p>
            <p className="mt-1 text-xs text-gray-500">{entry.subtitle}</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {(entry.labels.length ? entry.labels : ['Sin alerta destacada']).map((label) => (
                <InsightBadge key={label} label={label} tone={getBadgeTone(label)} />
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full text-sm">
          <thead>
            <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="pb-2 pr-3">Métrica</th>
              <th className="pb-2 px-3">{left.title}</th>
              <th className="pb-2 px-3">{right.title}</th>
              <th className="pb-2 pl-3">Lectura</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric.label} className="border-t border-gray-100 text-gray-700">
                <td className="py-3 pr-3 font-semibold text-gray-900">{metric.label}</td>
                <td className={`py-3 px-3 ${metric.winner === 'left' ? 'font-bold text-emerald-700' : ''}`}>{formatCompactMetric(metric.leftValue, metric.format)}</td>
                <td className={`py-3 px-3 ${metric.winner === 'right' ? 'font-bold text-emerald-700' : ''}`}>{formatCompactMetric(metric.rightValue, metric.format)}</td>
                <td className="py-3 pl-3 text-xs text-gray-500">{describeMetricWinner(metric)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

function DecisionSignalCard({ signal }: { signal: MetaDecisionSignal }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.8)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">{signal.title}</p>
          <p className="mt-2 text-xl font-bold text-gray-900">{formatCompactMetric(signal.metricValue, signal.metricFormat)}</p>
          <p className="mt-2 text-sm font-semibold text-gray-800">{signal.entry?.title ?? 'Sin data suficiente'}</p>
        </div>
        <InsightBadge
          label={signal.tone === 'warning' ? 'Revisar' : signal.tone === 'positive' ? 'Escalar' : 'Seguir de cerca'}
          tone={signal.tone}
        />
      </div>

      <p className="mt-2 text-xs text-gray-500">{signal.helper}</p>
      {signal.entry ? (
        <p className="mt-3 text-xs text-gray-500">
          {signal.metricLabel}: {formatCompactMetric(signal.metricValue, signal.metricFormat)} · {signal.entry.subtitle}
        </p>
      ) : null}
    </div>
  );
}

function PerformanceTableCard({
  title,
  description,
  rows,
  emptyMessage,
  showCreative,
}: {
  title: string;
  description: string;
  rows: MetaPerformanceEntry[];
  emptyMessage: string;
  showCreative: boolean;
}) {
  return (
    <ChartCard title={title} icon={<BarChart3 size={16} className="text-red-600" />}>
      <p className="text-sm text-gray-500">{description}</p>
      {rows.length === 0 ? (
        <EmptyState message={emptyMessage} />
      ) : (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="pb-2 pr-3">Activo</th>
                {showCreative ? <th className="pb-2 px-3">Creative</th> : null}
                <th className="pb-2 px-3">Spend</th>
                <th className="pb-2 px-3">Clicks</th>
                <th className="pb-2 px-3">CTR</th>
                <th className="pb-2 px-3">CPC</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100 align-top text-gray-700">
                  <td className="py-3 pr-3">
                    <p className="font-semibold text-gray-900">{row.title}</p>
                    <p className="mt-1 text-xs text-gray-500">{row.subtitle}</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {row.labels.map((label) => (
                        <InsightBadge key={label} label={label} tone={getBadgeTone(label)} />
                      ))}
                    </div>
                  </td>
                  {showCreative ? <td className="py-3 px-3 text-xs text-gray-500">{row.creativeName}</td> : null}
                  <td className="py-3 px-3 font-semibold text-gray-900">{formatCompactMetric(row.spend, 'currency')}</td>
                  <td className="py-3 px-3">{formatCompactMetric(row.clicks, 'number')}</td>
                  <td className="py-3 px-3">{formatCompactMetric(row.ctr, 'percent')}</td>
                  <td className="py-3 px-3">{formatCompactMetric(row.cpc, 'currency')}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </ChartCard>
  );
}

function InsightList({
  entries,
  emptyMessage,
  emphasis = 'positive',
}: {
  entries: MetaPerformanceEntry[];
  emptyMessage: string;
  emphasis?: 'positive' | 'warning';
}) {
  if (entries.length === 0) {
    return <EmptyState message={emptyMessage} />;
  }

  return (
    <ul className="space-y-3">
      {entries.map((entry) => (
        <li key={entry.id} className="rounded-2xl border border-gray-100 bg-gray-50/70 px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="font-semibold text-gray-900">{entry.title}</p>
              <p className="mt-1 text-xs text-gray-500">{entry.subtitle}</p>
              <p className="mt-2 text-xs text-gray-500">Creative: {entry.creativeName}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {(entry.labels.length ? entry.labels : [emphasis === 'warning' ? 'Revisar pieza' : 'Contenido con tracción']).map((label) => (
                  <InsightBadge key={label} label={label} tone={entry.labels.length ? getBadgeTone(label) : emphasis} />
                ))}
              </div>
            </div>
            <div className="shrink-0 text-right text-sm text-gray-600">
              <p className="font-semibold text-gray-900">{formatCompactMetric(entry.clicks, 'number')} clicks</p>
              <p className="mt-1">CTR {formatCompactMetric(entry.ctr, 'percent')}</p>
              <p className="mt-1">CPC {formatCompactMetric(entry.cpc, 'currency')}</p>
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">{message}</div>;
}

function getBadgeTone(label: string): 'positive' | 'warning' | 'neutral' {
  if (label.toLowerCase().includes('ganador') || label.toLowerCase().includes('atrae')) return 'positive';
  if (label.toLowerCase().includes('baja eficiencia')) return 'warning';
  return 'neutral';
}

function describeMetricWinner(metric: MetaComparisonMetric) {
  if (metric.winner === 'tie') return 'Empate técnico';

  const side = metric.winner === 'left' ? 'Lado A' : 'Lado B';
  const verb = metric.better === 'lower' ? 'gana por menor valor' : 'gana por mayor valor';
  return `${side} ${verb}`;
}
