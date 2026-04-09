import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type { MetaPagesPayload } from './types';

type MetaPagesFilters = {
  since: string;
  until: string;
};

export function getMetaPagesQueryKey(filters: MetaPagesFilters) {
  return ['meta-pages', filters.since, filters.until] as const;
}

export function useMetaPagesData(filters: MetaPagesFilters) {
  return useQuery({
    queryKey: getMetaPagesQueryKey(filters),
    queryFn: async (): Promise<MetaPagesPayload> => {
      if (!isSupabaseConfigured() || !supabase) {
        throw new Error('Supabase no está configurado para consultar Meta Pages.');
      }

      const pagesQuery = supabase
        .from('meta_pages')
        .select('business_id,name,category,fan_count,followers_count,link,picture_url,has_page_token')
        .order('followers_count', { ascending: false })
        .order('fan_count', { ascending: false });

      const postsDateStart = filters.since ? `${filters.since}T00:00:00.000Z` : undefined;
      const postsDateEnd = filters.until ? `${filters.until}T23:59:59.999Z` : undefined;

      let postsQuery = supabase
        .from('meta_page_posts')
        .select('business_id,page_business_id,page_name,message,created_time,permalink_url,full_picture,reactions,comments,shares')
        .order('created_time', { ascending: false })
        .limit(500);

      if (postsDateStart) postsQuery = postsQuery.gte('created_time', postsDateStart);
      if (postsDateEnd) postsQuery = postsQuery.lte('created_time', postsDateEnd);

      let insightsQuery = supabase
        .from('meta_page_insights_daily')
        .select('page_business_id,page_name,metric,date_end,value')
        .order('date_end', { ascending: true });

      if (filters.since) insightsQuery = insightsQuery.gte('date_end', filters.since);
      if (filters.until) insightsQuery = insightsQuery.lte('date_end', filters.until);

      const [pagesResult, postsResult, insightsResult] = await Promise.all([
        pagesQuery,
        postsQuery,
        insightsQuery,
      ]);

      if (pagesResult.error) {
        throw new Error(`No se pudo cargar páginas en SQL: ${pagesResult.error.message}`);
      }

      if (postsResult.error) {
        throw new Error(`No se pudo cargar posts en SQL: ${postsResult.error.message}`);
      }

      if (insightsResult.error) {
        throw new Error(`No se pudo cargar insights en SQL: ${insightsResult.error.message}`);
      }

      return {
        success: true,
        resource: 'pages',
        duration_ms: 0,
        since: filters.since,
        until: filters.until,
        pages: (pagesResult.data ?? []).map((item) => ({
          id: item.business_id,
          name: item.name,
          category: item.category,
          fan_count: Number(item.fan_count ?? 0),
          followers_count: Number(item.followers_count ?? 0),
          link: item.link,
          picture_url: item.picture_url,
          has_page_token: Boolean(item.has_page_token),
        })),
        posts: (postsResult.data ?? []).map((item) => ({
          id: item.business_id,
          page_id: item.page_business_id,
          page_name: item.page_name,
          message: item.message,
          created_time: item.created_time,
          permalink_url: item.permalink_url,
          full_picture: item.full_picture,
          reactions: Number(item.reactions ?? 0),
          comments: Number(item.comments ?? 0),
          shares: Number(item.shares ?? 0),
        })),
        insights: (insightsResult.data ?? []).map((item) => ({
          page_id: item.page_business_id,
          page_name: item.page_name,
          metric: item.metric,
          end_time: item.date_end ? `${item.date_end}T00:00:00.000Z` : null,
          value: Number(item.value ?? 0),
        })),
        errors: [],
        permissions_hint: ['pages_show_list', 'pages_read_engagement', 'read_insights', 'pages_read_user_content'],
      };
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}

export async function syncMetaPages(filters: MetaPagesFilters) {
  const params = new URLSearchParams({
    resource: 'pages',
    limit: '25',
    max_pages: '3',
  });

  if (filters.since) params.set('since', filters.since);
  if (filters.until) params.set('until', filters.until);

  const response = await fetch(`/api/meta/ads/sync?${params.toString()}`, {
    method: 'GET',
    credentials: 'include',
  });

  const payload = (await response.json()) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error ?? 'No se pudo sincronizar Meta Pages hacia SQL.');
  }

  return payload;
}
