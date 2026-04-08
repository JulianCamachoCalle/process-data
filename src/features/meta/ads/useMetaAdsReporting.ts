import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '../../../lib/supabase';
import type { MetaAdsHourlyRow, MetaAdsOverviewFilters, MetaAdsOverviewPayload, MetaAdsReportingRow } from './types';

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

      let hourlyQuery = supabase
        .from('meta_ad_insights_hourly')
        .select('ad_business_id,date_start,hour_bucket,spend,impressions,reach,clicks,ctr,cpc')
        .order('date_start', { ascending: true })
        .order('hour_bucket', { ascending: true });

      if (filters.dateFrom) {
        hourlyQuery = hourlyQuery.gte('date_start', filters.dateFrom);
      }

      if (filters.dateTo) {
        hourlyQuery = hourlyQuery.lte('date_start', filters.dateTo);
      }

      const accountsPromise = supabase
        .from('meta_ad_accounts')
        .select('business_id, name')
        .order('name', { ascending: true });

      const [accountsResult, reportingResult, hourlyResult] = await Promise.all([
        accountsPromise,
        reportingQuery,
        hourlyQuery,
      ]);

      if (accountsResult.error) {
        throw new Error(`No se pudieron cargar las cuentas de Meta Ads: ${accountsResult.error.message}`);
      }

      if (reportingResult.error) {
        throw new Error(`No se pudo cargar el detalle de Meta Ads: ${reportingResult.error.message}`);
      }

      if (hourlyResult.error) {
        throw new Error(`No se pudo cargar el detalle horario de Meta Ads: ${hourlyResult.error.message}`);
      }

      const hourlyRows = (hourlyResult.data ?? []) as MetaAdsHourlyRow[];

      return {
        accounts: (accountsResult.data ?? []) as MetaAdAccountRow[],
        rows: (reportingResult.data ?? []) as MetaAdsReportingRow[],
        hourlyRows,
      };
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
