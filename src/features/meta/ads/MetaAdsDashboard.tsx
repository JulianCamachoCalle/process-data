import { useMemo, useState } from 'react';
import { Activity, BadgeDollarSign, BarChart3, Eye, LineChart as LineChartIcon, Megaphone, MessageSquare, MousePointerClick, PieChart as PieChartIcon, Share2, Target, ThumbsUp, Trophy } from 'lucide-react';
import { Bar, BarChart, CartesianGrid, Cell, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
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

type AudienceMetricKey = 'impressions' | 'reach' | 'clicks' | 'spend' | 'reactions' | 'comments' | 'shares' | 'video_views';

type InsightChartMetricKey = 'clicks' | 'impressions' | 'spend' | 'reactions' | 'comments' | 'shares' | 'video_views';

type AudienceInteractionSelection = {
  age: string;
  gender: string;
  country: string;
  platform: string;
  region: string;
  device: string;
};

const EMPTY_AUDIENCE_SELECTION: AudienceInteractionSelection = {
  age: '',
  gender: '',
  country: '',
  platform: '',
  region: '',
  device: '',
};

const audienceMetricMeta: Record<AudienceMetricKey, { label: string; format: 'number' | 'currency' }> = {
  impressions: { label: 'Vistas', format: 'number' },
  reach: { label: 'Alcance', format: 'number' },
  clicks: { label: 'Clicks', format: 'number' },
  spend: { label: 'Gasto', format: 'currency' },
  reactions: { label: 'Reacciones', format: 'number' },
  comments: { label: 'Comentarios', format: 'number' },
  shares: { label: 'Compartidos', format: 'number' },
  video_views: { label: 'Vistas de video', format: 'number' },
};

const insightChartMetricMeta: Record<InsightChartMetricKey, { label: string; format: 'number' | 'currency' }> = {
  clicks: { label: 'Clicks', format: 'number' },
  impressions: { label: 'Vistas', format: 'number' },
  spend: { label: 'Gasto', format: 'currency' },
  reactions: { label: 'Reacciones', format: 'number' },
  comments: { label: 'Comentarios', format: 'number' },
  shares: { label: 'Compartidos', format: 'number' },
  video_views: { label: 'Vistas de video', format: 'number' },
};

function getAudienceMetricValue(row: { [key: string]: unknown }, metric: AudienceMetricKey) {
  if (metric === 'clicks') return Number(row.clicks ?? 0);
  if (metric === 'reach') return Number(row.reach ?? 0);
  if (metric === 'spend') return Number(row.spend ?? 0);
  if (metric === 'reactions') return Number(row.reactions ?? 0);
  if (metric === 'comments') return Number(row.comments ?? 0);
  if (metric === 'shares') return Number(row.shares ?? 0);
  if (metric === 'video_views') return Number(row.video_views ?? 0);
  return Number(row.impressions ?? 0);
}

function getAudienceMetricField(metric: AudienceMetricKey) {
  if (metric === 'reactions') return 'reactions';
  if (metric === 'comments') return 'comments';
  if (metric === 'shares') return 'shares';
  if (metric === 'video_views') return 'video_views';
  return null;
}

function resolveCountryLabel(codeOrName: string) {
  const normalized = (codeOrName ?? '').trim();
  if (!normalized) return 'N/D';

  const normalizedLower = normalized.toLowerCase();
  if (normalizedLower === 'unknown' || normalizedLower === 'undefined' || normalizedLower === 'null' || normalizedLower === 'not set') {
    return 'N/D';
  }

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

function normalizeAudienceLabel(raw: string) {
  const value = (raw ?? '').trim();
  if (!value) return 'N/D';

  const lower = value.toLowerCase();
  if (lower === 'unknown' || lower === 'undefined' || lower === 'null' || lower === 'not set') {
    return 'N/D';
  }

  return value;
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
  const [insightChartMetric, setInsightChartMetric] = useState<InsightChartMetricKey>('clicks');
  const [interactiveDate, setInteractiveDate] = useState('');
  const [audienceSelection, setAudienceSelection] = useState<AudienceInteractionSelection>(EMPTY_AUDIENCE_SELECTION);

  const toggleInteractiveDate = (nextDate: string | null) => {
    if (!nextDate) return;
    setInteractiveDate((current) => (current === nextDate ? '' : nextDate));
  };

  const extractDateFromChartClick = (input: unknown): string | null => {
    if (!input || typeof input !== 'object') return null;
    const record = input as Record<string, unknown>;

    const directDate = record.date_start;
    if (typeof directDate === 'string' && directDate) return directDate;

    const payload = record.payload;
    if (payload && typeof payload === 'object') {
      const payloadDate = (payload as Record<string, unknown>).date_start;
      if (typeof payloadDate === 'string' && payloadDate) return payloadDate;
    }

    const activePayload = record.activePayload;
    if (!Array.isArray(activePayload) || activePayload.length === 0) return null;

    const firstEntry = activePayload[0];
    if (!firstEntry || typeof firstEntry !== 'object') return null;

    const firstPayload = (firstEntry as Record<string, unknown>).payload;
    if (!firstPayload || typeof firstPayload !== 'object') return null;

    const activeDate = (firstPayload as Record<string, unknown>).date_start;
    return typeof activeDate === 'string' && activeDate ? activeDate : null;
  };

  const handleDailyChartClick = (input: unknown) => {
    toggleInteractiveDate(extractDateFromChartClick(input));
  };

  const extractLabelFromChartClick = (input: unknown, key = 'label'): string | null => {
    if (!input || typeof input !== 'object') return null;
    const record = input as Record<string, unknown>;

    const direct = record[key];
    if (typeof direct === 'string' && direct.trim()) return direct.trim();

    const payload = record.payload;
    if (payload && typeof payload === 'object') {
      const payloadValue = (payload as Record<string, unknown>)[key];
      if (typeof payloadValue === 'string' && payloadValue.trim()) return payloadValue.trim();
    }

    return null;
  };

  const extractIdFromChartClick = (input: unknown, key = 'id'): string | null => {
    if (!input || typeof input !== 'object') return null;
    const record = input as Record<string, unknown>;

    const direct = record[key];
    if (typeof direct === 'string' && direct.trim()) return direct.trim();

    const payload = record.payload;
    if (payload && typeof payload === 'object') {
      const payloadValue = (payload as Record<string, unknown>)[key];
      if (typeof payloadValue === 'string' && payloadValue.trim()) return payloadValue.trim();
    }

    return null;
  };

  const toggleAudienceSelection = (key: keyof AudienceInteractionSelection, value: string | null) => {
    const normalized = (value ?? '').trim();
    if (!normalized) return;
    setAudienceSelection((current) => ({
      ...current,
      [key]: current[key] === normalized ? '' : normalized,
    }));
  };

  const clearInteractiveSelections = () => {
    setInteractiveDate('');
    setAudienceSelection(EMPTY_AUDIENCE_SELECTION);
  };

  const resolveDailyBarColor = (rowDate: string, activeColor: string, mutedColor: string) => {
    if (!interactiveDate) return activeColor;
    return rowDate === interactiveDate ? activeColor : mutedColor;
  };

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

  const adsetOptionsByActiveCampaign = useMemo(() => {
    const targetCampaign = campaignId;
    const optionsMap = new Map<string, { id: string; label: string }>();

    for (const row of rows) {
      if (!row.adset_business_id) continue;
      if (targetCampaign && row.campaign_business_id !== targetCampaign) continue;
      if (optionsMap.has(row.adset_business_id)) continue;
      optionsMap.set(row.adset_business_id, {
        id: row.adset_business_id,
        label: row.adset_name ?? row.adset_business_id,
      });
    }

    return Array.from(optionsMap.values()).sort((left, right) => left.label.localeCompare(right.label, 'es'));
  }, [rows, campaignId]);

  const adOptionsByActiveScope = useMemo(() => {
    const optionsMap = new Map<string, { id: string; label: string }>();

    for (const row of rows) {
      if (!row.ad_business_id) continue;
      if (campaignId && row.campaign_business_id !== campaignId) continue;
      if (adsetId && row.adset_business_id !== adsetId) continue;
      if (optionsMap.has(row.ad_business_id)) continue;
      optionsMap.set(row.ad_business_id, {
        id: row.ad_business_id,
        label: row.ad_name ?? row.ad_business_id,
      });
    }

    return Array.from(optionsMap.values()).sort((left, right) => left.label.localeCompare(right.label, 'es'));
  }, [rows, campaignId, adsetId]);

  const rowByAdId = useMemo(() => {
    const index = new Map<string, { campaignId: string; adsetId: string }>();
    for (const row of rows) {
      if (!row.ad_business_id) continue;
      if (index.has(row.ad_business_id)) continue;
      index.set(row.ad_business_id, {
        campaignId: row.campaign_business_id ?? '',
        adsetId: row.adset_business_id ?? '',
      });
    }
    return index;
  }, [rows]);

  const rowByAdsetId = useMemo(() => {
    const index = new Map<string, { campaignId: string }>();
    for (const row of rows) {
      if (!row.adset_business_id) continue;
      if (index.has(row.adset_business_id)) continue;
      index.set(row.adset_business_id, {
        campaignId: row.campaign_business_id ?? '',
      });
    }
    return index;
  }, [rows]);

  const handleTopCampaignClick = (nextCampaignId: string) => {
    const normalized = (nextCampaignId ?? '').trim();
    if (!normalized) return;

    const shouldClear = campaignId === normalized;
    const value = shouldClear ? '' : normalized;
    setCampaignId(value);
    setDraftCampaignId(value);
    setAdsetId('');
    setDraftAdsetId('');
    setAdId('');
    setDraftAdId('');
    clearInteractiveSelections();
  };

  const handleTopAdClick = (nextAdId: string) => {
    const normalized = (nextAdId ?? '').trim();
    if (!normalized) return;

    const shouldClear = adId === normalized;
    if (shouldClear) {
      setAdId('');
      setDraftAdId('');
      clearInteractiveSelections();
      return;
    }

    const context = rowByAdId.get(normalized);
    const campaignFromAd = context?.campaignId ?? '';
    const adsetFromAd = context?.adsetId ?? '';

    setCampaignId(campaignFromAd);
    setDraftCampaignId(campaignFromAd);
    setAdsetId(adsetFromAd);
    setDraftAdsetId(adsetFromAd);
    setAdId(normalized);
    setDraftAdId(normalized);
    clearInteractiveSelections();
  };

  const handleDrillCampaignClick = (nextCampaignId: string | null) => {
    const normalized = (nextCampaignId ?? '').trim();
    if (!normalized) return;
    const shouldClear = campaignId === normalized;
    const value = shouldClear ? '' : normalized;

    setCampaignId(value);
    setDraftCampaignId(value);
    setAdsetId('');
    setDraftAdsetId('');
    setAdId('');
    setDraftAdId('');
  };

  const handleDrillAdsetClick = (nextAdsetId: string | null) => {
    const normalized = (nextAdsetId ?? '').trim();
    if (!normalized) return;
    const shouldClear = adsetId === normalized;
    if (shouldClear) {
      setAdsetId('');
      setDraftAdsetId('');
      setAdId('');
      setDraftAdId('');
      return;
    }

    const context = rowByAdsetId.get(normalized);
    const campaignFromAdset = context?.campaignId ?? campaignId;

    setCampaignId(campaignFromAdset);
    setDraftCampaignId(campaignFromAdset);
    setAdsetId(normalized);
    setDraftAdsetId(normalized);
    setAdId('');
    setDraftAdId('');
  };

  const handleDrillAdClick = (nextAdId: string | null) => {
    const normalized = (nextAdId ?? '').trim();
    if (!normalized) return;
    const shouldClear = adId === normalized;
    if (shouldClear) {
      setAdId('');
      setDraftAdId('');
      return;
    }

    const context = rowByAdId.get(normalized);
    const campaignFromAd = context?.campaignId ?? campaignId;
    const adsetFromAd = context?.adsetId ?? adsetId;

    setCampaignId(campaignFromAd);
    setDraftCampaignId(campaignFromAd);
    setAdsetId(adsetFromAd);
    setDraftAdsetId(adsetFromAd);
    setAdId(normalized);
    setDraftAdId(normalized);
  };

  const comparisonRows = useMemo(() => comparisonQuery.data?.rows ?? [], [comparisonQuery.data?.rows]);

  const audienceScopeKeysForGlobal = useMemo(() => {
    const audienceRows = audienceQuery.data ?? [];
    const reportRows = reportingQuery.data?.rows ?? [];

    const filteredReportRows = reportRows.filter((row) => {
      if (campaignId && row.campaign_business_id !== campaignId) return false;
      if (adsetId && row.adset_business_id !== adsetId) return false;
      if (adId && row.ad_business_id !== adId) return false;
      if (interactiveDate && row.date_start !== interactiveDate) return false;
      return true;
    });

    const audienceRowsInDateScope = interactiveDate
      ? audienceRows.filter((row) => row.date_start === interactiveDate)
      : audienceRows;

    const scopedAdIds = new Set(
      filteredReportRows
        .map((row) => row.ad_business_id)
        .filter((value): value is string => Boolean(value)),
    );

    const scopedAudienceRowsBase = scopedAdIds.size === 0
      ? (adId || adsetId || campaignId ? [] : audienceRowsInDateScope)
      : audienceRowsInDateScope.filter((row) => scopedAdIds.has(row.ad_business_id));

    const activeSelections = Object.entries(audienceSelection)
      .filter(([, value]) => Boolean(value)) as Array<[keyof AudienceInteractionSelection, string]>;

    if (activeSelections.length === 0) return null;

    const keySets: Array<Set<string>> = [];

    for (const [selectionKey, selectedValue] of activeSelections) {
      const currentSet = new Set<string>();

      for (const row of scopedAudienceRowsBase) {
        const rowKey = `${row.ad_business_id}__${row.date_start}`;
        if (!row.ad_business_id || !row.date_start) continue;

        if (selectionKey === 'age' && row.breakdown_type === 'age_gender') {
          const ageLabel = normalizeAudienceLabel(row.breakdown_value_1 || 'N/D');
          if (ageLabel === selectedValue) currentSet.add(rowKey);
        }

        if (selectionKey === 'gender' && row.breakdown_type === 'age_gender') {
          const genderLabel = resolveGenderLabel(row.breakdown_value_2 || '');
          if (genderLabel === selectedValue) currentSet.add(rowKey);
        }

        if (selectionKey === 'country' && row.breakdown_type === 'country') {
          const countryLabel = resolveCountryLabel(row.breakdown_value_1 || 'N/D');
          if (countryLabel === selectedValue) currentSet.add(rowKey);
        }

        if (selectionKey === 'platform' && row.breakdown_type === 'publisher_platform') {
          const platformLabel = normalizeAudienceLabel(row.breakdown_value_1 || 'N/D');
          if (platformLabel === selectedValue) currentSet.add(rowKey);
        }

        if (selectionKey === 'region' && row.breakdown_type === 'region') {
          const regionLabel = normalizeAudienceLabel(row.breakdown_value_1 || 'N/D');
          if (regionLabel === selectedValue) currentSet.add(rowKey);
        }

        if (selectionKey === 'device' && row.breakdown_type === 'device_platform') {
          const deviceLabel = normalizeAudienceLabel(row.breakdown_value_1 || 'N/D');
          if (deviceLabel === selectedValue) currentSet.add(rowKey);
        }
      }

      keySets.push(currentSet);
    }

    if (keySets.length === 0) return null;
    if (keySets.some((set) => set.size === 0)) return new Set<string>();

    const [firstSet, ...restSets] = keySets;
    const intersection = new Set<string>(firstSet);
    for (const key of intersection) {
      if (restSets.some((set) => !set.has(key))) intersection.delete(key);
    }

    return intersection;
  }, [audienceQuery.data, reportingQuery.data?.rows, campaignId, adsetId, adId, interactiveDate, audienceSelection]);

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
      if (interactiveDate && row.date_start !== interactiveDate) return false;
      if (audienceScopeKeysForGlobal) {
        const key = `${row.ad_business_id}__${row.date_start}`;
        if (!audienceScopeKeysForGlobal.has(key)) return false;
      }
      return true;
    });

    const totalSpend = sumBy(filteredRows, (row) => row.spend);
    const totalImpressions = sumBy(filteredRows, (row) => row.impressions);
    const totalReach = sumBy(filteredRows, (row) => row.reach);
    const totalClicks = sumBy(filteredRows, (row) => row.clicks);
    const totalReactions = sumBy(filteredRows, (row) => row.reactions);
    const totalComments = sumBy(filteredRows, (row) => row.comments);
    const totalShares = sumBy(filteredRows, (row) => row.shares);
    const totalVideoViews = sumBy(filteredRows, (row) => row.video_views);
    const totalVideoP25Views = sumBy(filteredRows, (row) => row.video_p25_views);
    const totalVideoP50Views = sumBy(filteredRows, (row) => row.video_p50_views);
    const totalVideoP75Views = sumBy(filteredRows, (row) => row.video_p75_views);
    const totalVideoP95Views = sumBy(filteredRows, (row) => row.video_p95_views);
    const totalVideoP100Views = sumBy(filteredRows, (row) => row.video_p100_views);
    const totalCampaigns = new Set(filteredRows.map((row) => row.campaign_business_id).filter(Boolean)).size;
    const totalAdsets = new Set(filteredRows.map((row) => row.adset_business_id).filter(Boolean)).size;
    const totalAds = new Set(filteredRows.map((row) => row.ad_business_id).filter(Boolean)).size;
    const overallCtr = safeDivide(totalClicks * 100, totalImpressions);
    const overallCpc = safeDivide(totalSpend, totalClicks);
    const retentionP25 = safeDivide(totalVideoP25Views * 100, totalVideoViews);
    const retentionP50 = safeDivide(totalVideoP50Views * 100, totalVideoViews);
    const retentionP75 = safeDivide(totalVideoP75Views * 100, totalVideoViews);
    const retentionP95 = safeDivide(totalVideoP95Views * 100, totalVideoViews);
    const retentionP100 = safeDivide(totalVideoP100Views * 100, totalVideoViews);

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

    const scopedHourlyRowsBase = adId
      ? hourlyRows.filter((row) => row.ad_business_id === adId)
      : adIdsInScope.size > 0
        ? hourlyRows.filter((row) => adIdsInScope.has(row.ad_business_id))
        : hourlyRows;

    const scopedHourlyRows = interactiveDate
      ? scopedHourlyRowsBase.filter((row) => row.date_start === interactiveDate)
      : scopedHourlyRowsBase;

    const hourlyRowsForTrend = scopedHourlyRows.length > 0 ? scopedHourlyRows : (interactiveDate ? [] : hourlyRows);

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
      totalReactions,
      totalComments,
      totalShares,
      totalVideoViews,
      totalVideoP25Views,
      totalVideoP50Views,
      totalVideoP75Views,
      totalVideoP95Views,
      totalVideoP100Views,
      totalCampaigns,
      totalAdsets,
      totalAds,
      overallCtr,
      overallCpc,
      retentionP25,
      retentionP50,
      retentionP75,
      retentionP95,
      retentionP100,
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
      filteredRows,
      hourlyRowsForTrend,
      hourlyRowsCount: hourlyRowsForTrend.length,
      hourlyRowsRawCount: hourlyRows.length,
    };
  }, [adId, adsetId, audienceScopeKeysForGlobal, campaignId, interactiveDate, reportingQuery.data?.hourlyRows, reportingQuery.data?.rows]);

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

  const selectedInsightMetricMeta = insightChartMetricMeta[insightChartMetric];

  const selectedHourlyTotals = useMemo(() => {
    const grouped = new Map<number, number>();
    for (let hour = 0; hour < 24; hour += 1) grouped.set(hour, 0);

    for (const row of dashboard.hourlyRowsForTrend) {
      const hour = parseHourFromBucket(row.hour_bucket);
      if (hour === null) continue;
      const value = Number((row as unknown as Record<string, unknown>)[insightChartMetric] ?? 0);
      grouped.set(hour, (grouped.get(hour) ?? 0) + value);
    }

    return Array.from(grouped.entries()).map(([hour, total]) => ({
      hour,
      label: `${String(hour).padStart(2, '0')}:00`,
      total,
    }));
  }, [dashboard.hourlyRowsForTrend, insightChartMetric]);

  const selectedHourlyAverages = useMemo(() => {
    const byDate = new Map<string, number[]>();

    for (const row of dashboard.hourlyRowsForTrend) {
      const hour = parseHourFromBucket(row.hour_bucket);
      if (hour === null) continue;

      const value = Number((row as unknown as Record<string, unknown>)[insightChartMetric] ?? 0);
      const current = byDate.get(row.date_start) ?? Array<number>(24).fill(0);
      current[hour] += value;
      byDate.set(row.date_start, current);
    }

    const dates = Array.from(byDate.keys());
    return Array.from({ length: 24 }).map((_, hour) => {
      const total = dates.reduce((acc, date) => acc + (byDate.get(date)?.[hour] ?? 0), 0);
      const average = dates.length > 0 ? total / dates.length : 0;
      return {
        hour,
        label: `${String(hour).padStart(2, '0')}:00`,
        average,
      };
    });
  }, [dashboard.hourlyRowsForTrend, insightChartMetric]);

  const selectedDailyTotals = useMemo(() => {
    const grouped = new Map<string, number>();
    for (const row of dashboard.filteredRows) {
      const date = row.date_start;
      if (!date) continue;
      const value = Number((row as unknown as Record<string, unknown>)[insightChartMetric] ?? 0);
      grouped.set(date, (grouped.get(date) ?? 0) + value);
    }

    const rows = Array.from(grouped.entries())
      .map(([date_start, total]) => ({ date_start, total }))
      .sort((a, b) => a.date_start.localeCompare(b.date_start));

    const shouldHideZeroDailyPoints = insightChartMetric === 'video_views'
      || insightChartMetric === 'reactions'
      || insightChartMetric === 'comments'
      || insightChartMetric === 'shares';

    return shouldHideZeroDailyPoints
      ? rows.filter((row) => row.total > 0)
      : rows;
  }, [dashboard.filteredRows, insightChartMetric]);

  const selectedDailyAverages = useMemo(() => {
    let acc = 0;
    return selectedDailyTotals.map((point, index) => {
      acc += point.total;
      return {
        date_start: point.date_start,
        average: acc / (index + 1),
      };
    });
  }, [selectedDailyTotals]);

  const showSelectedHourlyLabels = selectedHourlyTotals.length <= 25;
  const showSelectedDailyLabels = selectedDailyTotals.length <= 25;
  const showSelectedAverageDailyLabels = selectedDailyAverages.length <= 25;

  const selectedCampaignLabel = useMemo(() => {
    if (!campaignId) return '';
    return campaignOptions.find((option) => option.id === campaignId)?.label ?? campaignId;
  }, [campaignId, campaignOptions]);

  const selectedAdsetLabel = useMemo(() => {
    if (!adsetId) return '';
    return adsetOptionsByActiveCampaign.find((option) => option.id === adsetId)?.label
      ?? adsetOptions.find((option) => option.id === adsetId)?.label
      ?? adsetId;
  }, [adsetId, adsetOptions, adsetOptionsByActiveCampaign]);

  const selectedAdLabel = useMemo(() => {
    if (!adId) return '';
    return adOptionsByActiveScope.find((option) => option.id === adId)?.label
      ?? adOptions.find((option) => option.id === adId)?.label
      ?? adId;
  }, [adId, adOptions, adOptionsByActiveScope]);

  const dailyDrillCampaignData = useMemo(() => {
    if (!interactiveDate) return [] as Array<{ id: string; label: string; total: number }>;
    const grouped = new Map<string, { id: string; label: string; total: number }>();

    for (const row of rows) {
      if (row.date_start !== interactiveDate) continue;
      const id = row.campaign_business_id ?? '';
      if (!id) continue;
      const current = grouped.get(id) ?? { id, label: row.campaign_name ?? id, total: 0 };
      current.total += Number((row as unknown as Record<string, unknown>)[insightChartMetric] ?? 0);
      grouped.set(id, current);
    }

    return Array.from(grouped.values()).sort((left, right) => right.total - left.total).slice(0, 12);
  }, [interactiveDate, rows, insightChartMetric]);

  const dailyDrillAdsetData = useMemo(() => {
    if (!interactiveDate) return [] as Array<{ id: string; label: string; total: number }>;
    const grouped = new Map<string, { id: string; label: string; total: number }>();

    for (const row of rows) {
      if (row.date_start !== interactiveDate) continue;
      if (campaignId && row.campaign_business_id !== campaignId) continue;
      const id = row.adset_business_id ?? '';
      if (!id) continue;
      const current = grouped.get(id) ?? { id, label: row.adset_name ?? id, total: 0 };
      current.total += Number((row as unknown as Record<string, unknown>)[insightChartMetric] ?? 0);
      grouped.set(id, current);
    }

    return Array.from(grouped.values()).sort((left, right) => right.total - left.total).slice(0, 12);
  }, [interactiveDate, rows, campaignId, insightChartMetric]);

  const dailyDrillAdData = useMemo(() => {
    if (!interactiveDate) return [] as Array<{ id: string; label: string; total: number }>;
    const grouped = new Map<string, { id: string; label: string; total: number }>();

    for (const row of rows) {
      if (row.date_start !== interactiveDate) continue;
      if (campaignId && row.campaign_business_id !== campaignId) continue;
      if (adsetId && row.adset_business_id !== adsetId) continue;
      const id = row.ad_business_id ?? '';
      if (!id) continue;
      const current = grouped.get(id) ?? { id, label: row.ad_name ?? id, total: 0 };
      current.total += Number((row as unknown as Record<string, unknown>)[insightChartMetric] ?? 0);
      grouped.set(id, current);
    }

    return Array.from(grouped.values()).sort((left, right) => right.total - left.total).slice(0, 12);
  }, [interactiveDate, rows, campaignId, adsetId, insightChartMetric]);

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
      if (interactiveDate && row.date_start !== interactiveDate) return false;
      return true;
    });

    const audienceRowsInDateScope = interactiveDate
      ? audienceRows.filter((row) => row.date_start === interactiveDate)
      : audienceRows;

    const scopedAdIds = new Set(
      filteredReportRows
        .map((row) => row.ad_business_id)
        .filter((value): value is string => Boolean(value)),
    );

    if (scopedAdIds.size === 0) {
      return adId || adsetId || campaignId ? [] : audienceRowsInDateScope;
    }

    return audienceRowsInDateScope.filter((row) => scopedAdIds.has(row.ad_business_id));
  }, [audienceQuery.data, reportingQuery.data?.rows, campaignId, adsetId, adId, interactiveDate]);

  const audienceScopeKeys = useMemo(() => {
    const activeSelections = Object.entries(audienceSelection)
      .filter(([, value]) => Boolean(value)) as Array<[keyof AudienceInteractionSelection, string]>;

    if (activeSelections.length === 0) {
      return null;
    }

    const keySets: Array<Set<string>> = [];

    for (const [selectionKey, selectedValue] of activeSelections) {
      const currentSet = new Set<string>();

      for (const row of scopedAudienceRows) {
        const rowKey = `${row.ad_business_id}__${row.date_start}`;
        if (!row.ad_business_id || !row.date_start) continue;

        if (selectionKey === 'age' && row.breakdown_type === 'age_gender') {
          const ageLabel = normalizeAudienceLabel(row.breakdown_value_1 || 'N/D');
          if (ageLabel === selectedValue) currentSet.add(rowKey);
        }

        if (selectionKey === 'gender' && row.breakdown_type === 'age_gender') {
          const genderLabel = resolveGenderLabel(row.breakdown_value_2 || '');
          if (genderLabel === selectedValue) currentSet.add(rowKey);
        }

        if (selectionKey === 'country' && row.breakdown_type === 'country') {
          const countryLabel = resolveCountryLabel(row.breakdown_value_1 || 'N/D');
          if (countryLabel === selectedValue) currentSet.add(rowKey);
        }

        if (selectionKey === 'platform' && row.breakdown_type === 'publisher_platform') {
          const platformLabel = normalizeAudienceLabel(row.breakdown_value_1 || 'N/D');
          if (platformLabel === selectedValue) currentSet.add(rowKey);
        }

        if (selectionKey === 'region' && row.breakdown_type === 'region') {
          const regionLabel = normalizeAudienceLabel(row.breakdown_value_1 || 'N/D');
          if (regionLabel === selectedValue) currentSet.add(rowKey);
        }

        if (selectionKey === 'device' && row.breakdown_type === 'device_platform') {
          const deviceLabel = normalizeAudienceLabel(row.breakdown_value_1 || 'N/D');
          if (deviceLabel === selectedValue) currentSet.add(rowKey);
        }
      }

      keySets.push(currentSet);
    }

    if (keySets.length === 0) return null;
    if (keySets.some((set) => set.size === 0)) return new Set<string>();

    const [firstSet, ...restSets] = keySets;
    const intersection = new Set<string>(firstSet);
    for (const key of intersection) {
      if (restSets.some((set) => !set.has(key))) {
        intersection.delete(key);
      }
    }

    return intersection;
  }, [audienceSelection, scopedAudienceRows]);

  const scopedAudienceRowsWithInteractions = useMemo(() => {
    if (!audienceScopeKeys) return scopedAudienceRows;
    if (audienceScopeKeys.size === 0) return [];

    return scopedAudienceRows.filter((row) => audienceScopeKeys.has(`${row.ad_business_id}__${row.date_start}`));
  }, [audienceScopeKeys, scopedAudienceRows]);

  const metricLabel = audienceMetricMeta[audienceMetric].label;
  const metricFormat = audienceMetricMeta[audienceMetric].format;

  const audienceFallbackContext = useMemo(() => {
    const breakdownImpressionsByAdDate = new Map<string, number>();
    for (const row of scopedAudienceRows) {
      const key = `${row.ad_business_id}__${row.date_start}`;
      breakdownImpressionsByAdDate.set(key, (breakdownImpressionsByAdDate.get(key) ?? 0) + Number(row.impressions ?? 0));
    }

    const metricTotalsByAdDate = new Map<string, { reactions: number; comments: number; shares: number; video_views: number }>();
    for (const row of dashboard.filteredRows) {
      const key = `${row.ad_business_id}__${row.date_start}`;
      const current = metricTotalsByAdDate.get(key) ?? { reactions: 0, comments: 0, shares: 0, video_views: 0 };
      current.reactions += Number(row.reactions ?? 0);
      current.comments += Number(row.comments ?? 0);
      current.shares += Number(row.shares ?? 0);
      current.video_views += Number(row.video_views ?? 0);
      metricTotalsByAdDate.set(key, current);
    }

    return {
      breakdownImpressionsByAdDate,
      metricTotalsByAdDate,
    };
  }, [scopedAudienceRows, dashboard.filteredRows]);

  const resolveAudienceMetricValue = (row: { [key: string]: unknown }) => {
    const directValue = getAudienceMetricValue(row, audienceMetric);
    if (directValue > 0) return directValue;

    const field = getAudienceMetricField(audienceMetric);
    if (!field) return directValue;

    const adBusinessId = String(row.ad_business_id ?? '');
    const dateStart = String(row.date_start ?? '');
    if (!adBusinessId || !dateStart) return directValue;

    const key = `${adBusinessId}__${dateStart}`;
    const breakdownTotalImpressions = audienceFallbackContext.breakdownImpressionsByAdDate.get(key) ?? 0;
    if (breakdownTotalImpressions <= 0) return directValue;

    const adMetricTotals = audienceFallbackContext.metricTotalsByAdDate.get(key);
    if (!adMetricTotals) return directValue;

    const adMetricValue = Number(adMetricTotals[field] ?? 0);
    if (adMetricValue <= 0) return directValue;

    const rowImpressions = Number(row.impressions ?? 0);
    if (rowImpressions <= 0) return directValue;

    return adMetricValue * (rowImpressions / breakdownTotalImpressions);
  };

  const audienceByAge = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const row of scopedAudienceRowsWithInteractions) {
      if (row.breakdown_type !== 'age_gender') continue;
      const key = normalizeAudienceLabel(row.breakdown_value_1 || 'N/D');
      if (key === 'N/D') continue;
      const value = resolveAudienceMetricValue(row);
      grouped.set(key, (grouped.get(key) ?? 0) + value);
    }

    return Array.from(grouped.entries())
      .map(([label, total]) => ({ label, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [scopedAudienceRowsWithInteractions, audienceMetric]);

  const audienceByGender = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const row of scopedAudienceRowsWithInteractions) {
      if (row.breakdown_type !== 'age_gender') continue;
      const key = resolveGenderLabel(row.breakdown_value_2 || '');
      if (!key) continue;
      const value = resolveAudienceMetricValue(row);
      grouped.set(key, (grouped.get(key) ?? 0) + value);
    }

    return Array.from(grouped.entries())
      .map(([label, total]) => ({ label, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [scopedAudienceRowsWithInteractions, audienceMetric]);

  const audienceByCountry = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const row of scopedAudienceRowsWithInteractions) {
      if (row.breakdown_type !== 'country') continue;
      const key = resolveCountryLabel(row.breakdown_value_1 || 'N/D');
      const value = resolveAudienceMetricValue(row);
      grouped.set(key, (grouped.get(key) ?? 0) + value);
    }

    return Array.from(grouped.entries())
      .map(([label, total]) => ({ label, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [scopedAudienceRowsWithInteractions, audienceMetric]);

  const audienceByPlatform = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const row of scopedAudienceRowsWithInteractions) {
      if (row.breakdown_type !== 'publisher_platform') continue;
      const key = normalizeAudienceLabel(row.breakdown_value_1 || 'N/D');
      const value = resolveAudienceMetricValue(row);
      grouped.set(key, (grouped.get(key) ?? 0) + value);
    }

    return Array.from(grouped.entries())
      .map(([label, total]) => ({ label, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 10);
  }, [scopedAudienceRowsWithInteractions, audienceMetric]);

  const audienceByRegion = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const row of scopedAudienceRowsWithInteractions) {
      if (row.breakdown_type !== 'region') continue;
      const key = normalizeAudienceLabel(row.breakdown_value_1 || 'N/D');
      const value = resolveAudienceMetricValue(row);
      grouped.set(key, (grouped.get(key) ?? 0) + value);
    }

    return Array.from(grouped.entries())
      .map(([label, total]) => ({ label, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [scopedAudienceRowsWithInteractions, audienceMetric]);

  const audienceByDevicePlatform = useMemo(() => {
    const grouped = new Map<string, number>();

    for (const row of scopedAudienceRowsWithInteractions) {
      if (row.breakdown_type !== 'device_platform') continue;
      const key = row.breakdown_value_1 || 'N/D';
      const value = resolveAudienceMetricValue(row);
      grouped.set(key, (grouped.get(key) ?? 0) + value);
    }

    return Array.from(grouped.entries())
      .map(([label, total]) => ({ label, total: Math.round(total) }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 12);
  }, [scopedAudienceRowsWithInteractions, audienceMetric]);

  const activeAudienceSelectionChips = useMemo(() => {
    const chips: Array<{ key: keyof AudienceInteractionSelection; label: string; value: string }> = [];
    if (audienceSelection.age) chips.push({ key: 'age', label: 'Edad', value: audienceSelection.age });
    if (audienceSelection.gender) chips.push({ key: 'gender', label: 'Género', value: audienceSelection.gender });
    if (audienceSelection.country) chips.push({ key: 'country', label: 'País', value: audienceSelection.country });
    if (audienceSelection.platform) chips.push({ key: 'platform', label: 'Plataforma', value: audienceSelection.platform });
    if (audienceSelection.region) chips.push({ key: 'region', label: 'Región', value: audienceSelection.region });
    if (audienceSelection.device) chips.push({ key: 'device', label: 'Dispositivo', value: audienceSelection.device });
    return chips;
  }, [audienceSelection]);

  const hasInteractiveSelections = Boolean(interactiveDate) || activeAudienceSelectionChips.length > 0;

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
          clearInteractiveSelections();
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
          clearInteractiveSelections();
        }}
        isApplyDisabled={!isFiltersDirty}
      />

      {(interactiveDate || campaignId || adsetId || adId) ? (
        <div className="rounded-xl border border-red-100 bg-red-50/40 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2 text-[11px]">
            <span className="font-semibold uppercase tracking-[0.12em] text-gray-600">Contexto activo</span>
            {interactiveDate ? (
              <button
                type="button"
                onClick={() => setInteractiveDate('')}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-1 font-semibold text-red-700"
              >
                Fecha: {interactiveDate}
                <span aria-hidden>×</span>
              </button>
            ) : null}
            {campaignId ? (
              <button
                type="button"
                onClick={() => {
                  setCampaignId('');
                  setDraftCampaignId('');
                  setAdsetId('');
                  setDraftAdsetId('');
                  setAdId('');
                  setDraftAdId('');
                }}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-1 font-semibold text-red-700"
              >
                Campaña: {selectedCampaignLabel}
                <span aria-hidden>×</span>
              </button>
            ) : null}
            {adsetId ? (
              <button
                type="button"
                onClick={() => {
                  setAdsetId('');
                  setDraftAdsetId('');
                  setAdId('');
                  setDraftAdId('');
                }}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-1 font-semibold text-red-700"
              >
                Adset: {selectedAdsetLabel}
                <span aria-hidden>×</span>
              </button>
            ) : null}
            {adId ? (
              <button
                type="button"
                onClick={() => {
                  setAdId('');
                  setDraftAdId('');
                }}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-1 font-semibold text-red-700"
              >
                Ad: {selectedAdLabel}
                <span aria-hidden>×</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <Section title="KPI">
        <KpiGrid>
          <KpiCard title="Gasto total" value={formatCompactMetric(dashboard.totalSpend, 'currency')} helper="Inversión agregada del rango" icon={<BadgeDollarSign className="text-red-600" size={18} />} />
          <KpiCard title="Vistas" value={formatCompactMetric(dashboard.totalImpressions, 'number')} helper="Volumen total servido" icon={<Megaphone className="text-red-600" size={18} />} />
          <KpiCard title="Reach" value={formatCompactMetric(dashboard.totalReach, 'number')} helper="Usuarios alcanzados" icon={<Activity className="text-red-600" size={18} />} />
          <KpiCard title="Clicks" value={formatCompactMetric(dashboard.totalClicks, 'number')} helper="Interacciones principales" icon={<MousePointerClick className="text-red-600" size={18} />} />
          <KpiCard title="Reacciones" value={formatCompactMetric(dashboard.totalReactions, 'number')} helper="Total desde acciones" icon={<ThumbsUp className="text-red-600" size={18} />} />
          <KpiCard title="Comentarios" value={formatCompactMetric(dashboard.totalComments, 'number')} helper="Total desde acciones" icon={<MessageSquare className="text-red-600" size={18} />} />
          <KpiCard title="Compartidos" value={formatCompactMetric(dashboard.totalShares, 'number')} helper="Total desde acciones" icon={<Share2 className="text-red-600" size={18} />} />
          <KpiCard title="Vistas de video" value={formatCompactMetric(dashboard.totalVideoViews, 'number')} helper="video_play_actions" icon={<Eye className="text-red-600" size={18} />} />
          <KpiCard title="CTR global" value={formatCompactMetric(dashboard.overallCtr, 'percent')} helper="Clicks / vistas" icon={<Target className="text-red-600" size={18} />} />
          <KpiCard title="CPC global" value={formatCompactMetric(dashboard.overallCpc, 'currency')} helper="Gasto / clicks" icon={<BadgeDollarSign className="text-red-600" size={18} />} />
          <KpiCard title="Retención 25%" value={formatCompactMetric(dashboard.retentionP25, 'percent')} helper="Video p25 / video views" icon={<Target className="text-red-600" size={18} />} />
          <KpiCard title="Retención 50%" value={formatCompactMetric(dashboard.retentionP50, 'percent')} helper="Video p50 / video views" icon={<Target className="text-red-600" size={18} />} />
          <KpiCard title="Retención 75%" value={formatCompactMetric(dashboard.retentionP75, 'percent')} helper="Video p75 / video views" icon={<Target className="text-red-600" size={18} />} />
          <KpiCard title="Retención 95%" value={formatCompactMetric(dashboard.retentionP95, 'percent')} helper="Video p95 / video views" icon={<Target className="text-red-600" size={18} />} />
          <KpiCard title="Retención 100%" value={formatCompactMetric(dashboard.retentionP100, 'percent')} helper="Video p100 / video views" icon={<Target className="text-red-600" size={18} />} />
          <KpiCard title="Campañas con data" value={formatNumberEs(dashboard.totalCampaigns)} helper="Campañas únicas en el rango" icon={<BarChart3 className="text-red-600" size={18} />} />
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
            <option value="reactions">Reacciones</option>
            <option value="comments">Comentarios</option>
            <option value="shares">Compartidos</option>
            <option value="video_views">Vistas de video</option>
          </select>

          {activeAudienceSelectionChips.length > 0 ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {activeAudienceSelectionChips.map((chip) => (
                <button
                  key={chip.key}
                  type="button"
                  onClick={() => toggleAudienceSelection(chip.key, chip.value)}
                  className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-[11px] font-semibold text-red-700"
                >
                  {chip.label}: {chip.value}
                  <span aria-hidden>×</span>
                </button>
              ))}
            </div>
          ) : null}
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
                  <Bar
                    dataKey="total"
                    fill="#dc2626"
                    radius={[0, 8, 8, 0]}
                    isAnimationActive={false}
                    onClick={(entry) => toggleAudienceSelection('age', extractLabelFromChartClick(entry, 'label'))}
                  >
                    {audienceByAge.map((row) => (
                      <Cell
                        key={`age-${row.label}`}
                        fill={audienceSelection.age && audienceSelection.age !== row.label ? '#fca5a5' : '#dc2626'}
                      />
                    ))}
                  </Bar>
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
                  <Bar
                    dataKey="total"
                    fill="#dc2626"
                    radius={[8, 8, 0, 0]}
                    isAnimationActive={false}
                    onClick={(entry) => toggleAudienceSelection('gender', extractLabelFromChartClick(entry, 'label'))}
                  >
                    {audienceByGender.map((row) => (
                      <Cell
                        key={`gender-${row.label}`}
                        fill={audienceSelection.gender && audienceSelection.gender !== row.label ? '#fca5a5' : '#dc2626'}
                      />
                    ))}
                  </Bar>
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
                  <Bar
                    dataKey="total"
                    fill="#f97316"
                    radius={[8, 8, 0, 0]}
                    isAnimationActive={false}
                    onClick={(entry) => toggleAudienceSelection('country', extractLabelFromChartClick(entry, 'label'))}
                  >
                    {audienceByCountry.map((row) => (
                      <Cell
                        key={`country-${row.label}`}
                        fill={audienceSelection.country && audienceSelection.country !== row.label ? '#fdba74' : '#f97316'}
                      />
                    ))}
                  </Bar>
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
                  <Bar
                    dataKey="total"
                    fill="#dc2626"
                    radius={[8, 8, 0, 0]}
                    isAnimationActive={false}
                    onClick={(entry) => toggleAudienceSelection('platform', extractLabelFromChartClick(entry, 'label'))}
                  >
                    {audienceByPlatform.map((row) => (
                      <Cell
                        key={`platform-${row.label}`}
                        fill={audienceSelection.platform && audienceSelection.platform !== row.label ? '#fca5a5' : '#dc2626'}
                      />
                    ))}
                  </Bar>
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
                  <Bar
                    dataKey="total"
                    fill="#f97316"
                    radius={[8, 8, 0, 0]}
                    isAnimationActive={false}
                    onClick={(entry) => toggleAudienceSelection('region', extractLabelFromChartClick(entry, 'label'))}
                  >
                    {audienceByRegion.map((row) => (
                      <Cell
                        key={`region-${row.label}`}
                        fill={audienceSelection.region && audienceSelection.region !== row.label ? '#fdba74' : '#f97316'}
                      />
                    ))}
                  </Bar>
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
                  <Bar
                    dataKey="total"
                    fill="#dc2626"
                    radius={[8, 8, 0, 0]}
                    isAnimationActive={false}
                    onClick={(entry) => toggleAudienceSelection('device', extractLabelFromChartClick(entry, 'label'))}
                  >
                    {audienceByDevicePlatform.map((row) => (
                      <Cell
                        key={`device-${row.label}`}
                        fill={audienceSelection.device && audienceSelection.device !== row.label ? '#fca5a5' : '#dc2626'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>
        </div>
      </Section>

      <Section title="Gráficos">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-gray-200 bg-white px-4 py-3 text-xs">
          <span className="font-semibold uppercase tracking-[0.14em] text-gray-600">
            Cross-filter por fecha: hacé click en barras/líneas diarias para filtrar todo el dashboard.
          </span>
          {hasInteractiveSelections ? (
            <button
              type="button"
              onClick={clearInteractiveSelections}
              className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-3 py-1.5 font-semibold uppercase tracking-[0.12em] text-gray-700 transition hover:border-red-300 hover:text-red-700"
            >
              Limpiar selección
            </button>
          ) : null}
        </div>

        {hasInteractiveSelections ? (
          <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-red-100 bg-red-50/40 px-3 py-2 text-[11px]">
            {interactiveDate ? (
              <button
                type="button"
                onClick={() => setInteractiveDate('')}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-1 font-semibold text-red-700"
              >
                Fecha: {interactiveDate}
                <span aria-hidden>×</span>
              </button>
            ) : null}
            {activeAudienceSelectionChips.map((chip) => (
              <button
                key={`graph-chip-${chip.key}`}
                type="button"
                onClick={() => toggleAudienceSelection(chip.key, chip.value)}
                className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-white px-2 py-1 font-semibold text-red-700"
              >
                {chip.label}: {chip.value}
                <span aria-hidden>×</span>
              </button>
            ))}
          </div>
        ) : null}

        <div className="rounded-2xl border border-gray-200 bg-white px-4 py-3">
          <label className="text-xs font-semibold uppercase tracking-wide text-gray-500">Métrica de gráficos de insights</label>
          <select
            value={insightChartMetric}
            onChange={(event) => setInsightChartMetric(event.target.value as InsightChartMetricKey)}
            className="mt-2 w-full max-w-sm rounded-xl border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 outline-none transition focus:border-red-300 focus:ring-2 focus:ring-red-100"
          >
            <option value="clicks">Clicks</option>
            <option value="impressions">Vistas</option>
            <option value="spend">Gasto</option>
            <option value="reactions">Reacciones</option>
            <option value="comments">Comentarios</option>
            <option value="shares">Compartidos</option>
            <option value="video_views">Vistas de video</option>
          </select>
        </div>

        {interactiveDate ? (
          <div className="mt-4 grid grid-cols-1 gap-4 xl:grid-cols-3">
            <ChartCard title="Drill por campaña (fecha seleccionada)" icon={<Megaphone size={16} className="text-red-600" />}>
              {dailyDrillCampaignData.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  Sin datos de campañas para la fecha {interactiveDate}.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dailyDrillCampaignData} onClick={(entry) => handleDrillCampaignClick(extractIdFromChartClick(entry, 'id'))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), selectedInsightMetricMeta.format)} />
                    <Bar dataKey="total" fill="#dc2626" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                      {dailyDrillCampaignData.map((row) => (
                        <Cell key={`drill-campaign-${row.id}`} fill={campaignId && campaignId !== row.id ? '#fca5a5' : '#dc2626'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Drill por adset (fecha seleccionada)" icon={<BarChart3 size={16} className="text-red-600" />}>
              {dailyDrillAdsetData.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  Sin datos de adsets para la selección actual.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dailyDrillAdsetData} onClick={(entry) => handleDrillAdsetClick(extractIdFromChartClick(entry, 'id'))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), selectedInsightMetricMeta.format)} />
                    <Bar dataKey="total" fill="#dc2626" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                      {dailyDrillAdsetData.map((row) => (
                        <Cell key={`drill-adset-${row.id}`} fill={adsetId && adsetId !== row.id ? '#fca5a5' : '#dc2626'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>

            <ChartCard title="Drill por ad (fecha seleccionada)" icon={<Activity size={16} className="text-red-600" />}>
              {dailyDrillAdData.length === 0 ? (
                <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                  Sin datos de ads para la selección actual.
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={dailyDrillAdData} onClick={(entry) => handleDrillAdClick(extractIdFromChartClick(entry, 'id'))}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} interval={0} angle={-20} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 12 }} />
                    <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), selectedInsightMetricMeta.format)} />
                    <Bar dataKey="total" fill="#dc2626" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                      {dailyDrillAdData.map((row) => (
                        <Cell key={`drill-ad-${row.id}`} fill={adId && adId !== row.id ? '#fca5a5' : '#dc2626'} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </ChartCard>
          </div>
        ) : null}

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2 mt-4">
          <ChartCard title={`${selectedInsightMetricMeta.label} por hora (totales)`} icon={<BarChart3 size={16} className="text-red-600" />}>
            {dashboard.hourlyRowsCount === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                Sin data horaria para esta métrica. Filas en scope: {dashboard.hourlyRowsCount}. Filas horarias totales: {dashboard.hourlyRowsRawCount}
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={selectedHourlyTotals}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={1} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), selectedInsightMetricMeta.format)} />
                  <Bar dataKey="total" name="Total" fill="#dc2626" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                    {showSelectedHourlyLabels ? <LabelList dataKey="total" position="top" formatter={(value) => formatCompactMetric(Number(value ?? 0), selectedInsightMetricMeta.format)} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title={`Promedio de ${selectedInsightMetricMeta.label.toLowerCase()} por hora`} icon={<LineChartIcon size={16} className="text-red-600" />}>
            {dashboard.hourlyRowsCount === 0 ? (
              <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">
                Sin data horaria para promedios de esta métrica.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={selectedHourlyAverages}>
                  <CartesianGrid strokeDasharray="3 3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} interval={1} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), selectedInsightMetricMeta.format)} />
                  <Line type="monotone" dataKey="average" name="Promedio" stroke="#f97316" strokeWidth={2.4} dot={{ r: 2 }} isAnimationActive={false}>
                    {showSelectedHourlyLabels ? <LabelList dataKey="average" position="top" formatter={(value) => formatCompactMetric(Number(value ?? 0), selectedInsightMetricMeta.format)} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                  </Line>
                </LineChart>
              </ResponsiveContainer>
            )}
          </ChartCard>

          <ChartCard title={`${selectedInsightMetricMeta.label} por día (totales)`} icon={<BarChart3 size={16} className="text-red-600" />}>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={selectedDailyTotals} onClick={handleDailyChartClick}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date_start" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), selectedInsightMetricMeta.format)} />
                <Bar dataKey="total" name="Total" fill="#dc2626" radius={[8, 8, 0, 0]} isAnimationActive={false}>
                  {selectedDailyTotals.map((row) => (
                    <Cell key={`selected-daily-${row.date_start}`} fill={resolveDailyBarColor(row.date_start, '#dc2626', '#fca5a5')} />
                  ))}
                  {showSelectedDailyLabels ? <LabelList dataKey="total" position="top" formatter={(value) => formatCompactMetric(Number(value ?? 0), selectedInsightMetricMeta.format)} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </ChartCard>

          <ChartCard title={`Promedio diario de ${selectedInsightMetricMeta.label.toLowerCase()}`} icon={<LineChartIcon size={16} className="text-red-600" />}>
            <ResponsiveContainer width="100%" height={300}>
              <LineChart data={selectedDailyAverages} onClick={handleDailyChartClick}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date_start" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip {...chartTooltipStyle} formatter={(value) => formatCompactMetric(Number(value ?? 0), selectedInsightMetricMeta.format)} />
                <Line type="monotone" dataKey="average" name="Promedio" stroke="#f97316" strokeWidth={2.4} dot={{ r: 2 }} activeDot={{ r: 4 }} isAnimationActive={false}>
                  {showSelectedAverageDailyLabels ? <LabelList dataKey="average" position="top" formatter={(value) => formatCompactMetric(Number(value ?? 0), selectedInsightMetricMeta.format)} className="fill-gray-600 text-[10px] font-semibold" /> : null}
                </Line>
              </LineChart>
            </ResponsiveContainer>
          </ChartCard>
        </div>
      </Section>

      <Section title="Top performers">

        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          <ChartCard title="Top campañas" icon={<Megaphone size={16} className="text-red-600" />}>
            <TopPerformanceList
              items={dashboard.topCampaignsByClicks}
              emptyMessage="No hay campañas para mostrar con los filtros actuales."
              selectedId={campaignId}
              onSelect={handleTopCampaignClick}
              rankLabel="campaign"
            />
          </ChartCard>
          <ChartCard title="Top ads" icon={<Activity size={16} className="text-red-600" />}>
            <TopPerformanceList
              items={dashboard.topAdsByClicks}
              emptyMessage="No hay ads para mostrar con los filtros actuales."
              selectedId={adId}
              onSelect={handleTopAdClick}
              rankLabel="ad"
            />
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
  selectedId,
  onSelect,
  rankLabel,
}: {
  items: Array<{ id: string; title: string; subtitle: string; clicks: number; ctr: number; cpc: number }>;
  emptyMessage: string;
  selectedId: string;
  onSelect: (id: string) => void;
  rankLabel: 'campaign' | 'ad';
}) {
  if (items.length === 0) {
    return <div className="rounded-xl border border-dashed border-gray-200 bg-gray-50 px-4 py-6 text-sm text-gray-500">{emptyMessage}</div>;
  }

  return (
    <ul className="space-y-2">
      {items.slice(0, 5).map((item, index) => (
        <li
          key={item.id}
          className={`rounded-xl border px-4 py-3 transition ${selectedId === item.id ? 'border-red-300 bg-red-50/60' : 'border-gray-100 bg-gray-50/70 hover:border-red-200 hover:bg-red-50/30'}`}
        >
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-red-600">#{index + 1}</p>
              <p className="font-semibold text-gray-900 truncate">{item.title}</p>
              <p className="text-xs text-gray-500 truncate">{item.subtitle}</p>
              <button
                type="button"
                onClick={() => onSelect(item.id)}
                className={`mt-2 inline-flex items-center rounded-lg border px-2 py-1 text-[11px] font-semibold uppercase tracking-[0.1em] ${selectedId === item.id ? 'border-red-300 bg-red-100 text-red-700' : 'border-gray-300 bg-white text-gray-600 hover:border-red-300 hover:text-red-700'}`}
              >
                {selectedId === item.id ? `Quitar ${rankLabel}` : `Filtrar por ${rankLabel}`}
              </button>
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
