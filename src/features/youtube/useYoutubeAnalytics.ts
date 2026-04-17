import { useQuery } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '../../lib/supabase';
import type {
  YoutubeAnalyticsPayload,
  YoutubeChannelAudienceBreakdownDailyRow,
  YoutubeChannelDemographicDailyRow,
  YoutubeChannelRow,
  YoutubeVideoDailyStatsRow,
  YoutubeVideoRow,
} from './types';

type YoutubeFilters = {
  dateFrom: string;
  dateTo: string;
};

type DateRange = {
  dateFrom: string;
  dateTo: string;
};

function parseIsoDate(raw: string) {
  const [year, month, day] = raw.split('-').map(Number);
  if (!year || !month || !day) return null;
  const parsed = new Date(year, month - 1, day);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatIsoDate(value: Date) {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function subtractDays(value: Date, days: number) {
  const next = new Date(value);
  next.setDate(next.getDate() - days);
  return next;
}

function resolvePreviousPeriod(dateFrom: string, dateTo: string): DateRange | null {
  if (!dateFrom || !dateTo) return null;

  const start = parseIsoDate(dateFrom);
  const end = parseIsoDate(dateTo);
  if (!start || !end) return null;

  const msPerDay = 24 * 60 * 60 * 1000;
  const daySpan = Math.floor((end.getTime() - start.getTime()) / msPerDay) + 1;
  if (daySpan <= 0) return null;

  const previousEnd = subtractDays(start, 1);
  const previousStart = subtractDays(start, daySpan);

  return {
    dateFrom: formatIsoDate(previousStart),
    dateTo: formatIsoDate(previousEnd),
  };
}

export function getYoutubeAnalyticsQueryKey(filters: YoutubeFilters) {
  const previous = resolvePreviousPeriod(filters.dateFrom, filters.dateTo);
  return [
    'youtube-analytics',
    filters.dateFrom,
    filters.dateTo,
    previous?.dateFrom ?? '',
    previous?.dateTo ?? '',
  ] as const;
}

export function useYoutubeAnalytics(filters: YoutubeFilters) {
  return useQuery({
    queryKey: getYoutubeAnalyticsQueryKey(filters),
    queryFn: async (): Promise<YoutubeAnalyticsPayload> => {
      if (!isSupabaseConfigured() || !supabase) {
        throw new Error('Supabase no está configurado para consultar YouTube Analytics.');
      }

      const previousPeriod = resolvePreviousPeriod(filters.dateFrom, filters.dateTo);

      let demographicsQuery = supabase
        .from('youtube_channel_demographics_daily')
        .select('*')
        .order('stat_date', { ascending: true });

      let audienceQuery = supabase
        .from('youtube_channel_audience_breakdowns_daily')
        .select('*')
        .order('stat_date', { ascending: true });

      let videoDailyQuery = supabase
        .from('youtube_video_daily_stats')
        .select('*')
        .order('stat_date', { ascending: true });

      if (filters.dateFrom) {
        demographicsQuery = demographicsQuery.gte('stat_date', filters.dateFrom);
        audienceQuery = audienceQuery.gte('stat_date', filters.dateFrom);
        videoDailyQuery = videoDailyQuery.gte('stat_date', filters.dateFrom);
      }

      if (filters.dateTo) {
        demographicsQuery = demographicsQuery.lte('stat_date', filters.dateTo);
        audienceQuery = audienceQuery.lte('stat_date', filters.dateTo);
        videoDailyQuery = videoDailyQuery.lte('stat_date', filters.dateTo);
      }

      const previousVideoPromise = previousPeriod
        ? supabase
            .from('youtube_video_daily_stats')
            .select('*')
            .gte('stat_date', previousPeriod.dateFrom)
            .lte('stat_date', previousPeriod.dateTo)
            .order('stat_date', { ascending: true })
        : Promise.resolve({ data: [], error: null });

      const [
        channelsResult,
        videosResult,
        demographicsResult,
        audienceResult,
        videoDailyResult,
        previousVideoResult,
      ] = await Promise.all([
        supabase
          .from('youtube_channels')
          .select('*')
          .order('last_synced_at', { ascending: false }),
        supabase
          .from('youtube_videos')
          .select('*')
          .order('published_at', { ascending: false }),
        demographicsQuery,
        audienceQuery,
        videoDailyQuery,
        previousVideoPromise,
      ]);

      if (channelsResult.error) {
        throw new Error(`No se pudo cargar youtube_channels: ${channelsResult.error.message}`);
      }

      if (videosResult.error) {
        throw new Error(`No se pudo cargar youtube_videos: ${videosResult.error.message}`);
      }

      if (demographicsResult.error) {
        throw new Error(`No se pudo cargar youtube_channel_demographics_daily: ${demographicsResult.error.message}`);
      }

      if (audienceResult.error) {
        throw new Error(`No se pudo cargar youtube_channel_audience_breakdowns_daily: ${audienceResult.error.message}`);
      }

      if (videoDailyResult.error) {
        throw new Error(`No se pudo cargar youtube_video_daily_stats: ${videoDailyResult.error.message}`);
      }

      if (previousVideoResult.error) {
        throw new Error(`No se pudo cargar el período anterior en youtube_video_daily_stats: ${previousVideoResult.error.message}`);
      }

      return {
        channels: (channelsResult.data ?? []) as YoutubeChannelRow[],
        videos: (videosResult.data ?? []) as YoutubeVideoRow[],
        demographicsDaily: (demographicsResult.data ?? []) as YoutubeChannelDemographicDailyRow[],
        audienceBreakdownsDaily: (audienceResult.data ?? []) as YoutubeChannelAudienceBreakdownDailyRow[],
        videoDailyStats: (videoDailyResult.data ?? []) as YoutubeVideoDailyStatsRow[],
        previousVideoDailyStats: (previousVideoResult.data ?? []) as YoutubeVideoDailyStatsRow[],
        previousPeriod,
      };
    },
    staleTime: 60 * 1000,
    refetchInterval: 5 * 60 * 1000,
  });
}
