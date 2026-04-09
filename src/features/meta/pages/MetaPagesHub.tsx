import { useMemo, useState } from 'react';
import { Activity, BarChart3, BookImage, Eye, FileText } from 'lucide-react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumberEs } from '../../../lib/tableHelpers';
import { ChartCard, KpiCard, KpiGrid, MetaAdsFiltersPanel, MetaAdsPageHero, Section } from '../ads/metaAdsShared';
import { useMetaPagesData } from './useMetaPagesData';

type PostClicksSnapshotPoint = {
  date: string;
  clicks: number;
  engaged: number;
  impressions: number;
};

export function MetaPagesHub() {
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

  const topPosts = useMemo(() => {
    const latestByPostMetric = new Map<string, number>();

    for (const snapshot of postInsightSnapshots) {
      const key = `${snapshot.post_id}:${snapshot.metric}`;
      const current = latestByPostMetric.get(key) ?? 0;
      if (snapshot.value > current) {
        latestByPostMetric.set(key, snapshot.value);
      }
    }

    return [...posts]
      .map((post) => ({
        ...post,
        engagement: post.reactions + post.comments + post.shares,
        clicks: latestByPostMetric.get(`${post.id}:post_clicks`) ?? 0,
        views: latestByPostMetric.get(`${post.id}:post_impressions`) ?? 0,
        engagedUsers: latestByPostMetric.get(`${post.id}:post_engaged_users`) ?? 0,
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 12);
  }, [posts, postInsightSnapshots]);

  const postClicksTrend = useMemo(() => {
    const groupedBySnapshot = new Map<string, PostClicksSnapshotPoint>();

    for (const snapshot of postInsightSnapshots) {
      const date = snapshot.snapshot_date;
      if (!date) continue;

      const current = groupedBySnapshot.get(date) ?? { date, clicks: 0, engaged: 0, impressions: 0 };
      if (snapshot.metric === 'post_clicks') current.clicks += snapshot.value;
      if (snapshot.metric === 'post_engaged_users') current.engaged += snapshot.value;
      if (snapshot.metric === 'post_impressions') current.impressions += snapshot.value;
      groupedBySnapshot.set(date, current);
    }

    const snapshotSeries = Array.from(groupedBySnapshot.values()).sort((a, b) => a.date.localeCompare(b.date));
    if (snapshotSeries.length >= 2) {
      return snapshotSeries;
    }

    // Fallback: si hay un solo snapshot (o ninguno), usar fecha de publicación del post
    // para evitar que toda la tendencia colapse en un mismo día.
    const groupedByPostDate = new Map<string, PostClicksSnapshotPoint>();
    for (const post of topPosts) {
      const date = (post.created_time ?? '').slice(0, 10);
      if (!date) continue;

      const current = groupedByPostDate.get(date) ?? { date, clicks: 0, engaged: 0, impressions: 0 };
      current.clicks += post.clicks;
      current.engaged += post.engagedUsers;
      current.impressions += post.views;
      groupedByPostDate.set(date, current);
    }

    return Array.from(groupedByPostDate.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [postInsightSnapshots, topPosts]);

  const latestPostClicksSnapshot = useMemo(() => {
    if (postClicksTrend.length === 0) return null;
    return postClicksTrend[postClicksTrend.length - 1];
  }, [postClicksTrend]);

  const totals = useMemo(() => {
    const followers = pages.reduce((acc, page) => acc + (page.followers_count || 0), 0);
    const postEngagement = posts.reduce((acc, post) => acc + post.reactions + post.comments + post.shares, 0);
    const latestSnapshotDate = postInsightSnapshots.reduce((acc, item) => item.snapshot_date > acc ? item.snapshot_date : acc, '');
    const totalPostClicks = postInsightSnapshots
      .filter((item) => item.metric === 'post_clicks' && item.snapshot_date === latestSnapshotDate)
      .reduce((acc, item) => acc + item.value, 0);

    return {
      totalPages: pages.length,
      totalFollowers: followers,
      totalPosts: posts.length,
      avgEngagementPerPost: posts.length > 0 ? postEngagement / posts.length : 0,
      totalPostClicks,
    };
  }, [pages, posts, postInsightSnapshots]);

  if (pagesQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mr-3"></div>
        Cargando apartado de Meta Pages...
      </div>
    );
  }

  if (pagesQuery.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500 space-y-4">
        <Activity size={48} />
        <p className="text-lg font-medium">Error al cargar Meta Pages</p>
        <p className="text-sm text-red-400 max-w-xl text-center">
          {pagesQuery.error instanceof Error ? pagesQuery.error.message : 'Error desconocido'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MetaAdsPageHero
        title="Meta Pages"
        description="Explorer + publicaciones + insights del periodo seleccionado."
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
          <KpiCard title="Posts Totales" value={formatNumberEs(totals.totalPosts)} helper="Publicaciones totales" icon={<FileText className="text-red-600" size={18} />} />
          <KpiCard title="Engagement/post" value={formatNumberEs(Math.round(totals.avgEngagementPerPost))} helper="Reacciones + comentarios + compartidos" icon={<BarChart3 className="text-red-600" size={18} />} />
          <KpiCard title="Clicks orgánicos" value={formatNumberEs(Math.round(totals.totalPostClicks))} helper="Total de clicks orgánicos" icon={<Activity className="text-red-600" size={18} />} />
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

      <Section title="2) Publicaciones (top engagement)">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {topPosts.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
              No se pudieron leer posts para el rango actual.
            </div>
          ) : topPosts.map((post) => (
            <ChartCard key={post.id} title={post.page_name ?? post.page_id} icon={<FileText size={16} className="text-red-600" />}>
              <div className="space-y-2">
                <p className="text-xs text-gray-500">{post.created_time ? new Date(post.created_time).toLocaleString('es-PE') : 'Sin fecha'}</p>
                <p className="text-sm text-gray-700 line-clamp-3">{post.message ?? 'Sin texto en publicación'}</p>
                {post.full_picture ? <img src={post.full_picture} alt={post.id} className="w-full rounded-xl border border-gray-200" loading="lazy" /> : null}
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Reacciones</p>
                    <p className="mt-1 text-sm font-bold text-gray-800">{formatNumberEs(post.reactions)}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Comentarios</p>
                    <p className="mt-1 text-sm font-bold text-gray-800">{formatNumberEs(post.comments)}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-gray-50 px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-gray-500">Compartidos</p>
                    <p className="mt-1 text-sm font-bold text-gray-800">{formatNumberEs(post.shares)}</p>
                  </div>
                  <div className="rounded-lg border border-gray-200 bg-green-50 px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-green-500">Clicks</p>
                    <p className="mt-1 text-sm font-bold text-green-700">{formatNumberEs(post.clicks)}</p>
                  </div>
                  <div className="col-span-2 rounded-lg border border-green-200 bg-green-50 px-2.5 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-green-600">Vistas</p>
                    <p className="mt-1 text-sm font-bold text-green-700">{formatNumberEs(post.views)}</p>
                  </div>
                </div>
                {post.permalink_url ? (
                  <a href={post.permalink_url} target="_blank" rel="noreferrer" className="inline-block text-xs font-semibold text-red-600 hover:text-red-700">
                    Abrir
                  </a>
                ) : null}
              </div>
            </ChartCard>
          ))}
        </div>
      </Section>

      <Section title="4) Clicks y Engagement">
        <ChartCard title="Clicks y usuarios enganchados por día" icon={<BarChart3 size={16} className="text-red-600" />}>
          {postClicksTrend.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
              Sin snapshots de post insights todavía.
            </div>
          ) : postClicksTrend.length === 1 && latestPostClicksSnapshot ? (
            <div className="rounded-xl border border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-700 space-y-1">
              <p className="font-semibold">Estos son los datos disponibles</p>
              <p>Clicks: <strong>{formatNumberEs(Math.round(latestPostClicksSnapshot.clicks))}</strong></p>
              <p>Usuarios enganchados: <strong>{formatNumberEs(Math.round(latestPostClicksSnapshot.engaged))}</strong></p>
              <p className="text-xs text-gray-500">Necesitás al menos 2 snapshots en fechas distintas para ver tendencia.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={320}>
              <LineChart data={postClicksTrend}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Line type="monotone" dataKey="clicks" stroke="#dc2626" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="engaged" stroke="#f59e0b" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="impressions" stroke="#2563eb" strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          )}
        </ChartCard>
      </Section>

      {errors.length > 0 ? (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Se detectaron {formatNumberEs(errors.length)} advertencia(s) al leer algunas páginas (posts o insights). Revisá permisos de Meta (pages_show_list, pages_read_engagement, read_insights).
        </div>
      ) : null}
    </div>
  );
}
