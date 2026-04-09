import { useMemo, useState } from 'react';
import { Activity, BadgeDollarSign, BarChart3, LineChart as LineChartIcon, Megaphone, MousePointerClick, PieChart as PieChartIcon, Target, Trophy } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { DateRangePicker } from '../../../components/DateRangePicker';
import { isDateRangeValid } from '../../../lib/dateRange';
import { formatNumberEs } from '../../../lib/tableHelpers';
import { ChartCard, KpiCard, KpiGrid, MetaAdsFiltersPanel, MetaAdsPageHero, Section } from './metaAdsShared';
import {
  aggregateLeaderboard,
  aggregatePerformanceEntries,
  aggregateTrendRows,
  buildComparisonMetrics,
  formatCompactMetric,
  pickComparisonPair,
  safeDivide,
  sumBy,
  type MetaComparisonMetric,
  type MetaPerformanceEntry,
} from './metaAdsUtils';
import { useMetaAdsReporting } from './useMetaAdsReporting';
import { useMetaAdsAudience } from './useMetaAdsAudience';

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

type AudienceMetricKey = 'impressions' | 'reach' | 'clicks' | 'spend';

const audienceMetricMeta: Record<AudienceMetricKey, { label: string; format: 'number' | 'currency' }> = {
  impressions: { label: 'Vistas', format: 'number' },
  reach: { label: 'Alcance', format: 'number' },
  clicks: { label: 'Clicks', format: 'number' },
  spend: { label: 'Gasto', format: 'currency' },
};

function resolveCountryLabel(codeOrName: string) {
  const normalized = (codeOrName ?? '').trim();
  if (!normalized) return 'N/D';

  if (!/^[A-Za-z]{2}$/.test(normalized)) {
    return normalized;
  }

  try {
    const displayNames = new Intl.DisplayNames(['es'], { type: 'region' });
    return displayNames.of(normalized.toUpperCase()) ?? normalized.toUpperCase();
  } catch {
    return normalized.toUpperCase();
  }
}

function resolveGenderLabel(raw: string) {
  const normalized = (raw ?? '').trim().toLowerCase();
  if (normalized === 'male') return 'Masculino';
  if (normalized === 'female') return 'Femenino';
  if (normalized === 'm') return 'Masculino';
  if (normalized === 'f') return 'Femenino';
  return null;
}

export function MetaAdsDashboard() {
  const [campaignId, setCampaignId] = useState('');
  const [adsetId, setAdsetId] = useState('');
  const [adId, setAdId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [draftCampaignId, setDraftCampaignId] = useState('');
  const [draftAdsetId, setDraftAdsetId] = useState('');
  const [draftAdId, setDraftAdId] = useState('');
  const [draftDateFrom, setDraftDateFrom] = useState('');
  const [draftDateTo, setDraftDateTo] = useState('');
  const [comparisonType, setComparisonType] = useState<'campaigns' | 'ads'>('campaigns');
  const [comparisonCampaignId, setComparisonCampaignId] = useState('');
  const [comparisonAdId, setComparisonAdId] = useState('');
  const [comparisonDateFrom, setComparisonDateFrom] = useState('');
  const [comparisonDateTo, setComparisonDateTo] = useState('');
  const [comparisonDraftCampaignId, setComparisonDraftCampaignId] = useState('');
  const [comparisonDraftAdId, setComparisonDraftAdId] = useState('');
  const [comparisonDraftDateFrom, setComparisonDraftDateFrom] = useState('');
  const [comparisonDraftDateTo, setComparisonDraftDateTo] = useState('');
  const [campaignCompareIds, setCampaignCompareIds] = useState({ left: '', right: '' });
  const [adCompareIds, setAdCompareIds] = useState({ left: '', right: '' });
  const [audienceMetric, setAudienceMetric] = useState<AudienceMetricKey>('impressions');

  const reportingQuery = useMetaAdsReporting({ accountId: '', campaignId: '', adId: '', dateFrom, dateTo });
  const comparisonQuery = useMetaAdsReporting({
    accountId: '',
    campaignId: '',
    adId: '',
    dateFrom: comparisonDateFrom,
    dateTo: comparisonDateTo,
  });
  const audienceQuery = useMetaAdsAudience({ dateFrom, dateTo, adId });

  const rows = useMemo(() => reportingQuery.data?.rows ?? [], [reportingQuery.data?.rows]);

  const campaignOptions = useMemo(() => {
    const optionsMap = new Map<string, { id: string; label: string }>();

    for (const row of rows) {
      if (!row.campaign_business_id) continue;
      if (optionsMap.has(row.campaign_business_id)) continue;

      optionsMap.set(row.campaign_business_id, {
        id: row.campaign_business_id,
        label: row.campaign_name ?? row.campaign_business_id,
      });
    }

    return Array.from(optionsMap.values()).sort((left, right) => left.label.localeCompare(right.label, 'es'));
  }, [rows]);

  const adOptions = useMemo(() => {
    const optionsMap = new Map<string, { id: string; label: string }>();

    for (const row of rows) {
      if (!row.ad_business_id) continue;
      if (draftCampaignId && row.campaign_business_id !== draftCampaignId) continue;
      if (draftAdsetId && row.adset_business_id !== draftAdsetId) continue;
      if (optionsMap.has(row.ad_business_id)) continue;

      optionsMap.set(row.ad_business_id, {
        id: row.ad_business_id,
        label: row.ad_name ?? row.ad_business_id,
      });
    }

    return Array.from(optionsMap.values()).sort((left, right) => left.label.localeCompare(right.label, 'es'));
  }, [rows, draftCampaignId, draftAdsetId]);

  const adsetOptions = useMemo(() => {
    const optionsMap = new Map<string, { id: string; label: string }>();

    for (const row of rows) {
      if (!row.adset_business_id) continue;
      if (draftCampaignId && row.campaign_business_id !== draftCampaignId) continue;
      if (optionsMap.has(row.adset_business_id)) continue;

      optionsMap.set(row.adset_business_id, {
        id: row.adset_business_id,
        label: row.adset_name ?? row.adset_business_id,
      });
    }

    return Array.from(optionsMap.values()).sort((left, right) => left.label.localeCompare(right.label, 'es'));
  }, [rows, draftCampaignId]);

  const comparisonRows = useMemo(() => comparisonQuery.data?.rows ?? [], [comparisonQuery.data?.rows]);

  const comparisonCampaignOptions = useMemo(() => {
    const optionsMap = new Map<string, { id: string; label: string }>();

    for (const row of comparisonRows) {
      if (!row.campaign_business_id) continue;
      if (optionsMap.has(row.campaign_business_id)) continue;

      optionsMap.set(row.campaign_business_id, {
        id: row.campaign_business_id,
        label: row.campaign_name ?? row.campaign_business_id,
      });
    }

    return Array.from(optionsMap.values()).sort((left, right) => left.label.localeCompare(right.label, 'es'));
  }, [comparisonRows]);

  const comparisonAdOptions = useMemo(() => {
    const optionsMap = new Map<string, { id: string; label: string }>();

    for (const row of comparisonRows) {
      if (!row.ad_business_id) continue;
      if (comparisonDraftCampaignId && row.campaign_business_id !== comparisonDraftCampaignId) continue;
      if (optionsMap.has(row.ad_business_id)) continue;

      const adLabel = row.ad_name ?? row.ad_business_id;
      const campaignLabel = row.campaign_name ?? row.campaign_business_id ?? 'Sin campaña';
      optionsMap.set(row.ad_business_id, {
        id: row.ad_business_id,
        label: `${adLabel} · ${campaignLabel}`,
      });
    }

    return Array.from(optionsMap.values()).sort((left, right) => left.label.localeCompare(right.label, 'es'));
  }, [comparisonRows, comparisonDraftCampaignId]);

  const dashboard = useMemo(() => {
    const rows = reportingQuery.data?.rows ?? [];
    const hourlyRows = reportingQuery.data?.hourlyRows ?? [];
    const filteredRows = rows.filter((row) => {
      if (campaignId && row.campaign_business_id !== campaignId) return false;
      if (adsetId && row.adset_business_id !== adsetId) return false;
      if (adId && row.ad_business_id !== adId) return false;
      return true;
    });

    const totalSpend = sumBy(filteredRows, (row) => row.spend);
    const totalImpressions = sumBy(filteredRows, (row) => row.impressions);
    const totalReach = sumBy(filteredRows, (row) => row.reach);
    const totalClicks = sumBy(filteredRows, (row) => row.clicks);
    const totalCampaigns = new Set(filteredRows.map((row) => row.campaign_business_id).filter(Boolean)).size;
    const totalAdsets = new Set(filteredRows.map((row) => row.adset_business_id).filter(Boolean)).size;
    const totalAds = new Set(filteredRows.map((row) => row.ad_business_id).filter(Boolean)).size;
    const overallCtr = safeDivide(totalClicks * 100, totalImpressions);
    const overallCpc = safeDivide(totalSpend, totalClicks);

    const trend = aggregateTrendRows(filteredRows);
    const trendEfficiency = trend.map((point) => ({
      ...point,
      ctr: safeDivide(point.clicks * 100, point.impressions),
      cpc: safeDivide(point.spend, point.clicks),
    }));

    const topCampaignsByClicks = aggregateLeaderboard(filteredRows, {
      getId: (row) => row.campaign_business_id,
      getTitle: (row) => row.campaign_name,
      getSubtitle: (row) => row.account_name ?? row.account_business_id,
    })
      .sort((left, right) => {
        if (right.clicks !== left.clicks) return right.clicks - left.clicks;
        if (right.ctr !== left.ctr) return right.ctr - left.ctr;
        return left.cpc - right.cpc;
      })
      .slice(0, 5);

    const topAdsByClicks = aggregateLeaderboard(filteredRows, {
      getId: (row) => row.ad_business_id,
      getTitle: (row) => row.ad_name ?? row.ad_business_id,
      getSubtitle: (row) => row.creative_name ?? row.creative_id ?? 'Sin creative',
    })
      .sort((left, right) => {
        if (right.clicks !== left.clicks) return right.clicks - left.clicks;
        if (right.ctr !== left.ctr) return right.ctr - left.ctr;
        return left.cpc - right.cpc;
      })
      .slice(0, 5);

    const adIdsInScope = new Set(filteredRows.map((row) => row.ad_business_id).filter(Boolean));

    const scopedHourlyRows = adId
      ? hourlyRows.filter((row) => row.ad_business_id === adId)
      : adIdsInScope.size > 0
        ? hourlyRows.filter((row) => adIdsInScope.has(row.ad_business_id))
        : hourlyRows;

    const hourlyRowsForTrend = scopedHourlyRows.length > 0 ? scopedHourlyRows : hourlyRows;

    const hourlyClicksByDateMap = new Map<string, number[]>();
    const hourlyImpressionsByDateMap = new Map<string, number[]>();
    const hourlySpendByDateMap = new Map<string, number[]>();
    for (const row of hourlyRowsForTrend) {
      const hour = parseHourFromBucket(row.hour_bucket);
      if (hour === null) continue;

      const date = row.date_start;
      const clicksCurrent = hourlyClicksByDateMap.get(date) ?? Array<number>(24).fill(0);
      clicksCurrent[hour] += Number(row.clicks ?? 0);
      hourlyClicksByDateMap.set(date, clicksCurrent);

      const impressionsCurrent = hourlyImpressionsByDateMap.get(date) ?? Array<number>(24).fill(0);
      impressionsCurrent[hour] += Number(row.impressions ?? 0);
      hourlyImpressionsByDateMap.set(date, impressionsCurrent);

      const spendCurrent = hourlySpendByDateMap.get(date) ?? Array<number>(24).fill(0);
      spendCurrent[hour] += Number(row.spend ?? 0);
      hourlySpendByDateMap.set(date, spendCurrent);
    }

    const hourlyDates = Array.from(hourlyClicksByDateMap.keys()).sort();

    const hourlyAverageClicks = Array.from({ length: 24 }).map((_, hour) => {
      const total = hourlyDates.reduce((acc, date) => acc + (hourlyClicksByDateMap.get(date)?.[hour] ?? 0), 0);
      const average = hourlyDates.length > 0 ? total / hourlyDates.length : 0;
      return {
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        avg_clicks: average,
      };
    });

    const hourlyTotalClicks = Array.from({ length: 24 }).map((_, hour) => {
      const total = hourlyDates.reduce((acc, date) => acc + (hourlyClicksByDateMap.get(date)?.[hour] ?? 0), 0);
      return {
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        total_clicks: total,
      };
    });

    const hourlyAverageImpressions = Array.from({ length: 24 }).map((_, hour) => {
      const total = hourlyDates.reduce((acc, date) => acc + (hourlyImpressionsByDateMap.get(date)?.[hour] ?? 0), 0);
      const average = hourlyDates.length > 0 ? total / hourlyDates.length : 0;
      return {
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        avg_impressions: average,
      };
    });

    const hourlyTotalImpressions = Array.from({ length: 24 }).map((_, hour) => {
      const total = hourlyDates.reduce((acc, date) => acc + (hourlyImpressionsByDateMap.get(date)?.[hour] ?? 0), 0);
      return {
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        total_impressions: total,
      };
    });

    const hourlyAverageSpend = Array.from({ length: 24 }).map((_, hour) => {
      const total = hourlyDates.reduce((acc, date) => acc + (hourlySpendByDateMap.get(date)?.[hour] ?? 0), 0);
      const average = hourlyDates.length > 0 ? total / hourlyDates.length : 0;
      return {
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        avg_spend: average,
      };
    });

    const hourlyTotalSpend = Array.from({ length: 24 }).map((_, hour) => {
      const total = hourlyDates.reduce((acc, date) => acc + (hourlySpendByDateMap.get(date)?.[hour] ?? 0), 0);
      return {
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        total_spend: total,
      };
    });

    const trendAveragesByDay = (() => {
      const chronological = [...trend].sort((left, right) => left.date_start.localeCompare(right.date_start));
      let accSpend = 0;
      let accImpressions = 0;
      let accClicks = 0;

      return chronological.map((point, index) => {
        accSpend += point.spend;
        accImpressions += point.impressions;
        accClicks += point.clicks;

        const denominator = index + 1;
        return {
          date_start: point.date_start,
          avg_spend: denominator > 0 ? accSpend / denominator : 0,
          avg_impressions: denominator > 0 ? accImpressions / denominator : 0,
          avg_clicks: denominator > 0 ? accClicks / denominator : 0,
        };
      });
    })();

    return {
      totalSpend,
      totalImpressions,
      totalReach,
      totalClicks,
      totalCampaigns,
      totalAdsets,
      totalAds,
      overallCtr,
      overallCpc,
      trend,
      trendAveragesByDay,
      trendEfficiency,
      topCampaignsByClicks,
      topAdsByClicks,
      hourlyAverageClicks,
      hourlyTotalClicks,
      hourlyAverageImpressions,
      hourlyTotalImpressions,
      hourlyAverageSpend,
      hourlyTotalSpend,
      hourlyRowsCount: hourlyRowsForTrend.length,
      hourlyRowsRawCount: hourlyRows.length,
    };
  }, [adId, adsetId, campaignId, reportingQuery.data?.hourlyRows, reportingQuery.data?.rows]);

  const isFiltersDirty = campaignId !== draftCampaignId
    || adsetId !== draftAdsetId
    || adId !== draftAdId
    || dateFrom !== draftDateFrom
    || dateTo !== draftDateTo;

  const isComparisonFiltersDirty = comparisonCampaignId !== comparisonDraftCampaignId
    || comparisonAdId !== comparisonDraftAdId
    || comparisonDateFrom !== comparisonDraftDateFrom
    || comparisonDateTo !== comparisonDraftDateTo;
  const hasValidComparisonDateRange = isDateRangeValid(comparisonDraftDateFrom, comparisonDraftDateTo);

  const comparisonFilteredRows = useMemo(() => {
    return comparisonRows.filter((row) => {
      if (comparisonCampaignId && row.campaign_business_id !== comparisonCampaignId) return false;
      if (comparisonAdId && row.ad_business_id !== comparisonAdId) return false;
      return true;
    });
  }, [comparisonAdId, comparisonCampaignId, comparisonRows]);

  const comparisonCampaignPerformance = useMemo(() => {
    return aggregatePerformanceEntries(comparisonFilteredRows, {
      getId: (row) => row.campaign_business_id,
      getTitle: (row) => row.campaign_name,
      getSubtitle: (row) => row.account_name ?? row.account_business_id,
    });
  }, [comparisonFilteredRows]);

  const comparisonAdPerformance = useMemo(() => {
    return aggregatePerformanceEntries(comparisonFilteredRows, {
      getId: (row) => row.ad_business_id,
      getTitle: (row) => row.ad_name ?? row.ad_business_id,
      getSubtitle: (row) => row.campaign_name ?? row.campaign_business_id,
      getCreativeName: (row) => row.creative_name ?? row.creative_id ?? 'Sin creative',
    });
  }, [comparisonFilteredRows]);

  const showHourlyLabels = dashboard.hourlyTotalClicks.length <= 25;
  const showDailyLabels = dashboard.trend.length <= 25;
  const showAverageDailyLabels = dashboard.trendAveragesByDay.length <= 25;
  const showEfficiencyLabels = dashboard.trendEfficiency.length <= 25;

  const resolvedCampaignCompareIds = useMemo(
    () => resolveComparisonSelection(comparisonCampaignPerformance, campaignCompareIds),
    [comparisonCampaignPerformance, campaignCompareIds],
  );

  const resolvedAdCompareIds = useMemo(
    () => resolveComparisonSelection(comparisonAdPerformance, adCompareIds),
    [comparisonAdPerformance, adCompareIds],
  );

  const selectedCampaignComparison = useMemo(
    () => resolveComparisonEntries(comparisonCampaignPerformance, resolvedCampaignCompareIds),
    [comparisonCampaignPerformance, resolvedCampaignCompareIds],
  );

  const selectedAdComparison = useMemo(
    () => resolveComparisonEntries(comparisonAdPerformance, resolvedAdCompareIds),
    [comparisonAdPerformance, resolvedAdCompareIds],
  );

  const selectedCampaignComparisonMetrics = useMemo(
    () => buildComparisonMetrics(selectedCampaignComparison[0], selectedCampaignComparison[1]),
    [selectedCampaignComparison],
  );

  const selectedAdComparisonMetrics = useMemo(
    () => buildComparisonMetrics(selectedAdComparison[0], selectedAdComparison[1]),
    [selectedAdComparison],
  );

  const activeComparison = comparisonType === 'campaigns'
    ? {
        title: 'Comparación directa',
        emptyMessage: 'Todavía no hay suficientes campañas con data para comparar.',
        leftLabel: 'Campaña A',
        rightLabel: 'Campaña B',
        options: comparisonCampaignPerformance,
        selection: resolvedCampaignCompareIds,
        left: selectedCampaignComparison[0],
        right: selectedCampaignComparison[1],
        metrics: selectedCampaignComparisonMetrics,
        onLeftChange: (value: string) => setCampaignCompareIds((current) => resolveComparisonSelection(comparisonCampaignPerformance, { ...current, left: value })),
        onRightChange: (value: string) => setCampaignCompareIds((current) => resolveComparisonSelection(comparisonCampaignPerformance, { ...current, right: value })),
      }
    : {
        title: 'Comparación directa',
        emptyMessage: 'Todavía no hay suficientes ads con data para comparar.',
        leftLabel: 'Ad A',
        rightLabel: 'Ad B',
        options: comparisonAdPerformance,
        selection: resolvedAdCompareIds,
        left: selectedAdComparison[0],
        right: selectedAdComparison[1],
        metrics: selectedAdComparisonMetrics,
        onLeftChange: (value: string) => setAdCompareIds((current) => resolveComparisonSelection(comparisonAdPerformance, { ...current, left: value })),
        onRightChange: (value: string) => setAdCompareIds((current) => resolveComparisonSelection(comparisonAdPerformance, { ...current, right: value })),
      };

  const scopedAudienceRows = useMemo(() => {
    const audienceRows = audienceQuery.data ?? [];
    const reportRows = reportingQuery.data?.rows ?? [];

    // Respetar filtros activos de campaña/adset/ad sobre la audiencia.
    const filteredReportRows = reportRows.filter((row) => {
      if (campaignId && row.campaign_business_id !== campaignId) return false;
      if (adsetId && row.adset_business_id !== adsetId) return false;
      if (adId && row.ad_business_id !== adId) return false;
      return true;
    });

    const scopedAdIds = new Set(
      filteredReportRows
        .map((row) => row.ad_business_id)
        .filter((value): value is string => Boolean(value)),
    );

    if (scopedAdIds.size === 0) {
      return adId || adsetId || campaignId ? [] : audienceRows;
    }

    return audienceRows.filter((row) => scopedAdIds.has(row.ad_business_id));
  }, [audienceQuery.data, reportingQuery.data?.rows, campaignId, adsetId, adId]);

  const metricLabel = audienceMetricMeta[audienceMetric].label;
  const metricFormat = audienceMetricMeta[audienceMetric].format;

  const audienceByAge = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const row of scopedAudienceRows) {
      if (row.breakdown_type !== 'age_gender') continue;
      const key = row.breakdown_value_1 || 'N/D';
      const value = audienceMetric === 'clicks'
        ? Number(row.clicks ?? 0)
        : audienceMetric === 'reach'
          ? Number(row.reach ?? 0)
          : audienceMetric === 'spend'
            ? Number(row.spend ?? 0)
            : Number(row.impressions ?? 0);
      grouped.set(key, (grouped.get(key) ?? 0) + value);
    }

    return Array.from(grouped.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [scopedAudienceRows, audienceMetric]);

  const audienceByGender = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const row of scopedAudienceRows) {
      if (row.breakdown_type !== 'age_gender') continue;
      const key = resolveGenderLabel(row.breakdown_value_2 || '');
      if (!key) continue;
      const value = audienceMetric === 'clicks'
        ? Number(row.clicks ?? 0)
        : audienceMetric === 'reach'
          ? Number(row.reach ?? 0)
          : audienceMetric === 'spend'
            ? Number(row.spend ?? 0)
            : Number(row.impressions ?? 0);
      grouped.set(key, (grouped.get(key) ?? 0) + value);
    }

    return Array.from(grouped.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [scopedAudienceRows, audienceMetric]);

  const audienceByCountry = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const row of scopedAudienceRows) {
      if (row.breakdown_type !== 'country') continue;
      const key = resolveCountryLabel(row.breakdown_value_1 || 'N/D');
      const value = audienceMetric === 'clicks'
        ? Number(row.clicks ?? 0)
        : audienceMetric === 'reach'
          ? Number(row.reach ?? 0)
          : audienceMetric === 'spend'
            ? Number(row.spend ?? 0)
            : Number(row.impressions ?? 0);
      grouped.set(key, (grouped.get(key) ?? 0) + value);
    }

    return Array.from(grouped.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [scopedAudienceRows, audienceMetric]);

  const audienceByPlatform = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const row of scopedAudienceRows) {
      if (row.breakdown_type !== 'publisher_platform') continue;
      const key = row.breakdown_value_1 || 'N/D';
      const value = audienceMetric === 'clicks'
        ? Number(row.clicks ?? 0)
        : audienceMetric === 'reach'
          ? Number(row.reach ?? 0)
          : audienceMetric === 'spend'
            ? Number(row.spend ?? 0)
            : Number(row.impressions ?? 0);
      grouped.set(key, (grouped.get(key) ?? 0) + value);
    }

    return Array.from(grouped.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [scopedAudienceRows, audienceMetric]);

  const audienceByRegion = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const row of scopedAudienceRows) {
      if (row.breakdown_type !== 'region') continue;
      const key = row.breakdown_value_1 || 'N/D';
      const value = audienceMetric === 'clicks'
        ? Number(row.clicks ?? 0)
        : audienceMetric === 'reach'
          ? Number(row.reach ?? 0)
          : audienceMetric === 'spend'
            ? Number(row.spend ?? 0)
            : Number(row.impressions ?? 0);
      grouped.set(key, (grouped.get(key) ?? 0) + value);
    }

    return Array.from(grouped.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [scopedAudienceRows, audienceMetric]);

  const audienceByDevicePlatform = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const row of scopedAudienceRows) {
      if (row.breakdown_type !== 'device_platform') continue;
      const key = row.breakdown_value_1 || 'N/D';
      const value = audienceMetric === 'clicks'
        ? Number(row.clicks ?? 0)
        : audienceMetric === 'reach'
          ? Number(row.reach ?? 0)
          : audienceMetric === 'spend'
            ? Number(row.spend ?? 0)
            : Number(row.impressions ?? 0);
      grouped.set(key, (grouped.get(key) ?? 0) + value);
    }

    return Array.from(grouped.entries())
      .map(([label, total]) => ({ label, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [scopedAudienceRows, audienceMetric]);

  if (reportingQuery.isLoading) {
    return (
      <div className="flex items-center justify-center h-full text-gray-500 bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-red-600 mr-3"></div>
        Cargando dashboard de Meta Ads...
      </div>
    );
  }

  if (reportingQuery.error) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-red-500 space-y-4">
        <Activity size={48} />
        <p className="text-lg font-medium">Error al cargar Meta Ads</p>
        <p className="text-sm text-red-400 max-w-xl text-center">
          {reportingQuery.error instanceof Error ? reportingQuery.error.message : 'Error desconocido'}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <MetaAdsPageHero
        title="Meta Ads Dashboard"
        description="Vista de performance y tendencia diaria."
        icon={<Megaphone className="text-red-600" size={24} />}
      />

      <MetaAdsFiltersPanel
        draftDateFrom={draftDateFrom}
        draftDateTo={draftDateTo}
        onDraftDateFromChange={setDraftDateFrom}
        onDraftDateToChange={setDraftDateTo}
        onPresetApply={({ startDate, endDate }) => {
          setDraftDateFrom(startDate);
          setDraftDateTo(endDate);
          setDateFrom(startDate);
          setDateTo(endDate);
        }}
        extra={(
          <>
            <label className="rounded-2xl bg-white px-0 py-0 text-sm text-gray-600">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Campaña</span>
              <select
                value={draftCampaignId}
                onChange={(event) => {
                  setDraftCampaignId(event.target.value);
                  setDraftAdsetId('');
                  setDraftAdId('');
                }}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              >
                <option value="">Todas las campañas</option>
                {campaignOptions.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="rounded-2xl bg-white px-0 py-0 text-sm text-gray-600">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Conjunto de ads</span>
              <select
                value={draftAdsetId}
                onChange={(event) => {
                  setDraftAdsetId(event.target.value);
                  setDraftAdId('');
                }}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              >
                <option value="">Todos los conjuntos</option>
                {adsetOptions.map((adset) => (
                  <option key={adset.id} value={adset.id}>
                    {adset.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="rounded-2xl bg-white px-0 py-0 text-sm text-gray-600">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ad</span>
              <select
                value={draftAdId}
                onChange={(event) => setDraftAdId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              >
                <option value="">Todos los ads</option>
                {adOptions.map((ad) => (
                  <option key={ad.id} value={ad.id}>
                    {ad.label}
                  </option>
                ))}
              </select>
            </label>
          </>
        )}
        onApply={() => {
          setCampaignId(draftCampaignId);
          setAdsetId(draftAdsetId);
          setAdId(draftAdId);
          setDateFrom(draftDateFrom);
          setDateTo(draftDateTo);
        }}
        onClear={() => {
          setCampaignId('');
          setAdsetId('');
          setAdId('');
          setDateFrom('');
          setDateTo('');
          setDraftCampaignId('');
          setDraftAdsetId('');
          setDraftAdId('');
          setDraftDateFrom('');
          setDraftDateTo('');
        }}
        isApplyDisabled={!isFiltersDirty}
      />

      <Section title="KPI">
        <KpiGrid>
          <KpiCard title="Gasto total" value={formatCompactMetric(dashboard.totalSpend, 'currency')} helper="Inversión agregada del rango" icon={<BadgeDollarSign className="text-red-600" size={18} />} />
          <KpiCard title="Vistas" value={formatCompactMetric(dashboard.totalImpressions, 'number')} helper="Volumen total servido" icon={<Megaphone className="text-red-600" size={18} />} />
          <KpiCard title="Reach" value={formatCompactMetric(dashboard.totalReach, 'number')} helper="Usuarios alcanzados" icon={<Activity className="text-red-600" size={18} />} />
          <KpiCard title="Clicks" value={formatCompactMetric(dashboard.totalClicks, 'number')} helper="Interacciones principales" icon={<MousePointerClick className="text-red-600" size={18} />} />
          <KpiCard title="CTR global" value={formatCompactMetric(dashboard.overallCtr, 'percent')} helper="Clicks / vistas" icon={<Target className="text-red-600" size={18} />} />
          <KpiCard title="CPC global" value={formatCompactMetric(dashboard.overallCpc, 'currency')} helper="Gasto / clicks" icon={<BadgeDollarSign className="text-red-600" size={18} />} />
          <KpiCard title="Campañas con data" value={formatNumberEs(dashboard.totalCampaigns)} helper="Campañas únicas en el rango" icon={<BarChart3 className="text-red-600" size={18} />} />
          <KpiCard title="Ads con data" value={formatNumberEs(dashboard.totalAds)} helper={`${formatNumberEs(dashboard.totalAdsets)} ad sets únicos`} icon={<Megaphone className="text-red-600" size={18} />} />
        </KpiGrid>
      </Section>

      <Section title="Audiencia (Demografia y Posicionamiento)">
        {audienceQuery.error ? (
          <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
            No se pudo cargar audiencia desde SQL: {audienceQuery.error instanceof Error ? audienceQuery.error.message : 'Error desconocido'}
          </div>
        ) : null}

        <div className="mt-4 rounded-xl border border-gray-200 bg-white px-4 py-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Métrica para gráficos de audiencia</label>
          <select
            value={audienceMetric}
            onChange={(event) => setAudienceMetric(event.target.value as AudienceMetricKey)}
            className="mt-2 w-full max-w-xs rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
          >
            <option value="impressions">Vistas</option>
            <option value="reach">Alcance</option>
            <option value="clicks">Clicks</option>
            <option value="spend">Gasto</option>
          </select>
        </div>

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-3 mt-4">
          <ChartCard title={`${metricLabel} por edad`} icon={<Target size={16} className="text-red-600" />}>
            {audienceByAge.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                No hay data de edad todavía.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={audienceByAge} layout="vertical" margin={{ left: 10, right: 10 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="label" width={90} tick={{ fontSize: 11 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), metricFormat)} />
                  <Bar dataKey="total" fill="#dc2626" radius={[0, 8, 8, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title={`${metricLabel} por género`} icon={<Target size={16} className="text-red-600" />}>
            {audienceByGender.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                No hay data de género todavía.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={audienceByGender}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), metricFormat)} />
                  <Bar dataKey="total" fill="#dc2626" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title={`${metricLabel} por país`} icon={<PieChartIcon size={16} className="text-red-600" />}>
            {audienceByCountry.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                No hay data de país todavía.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={audienceByCountry}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), metricFormat)} />
                  <Bar dataKey="total" fill="#f97316" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title={`${metricLabel} por plataforma`} icon={<Megaphone size={16} className="text-red-600" />}>
            {audienceByPlatform.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                No hay data de plataforma todavía.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={audienceByPlatform}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), metricFormat)} />
                  <Bar dataKey="total" fill="#dc2626" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title={`${metricLabel} por región`} icon={<PieChartIcon size={16} className="text-red-600" />}>
            {audienceByRegion.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                No hay data de región todavía.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={audienceByRegion}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), metricFormat)} />
                  <Bar dataKey="total" fill="#f97316" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title={`${metricLabel} por dispositivo`} icon={<Megaphone size={16} className="text-red-600" />}>
            {audienceByDevicePlatform.length === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                No hay data de device platform todavía.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={audienceByDevicePlatform}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), metricFormat)} />
                  <Bar dataKey="total" fill="#dc2626" radius={[8, 8, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </Section>

      <Section title="Gráficos">
        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Clicks</p>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="Clicks por hora (totales)" icon={<MousePointerClick size={16} className="text-red-600" />}>
              {dashboard.hourlyRowsCount === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  Sin data horaria para calcular clicks por hora. Filas en scope: {dashboard.hourlyRowsCount}. Filas horarias totales: {dashboard.hourlyRowsRawCount}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dashboard.hourlyTotalClicks}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={1} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), 'number')} />
                    <Bar dataKey="total_clicks" name="Clicks totales" fill="#dc2626" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                      {showHourlyLabels ? <LabelList dataKey="total_clicks" position="top" formatter={(value) => formatCompactMetric(Number(value ?? 0), 'number')} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Promedio de clicks por hora" icon={<LineChartIcon size={16} className="text-red-600" />}>
              {dashboard.hourlyRowsCount === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  Sin data horaria para calcular promedio por hora. Filas en scope: {dashboard.hourlyRowsCount}. Filas horarias totales: {dashboard.hourlyRowsRawCount}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dashboard.hourlyAverageClicks}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={1} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(value) => Number(value ?? 0).toFixed(2)} />
                    <Line type="monotone" dataKey="avg_clicks" name="Promedio clicks" stroke="#f97316" strokeWidth={2.4} dot={{ r: 2 }} isAnimationActive={false}>
                      {showHourlyLabels ? <LabelList dataKey="avg_clicks" position="top" formatter={(value) => Number(value ?? 0).toFixed(1)} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Clicks por día (totales)" icon={<MousePointerClick size={16} className="text-red-600" />}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dashboard.trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date_start" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), 'number')} />
                  <Bar dataKey="clicks" name="Clicks" fill="#dc2626" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                    {showDailyLabels ? <LabelList dataKey="clicks" position="top" formatter={(value) => formatCompactMetric(Number(value ?? 0), 'number')} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Promedio diario de clicks" icon={<LineChartIcon size={16} className="text-red-600" />}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dashboard.trendAveragesByDay}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date_start" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(value) => Number(value ?? 0).toFixed(2)} />
                  <Line type="monotone" dataKey="avg_clicks" name="Promedio clicks" stroke="#f97316" strokeWidth={2.4} dot={{ r: 2 }} isAnimationActive={false}>
                    {showAverageDailyLabels ? <LabelList dataKey="avg_clicks" position="top" formatter={(value) => Number(value ?? 0).toFixed(1)} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Vistas</p>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="Vistas por hora (totales)" icon={<Megaphone size={16} className="text-red-600" />}>
              {dashboard.hourlyRowsCount === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  Sin data horaria para calcular vistas por hora. Filas en scope: {dashboard.hourlyRowsCount}. Filas horarias totales: {dashboard.hourlyRowsRawCount}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dashboard.hourlyTotalImpressions}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={1} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), 'number')} />
                    <Bar dataKey="total_impressions" name="Vistas totales" fill="#dc2626" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                      {showHourlyLabels ? <LabelList dataKey="total_impressions" position="top" formatter={(value) => formatCompactMetric(Number(value ?? 0), 'number')} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Promedio de vistas por hora" icon={<LineChartIcon size={16} className="text-red-600" />}>
              {dashboard.hourlyRowsCount === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  Sin data horaria para calcular promedio de vistas por hora. Filas en scope: {dashboard.hourlyRowsCount}. Filas horarias totales: {dashboard.hourlyRowsRawCount}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dashboard.hourlyAverageImpressions}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={1} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(value) => Number(value ?? 0).toFixed(2)} />
                    <Line type="monotone" dataKey="avg_impressions" name="Promedio de vistas" stroke="#f97316" strokeWidth={2.4} dot={{ r: 2 }} isAnimationActive={false}>
                      {showHourlyLabels ? <LabelList dataKey="avg_impressions" position="top" formatter={(value) => Number(value ?? 0).toFixed(1)} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Vistas por día (totales)" icon={<LineChartIcon size={16} className="text-red-600" />}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dashboard.trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date_start" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), 'number')} />
                  <Bar dataKey="impressions" name="Vistas" fill="#dc2626" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                    {showDailyLabels ? <LabelList dataKey="impressions" position="top" formatter={(value) => formatCompactMetric(Number(value ?? 0), 'number')} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Promedio diario de vistas" icon={<LineChartIcon size={16} className="text-red-600" />}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dashboard.trendAveragesByDay}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date_start" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} allowDecimals={false} />
                  <Tooltip {...chartTooltipStyle} formatter={(value) => Number(value ?? 0).toFixed(2)} />
                  <Line type="monotone" dataKey="avg_impressions" name="Promedio de vistas" stroke="#f97316" strokeWidth={2.4} dot={{ r: 2 }} isAnimationActive={false}>
                    {showAverageDailyLabels ? <LabelList dataKey="avg_impressions" position="top" formatter={(value) => Number(value ?? 0).toFixed(1)} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Gasto</p>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
            <ChartCard title="Gasto por hora (total)" icon={<BadgeDollarSign size={16} className="text-red-600" />}>
              {dashboard.hourlyRowsCount === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  Sin data horaria para calcular gasto por hora. Filas en scope: {dashboard.hourlyRowsCount}. Filas horarias totales: {dashboard.hourlyRowsRawCount}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <BarChart data={dashboard.hourlyTotalSpend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={1} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), 'currency')} />
                    <Bar dataKey="total_spend" name="Gasto total" fill="#dc2626" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                      {showHourlyLabels ? <LabelList dataKey="total_spend" position="top" formatter={(value) => formatCompactMetric(Number(value ?? 0), 'currency')} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Promedio de gasto por hora" icon={<LineChartIcon size={16} className="text-red-600" />}>
              {dashboard.hourlyRowsCount === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  Sin data horaria para calcular promedio de gasto por hora. Filas en scope: {dashboard.hourlyRowsCount}. Filas horarias totales: {dashboard.hourlyRowsRawCount}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={dashboard.hourlyAverageSpend}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={1} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), 'currency')} />
                    <Line type="monotone" dataKey="avg_spend" name="Promedio gasto" stroke="#f97316" strokeWidth={2.4} dot={{ r: 2 }} isAnimationActive={false}>
                      {showHourlyLabels ? <LabelList dataKey="avg_spend" position="top" formatter={(value) => formatCompactMetric(Number(value ?? 0), 'currency')} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                    </Line>
                  </LineChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Gasto por día (total)" icon={<BadgeDollarSign size={16} className="text-red-600" />}>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={dashboard.trend}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date_start" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), 'currency')} />
                  <Bar dataKey="spend" name="Gasto" fill="#dc2626" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                    {showDailyLabels ? <LabelList dataKey="spend" position="top" formatter={(value) => formatCompactMetric(Number(value ?? 0), 'currency')} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard title="Promedio diario de gasto" icon={<LineChartIcon size={16} className="text-red-600" />}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dashboard.trendAveragesByDay}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date_start" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), 'currency')} />
                  <Line type="monotone" dataKey="avg_spend" name="Promedio gasto" stroke="#f97316" strokeWidth={2.4} dot={{ r: 2 }} isAnimationActive={false}>
                    {showAverageDailyLabels ? <LabelList dataKey="avg_spend" position="top" formatter={(value) => formatCompactMetric(Number(value ?? 0), 'currency')} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>

        <div className="space-y-3">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Eficiencia</p>
          <div className="grid grid-cols-1 gap-4 xl:grid-cols-1">
            <ChartCard title="Tendencia diaria de CTR y CPC" icon={<PieChartIcon size={16} className="text-red-600" />}>
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={dashboard.trendEfficiency}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="date_start" tick={{ fontSize: 12 }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 12 }} tickFormatter={(value) => `${Number(value).toFixed(1)}%`} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 12 }} tickFormatter={(value) => `S/ ${Number(value).toFixed(1)}`} />
                  <Tooltip
                    {...chartTooltipStyle}
                    formatter={(value, key) => {
                      const numeric = Number(value ?? 0);
                      if (key === 'ctr') return formatCompactMetric(numeric, 'percent');
                      return formatCompactMetric(numeric, 'currency');
                    }}
                  />
                  <Line yAxisId="left" type="monotone" dataKey="ctr" name="CTR" stroke="#dc2626" strokeWidth={2.5} dot={{ r: 2 }} isAnimationActive={false}>
                    {showEfficiencyLabels ? <LabelList dataKey="ctr" position="top" formatter={(value) => `${Number(value ?? 0).toFixed(1)}%`} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                  </Line>
                  <Line yAxisId="right" type="monotone" dataKey="cpc" name="CPC" stroke="#f97316" strokeWidth={2.2} dot={{ r: 2 }} isAnimationActive={false}>
                    {showEfficiencyLabels ? <LabelList dataKey="cpc" position="top" formatter={(value) => formatCompactMetric(Number(value ?? 0), 'currency')} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>
      </Section>

      <Section title="Top performers">

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Top campañas" icon={<Megaphone size={16} className="text-red-600" />}>
            <TopPerformanceList items={dashboard.topCampaignsByClicks} emptyMessage="No hay campañas para mostrar con los filtros actuales." />
          </ChartCard>
          <ChartCard title="Top ads" icon={<Activity size={16} className="text-red-600" />}>
            <TopPerformanceList items={dashboard.topAdsByClicks} emptyMessage="No hay ads para mostrar con los filtros actuales." />
          </ChartCard>
        </div>
      </Section>

      <Section title="Comparativas directas">
        <div className="rounded-[24px] border border-gray-200 bg-white p-4 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.8)] space-y-4">
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Filtros de comparativa (independientes)</p>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[minmax(0,18rem)_repeat(2,minmax(0,1fr))_auto] xl:items-end">
            <DateRangePicker
              startDate={comparisonDraftDateFrom}
              endDate={comparisonDraftDateTo}
              onStartDateChange={setComparisonDraftDateFrom}
              onEndDateChange={setComparisonDraftDateTo}
              onPresetApply={({ startDate, endDate }) => {
                setComparisonDraftDateFrom(startDate);
                setComparisonDraftDateTo(endDate);
                setComparisonDateFrom(startDate);
                setComparisonDateTo(endDate);
              }}
              className="xl:col-span-1"
              layoutClassName="grid-cols-1 gap-4 md:grid-cols-2"
            />

            <label className="rounded-2xl bg-white px-0 py-0 text-sm text-gray-600">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Campaña</span>
              <select
                value={comparisonDraftCampaignId}
                onChange={(event) => {
                  setComparisonDraftCampaignId(event.target.value);
                  setComparisonDraftAdId('');
                }}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              >
                <option value="">Todas las campañas</option>
                {comparisonCampaignOptions.map((campaign) => (
                  <option key={campaign.id} value={campaign.id}>
                    {campaign.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="rounded-2xl bg-white px-0 py-0 text-sm text-gray-600">
              <span className="text-xs font-semibold uppercase tracking-wide text-gray-500">Ad</span>
              <select
                value={comparisonDraftAdId}
                onChange={(event) => setComparisonDraftAdId(event.target.value)}
                className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
              >
                <option value="">Todos los ads</option>
                {comparisonAdOptions.map((ad) => (
                  <option key={ad.id} value={ad.id}>
                    {ad.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex items-end justify-start gap-2 xl:justify-end">
              <button
                type="button"
                onClick={() => {
                  setComparisonCampaignId('');
                  setComparisonAdId('');
                  setComparisonDateFrom('');
                  setComparisonDateTo('');
                  setComparisonDraftCampaignId('');
                  setComparisonDraftAdId('');
                  setComparisonDraftDateFrom('');
                  setComparisonDraftDateTo('');
                }}
                className="inline-flex items-center justify-center rounded-xl border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-700 transition hover:border-gray-400 hover:bg-gray-50"
              >
                Limpiar
              </button>
              <button
                type="button"
                onClick={() => {
                  setComparisonCampaignId(comparisonDraftCampaignId);
                  setComparisonAdId(comparisonDraftAdId);
                  setComparisonDateFrom(comparisonDraftDateFrom);
                  setComparisonDateTo(comparisonDraftDateTo);
                }}
                disabled={!isComparisonFiltersDirty || !hasValidComparisonDateRange}
                className="inline-flex items-center justify-center rounded-xl bg-red-600 px-4 py-2 text-sm font-semibold text-white shadow-[0_18px_32px_-18px_rgba(220,38,38,0.95)] transition hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300 disabled:shadow-none"
              >
                Aplicar filtros
              </button>
            </div>
          </div>
        </div>

        <UnifiedComparisonCard
          comparisonType={comparisonType}
          onComparisonTypeChange={setComparisonType}
          title={activeComparison.title}
          leftLabel={activeComparison.leftLabel}
          rightLabel={activeComparison.rightLabel}
          leftValue={activeComparison.selection.left}
          rightValue={activeComparison.selection.right}
          options={activeComparison.options}
          onLeftChange={activeComparison.onLeftChange}
          onRightChange={activeComparison.onRightChange}
          left={activeComparison.left}
          right={activeComparison.right}
          metrics={activeComparison.metrics}
          emptyMessage={activeComparison.emptyMessage}
        />
      </Section>

      {dashboard.trend.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-5 py-8 text-center text-sm text-gray-500">
          No hay datos de Meta Ads para los filtros actuales. Probá limpiarlos o ajustar el rango.
        </div>
      ) : null}
    </div>
  );
}

function TopPerformanceList({
  items,
  emptyMessage,
}: {
  items: Array<{ id: string; title: string; subtitle: string; clicks: number; ctr: number; cpc: number }>;
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">{emptyMessage}</div>;
  }

  return (
    <ul className="space-y-2">
      {items.slice(0, 5).map((item, index) => (
        <li key={item.id} className="rounded-xl border border-gray-100 bg-gray-50/70 px-4 py-3">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">#{index + 1}</p>
              <p className="font-semibold text-gray-900 truncate">{item.title}</p>
              <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>
            </div>
            <div className="grid grid-cols-3 gap-4 text-right shrink-0">
              <Metric label="Clicks" value={formatNumberEs(item.clicks)} />
              <Metric label="CTR" value={`${item.ctr.toFixed(2)}%`} />
              <Metric label="CPC" value={formatCompactMetric(item.cpc, 'currency')} />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</p>
      <p className="text-sm font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function UnifiedComparisonCard({
  comparisonType,
  onComparisonTypeChange,
  title,
  leftLabel,
  rightLabel,
  leftValue,
  rightValue,
  options,
  onLeftChange,
  onRightChange,
  left,
  right,
  metrics,
  emptyMessage,
}: {
  comparisonType: 'campaigns' | 'ads';
  onComparisonTypeChange: (value: 'campaigns' | 'ads') => void;
  title: string;
  leftLabel: string;
  rightLabel: string;
  leftValue: string;
  rightValue: string;
  options: MetaPerformanceEntry[];
  onLeftChange: (value: string) => void;
  onRightChange: (value: string) => void;
  left?: MetaPerformanceEntry;
  right?: MetaPerformanceEntry;
  metrics: MetaComparisonMetric[];
  emptyMessage: string;
}) {
  if (!left || !right) {
    return <ChartCard title={title} icon={<BarChart3 size={16} className="text-red-600" />}><EmptyState message={emptyMessage} /></ChartCard>;
  }

  return (
    <ChartCard title={title} icon={<Trophy size={16} className="text-red-600" />}>
      <ComparisonControls
        comparisonType={comparisonType}
        onComparisonTypeChange={onComparisonTypeChange}
        leftLabel={leftLabel}
        rightLabel={rightLabel}
        leftValue={leftValue}
        rightValue={rightValue}
        options={options}
        onLeftChange={onLeftChange}
        onRightChange={onRightChange}
      />

      <div className="overflow-x-auto rounded-2xl border border-gray-200 bg-white shadow-[0_14px_30px_-24px_rgba(15,23,42,0.75)]">
        <table className="min-w-full table-fixed text-sm">
          <colgroup>
            <col className="w-[20%]" />
            <col className="w-[40%]" />
            <col className="w-[40%]" />
          </colgroup>
          <thead>
            <tr className="text-left text-xs uppercase tracking-[0.2em] text-gray-500 bg-gray-50 border-y border-gray-200">
              <th className="py-3.5 pr-3 pl-4">Métrica</th>
              <th className="py-3.5 px-3">A · {left.title}</th>
              <th className="py-3.5 px-3 pr-4">B · {right.title}</th>
            </tr>
          </thead>
          <tbody>
            {metrics.map((metric) => (
              <tr key={metric.label} className="border-t border-gray-100 text-gray-700 even:bg-gray-50/35">
                <td className="py-3.5 pr-3 pl-4 font-extrabold uppercase text-gray-700">{metric.label}</td>
                <td className={`py-3.5 px-3 text-base tabular-nums ${getComparisonCellClassName(metric, 'left')}`}>{formatCompactMetric(metric.leftValue, metric.format)}</td>
                <td className={`py-3.5 px-3 pr-4 text-base tabular-nums ${getComparisonCellClassName(metric, 'right')}`}>{formatCompactMetric(metric.rightValue, metric.format)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </ChartCard>
  );
}

function ComparisonControls({
  comparisonType,
  onComparisonTypeChange,
  leftLabel,
  rightLabel,
  leftValue,
  rightValue,
  options,
  onLeftChange,
  onRightChange,
}: {
  comparisonType: 'campaigns' | 'ads';
  onComparisonTypeChange: (value: 'campaigns' | 'ads') => void;
  leftLabel: string;
  rightLabel: string;
  leftValue: string;
  rightValue: string;
  options: MetaPerformanceEntry[];
  onLeftChange: (value: string) => void;
  onRightChange: (value: string) => void;
}) {
  return (
    <div className="space-y-4 rounded-[24px] border border-gray-200 bg-gradient-to-br from-gray-50/90 to-white p-4 shadow-[0_16px_34px_-28px_rgba(15,23,42,0.8)]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs font-semibold uppercase tracking-[0.22em] text-gray-500">Tipo de comparativa</p>
        <div className="rounded-2xl border border-gray-200 bg-white p-1 shadow-sm">
          <div className="grid grid-cols-2 gap-1">
          {[
            { key: 'campaigns', label: 'Campañas' },
            { key: 'ads', label: 'Ads' },
          ].map((option) => {
            const isActive = option.key === comparisonType;
            return (
              <button
                key={option.key}
                type="button"
                onClick={() => onComparisonTypeChange(option.key as 'campaigns' | 'ads')}
                className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${isActive ? 'bg-red-600 text-white shadow-sm' : 'text-gray-600 hover:bg-gray-100'}`}
              >
                {option.label}
              </button>
            );
          })}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 items-center gap-3 xl:grid-cols-[1fr_auto_1fr]">
        <ComparisonSelect
          label={leftLabel}
          value={leftValue}
          options={options}
          selectedPeer={rightValue}
          onChange={onLeftChange}
        />
        <div className="mx-auto hidden h-9 items-center rounded-full px-4 text-lg font-extrabold uppercase tracking-[0.1em] text-red-600 xl:inline-flex">
          VS
        </div>
        <ComparisonSelect
          label={rightLabel}
          value={rightValue}
          options={options}
          selectedPeer={leftValue}
          onChange={onRightChange}
        />
      </div>
    </div>
  );
}

function ComparisonSelect({
  label,
  value,
  options,
  selectedPeer,
  onChange,
}: {
  label: string;
  value: string;
  options: MetaPerformanceEntry[];
  selectedPeer: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="rounded-2xl bg-white px-0 py-0 text-sm text-gray-600">
      <span className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-2 w-full rounded-xl border border-gray-300 bg-white px-3 py-2.5 text-sm font-medium text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
      >
        {options.map((option) => (
          <option key={option.id} value={option.id} disabled={option.id === selectedPeer}>
            {option.title} · {option.subtitle}
          </option>
        ))}
      </select>
    </label>
  );
}

function EmptyState({ message }: { message: string }) {
  return <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">{message}</div>;
}

function getComparisonCellClassName(metric: MetaComparisonMetric, side: 'left' | 'right') {
  if (metric.winner === 'tie') return 'font-medium text-gray-700';
  if (metric.winner === side) return 'font-extrabold text-emerald-700 bg-emerald-50/90';
  return 'font-semibold text-red-600 bg-red-50/90';
}

function resolveComparisonEntries(
  entries: MetaPerformanceEntry[],
  selection: { left: string; right: string },
): [MetaPerformanceEntry | undefined, MetaPerformanceEntry | undefined] {
  const normalized = resolveComparisonSelection(entries, selection);
  const left = entries.find((entry) => entry.id === normalized.left);
  const right = entries.find((entry) => entry.id === normalized.right);
  return [left, right];
}

function resolveComparisonSelection(
  entries: MetaPerformanceEntry[],
  selection: { left: string; right: string },
) {
  const [defaultLeft, defaultRight] = pickComparisonPair(entries);
  const fallbackLeft = defaultLeft?.id ?? '';
  const fallbackRight = defaultRight?.id ?? '';
  const validIds = new Set(entries.map((entry) => entry.id));

  const left = validIds.has(selection.left) ? selection.left : fallbackLeft;
  const leftResolved = left || fallbackLeft;
  const rightCandidate = validIds.has(selection.right) ? selection.right : fallbackRight;
  const right = rightCandidate && rightCandidate !== leftResolved
    ? rightCandidate
    : entries.find((entry) => entry.id !== leftResolved)?.id ?? '';

  return {
    left: leftResolved,
    right,
  };
}

function parseHourFromBucket(hourBucket: string) {
  const value = String(hourBucket ?? '').trim();
  if (!value) return null;

  const candidates = [
    value.match(/^(\d{1,2})/),
    value.match(/(\d{1,2}):\d{2}/),
    value.match(/(\d{1,2})\s*(?:am|pm)/i),
  ];

  const rawHour = candidates.map((match) => match?.[1]).find(Boolean);
  if (!rawHour) return null;

  const hour = Number.parseInt(rawHour, 10);
  if (!Number.isInteger(hour) || hour < 0 || hour > 23) return null;
  return hour;
}
