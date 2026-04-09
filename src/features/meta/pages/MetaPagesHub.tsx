import { useMemo, useState } from 'react';
import { Activity, BarChart3, BookImage, Eye, FileText, Megaphone } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatNumberEs } from '../../../lib/tableHelpers';
import { ChartCard, KpiCard, KpiGrid, MetaAdsFiltersPanel, MetaAdsPageHero, Section } from '../ads/metaAdsShared';
import { useMetaPagesData } from './useMetaPagesData';

type InsightPoint = {
  date: string;
  impressions: number;
  reach: number;
  engagement: number;
};

function getTodayDateOnly() {
  return new Date().toISOString().slice(0, 10);
}

function getDateDaysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function MetaPagesHub() {
  const [since, setSince] = useState(getDateDaysAgo(29));
  const [until, setUntil] = useState(getTodayDateOnly());
  const [draftSince, setDraftSince] = useState(since);
  const [draftUntil, setDraftUntil] = useState(until);

  const pagesQuery = useMetaPagesData({ since, until });

  const isFiltersDirty = since !== draftSince || until !== draftUntil;

  const pages = useMemo(() => pagesQuery.data?.pages ?? [], [pagesQuery.data?.pages]);
  const posts = useMemo(() => pagesQuery.data?.posts ?? [], [pagesQuery.data?.posts]);
  const errors = pagesQuery.data?.errors ?? [];

  const insightTrend = useMemo(() => {
    const rows = pagesQuery.data?.insights ?? [];
    const grouped = new Map<string, InsightPoint>();

    for (const row of rows) {
      const date = (row.end_time ?? '').slice(0, 10);
      if (!date) continue;

      const current = grouped.get(date) ?? {
        date,
        impressions: 0,
        reach: 0,
        engagement: 0,
      };

      if (row.metric === 'page_impressions') current.impressions += row.value;
      if (row.metric === 'page_reach') current.reach += row.value;
      if (row.metric === 'page_post_engagements') current.engagement += row.value;

      grouped.set(date, current);
    }

    return Array.from(grouped.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [pagesQuery.data?.insights]);

  const topPages = useMemo(() => {
    return [...pages]
      .sort((a, b) => (b.followers_count || b.fan_count) - (a.followers_count || a.fan_count))
      .slice(0, 8);
  }, [pages]);

  const topPosts = useMemo(() => {
    return [...posts]
      .map((post) => ({
        ...post,
        engagement: post.reactions + post.comments + post.shares,
      }))
      .sort((a, b) => b.engagement - a.engagement)
      .slice(0, 12);
  }, [posts]);

  const totals = useMemo(() => {
    const followers = pages.reduce((acc, page) => acc + (page.followers_count || page.fan_count || 0), 0);
    const postEngagement = posts.reduce((acc, post) => acc + post.reactions + post.comments + post.shares, 0);

    return {
      totalPages: pages.length,
      totalFollowers: followers,
      totalPosts: posts.length,
      avgEngagementPerPost: posts.length > 0 ? postEngagement / posts.length : 0,
    };
  }, [pages, posts]);

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
          const defaultSince = getDateDaysAgo(29);
          const defaultUntil = getTodayDateOnly();
          setSince(defaultSince);
          setUntil(defaultUntil);
          setDraftSince(defaultSince);
          setDraftUntil(defaultUntil);
        }}
        isApplyDisabled={!isFiltersDirty}
      />

      <Section title="KPI (Pages)">
        <KpiGrid>
          <KpiCard title="Páginas" value={formatNumberEs(totals.totalPages)} helper="Páginas con acceso" icon={<Megaphone className="text-red-600" size={18} />} />
          <KpiCard title="Seguidores" value={formatNumberEs(totals.totalFollowers)} helper="followers_count + fallback fan_count" icon={<Eye className="text-red-600" size={18} />} />
          <KpiCard title="Posts leídos" value={formatNumberEs(totals.totalPosts)} helper="Publicaciones del rango" icon={<FileText className="text-red-600" size={18} />} />
          <KpiCard title="Engagement/post" value={formatNumberEs(Math.round(totals.avgEngagementPerPost))} helper="Reacciones + comentarios + shares" icon={<BarChart3 className="text-red-600" size={18} />} />
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
                          <p className="text-xs text-gray-500">{page.id}</p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-gray-700">{page.category ?? 'N/D'}</td>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{formatNumberEs(page.followers_count)}</td>
                    <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{formatNumberEs(page.fan_count)}</td>
                    <td className="px-4 py-3">
                      {page.link ? (
                        <a href={page.link} target="_blank" rel="noreferrer" className="text-xs font-semibold text-red-600 hover:text-red-700">
                          Abrir página ↗
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
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
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
                <div className="grid grid-cols-3 gap-2 text-xs text-gray-600">
                  <div>Reacciones: <strong>{formatNumberEs(post.reactions)}</strong></div>
                  <div>Comentarios: <strong>{formatNumberEs(post.comments)}</strong></div>
                  <div>Shares: <strong>{formatNumberEs(post.shares)}</strong></div>
                </div>
                {post.permalink_url ? (
                  <a href={post.permalink_url} target="_blank" rel="noreferrer" className="inline-block text-xs font-semibold text-red-600 hover:text-red-700">
                    Abrir publicación ↗
                  </a>
                ) : null}
              </div>
            </ChartCard>
          ))}
        </div>
      </Section>

      <Section title="3) Pages Insights Dashboard">
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Impresiones y Reach por día" icon={<BarChart3 size={16} className="text-red-600" />}>
            {insightTrend.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">Sin datos de insights para el rango.</div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <BarChart data={insightTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="impressions" fill="#dc2626" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                  <Bar dataKey="reach" fill="#f59e0b" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title="Engagement por día" icon={<Activity size={16} className="text-red-600" />}>
            {insightTrend.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">Sin datos de engagement.</div>
            ) : (
              <ResponsiveContainer width="100%" height={320}>
                <LineChart data={insightTrend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Line type="monotone" dataKey="engagement" stroke="#dc2626" strokeWidth={2.5} dot={false} isAnimationActive={false} />
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
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
