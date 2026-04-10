import { useMemo, useState } from 'react';
import { Activity, BarChart3, LineChart as LineChartIcon, MousePointerClick, SplitSquareHorizontal } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumberEs } from '../../../lib/tableHelpers';
import { ChartCard, KpiCard, KpiGrid, MetaAdsFiltersPanel, MetaAdsPageHero, Section } from '../ads/metaAdsShared';
import { useMetaAdsReporting } from '../ads/useMetaAdsReporting';
import { useMetaPagesData } from '../pages/useMetaPagesData';

type ComparePoint = {
  date: string;
  ads_clicks: number;
  organic_clicks: number;
  ads_impressions: number;
  organic_impressions: number;
};

const chartTooltipStyle = {
  contentStyle: {
    borderRadius: '10px',
    border: '1px solid #d1d5db',
    backgroundColor: '#f9fafb',
    boxShadow: '0 8px 16px -12px rgba(15,23,42,0.35)',
    padding: '6px 8px',
  },
  labelStyle: {
    color: '#374151',
    fontWeight: 600,
    fontSize: 12,
  },
  itemStyle: {
    color: '#374151',
    fontWeight: 500,
    fontSize: 12,
  },
  cursor: {
    fill: 'rgba(107,114,128,0.08)',
  },
} as const;

export function MetaAdsOrganicDashboard() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');

  const adsQuery = useMetaAdsReporting({
    accountId: '',
    campaignId: '',
    adId: '',
    dateFrom,
    dateTo,
  });
  const organicQuery = useMetaPagesData({
    since: dateFrom,
    until: dateTo,
  });

  const isFiltersDirty = dateFrom !== draftDateFrom || dateTo !== draftDateTo;

  const compareByDate = useMemo<ComparePoint[]>(() => {
    const adsRows = adsQuery.data?.rows ?? [];
    const organicPosts = organicQuery.data?.posts ?? [];
    const snapshots = organicQuery.data?.post_insights_snapshots ?? [];

    const latestByPostMetric = new Map<string, number>();
    for (const snapshot of snapshots) {
      const key = `${snapshot.post_id}:${snapshot.metric}`;
      const current = latestByPostMetric.get(key) ?? 0;
      if (snapshot.value > current) {
        latestByPostMetric.set(key, snapshot.value);
      }
    }

    const byDate = new Map<string, ComparePoint>();

    for (const row of adsRows) {
      const date = row.date_start;
      if (!date) continue;
      const current = byDate.get(date) ?? {
        date,
        ads_clicks: 0,
        organic_clicks: 0,
        ads_impressions: 0,
        organic_impressions: 0,
      };
      current.ads_clicks += Number(row.clicks ?? 0);
      current.ads_impressions += Number(row.impressions ?? 0);
      byDate.set(date, current);
    }

    for (const post of organicPosts) {
      const date = (post.created_time ?? '').slice(0, 10);
      if (!date) continue;
      const current = byDate.get(date) ?? {
        date,
        ads_clicks: 0,
        organic_clicks: 0,
        ads_impressions: 0,
        organic_impressions: 0,
      };
      current.organic_clicks += latestByPostMetric.get(`${post.id}:post_clicks`) ?? 0;
      current.organic_impressions += latestByPostMetric.get(`${post.id}:post_impressions`) ?? 0;
      byDate.set(date, current);
    }

    return Array.from(byDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [adsQuery.data?.rows, organicQuery.data?.post_insights_snapshots, organicQuery.data?.posts]);

  const totals = useMemo(() => {
    return compareByDate.reduce(
      (acc, row) => ({
        adsClicks: acc.adsClicks + row.ads_clicks,
        organicClicks: acc.organicClicks + row.organic_clicks,
        adsImpressions: acc.adsImpressions + row.ads_impressions,
        organicImpressions: acc.organicImpressions + row.organic_impressions,
      }),
      { adsClicks: 0, organicClicks: 0, adsImpressions: 0, organicImpressions: 0 },
    );
  }, [compareByDate]);

  const isLoading = adsQuery.isLoading || organicQuery.isLoading;
  const error = adsQuery.error ?? organicQuery.error;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mr-3"></div>
        Cargando comparativo Ads vs Orgánico...
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500 space-y-4">
        <Activity size={48} />
        <p className="text-lg font-medium">Error al cargar Ads vs Orgánico</p>
        <p className="text-sm text-red-400 max-w-xl text-center">
          {error instanceof Error ? error.message : 'Error desconocido'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MetaAdsPageHero
        title="Ads vs Orgánico"
        description="Comparativa diaria entre rendimiento de Ads y publicaciones orgánicas."
        icon={<SplitSquareHorizontal className="text-red-600" size={24} />}
      />

      <MetaAdsFiltersPanel
        draftDateFrom={draftDateFrom}
        draftDateTo={draftDateTo}
        onDraftDateFromChange={setDraftDateFrom}
        onDraftDateToChange={setDraftDateTo}
        onApply={() => {
          setDateFrom(draftDateFrom);
          setDateTo(draftDateTo);
        }}
        onClear={() => {
          setDateFrom('');
          setDateTo('');
          setDraftDateFrom('');
          setDraftDateTo('');
        }}
        isApplyDisabled={!isFiltersDirty}
      />

      <Section title="KPI comparativos">
        <KpiGrid>
          <KpiCard title="Clicks Ads" value={formatNumberEs(Math.round(totals.adsClicks))} helper="Total del periodo" icon={<MousePointerClick className="text-red-600" size={18} />} />
          <KpiCard title="Clicks Orgánico" value={formatNumberEs(Math.round(totals.organicClicks))} helper="Total del periodo" icon={<MousePointerClick className="text-red-600" size={18} />} />
          <KpiCard title="Impresiones Ads" value={formatNumberEs(Math.round(totals.adsImpressions))} helper="Total del periodo" icon={<BarChart3 className="text-red-600" size={18} />} />
          <KpiCard title="Impresiones Orgánico" value={formatNumberEs(Math.round(totals.organicImpressions))} helper="Total del periodo" icon={<LineChartIcon className="text-red-600" size={18} />} />
        </KpiGrid>
      </Section>

      <Section title="1) Clicks por día (líneas)">
        <ChartCard title="Ads vs Orgánico · Clicks" icon={<LineChartIcon size={16} className="text-red-600" />}>
          {compareByDate.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
              Sin datos para este rango.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={compareByDate}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip {...chartTooltipStyle} />
                <Line type="monotone" dataKey="ads_clicks" name="Clicks Ads" stroke="#dc2626" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="organic_clicks" name="Clicks Orgánico" stroke="#2563eb" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </Section>

      <Section title="2) Impresiones Ads vs Impresiones Orgánico por día (líneas)">
        <ChartCard title="Ads vs Orgánico · Impresiones" icon={<BarChart3 size={16} className="text-red-600" />}>
          {compareByDate.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
              Sin datos para este rango.
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={compareByDate}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip {...chartTooltipStyle} />
                <Line type="monotone" dataKey="ads_impressions" name="Impresiones Ads" stroke="#dc2626" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="organic_impressions" name="Impresiones Orgánico" stroke="#059669" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </Section>

      <Section title="3) Comparativa total (barras)">
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          <ChartCard title="Total Clicks · Ads vs Orgánico" icon={<BarChart3 size={16} className="text-red-600" />}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={[{ label: 'Clicks', ads: totals.adsClicks, organico: totals.organicClicks }]}> 
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip {...chartTooltipStyle} />
                <Bar dataKey="ads" name="Ads" fill="#dc2626" radius={[8, 8, 0, 0]} />
                <Bar dataKey="organico" name="Orgánico" fill="#2563eb" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title="Total Impresiones · Ads vs Orgánico" icon={<BarChart3 size={16} className="text-red-600" />}>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={[{ label: 'Impresiones', ads: totals.adsImpressions, organico: totals.organicImpressions }]}> 
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip {...chartTooltipStyle} />
                <Bar dataKey="ads" name="Ads" fill="#dc2626" radius={[8, 8, 0, 0]} />
                <Bar dataKey="organico" name="Orgánico" fill="#059669" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </Section>
    </div>
  );
}
