import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type { MetaAdsOverviewFilters, MetaAdsOverviewPayload, MetaAdsReportingRow, MetaSyncRunRow } from './types';

type MetaAdAccountRow = {
  business_id: string;
  name: string | null;
};

export function getMetaAdsReportingQueryKey(filters: MetaAdsOverviewFilters) {
  return ['meta-ads-reporting', filters.accountId, filters.dateFrom, filters.dateTo] as const;
}

export function useMetaAdsReporting(filters: MetaAdsOverviewFilters) {
  return useQuery({
    queryKey: getMetaAdsReportingQueryKey(filters),
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

      let latestSyncQuery = supabase
        .from('meta_sync_runs')
        .select('*')
        .eq('provider', 'meta')
        .eq('resource', 'ads')
        .order('started_at', { ascending: false })
        .limit(1);

      if (filters.accountId) {
        latestSyncQuery = latestSyncQuery.eq('account_business_id', filters.accountId);
      }

      const accountsPromise = supabase
        .from('meta_ad_accounts')
        .select('business_id, name')
        .order('name', { ascending: true });

      const [accountsResult, reportingResult, latestSyncResult] = await Promise.all([
        accountsPromise,
        reportingQuery,
        latestSyncQuery,
      ]);

      if (accountsResult.error) {
        throw new Error(`No se pudieron cargar las cuentas de Meta Ads: ${accountsResult.error.message}`);
      }

      if (reportingResult.error) {
        throw new Error(`No se pudo cargar el detalle de Meta Ads: ${reportingResult.error.message}`);
      }

      if (latestSyncResult.error) {
        throw new Error(`No se pudo cargar el último sync de Meta Ads: ${latestSyncResult.error.message}`);
      }

      return {
        accounts: (accountsResult.data ?? []) as MetaAdAccountRow[],
        rows: (reportingResult.data ?? []) as MetaAdsReportingRow[],
        latestSyncRun: ((latestSyncResult.data ?? [])[0] ?? null) as MetaSyncRunRow | null,
      };
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
