import { useMemo, useState, type ReactNode } from 'react';
import {
  Activity,
  BarChart3,
  Clock3,
  Globe2,
  MessageCircle,
  MonitorSmartphone,
  PlaySquare,
  ThumbsUp,
  TrendingUp,
  Users,
} from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { formatNumberEs } from '../../lib/tableHelpers';
import { ChartCard, KpiGrid, MetaAdsFiltersPanel, MetaAdsPageHero, Section } from '../meta/ads/metaAdsShared';
import { useYoutubeAnalytics } from './useYoutubeAnalytics';
import type {
  YoutubeChannelAudienceBreakdownDailyRow,
  YoutubeChannelDemographicDailyRow,
  YoutubeVideoDailyStatsRow,
  YoutubeVideoRow,
} from './types';

type KpiMetric = {
  label: string;
  value: string;
  helper: string;
  deltaLabel: string | null;
  tone: 'positive' | 'negative' | 'neutral';
  icon: ReactNode;
};

type Totals = {
  views: number;
  likes: number;
  comments: number;
  estimatedMinutesWatched: number;
  weightedAverageViewDuration: number;
  engagementRate: number;
  activeVideos: number;
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

const TOP_DIMENSION_LIMIT = 8;
const TOP_VIDEOS_LIMIT = 8;

function safeDivide(numerator: number, denominator: number) {
  if (!denominator) return 0;
  return numerator / denominator;
}

function formatDateLabel(isoDate: string) {
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) return isoDate;
  return `${day}/${month}`;
}

function formatHours(minutes: number) {
  return `${formatNumberEs(minutes / 60)} h`;
}

function formatSeconds(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0s';
  const totalSeconds = Math.round(seconds);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (!mins) return `${secs}s`;
  return `${mins}m ${String(secs).padStart(2, '0')}s`;
}

function formatPercent(value: number) {
  return `${value.toFixed(1)}%`;
}

function normalizeLabel(raw: string) {
  const value = (raw ?? '').trim();
  if (!value) return 'N/D';
  const lower = value.toLowerCase();
  if (lower === 'unknown' || lower === 'not set' || lower === 'null' || lower === 'undefined') return 'N/D';
  return value;
}

function resolveCountryLabel(codeOrName: string) {
  const normalized = normalizeLabel(codeOrName);
  if (!/^[A-Za-z]{2}$/.test(normalized)) return normalized;

  try {
    const displayNames = new Intl.DisplayNames(['es'], { type: 'region' });
    return displayNames.of(normalized.toUpperCase()) ?? normalized.toUpperCase();
  } catch {
    return normalized.toUpperCase();
  }
}

function resolveAudienceDimensionLabel(dimensionType: string, value: string) {
  const normalized = normalizeLabel(value);

  if (dimensionType === 'country') return resolveCountryLabel(normalized);

  if (dimensionType === 'deviceType') {
    const map: Record<string, string> = {
      desktop: 'Desktop',
      mobile: 'Mobile',
      tablet: 'Tablet',
      tv: 'TV',
      game_console: 'Consola',
      unknown: 'N/D',
    };
    return map[normalized.toLowerCase()] ?? normalized;
  }

  if (dimensionType === 'subscribedStatus') {
    const map: Record<string, string> = {
      subscribed: 'Suscriptos',
      unsubscribed: 'No suscriptos',
      unknown: 'N/D',
    };
    return map[normalized.toLowerCase()] ?? normalized;
  }

  if (dimensionType === 'trafficSourceType') {
    const map: Record<string, string> = {
      yt_search: 'Búsqueda YouTube',
      suggested_video: 'Videos sugeridos',
      browse: 'Explorar',
      external: 'Externo',
      playlist: 'Playlist',
      channel: 'Canal',
      notification: 'Notificaciones',
      direct_or_unknown: 'Directo / desconocido',
    };
    return map[normalized.toLowerCase()] ?? normalized;
  }

  if (dimensionType === 'playbackLocationType') {
    const map: Record<string, string> = {
      youtube: 'Página YouTube',
      embedded: 'Embebido',
      yt_other: 'Otros de YouTube',
      mobile: 'Mobile YouTube',
      __all__: 'Total diario',
    };
    return map[normalized.toLowerCase()] ?? normalized;
  }

  return normalized;
}

function computeTotals(rows: YoutubeVideoDailyStatsRow[]): Totals {
  const uniqueVideos = new Set<string>();
  let views = 0;
  let likes = 0;
  let comments = 0;
  let estimatedMinutesWatched = 0;
  let durationWeightedSum = 0;

  for (const row of rows) {
    const rowViews = Number(row.views ?? 0);
    const rowLikes = Number(row.likes ?? 0);
    const rowComments = Number(row.comments ?? 0);
    const rowMinutes = Number(row.estimated_minutes_watched ?? 0);
    const rowAvgDuration = Number(row.average_view_duration ?? 0);

    views += rowViews;
    likes += rowLikes;
    comments += rowComments;
    estimatedMinutesWatched += rowMinutes;
    durationWeightedSum += rowAvgDuration * rowViews;

    if (rowViews > 0) {
      uniqueVideos.add(row.video_business_id);
    }
  }

  const weightedAverageViewDuration = safeDivide(durationWeightedSum, views);
  const engagementRate = safeDivide(likes + comments, views) * 100;

  return {
    views,
    likes,
    comments,
    estimatedMinutesWatched,
    weightedAverageViewDuration,
    engagementRate,
    activeVideos: uniqueVideos.size,
  };
}

function buildDelta(current: number, previous: number | null) {
  if (previous === null) {
    return {
      label: null,
      tone: 'neutral' as const,
    };
  }

  const diff = current - previous;
  const percent = previous === 0 ? null : (diff / previous) * 100;
  const sign = diff > 0 ? '+' : diff < 0 ? '−' : '';
  const pctText = percent === null ? 'n/a' : `${sign}${Math.abs(percent).toFixed(1)}%`;

  return {
    label: `${pctText} vs período anterior`,
    tone: diff > 0 ? ('positive' as const) : diff < 0 ? ('negative' as const) : ('neutral' as const),
  };
}

function aggregateDailyTrend(rows: YoutubeVideoDailyStatsRow[]) {
  const map = new Map<string, {
    date: string;
    views: number;
    likes: number;
    comments: number;
    estimatedMinutesWatched: number;
    durationWeightedSum: number;
  }>();

  for (const row of rows) {
    const key = row.stat_date;
    const current = map.get(key) ?? {
      date: key,
      views: 0,
      likes: 0,
      comments: 0,
      estimatedMinutesWatched: 0,
      durationWeightedSum: 0,
    };

    const rowViews = Number(row.views ?? 0);
    current.views += rowViews;
    current.likes += Number(row.likes ?? 0);
    current.comments += Number(row.comments ?? 0);
    current.estimatedMinutesWatched += Number(row.estimated_minutes_watched ?? 0);
    current.durationWeightedSum += Number(row.average_view_duration ?? 0) * rowViews;
    map.set(key, current);
  }

  return Array.from(map.values())
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((point) => ({
      date: point.date,
      dateLabel: formatDateLabel(point.date),
      views: point.views,
      likes: point.likes,
      comments: point.comments,
      watchHours: point.estimatedMinutesWatched / 60,
      averageViewDuration: safeDivide(point.durationWeightedSum, point.views),
      engagementRate: safeDivide(point.likes + point.comments, point.views) * 100,
    }));
}

function aggregateDemographics(rows: YoutubeChannelDemographicDailyRow[]) {
  const ageOrder = ['13-17', '18-24', '25-34', '35-44', '45-54', '55-64', '65+'];
  const map = new Map<string, { ageGroup: string; male: number; female: number; unknown: number }>();

  for (const row of rows) {
    const age = normalizeLabel(row.age_group);
    const gender = normalizeLabel(row.gender).toLowerCase();
    const current = map.get(age) ?? { ageGroup: age, male: 0, female: 0, unknown: 0 };
    const views = Number(row.views ?? 0);

    if (gender === 'male' || gender === 'm') current.male += views;
    else if (gender === 'female' || gender === 'f') current.female += views;
    else current.unknown += views;

    map.set(age, current);
  }

  return Array.from(map.values()).sort((left, right) => {
    const leftIndex = ageOrder.indexOf(left.ageGroup);
    const rightIndex = ageOrder.indexOf(right.ageGroup);
    const normalizedLeftIndex = leftIndex === -1 ? Number.MAX_SAFE_INTEGER : leftIndex;
    const normalizedRightIndex = rightIndex === -1 ? Number.MAX_SAFE_INTEGER : rightIndex;
    return normalizedLeftIndex - normalizedRightIndex;
  });
}

function aggregateDimension(
  rows: YoutubeChannelAudienceBreakdownDailyRow[],
  dimensionType: YoutubeChannelAudienceBreakdownDailyRow['dimension_type'],
) {
  const map = new Map<string, number>();

  for (const row of rows) {
    if (row.dimension_type !== dimensionType) continue;
    if (dimensionType === 'playbackLocationType' && row.dimension_value === '__all__') continue;
    const key = normalizeLabel(row.dimension_value);
    map.set(key, (map.get(key) ?? 0) + Number(row.views ?? 0));
  }

  const total = Array.from(map.values()).reduce((acc, value) => acc + value, 0);

  return Array.from(map.entries())
    .map(([value, views]) => ({
      value,
      label: resolveAudienceDimensionLabel(dimensionType, value),
      views,
      share: safeDivide(views, total) * 100,
    }))
    .sort((left, right) => right.views - left.views)
    .slice(0, TOP_DIMENSION_LIMIT);
}

function aggregateTopVideos(rows: YoutubeVideoDailyStatsRow[], videos: YoutubeVideoRow[]) {
  const videoMetaMap = new Map(videos.map((video) => [video.business_id, video]));
  const map = new Map<string, {
    videoId: string;
    title: string;
    thumbnailUrl: string | null;
    views: number;
    likes: number;
    comments: number;
    estimatedMinutesWatched: number;
    durationWeightedSum: number;
    definition: string;
  }>();

  for (const row of rows) {
    const videoId = row.video_business_id;
    const metadata = videoMetaMap.get(videoId);
    const current = map.get(videoId) ?? {
      videoId,
      title: metadata?.title?.trim() || videoId,
      thumbnailUrl: metadata?.thumbnail_url ?? null,
      views: 0,
      likes: 0,
      comments: 0,
      estimatedMinutesWatched: 0,
      durationWeightedSum: 0,
      definition: metadata?.definition ?? 'N/D',
    };

    const rowViews = Number(row.views ?? 0);
    current.views += rowViews;
    current.likes += Number(row.likes ?? 0);
    current.comments += Number(row.comments ?? 0);
    current.estimatedMinutesWatched += Number(row.estimated_minutes_watched ?? 0);
    current.durationWeightedSum += Number(row.average_view_duration ?? 0) * rowViews;
    map.set(videoId, current);
  }

  return Array.from(map.values())
    .map((video) => ({
      ...video,
      averageViewDuration: safeDivide(video.durationWeightedSum, video.views),
      engagementRate: safeDivide(video.likes + video.comments, video.views) * 100,
    }))
    .sort((left, right) => right.views - left.views)
    .slice(0, TOP_VIDEOS_LIMIT);
}

function buildDefinitionBreakdown(topVideos: Array<{ definition: string; views: number }>) {
  const map = new Map<string, number>();

  for (const row of topVideos) {
    const key = normalizeLabel(row.definition).toUpperCase();
    map.set(key, (map.get(key) ?? 0) + row.views);
  }

  return Array.from(map.entries())
    .map(([definition, views]) => ({ definition, views }))
    .sort((left, right) => right.views - left.views);
}

function EmptyChartState({ message }: { message: string }) {
  return (
    <div className="flex h-[260px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-6 text-center text-sm text-gray-500">
      {message}
    </div>
  );
}

function YoutubeKpiCard({ metric }: { metric: KpiMetric }) {
  const toneClassName = metric.tone === 'positive'
    ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
    : metric.tone === 'negative'
      ? 'border-red-200 bg-red-50 text-red-700'
      : 'border-gray-200 bg-gray-100 text-gray-600';

  return (
    <div className="bg-white p-4 rounded-2xl border border-gray-200 shadow-[0_20px_42px_-34px_rgba(15,23,42,0.9)]">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">{metric.label}</p>
          <p className="text-2xl font-bold text-gray-900 mt-1">{metric.value}</p>
          <p className="text-xs text-gray-500 mt-2">{metric.helper}</p>
          {metric.deltaLabel ? (
            <span className={`mt-2 inline-flex rounded-full border px-2.5 py-1 text-[11px] font-semibold ${toneClassName}`}>
              {metric.deltaLabel}
            </span>
          ) : null}
        </div>
        <div className="h-10 w-10 rounded-xl bg-red-50 border border-red-100 flex items-center justify-center">
          {metric.icon}
        </div>
      </div>
    </div>
  );
}

export function YouTubeDashboard() {
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');

  const isFiltersDirty = dateFrom !== draftDateFrom || dateTo !== draftDateTo;
  const youtubeQuery = useYoutubeAnalytics({ dateFrom, dateTo });

  const channels = useMemo(() => youtubeQuery.data?.channels ?? [], [youtubeQuery.data?.channels]);
  const videos = useMemo(() => youtubeQuery.data?.videos ?? [], [youtubeQuery.data?.videos]);
  const demographicsDaily = useMemo(() => youtubeQuery.data?.demographicsDaily ?? [], [youtubeQuery.data?.demographicsDaily]);
  const audienceBreakdownsDaily = useMemo(
    () => youtubeQuery.data?.audienceBreakdownsDaily ?? [],
    [youtubeQuery.data?.audienceBreakdownsDaily],
  );
  const videoDailyStats = useMemo(() => youtubeQuery.data?.videoDailyStats ?? [], [youtubeQuery.data?.videoDailyStats]);
  const previousVideoDailyStats = useMemo(
    () => youtubeQuery.data?.previousVideoDailyStats ?? [],
    [youtubeQuery.data?.previousVideoDailyStats],
  );

  const latestChannel = channels[0] ?? null;
  const totals = useMemo(() => computeTotals(videoDailyStats), [videoDailyStats]);
  const previousTotals = useMemo(
    () => (previousVideoDailyStats.length ? computeTotals(previousVideoDailyStats) : null),
    [previousVideoDailyStats],
  );

  const kpiMetrics = useMemo<KpiMetric[]>(() => {
    const viewsDelta = buildDelta(totals.views, previousTotals?.views ?? null);
    const likesDelta = buildDelta(totals.likes, previousTotals?.likes ?? null);
    const commentsDelta = buildDelta(totals.comments, previousTotals?.comments ?? null);
    const watchTimeDelta = buildDelta(totals.estimatedMinutesWatched, previousTotals?.estimatedMinutesWatched ?? null);
    const durationDelta = buildDelta(totals.weightedAverageViewDuration, previousTotals?.weightedAverageViewDuration ?? null);
    const engagementDelta = buildDelta(totals.engagementRate, previousTotals?.engagementRate ?? null);
    const activeVideosDelta = buildDelta(totals.activeVideos, previousTotals?.activeVideos ?? null);

    return [
      {
        label: 'Views del período',
        value: formatNumberEs(totals.views),
        helper: 'Suma de views de youtube_video_daily_stats',
        deltaLabel: viewsDelta.label,
        tone: viewsDelta.tone,
        icon: <TrendingUp className="text-red-600" size={18} />,
      },
      {
        label: 'Watch time',
        value: formatHours(totals.estimatedMinutesWatched),
        helper: 'Horas estimadas vistas',
        deltaLabel: watchTimeDelta.label,
        tone: watchTimeDelta.tone,
        icon: <Clock3 className="text-red-600" size={18} />,
      },
      {
        label: 'Avg view duration',
        value: formatSeconds(totals.weightedAverageViewDuration),
        helper: 'Promedio ponderado por views',
        deltaLabel: durationDelta.label,
        tone: durationDelta.tone,
        icon: <PlaySquare className="text-red-600" size={18} />,
      },
      {
        label: 'Engagement rate',
        value: formatPercent(totals.engagementRate),
        helper: '(Likes + comentarios) / views',
        deltaLabel: engagementDelta.label,
        tone: engagementDelta.tone,
        icon: <Users className="text-red-600" size={18} />,
      },
      {
        label: 'Likes',
        value: formatNumberEs(totals.likes),
        helper: 'Interacciones positivas',
        deltaLabel: likesDelta.label,
        tone: likesDelta.tone,
        icon: <ThumbsUp className="text-red-600" size={18} />,
      },
      {
        label: 'Comentarios',
        value: formatNumberEs(totals.comments),
        helper: 'Interacciones escritas',
        deltaLabel: commentsDelta.label,
        tone: commentsDelta.tone,
        icon: <MessageCircle className="text-red-600" size={18} />,
      },
      {
        label: 'Videos activos',
        value: formatNumberEs(totals.activeVideos),
        helper: 'Videos con views en el rango',
        deltaLabel: activeVideosDelta.label,
        tone: activeVideosDelta.tone,
        icon: <BarChart3 className="text-red-600" size={18} />,
      },
      {
        label: 'Suscriptores actuales',
        value: formatNumberEs(Number(latestChannel?.subscriber_count ?? 0)),
        helper: `Snapshot canal: ${latestChannel?.title ?? 'Canal principal'}`,
        deltaLabel: null,
        tone: 'neutral',
        icon: <Users className="text-red-600" size={18} />,
      },
    ];
  }, [latestChannel?.subscriber_count, latestChannel?.title, previousTotals, totals]);

  const trend = useMemo(() => aggregateDailyTrend(videoDailyStats), [videoDailyStats]);
  const demographics = useMemo(() => aggregateDemographics(demographicsDaily), [demographicsDaily]);
  const topCountries = useMemo(() => aggregateDimension(audienceBreakdownsDaily, 'country'), [audienceBreakdownsDaily]);
  const topDevices = useMemo(() => aggregateDimension(audienceBreakdownsDaily, 'deviceType'), [audienceBreakdownsDaily]);
  const topTrafficSources = useMemo(() => aggregateDimension(audienceBreakdownsDaily, 'trafficSourceType'), [audienceBreakdownsDaily]);
  const topPlaybackLocations = useMemo(
    () => aggregateDimension(audienceBreakdownsDaily, 'playbackLocationType'),
    [audienceBreakdownsDaily],
  );
  const subscribedStatus = useMemo(() => aggregateDimension(audienceBreakdownsDaily, 'subscribedStatus'), [audienceBreakdownsDaily]);
  const topVideos = useMemo(() => aggregateTopVideos(videoDailyStats, videos), [videoDailyStats, videos]);
  const definitionBreakdown = useMemo(() => buildDefinitionBreakdown(topVideos), [topVideos]);

  if (youtubeQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mr-3"></div>
        Cargando apartado de YouTube Dashboard...
      </div>
    );
  }

  if (youtubeQuery.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500 space-y-4 rounded-2xl border border-red-200 bg-red-50/60 p-8">
        <Activity size={48} />
        <p className="text-lg font-medium">Error al cargar YouTube Dashboard</p>
        <p className="text-sm text-red-400 max-w-xl text-center">
          {youtubeQuery.error instanceof Error ? youtubeQuery.error.message : 'Error desconocido'}
        </p>
      </div>
    );
  }

  const hasNoData = !videoDailyStats.length && !audienceBreakdownsDaily.length && !demographicsDaily.length;

  return (
    <div className="space-y-6">
      <MetaAdsPageHero
        title="YouTube Dashboard"
        description="KPIs ejecutivos, comparativas de período, tendencias y performance de videos en un solo lugar."
        icon={<PlaySquare className="text-red-600" size={24} />}
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

      {hasNoData ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-10 text-center text-sm text-gray-500">
          No hay datos de YouTube para el rango seleccionado. Ajustá fechas o verificá la última sincronización.
        </div>
      ) : (
        <>
          <Section title="KPI ejecutivos">
            <KpiGrid>
              {kpiMetrics.map((metric) => (
                <YoutubeKpiCard key={metric.label} metric={metric} />
              ))}
            </KpiGrid>
          </Section>

          <Section title="Tendencia y engagement">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChartCard title="Evolución diaria · Views, likes y comentarios" icon={<TrendingUp size={16} className="text-red-600" />}>
                {trend.length ? (
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="dateLabel" tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <Tooltip {...chartTooltipStyle} />
                        <Line type="monotone" dataKey="views" stroke="#dc2626" strokeWidth={2.4} dot={false} name="Views" />
                        <Line type="monotone" dataKey="likes" stroke="#f59e0b" strokeWidth={2} dot={false} name="Likes" />
                        <Line type="monotone" dataKey="comments" stroke="#2563eb" strokeWidth={2} dot={false} name="Comentarios" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyChartState message="Sin datos diarios de rendimiento en el rango seleccionado." />
                )}
              </ChartCard>

              <ChartCard title="Calidad de visualización · Retención y watch hours" icon={<Clock3 size={16} className="text-red-600" />}>
                {trend.length ? (
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={trend} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="dateLabel" tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <YAxis yAxisId="left" tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <Tooltip {...chartTooltipStyle} />
                        <Line yAxisId="left" type="monotone" dataKey="watchHours" stroke="#dc2626" strokeWidth={2.4} dot={false} name="Watch hours" />
                        <Line yAxisId="right" type="monotone" dataKey="averageViewDuration" stroke="#7c3aed" strokeWidth={2} dot={false} name="Duración promedio (s)" />
                        <Line yAxisId="right" type="monotone" dataKey="engagementRate" stroke="#16a34a" strokeWidth={2} dot={false} name="Engagement (%)" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyChartState message="Sin datos para calcular watch time, retención y engagement." />
                )}
              </ChartCard>
            </div>
          </Section>

          <Section title="Audiencia y distribución">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChartCard title="Demografía por edad y género" icon={<Users size={16} className="text-red-600" />}>
                {demographics.length ? (
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={demographics} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="ageGroup" tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <Tooltip {...chartTooltipStyle} />
                        <Bar dataKey="male" stackId="gender" fill="#dc2626" name="Masculino" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="female" stackId="gender" fill="#f59e0b" name="Femenino" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="unknown" stackId="gender" fill="#6b7280" name="N/D" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyChartState message="No hay datos demográficos para el rango seleccionado." />
                )}
              </ChartCard>

              <ChartCard title="Origen de audiencia · países top" icon={<Globe2 size={16} className="text-red-600" />}>
                {topCountries.length ? (
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topCountries} layout="vertical" margin={{ top: 8, right: 12, left: 40, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <YAxis type="category" dataKey="label" width={120} tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <Tooltip {...chartTooltipStyle} />
                        <Bar dataKey="views" fill="#dc2626" name="Views" radius={[0, 8, 8, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyChartState message="No se registraron vistas por país en el rango actual." />
                )}
              </ChartCard>

              <ChartCard title="Dispositivos" icon={<MonitorSmartphone size={16} className="text-red-600" />}>
                {topDevices.length ? (
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={topDevices} dataKey="views" nameKey="label" cx="50%" cy="50%" outerRadius={108} labelLine={false} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                          {topDevices.map((_, index) => (
                            <Cell key={`device-${index}`} fill={['#dc2626', '#f59e0b', '#2563eb', '#7c3aed', '#14b8a6'][index % 5]} />
                          ))}
                        </Pie>
                        <Tooltip {...chartTooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyChartState message="No hay dimensión de dispositivos para el período." />
                )}
              </ChartCard>

              <ChartCard title="Fuentes de tráfico" icon={<TrendingUp size={16} className="text-red-600" />}>
                {topTrafficSources.length ? (
                  <div className="space-y-2">
                    {topTrafficSources.map((source) => (
                      <div key={source.value} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2">
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-sm font-semibold text-gray-700">{source.label}</p>
                          <p className="text-sm font-bold text-gray-900">{formatPercent(source.share)}</p>
                        </div>
                        <div className="mt-2 h-2.5 w-full rounded-full bg-gray-200">
                          <div className="h-2.5 rounded-full bg-red-600" style={{ width: `${Math.min(100, source.share)}%` }} />
                        </div>
                        <p className="mt-1 text-[11px] text-gray-500">{formatNumberEs(source.views)} views</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyChartState message="No hay tráfico fuente disponible para el período." />
                )}
              </ChartCard>

              <ChartCard title="Playback location" icon={<PlaySquare size={16} className="text-red-600" />}>
                {topPlaybackLocations.length ? (
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topPlaybackLocations} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="label" tick={{ fontSize: 11, fill: '#6b7280' }} interval={0} angle={-12} textAnchor="end" height={70} />
                        <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <Tooltip {...chartTooltipStyle} />
                        <Bar dataKey="views" fill="#dc2626" name="Views" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyChartState message="Sin datos de playback location en el período." />
                )}
              </ChartCard>

              <ChartCard title="Suscripción de audiencia" icon={<Users size={16} className="text-red-600" />}>
                {subscribedStatus.length ? (
                  <div className="h-[320px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={subscribedStatus} dataKey="views" nameKey="label" cx="50%" cy="50%" outerRadius={108} labelLine={false} label={({ name, percent }) => `${name} ${((percent ?? 0) * 100).toFixed(0)}%`}>
                          {subscribedStatus.map((_, index) => (
                            <Cell key={`subscribed-${index}`} fill={['#dc2626', '#2563eb', '#6b7280'][index % 3]} />
                          ))}
                        </Pie>
                        <Tooltip {...chartTooltipStyle} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyChartState message="No se registró breakdown de suscripción en el rango." />
                )}
              </ChartCard>
            </div>
          </Section>

          <Section title="Performance de videos">
            <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
              <ChartCard title="Top videos por views" icon={<BarChart3 size={16} className="text-red-600" />}>
                {topVideos.length ? (
                  <div className="h-[360px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={topVideos} layout="vertical" margin={{ top: 8, right: 14, left: 38, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis type="number" tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <YAxis
                          type="category"
                          width={140}
                          dataKey="title"
                          tick={{ fontSize: 11, fill: '#6b7280' }}
                          tickFormatter={(value: string) => (value.length > 28 ? `${value.slice(0, 28)}…` : value)}
                        />
                        <Tooltip {...chartTooltipStyle} />
                        <Bar dataKey="views" fill="#dc2626" radius={[0, 8, 8, 0]} name="Views" />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyChartState message="No hay videos con rendimiento en el rango seleccionado." />
                )}
              </ChartCard>

              <ChartCard title="Detalle ejecutivo · top videos" icon={<PlaySquare size={16} className="text-red-600" />}>
                {topVideos.length ? (
                  <div className="space-y-3">
                    {topVideos.map((video) => (
                      <article key={video.videoId} className="rounded-xl border border-gray-200 bg-gray-50/80 p-3">
                        <div className="flex items-start gap-3">
                          {video.thumbnailUrl ? (
                            <img
                              src={video.thumbnailUrl}
                              alt={video.title}
                              className="h-14 w-24 rounded-lg object-cover border border-gray-200"
                              loading="lazy"
                            />
                          ) : (
                            <div className="flex h-14 w-24 items-center justify-center rounded-lg border border-dashed border-gray-300 text-xs text-gray-500">
                              Sin thumbnail
                            </div>
                          )}

                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-semibold text-gray-900 line-clamp-2">{video.title}</p>
                            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] text-gray-600">
                              <span>Views: {formatNumberEs(video.views)}</span>
                              <span>Likes: {formatNumberEs(video.likes)}</span>
                              <span>Comentarios: {formatNumberEs(video.comments)}</span>
                              <span>ER: {formatPercent(video.engagementRate)}</span>
                              <span>Watch time: {formatHours(video.estimatedMinutesWatched)}</span>
                              <span>Avg duration: {formatSeconds(video.averageViewDuration)}</span>
                            </div>
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <EmptyChartState message="Sin detalle de videos para mostrar." />
                )}
              </ChartCard>

              <ChartCard title="Definición de video (Top views)" icon={<PlaySquare size={16} className="text-red-600" />}>
                {definitionBreakdown.length ? (
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={definitionBreakdown} margin={{ top: 8, right: 12, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="definition" tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} />
                        <Tooltip {...chartTooltipStyle} />
                        <Bar dataKey="views" fill="#dc2626" radius={[8, 8, 0, 0]}>
                          {definitionBreakdown.map((entry, index) => (
                            <Cell key={`${entry.definition}-${index}`} fill={index === 0 ? '#dc2626' : '#f59e0b'} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : (
                  <EmptyChartState message="No hay suficiente data para analizar definición de video." />
                )}
              </ChartCard>

              <ChartCard title="Estado del inventario de contenido" icon={<PlaySquare size={16} className="text-red-600" />}>
                <div className="space-y-3">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Videos catalogados</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{formatNumberEs(videos.length)}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Videos activos en rango</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{formatNumberEs(totals.activeVideos)}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-[0.08em] text-gray-500">Vistas acumuladas del canal (snapshot)</p>
                    <p className="mt-1 text-xl font-bold text-gray-900">{formatNumberEs(Number(latestChannel?.view_count ?? 0))}</p>
                    <p className="mt-1 text-[11px] text-gray-500">Fuente: youtube_channels.view_count</p>
                  </div>
                </div>
              </ChartCard>
            </div>
          </Section>
        </>
      )}
    </div>
  );
}
