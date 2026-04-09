import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type { MetaAdAudienceBreakdownRow } from './types';

type MetaAdsAudienceFilters = {
  dateFrom: string;
  dateTo: string;
  adId: string;
};

export function getMetaAdsAudienceQueryKey(filters: MetaAdsAudienceFilters) {
  return ['meta-ads-audience', filters.dateFrom, filters.dateTo, filters.adId] as const;
}

export function useMetaAdsAudience(filters: MetaAdsAudienceFilters) {
  return useQuery({
    queryKey: getMetaAdsAudienceQueryKey(filters),
    queryFn: async (): Promise<MetaAdAudienceBreakdownRow[]> => {
      if (!isSupabaseConfigured() || !supabase) {
        throw new Error('Supabase no está configurado para consultar audiencia de Meta Ads.');
      }

      let query = supabase
        .from('meta_ad_insights_breakdown_daily')
        .select('ad_business_id,date_start,date_stop,breakdown_type,breakdown_value_1,breakdown_value_2,spend,impressions,reach,clicks,ctr,cpc')
        .order('date_start', { ascending: false });

      if (filters.dateFrom) query = query.gte('date_start', filters.dateFrom);
      if (filters.dateTo) query = query.lte('date_start', filters.dateTo);
      if (filters.adId) query = query.eq('ad_business_id', filters.adId);

      const { data, error } = await query.limit(5000);
      if (error) {
        throw new Error(`No se pudo cargar audiencia de ads: ${error.message}`);
      }

      return (data ?? []) as MetaAdAudienceBreakdownRow[];
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
