import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type { MetaAdsOverviewFilters, MetaAdsOverviewPayload, MetaAdsReportingRow } from './types';

type MetaAdAccountRow = {
  business_id: string;
  name: string | null;
};

export function getMetaAdsOverviewQueryKey(filters: MetaAdsOverviewFilters) {
  return ['meta-ads-overview', filters.accountId, filters.dateFrom, filters.dateTo] as const;
}

export function useMetaAdsOverview(filters: MetaAdsOverviewFilters) {
  return useQuery({
    queryKey: getMetaAdsOverviewQueryKey(filters),
    queryFn: async (): Promise<MetaAdsOverviewPayload> => {
      if (!isSupabaseConfigured() || !supabase) {
        throw new Error('Supabase no está configurado para consultar Meta Ads.');
      }

      let reportingQuery = supabase
        .from('meta_ads_reporting_daily')
        .select('*')
        .order('date_start', { ascending: false })
        .order('spend', { ascending: false });

      if (filters.accountId) {
        reportingQuery = reportingQuery.eq('account_business_id', filters.accountId);
      }

      if (filters.dateFrom) {
        reportingQuery = reportingQuery.gte('date_start', filters.dateFrom);
      }

      if (filters.dateTo) {
        reportingQuery = reportingQuery.lte('date_start', filters.dateTo);
      }

      const accountsPromise = supabase
        .from('meta_ad_accounts')
        .select('business_id, name')
        .order('name', { ascending: true });

      const [accountsResult, reportingResult] = await Promise.all([accountsPromise, reportingQuery]);

      if (accountsResult.error) {
        throw new Error(`No se pudieron cargar las cuentas de Meta Ads: ${accountsResult.error.message}`);
      }

      if (reportingResult.error) {
        throw new Error(`No se pudo cargar el overview de Meta Ads: ${reportingResult.error.message}`);
      }

      return {
        accounts: (accountsResult.data ?? []) as MetaAdAccountRow[],
        rows: (reportingResult.data ?? []) as MetaAdsReportingRow[],
      };
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
