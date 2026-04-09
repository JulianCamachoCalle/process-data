import { useQuery } from '@tanstack/react-query';
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
      const params = new URLSearchParams({ mode: 'ads_audience_sql' });
      if (filters.dateFrom) params.set('date_from', filters.dateFrom);
      if (filters.dateTo) params.set('date_to', filters.dateTo);
      if (filters.adId) params.set('ad_id', filters.adId);

      const response = await fetch(`/api/meta/ads/sync?${params.toString()}`, {
        method: 'GET',
        credentials: 'include',
      });

      const payload = (await response.json()) as { error?: string; rows?: MetaAdAudienceBreakdownRow[] };
      if (!response.ok) {
        throw new Error(payload.error ?? 'No se pudo cargar audiencia de ads desde SQL.');
      }

      return payload.rows ?? [];
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
