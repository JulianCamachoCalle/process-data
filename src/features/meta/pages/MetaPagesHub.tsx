import { useMemo, useState } from 'react';
import { Activity, BarChart3, BookImage, Eye, FileText, MessageSquare, MousePointerClick, Share2, ThumbsUp } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumberEs } from '../../../lib/tableHelpers';
import { ChartCard, KpiCard, KpiGrid, MetaAdsFiltersPanel, MetaAdsPageHero, Section } from '../ads/metaAdsShared';
import { useMetaPagesData } from './useMetaPagesData';

type EnrichedPost = {
  id: string;
  page_id: string;
  page_name: string | null;
  message: string | null;
  created_time: string | null;
  permalink_url: string | null;
  full_picture: string | null;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
  views: number;
  video_views: number;
  retention: number;
};

type PostMetricTrendPoint = {
  date: string;
  reactions: number;
  comments: number;
  shares: number;
  clicks: number;
  views: number;
  video_views: number;
  avg_retention: number;
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

export function MetaPagesDashboard() {
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [draftSince, setDraftSince] = useState(since);
  const [draftUntil, setDraftUntil] = useState(until);

  const pagesQuery = useMetaPagesData({ since, until });
  const isFiltersDirty = since !== draftSince || until !== draftUntil;

  const pages = useMemo(() => pagesQuery.data?.pages ?? [], [pagesQuery.data?.pages]);
  const posts = useMemo(() => pagesQuery.data?.posts ?? [], [pagesQuery.data?.posts]);
  const postInsightSnapshots = useMemo(
    () => pagesQuery.data?.post_insights_snapshots ?? [],
    [pagesQuery.data?.post_insights_snapshots],
  );
  const errors = pagesQuery.data?.errors ?? [];

  const topPages = useMemo(() => {
    return [...pages]
      .sort((a, b) => (b.followers_count || b.fan_count) - (a.followers_count || a.fan_count))
      .slice(0, 8);
  }, [pages]);

  const enrichedPosts = useMemo<EnrichedPost[]>(() => {
    const latestByPostMetric = new Map<string, number>();

    for (const snapshot of postInsightSnapshots) {
      const key = `${snapshot.post_id}:${snapshot.metric}`;
      const current = latestByPostMetric.get(key) ?? 0;
      if (snapshot.value > current) {
        latestByPostMetric.set(key, snapshot.value);
      }
    }

    return posts.map((post) => ({
      ...post,
      clicks: latestByPostMetric.get(`${post.id}:post_clicks`) ?? 0,
      views: latestByPostMetric.get(`${post.id}:post_impressions`) ?? 0,
      video_views: latestByPostMetric.get(`${post.id}:post_video_views`) ?? 0,
      retention: (() => {
        const impressions = latestByPostMetric.get(`${post.id}:post_impressions`) ?? 0;
        const videoViews = latestByPostMetric.get(`${post.id}:post_video_views`) ?? 0;
        if (!impressions) return 0;
        return (videoViews * 100) / impressions;
      })(),
    }));
  }, [posts, postInsightSnapshots]);

  const topByReactions = useMemo(
    () => [...enrichedPosts].sort((a, b) => b.reactions - a.reactions).slice(0, 5),
    [enrichedPosts],
  );
  const topByComments = useMemo(
    () => [...enrichedPosts].sort((a, b) => b.comments - a.comments).slice(0, 5),
    [enrichedPosts],
  );
  const topByShares = useMemo(
    () => [...enrichedPosts].sort((a, b) => b.shares - a.shares).slice(0, 5),
    [enrichedPosts],
  );
  const topByClicks = useMemo(
    () => [...enrichedPosts].sort((a, b) => b.clicks - a.clicks).slice(0, 5),
    [enrichedPosts],
  );
  const topByViews = useMemo(
    () => [...enrichedPosts].sort((a, b) => b.views - a.views).slice(0, 5),
    [enrichedPosts],
  );

  const trendByPostDate = useMemo<PostMetricTrendPoint[]>(() => {
    const grouped = new Map<string, PostMetricTrendPoint>();

    for (const post of enrichedPosts) {
      const date = (post.created_time ?? '').slice(0, 10);
      if (!date) continue;

      const current = grouped.get(date) ?? {
        date,
        reactions: 0,
        comments: 0,
        shares: 0,
        clicks: 0,
        views: 0,
        video_views: 0,
        avg_retention: 0,
      };

      current.reactions += post.reactions;
      current.comments += post.comments;
      current.shares += post.shares;
      current.clicks += post.clicks;
      current.views += post.views;
      current.video_views += post.video_views;
      current.avg_retention = current.views > 0 ? (current.video_views * 100) / current.views : 0;
      grouped.set(date, current);
    }

    return Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [enrichedPosts]);

  const totals = useMemo(() => {
    return {
      totalFollowers: pages.reduce((acc, page) => acc + (page.followers_count || 0), 0),
      totalPosts: posts.length,
      totalReactions: enrichedPosts.reduce((acc, post) => acc + post.reactions, 0),
      totalComments: enrichedPosts.reduce((acc, post) => acc + post.comments, 0),
      totalShares: enrichedPosts.reduce((acc, post) => acc + post.shares, 0),
      totalClicks: enrichedPosts.reduce((acc, post) => acc + post.clicks, 0),
      totalViews: enrichedPosts.reduce((acc, post) => acc + post.views, 0),
      totalVideoViews: enrichedPosts.reduce((acc, post) => acc + post.video_views, 0),
    };
  }, [enrichedPosts, pages, posts.length]);

  if (pagesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mr-3"></div>
        Cargando apartado de Pages Dashboard...
      </div>
    );
  }

  if (pagesQuery.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500 space-y-4">
        <Activity size={48} />
        <p className="text-lg font-medium">Error al cargar Pages Dashboard</p>
        <p className="text-sm text-red-400 max-w-xl text-center">
          {pagesQuery.error instanceof Error ? pagesQuery.error.message : 'Error desconocido'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MetaAdsPageHero
        title="Pages Dashboard"
        description="Explorer + top posts por métrica + tendencias de publicaciones."
        icon={<BookImage className="text-red-600" size={24} />}
      />

      <MetaAdsFiltersPanel
        draftDateFrom={draftSince}
        draftDateTo={draftUntil}
        onDraftDateFromChange={setDraftSince}
        onDraftDateToChange={setDraftUntil}
        onApply={() => {
          setSince(draftSince);
          setUntil(draftUntil);
        }}
        onClear={() => {
          setSince('');
          setUntil('');
          setDraftSince('');
          setDraftUntil('');
        }}
        isApplyDisabled={!isFiltersDirty}
      />

      <Section title="KPI (Pages)">
        <KpiGrid>
          <KpiCard title="Seguidores" value={formatNumberEs(totals.totalFollowers)} helper="Total de seguidores" icon={<Eye className="text-red-600" size={18} />} />
          <KpiCard title="Posts" value={formatNumberEs(totals.totalPosts)} helper="Publicaciones del rango" icon={<FileText className="text-red-600" size={18} />} />
          <KpiCard title="Reacciones" value={formatNumberEs(totals.totalReactions)} helper="Total acumulado" icon={<ThumbsUp className="text-red-600" size={18} />} />
          <KpiCard title="Comentarios" value={formatNumberEs(totals.totalComments)} helper="Total acumulado" icon={<MessageSquare className="text-red-600" size={18} />} />
          <KpiCard title="Compartidos" value={formatNumberEs(totals.totalShares)} helper="Total acumulado" icon={<Share2 className="text-red-600" size={18} />} />
          <KpiCard title="Clicks" value={formatNumberEs(totals.totalClicks)} helper="Total acumulado" icon={<MousePointerClick className="text-red-600" size={18} />} />
          <KpiCard title="Vistas" value={formatNumberEs(totals.totalViews)} helper="Total acumulado" icon={<Eye className="text-red-600" size={18} />} />
          <KpiCard title="Vistas de video" value={formatNumberEs(totals.totalVideoViews)} helper="post_video_views" icon={<Eye className="text-red-600" size={18} />} />
        </KpiGrid>
      </Section>

      <Section title="1) Pages Explorer">
        <div className="rounded-2xl border border-gray-200 bg-white overflow-hidden shadow-[0_20px_42px_-34px_rgba(15,23,42,0.9)]">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-white">
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-gray-500">
                  <th className="px-4 py-3">Página</th>
                  <th className="px-4 py-3">Categoría</th>
                  <th className="px-4 py-3 text-right">Followers</th>
                  <th className="px-4 py-3 text-right">Fans</th>
                  <th className="px-4 py-3">Enlace</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {topPages.map((page) => (
                  <tr key={page.id} className="align-top hover:bg-red-50/30">
                    <td className="px-4 py-3 min-w-64">
                      <div className="flex items-center gap-3">
                        {page.picture_url ? <img src={page.picture_url} alt={page.name ?? page.id} className="h-8 w-8 rounded-full border border-gray-200" /> : null}
                        <div>
                          <p className="font-medium text-gray-900">{page.name ?? page.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{page.category ?? 'N/D'}</td>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{formatNumberEs(page.followers_count)}</td>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{formatNumberEs(page.fan_count)}</td>
                    <td className="px-4 py-3">
                      {page.link ? (
                        <a href={page.link} target="_blank" rel="noreferrer" className="text-xs font-semibold text-red-600 hover:text-red-700">
                          Abrir
                        </a>
                      ) : <span className="text-xs text-gray-400">Sin link</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Section>

      <Section title="2) Top 5 publicaciones por métrica">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <TopPostsListCard
            title="Top 5 · Reacciones"
            posts={topByReactions}
            getMetric={(post) => post.reactions}
          />
          <TopPostsListCard
            title="Top 5 · Comentarios"
            posts={topByComments}
            getMetric={(post) => post.comments}
          />
          <TopPostsListCard
            title="Top 5 · Compartidos"
            posts={topByShares}
            getMetric={(post) => post.shares}
          />
          <TopPostsListCard
            title="Top 5 · Clicks"
            posts={topByClicks}
            getMetric={(post) => post.clicks}
          />
          <TopPostsListCard
            title="Top 5 · Vistas"
            posts={topByViews}
            getMetric={(post) => post.views}
          />
        </div>
      </Section>

      <Section title="3) Tendencias de posts (5 apartados)">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          <PostTrendChartCard
            title="Tendencia · Reacciones"
            data={trendByPostDate}
            dataKey="reactions"
            stroke="#dc2626"
          />
          <PostTrendChartCard
            title="Tendencia · Comentarios"
            data={trendByPostDate}
            dataKey="comments"
            stroke="#f59e0b"
          />
          <PostTrendChartCard
            title="Tendencia · Compartidos"
            data={trendByPostDate}
            dataKey="shares"
            stroke="#7c3aed"
          />
          <PostTrendChartCard
            title="Tendencia · Clicks"
            data={trendByPostDate}
            dataKey="clicks"
            stroke="#2563eb"
          />
          <PostTrendChartCard
            title="Tendencia · Vistas"
            data={trendByPostDate}
            dataKey="views"
            stroke="#059669"
          />
        </div>
      </Section>

      {errors.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Se detectaron {formatNumberEs(errors.length)} advertencia(s) al leer algunas páginas (posts o insights). Revisá permisos de Meta (pages_show_list, pages_read_engagement, read_insights).
        </div>
      ) : null}
    </div>
  );
}

function TopPostsListCard({
  title,
  posts,
  getMetric,
}: {
  title: string;
  posts: EnrichedPost[];
  getMetric: (post: EnrichedPost) => number;
}) {
  return (
    <ChartCard title={title} icon={<FileText size={16} className="text-red-600" />}>
      {posts.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
          No hay publicaciones para este rango.
        </div>
      ) : (
        <div className="space-y-2">
          {posts.map((post, index) => (
            <article key={`${title}-${post.id}`} className="rounded-xl border border-gray-200 bg-gray-50 px-3 py-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">#{index + 1}</p>
                  <div className="flex items-center gap-2 min-w-0">
                    <p className="text-sm font-semibold text-gray-800 truncate">{post.page_name ?? post.page_id}</p>
                    <span className="shrink-0 text-[11px] text-gray-400">
                      {post.created_time ? new Date(post.created_time).toLocaleDateString('es-PE') : 'Sin fecha'}
                    </span>
                  </div>
                  <p className="text-xs text-gray-600 line-clamp-2">{post.message ?? 'Sin texto en publicación'}</p>
                  {post.full_picture ? (
                    post.permalink_url ? (
                      <a href={post.permalink_url} target="_blank" rel="noreferrer" className="inline-block mt-2">
                        <img
                          src={post.full_picture}
                          alt={post.id}
                          className="h-14 w-24 rounded-md border border-gray-200 object-cover transition hover:opacity-90"
                          loading="lazy"
                        />
                      </a>
                    ) : (
                      <img
                        src={post.full_picture}
                        alt={post.id}
                        className="mt-2 h-14 w-24 rounded-md border border-gray-200 object-cover"
                        loading="lazy"
                      />
                    )
                  ) : null}
                </div>
                <p className="text-base font-extrabold text-gray-900">{formatNumberEs(getMetric(post))}</p>
              </div>
            </article>
          ))}
        </div>
      )}
    </ChartCard>
  );
}

function PostTrendChartCard({
  title,
  data,
  dataKey,
  stroke,
}: {
  title: string;
  data: PostMetricTrendPoint[];
  dataKey: 'reactions' | 'comments' | 'shares' | 'clicks' | 'views';
  stroke: string;
}) {
  return (
    <ChartCard title={title} icon={<BarChart3 size={16} className="text-red-600" />}>
      {data.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
          Sin datos para graficar en este rango.
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} />
            <Tooltip {...chartTooltipStyle} />
            <Line type="monotone" dataKey={dataKey} stroke={stroke} strokeWidth={2.5} dot={false} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      )}
    </ChartCard>
  );
}
