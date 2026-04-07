import { useMemo, useState, type ReactNode } from 'react';
import { Activity, BadgeDollarSign, BarChart3, LineChart as LineChartIcon, Megaphone, MousePointerClick, PieChart as PieChartIcon, Sparkles, Target, TrendingUp, TriangleAlert, Trophy, Wrench } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumberEs } from '../../../lib/tableHelpers';
import { ChartCard, InsightBadge, KpiCard, KpiGrid, LeaderboardList, MetaAdsFiltersPanel, MetaAdsPageHero, Section } from './metaAdsShared';
import {
  aggregateBreakdown,
  aggregateLeaderboard,
  aggregatePerformanceEntries,
  aggregateTrendRows,
  buildComparisonMetrics,
  buildComparisonNarrative,
  buildDecisionSignals,
  buildRecommendationBuckets,
  formatCompactMetric,
  getCreativeInsightEntries,
  getWeakPerformers,
  pickComparisonPair,
  safeDivide,
  sumBy,
  type MetaComparisonMetric,
  type MetaComparisonNarrative,
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
  const [campaignCompareIds, setCampaignCompareIds] = useState({ left: '', right: '' });
  const [adCompareIds, setAdCompareIds] = useState({ left: '', right: '' });

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
    const adDecisionSignals = buildDecisionSignals(adPerformance);
    const recommendationBuckets = buildRecommendationBuckets(adPerformance);
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
      adDecisionSignals,
      recommendationBuckets,
      weakAds,
      creativeInsights,
    };
  }, [reportingQuery.data?.rows]);

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

  const selectedCampaignNarrative = useMemo(
    () => buildComparisonNarrative(selectedCampaignComparison[0], selectedCampaignComparison[1]),
    [selectedCampaignComparison],
  );

  const selectedAdNarrative = useMemo(
    () => buildComparisonNarrative(selectedAdComparison[0], selectedAdComparison[1]),
    [selectedAdComparison],
  );

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
            description="Arranca con la dupla de mayor spend del filtro actual, pero podés cambiarla para revisar cualquier campaña contra otra sin volver a pedir data al servidor."
            controls={(
              <ComparisonSelectorRow
                leftLabel="Campaña A"
                rightLabel="Campaña B"
                leftValue={resolvedCampaignCompareIds.left}
                rightValue={resolvedCampaignCompareIds.right}
                options={dashboard.campaignPerformance}
                onLeftChange={(value) => setCampaignCompareIds((current) => resolveComparisonSelection(dashboard.campaignPerformance, { ...current, left: value }))}
                onRightChange={(value) => setCampaignCompareIds((current) => resolveComparisonSelection(dashboard.campaignPerformance, { ...current, right: value }))}
              />
            )}
            left={selectedCampaignComparison[0]}
            right={selectedCampaignComparison[1]}
            metrics={selectedCampaignComparisonMetrics}
            narrative={selectedCampaignNarrative}
            emptyMessage="Todavía no hay suficientes campañas con data para comparar."
          />
          <HeadToHeadCard
            title="Ad vs ad"
            description="La comparación empieza con los ads líderes en spend del dataset filtrado y después queda completamente manual para que pruebes hipótesis."
            controls={(
              <ComparisonSelectorRow
                leftLabel="Ad A"
                rightLabel="Ad B"
                leftValue={resolvedAdCompareIds.left}
                rightValue={resolvedAdCompareIds.right}
                options={dashboard.adPerformance}
                onLeftChange={(value) => setAdCompareIds((current) => resolveComparisonSelection(dashboard.adPerformance, { ...current, left: value }))}
                onRightChange={(value) => setAdCompareIds((current) => resolveComparisonSelection(dashboard.adPerformance, { ...current, right: value }))}
              />
            )}
            left={selectedAdComparison[0]}
            right={selectedAdComparison[1]}
            metrics={selectedAdComparisonMetrics}
            narrative={selectedAdNarrative}
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

      <Section title="Recomendaciones accionables">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
          {dashboard.recommendationBuckets.map((bucket) => (
            <RecommendationBucketCard key={bucket.key} bucket={bucket} />
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
  controls,
  left,
  right,
  metrics,
  narrative,
  emptyMessage,
}: {
  title: string;
  description: string;
  controls?: ReactNode;
  left?: MetaPerformanceEntry;
  right?: MetaPerformanceEntry;
  metrics: MetaComparisonMetric[];
  narrative: MetaComparisonNarrative | null;
  emptyMessage: string;
}) {
  if (!left || !right) {
    return <ChartCard title={title} icon={<BarChart3 size={16} className="text-red-600" />}><EmptyState message={emptyMessage} /></ChartCard>;
  }

  return (
    <ChartCard title={title} icon={<Trophy size={16} className="text-red-600" />}>
      <p className="text-sm text-gray-500">{description}</p>
      {controls}

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

      {narrative ? <ComparisonNarrativeCard narrative={narrative} /> : null}
    </ChartCard>
  );
}

function ComparisonNarrativeCard({ narrative }: { narrative: MetaComparisonNarrative }) {
  return (
    <div className="rounded-2xl border border-red-100 bg-gradient-to-br from-red-50 via-white to-orange-50 px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Resumen ejecutivo</p>
          <p className="mt-2 text-sm font-semibold text-gray-900">{narrative.summary}</p>
        </div>
        <InsightBadge
          label={narrative.recommendationTone === 'positive' ? 'Escalar' : narrative.recommendationTone === 'warning' ? 'Revisar' : 'Iterar'}
          tone={narrative.recommendationTone}
        />
      </div>

      <div className="mt-3 space-y-2 text-sm text-gray-600">
        <p>{narrative.tradeoff}</p>
        <p className="font-medium text-gray-800">{narrative.recommendation}</p>
      </div>
    </div>
  );
}

function ComparisonSelectorRow({
  leftLabel,
  rightLabel,
  leftValue,
  rightValue,
  options,
  onLeftChange,
  onRightChange,
}: {
  leftLabel: string;
  rightLabel: string;
  leftValue: string;
  rightValue: string;
  options: MetaPerformanceEntry[];
  onLeftChange: (value: string) => void;
  onRightChange: (value: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 rounded-2xl border border-gray-200 bg-gray-50/80 p-4 md:grid-cols-2">
      <ComparisonSelect
        label={leftLabel}
        value={leftValue}
        options={options}
        selectedPeer={rightValue}
        onChange={onLeftChange}
      />
      <ComparisonSelect
        label={rightLabel}
        value={rightValue}
        options={options}
        selectedPeer={leftValue}
        onChange={onRightChange}
      />
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
    <label className="rounded-2xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-600 shadow-inner shadow-white/50">
      <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
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

function RecommendationBucketCard({
  bucket,
}: {
  bucket: ReturnType<typeof buildRecommendationBuckets>[number];
}) {
  const toneClassName = bucket.tone === 'positive'
    ? 'border-emerald-200 bg-emerald-50/70'
    : bucket.tone === 'warning'
      ? 'border-amber-200 bg-amber-50/80'
      : 'border-gray-200 bg-gray-50/80';

  const metricToneClassName = bucket.tone === 'positive'
    ? 'text-emerald-700'
    : bucket.tone === 'warning'
      ? 'text-amber-700'
      : 'text-slate-700';

  const Icon = bucket.key === 'escalar' ? TrendingUp : bucket.key === 'revisar' ? TriangleAlert : Wrench;

  return (
    <div className={`rounded-2xl border p-5 shadow-[0_20px_36px_-30px_rgba(15,23,42,0.8)] ${toneClassName}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-500">
            <Icon size={14} />
            {bucket.title}
          </p>
          <h3 className="mt-2 text-lg font-bold text-gray-900">{bucket.entries.length} ads</h3>
          <p className="mt-2 text-sm text-gray-600">{bucket.description}</p>
        </div>
        <InsightBadge label={bucket.title} tone={bucket.tone} />
      </div>

      <p className="mt-3 rounded-2xl border border-white/70 bg-white/80 px-3 py-2 text-xs text-gray-600">
        {bucket.helper}
      </p>

      {bucket.entries.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-gray-200 bg-white/70 px-4 py-5 text-sm text-gray-500">
          No hay piezas para este bucket con los filtros actuales.
        </div>
      ) : (
        <ul className="mt-4 space-y-3">
          {bucket.entries.slice(0, 4).map((entry) => (
            <li key={entry.id} className="rounded-2xl border border-white/80 bg-white/90 px-4 py-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold text-gray-900">{entry.title}</p>
                  <p className="mt-1 text-xs text-gray-500">{entry.subtitle}</p>
                  <p className="mt-2 text-xs text-gray-500">Creative: {entry.creativeName}</p>
                </div>
                <div className={`shrink-0 text-right text-xs font-semibold ${metricToneClassName}`}>
                  <p>{formatCompactMetric(entry.spend, 'currency')}</p>
                  <p className="mt-1">{formatCompactMetric(entry.clicks, 'number')} clicks</p>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-gray-50/80 px-3 py-2 text-xs text-gray-600">
                <div>
                  <p className="uppercase tracking-wide text-gray-400">CTR</p>
                  <p className="mt-1 font-semibold text-gray-900">{formatCompactMetric(entry.ctr, 'percent')}</p>
                </div>
                <div>
                  <p className="uppercase tracking-wide text-gray-400">CPC</p>
                  <p className="mt-1 font-semibold text-gray-900">{formatCompactMetric(entry.cpc, 'currency')}</p>
                </div>
                <div>
                  <p className="uppercase tracking-wide text-gray-400">Imp.</p>
                  <p className="mt-1 font-semibold text-gray-900">{formatCompactMetric(entry.impressions, 'number')}</p>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
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
