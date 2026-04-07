import { useMemo, useState } from 'react';
import { Activity, BadgeDollarSign, BarChart3, LineChart as LineChartIcon, Megaphone, MousePointerClick, PieChart as PieChartIcon, Target } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumberEs } from '../../../lib/tableHelpers';
import { ChartCard, KpiCard, KpiGrid, LeaderboardList, MetaAdsFiltersPanel, MetaAdsPageHero, Section } from './metaAdsShared';
import { aggregateBreakdown, aggregateLeaderboard, aggregateTrendRows, formatCompactMetric, safeDivide, sumBy } from './metaAdsUtils';
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
          <KpiCard title="Spend total" value={formatCompactMetric(dashboard.totalSpend, 'currency')} helper="Inversión agregada del rango" icon={<BadgeDollarSign className="text-red-600" size={18} />} />
          <KpiCard title="Impresiones" value={formatCompactMetric(dashboard.totalImpressions, 'number')} helper="Volumen total servido" icon={<Megaphone className="text-red-600" size={18} />} />
          <KpiCard title="Reach" value={formatCompactMetric(dashboard.totalReach, 'number')} helper="Usuarios alcanzados" icon={<Activity className="text-red-600" size={18} />} />
          <KpiCard title="Clicks" value={formatCompactMetric(dashboard.totalClicks, 'number')} helper="Interacciones principales" icon={<MousePointerClick className="text-red-600" size={18} />} />
          <KpiCard title="CTR global" value={formatCompactMetric(dashboard.overallCtr, 'percent')} helper="Clicks / impresiones" icon={<Target className="text-red-600" size={18} />} />
          <KpiCard title="CPC global" value={formatCompactMetric(dashboard.overallCpc, 'currency')} helper="Spend / clicks" icon={<BadgeDollarSign className="text-red-600" size={18} />} />
          <KpiCard title="Campañas con data" value={formatNumberEs(dashboard.totalCampaigns)} helper="Campañas únicas en el rango" icon={<BarChart3 className="text-red-600" size={18} />} />
          <KpiCard title="Ads con data" value={formatNumberEs(dashboard.totalAds)} helper={`${formatNumberEs(dashboard.totalAdsets)} ad sets únicos`} icon={<Megaphone className="text-red-600" size={18} />} />
        </KpiGrid>
      </Section>

      <Section title="Tendencias y composición">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Tendencia diaria de spend" icon={<LineChartIcon size={16} className="text-red-600" />}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={dashboard.trend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date_start" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCompactMetric(Number(value ?? 0), 'currency')} />
                <Line type="monotone" dataKey="spend" name="Spend" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 2 }} />
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Spend por objetivo" icon={<PieChartIcon size={16} className="text-red-600" />}>
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
          <ChartCard title="Campañas con mayor spend" icon={<BarChart3 size={16} className="text-red-600" />}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={dashboard.topCampaigns}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="title" tick={{ fontSize: 12 }} interval={0} angle={-15} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(value) => formatCompactMetric(Number(value ?? 0), 'currency')} />
                <Bar dataKey="spend" name="Spend" fill="#dc2626" radius={[8, 8, 0, 0]} />
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

      {dashboard.trend.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-500">
          No hay datos synced para los filtros actuales. Probá limpiarlos o lanzar un nuevo sync para esta cuenta.
        </div>
      ) : null}
    </div>
  );
}
