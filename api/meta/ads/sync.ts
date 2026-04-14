import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getSupabaseAdminClient,
  isSecretAuthorized,
  isVercelCronAuthorized,
  verifyAdminSession,
} from '../../kommo/_shared.js';

const META_GRAPH_VERSION = 'v22.0';
const META_GRAPH_BASE_URL = `https://graph.facebook.com/${META_GRAPH_VERSION}`;
const SYNC_SECRET_HEADER = 'x-meta-sync-secret';
const SYNC_SECRET_ENV = 'META_SYNC_SECRET';
const DEFAULT_ACCOUNT_ID_ENV = 'META_ADS_ACCOUNT_ID';
const DEFAULT_INSTAGRAM_USER_ID_ENV = 'META_INSTAGRAM_USER_ID';
const DEFAULT_LIMIT = 100;
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_MAX_RUNTIME_MS = 45_000;
const UPSERT_CHUNK_SIZE = 200;
const RUNTIME_BUFFER_MS = 1_500;

const ALLOWED_DATE_PRESETS = new Set([
  'today',
  'yesterday',
  'this_month',
  'last_month',
  'this_quarter',
  'maximum',
  'data_maximum',
  'last_3d',
  'last_7d',
  'last_14d',
  'last_28d',
  'last_30d',
  'last_90d',
  'last_week_mon_sun',
  'last_week_sun_sat',
  'last_quarter',
  'last_year',
  'this_week_mon_today',
  'this_week_sun_today',
  'this_year',
]);

type JsonRecord = Record<string, unknown>;

type SyncRunInsertRow = {
  provider: string;
  resource: string;
  sync_type: string;
  account_business_id: string | null;
  started_at: string;
  request_params: JsonRecord;
};

type SyncRunUpdateRow = {
  finished_at: string;
  duration_ms: number;
  success: boolean;
  early_stop?: JsonRecord | null;
  totals?: JsonRecord | null;
  resources?: JsonRecord | null;
  error_message?: string | null;
};

type SyncResourceSummary = {
  pages_fetched: number;
  pulled: number;
  upserted: number;
  has_more: boolean;
};

type SyncSummary = {
  account: SyncResourceSummary;
  campaigns: SyncResourceSummary;
  adsets: SyncResourceSummary;
  ads: SyncResourceSummary;
  insights: SyncResourceSummary;
};

type EarlyStopInfo = {
  resource: keyof SyncSummary;
  reason: 'max_runtime_ms';
};

type HourlySyncDebug = {
  pages_fetched: number;
  pulled: number;
  upserted: number;
  has_more: boolean;
  skipped: boolean;
  error: string | null;
};

type MetaSyncResource = 'ads' | 'instagram' | 'pages';

type MetaOembedEndpoint = 'oembed_page' | 'oembed_post' | 'oembed_video' | 'instagram_oembed';

type MetaAccountRow = {
  business_id: string;
  account_id: string | null;
  name: string | null;
  account_status: string | null;
  currency: string | null;
  timezone_name: string | null;
  raw_payload: JsonRecord;
};

type MetaCampaignRow = {
  business_id: string;
  account_business_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  objective: string | null;
  start_time: string | null;
  stop_time: string | null;
  raw_payload: JsonRecord;
};

type MetaAdsetRow = {
  business_id: string;
  campaign_business_id: string;
  account_business_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  optimization_goal: string | null;
  billing_event: string | null;
  raw_payload: JsonRecord;
};

type MetaAdRow = {
  business_id: string;
  adset_business_id: string;
  campaign_business_id: string;
  account_business_id: string;
  name: string | null;
  status: string | null;
  effective_status: string | null;
  creative_id: string | null;
  creative_name: string | null;
  object_story_id: string | null;
  effective_object_story_id: string | null;
  raw_payload: JsonRecord;
};

type MetaInsightRow = {
  ad_business_id: string;
  date_start: string;
  date_stop: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  reactions: number;
  comments: number;
  shares: number;
  video_views: number;
  video_p25_views: number;
  video_p50_views: number;
  video_p75_views: number;
  video_p95_views: number;
  video_p100_views: number;
  ctr: number | null;
  cpc: number | null;
  raw_payload: JsonRecord;
};

type MetaInsightHourlyRow = {
  ad_business_id: string;
  date_start: string;
  hour_bucket: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  reactions: number;
  comments: number;
  shares: number;
  video_views: number;
  video_p25_views: number;
  video_p50_views: number;
  video_p75_views: number;
  video_p95_views: number;
  video_p100_views: number;
  ctr: number | null;
  cpc: number | null;
  raw_payload: JsonRecord;
};

type MetaAdInsightBreakdownType = 'age_gender' | 'country' | 'region' | 'publisher_platform' | 'device_platform';

type MetaAdInsightBreakdownRow = {
  ad_business_id: string;
  date_start: string;
  date_stop: string;
  breakdown_type: MetaAdInsightBreakdownType;
  breakdown_value_1: string;
  breakdown_value_2: string;
  spend: number;
  impressions: number;
  reach: number;
  clicks: number;
  reactions: number;
  comments: number;
  shares: number;
  video_views: number;
  video_p25_views: number;
  video_p50_views: number;
  video_p75_views: number;
  video_p95_views: number;
  video_p100_views: number;
  ctr: number | null;
  cpc: number | null;
  raw_payload: JsonRecord;
};

type MetaPageRow = {
  business_id: string;
  name: string | null;
  category: string | null;
  fan_count: number;
  followers_count: number;
  link: string | null;
  picture_url: string | null;
  has_page_token: boolean;
  last_synced_at: string;
  raw_payload: JsonRecord;
};

type MetaPagePostRow = {
  business_id: string;
  page_business_id: string;
  page_name: string | null;
  message: string | null;
  created_time: string | null;
  permalink_url: string | null;
  full_picture: string | null;
  reactions: number;
  comments: number;
  shares: number;
  raw_payload: JsonRecord;
};

type MetaPageInsightDailyRow = {
  page_business_id: string;
  page_name: string | null;
  metric: string;
  date_end: string;
  value: number;
  raw_payload: JsonRecord;
};

type MetaPagePostInsightSnapshotRow = {
  post_business_id: string;
  page_business_id: string;
  page_name: string | null;
  metric: string;
  period: string;
  snapshot_date: string;
  value: number;
  raw_payload: JsonRecord;
};

function asSingleParam(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' || typeof first === 'number' ? String(first) : undefined;
  }

  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function parseBodyObject(req: VercelRequest): JsonRecord {
  if (!req.body) return {};

  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as JsonRecord
        : {};
    } catch {
      return {};
    }
  }

  return typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as JsonRecord
    : {};
}

function getRequestParam(req: VercelRequest, body: JsonRecord, key: string): string | undefined {
  const bodyValue = asSingleParam(body[key]);
  if (bodyValue !== undefined) {
    return bodyValue;
  }

  return asSingleParam(req.query[key]);
}

function parsePositiveInt(value: string | undefined, fallback: number, max?: number) {
  if (!value?.trim()) return fallback;

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Debe ser un número entero positivo.');
  }

  if (max !== undefined && parsed > max) {
    return max;
  }

  return parsed;
}

function normalizeAccountId(accountIdRaw: string) {
  const trimmed = accountIdRaw.trim();
  if (!trimmed) {
    throw new Error('El parámetro account_id es obligatorio.');
  }

  return trimmed.startsWith('act_') ? trimmed : `act_${trimmed}`;
}

function resolveAccountId(req: VercelRequest, body: JsonRecord) {
  const requestValue = getRequestParam(req, body, 'account_id');
  if (requestValue?.trim()) {
    return normalizeAccountId(requestValue);
  }

  const envValue = process.env[DEFAULT_ACCOUNT_ID_ENV];
  if (envValue?.trim()) {
    return normalizeAccountId(envValue);
  }

  throw new Error('El parámetro account_id es obligatorio. También podés configurar META_ADS_ACCOUNT_ID para corridas automáticas.');
}

function resolveDatePreset(req: VercelRequest, body: JsonRecord) {
  const candidate = (getRequestParam(req, body, 'date_preset') ?? 'last_30d').trim();
  const normalized = candidate.toLowerCase();
  if (ALLOWED_DATE_PRESETS.has(normalized)) {
    return normalized;
  }

  return 'last_30d';
}

function resolveSyncResource(req: VercelRequest, body: JsonRecord): MetaSyncResource {
  const value = (getRequestParam(req, body, 'resource') ?? 'ads').trim().toLowerCase();

  if (value === 'ads' || value === 'instagram' || value === 'pages') {
    return value;
  }

  throw new Error('resource inválido. Permitidos: ads | instagram | pages');
}

function resolvePagesDateRange(req: VercelRequest, body: JsonRecord) {
  const sinceParam = getRequestParam(req, body, 'since')?.trim() ?? '';
  const untilParam = getRequestParam(req, body, 'until')?.trim() ?? '';

  const since = /^\d{4}-\d{2}-\d{2}$/.test(sinceParam) ? sinceParam : null;
  const until = /^\d{4}-\d{2}-\d{2}$/.test(untilParam) ? untilParam : null;

  return { since, until };
}

function isTruthyFlag(value: string | undefined) {
  if (!value) return false;
  const normalized = value.trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

function parseYearMonth(value: string | undefined) {
  if (!value) return null;
  const match = value.trim().match(/^(\d{4})-(\d{2})$/);
  if (!match) return null;

  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return null;
  }

  return { year, month };
}

function toYearMonth(year: number, month: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

function shiftMonth(year: number, month: number, delta: number) {
  const date = new Date(Date.UTC(year, month - 1 + delta, 1));
  return {
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
  };
}

function getMonthBounds(year: number, month: number) {
  const since = `${toYearMonth(year, month)}-01`;
  const untilDate = new Date(Date.UTC(year, month, 0));
  const until = `${toYearMonth(untilDate.getUTCFullYear(), untilDate.getUTCMonth() + 1)}-${String(untilDate.getUTCDate()).padStart(2, '0')}`;
  return { since, until };
}

async function resolvePagesMonthlyBackfillRange(args: {
  req: VercelRequest;
  body: JsonRecord;
  since: string | null;
  until: string | null;
}) {
  if (args.since && args.until) {
    return {
      since: args.since,
      until: args.until,
      backfillMonth: args.since.slice(0, 7),
      source: 'explicit_range' as const,
    };
  }

  const supabase = getSupabaseAdminClient();
  const startMonthParam = parseYearMonth(getRequestParam(args.req, args.body, 'backfill_start_month'));

  const { data: runsData } = await supabase
    .from('meta_sync_runs' as never)
    .select('request_params,started_at' as never)
    .eq('provider' as never, 'meta' as never)
    .eq('resource' as never, 'pages' as never)
    .eq('success' as never, true as never)
    .order('started_at' as never, { ascending: false })
    .limit(50);

  const runs = (runsData ?? []) as Array<{ request_params?: unknown }>;
  const previousBackfillMonthRaw = runs
    .map((row) => ensureObject(row.request_params).backfill_month)
    .map((value) => toNullableText(value))
    .find((value) => Boolean(parseYearMonth(value ?? undefined)));

  const previousBackfillMonth = parseYearMonth(previousBackfillMonthRaw ?? undefined);
  if (previousBackfillMonth) {
    const next = shiftMonth(previousBackfillMonth.year, previousBackfillMonth.month, -1);
    const bounds = getMonthBounds(next.year, next.month);
    return {
      ...bounds,
      backfillMonth: toYearMonth(next.year, next.month),
      source: 'cursor_previous_run' as const,
    };
  }

  if (startMonthParam) {
    const bounds = getMonthBounds(startMonthParam.year, startMonthParam.month);
    return {
      ...bounds,
      backfillMonth: toYearMonth(startMonthParam.year, startMonthParam.month),
      source: 'start_month_param' as const,
    };
  }

  const { data: oldestPosts } = await supabase
    .from('meta_page_posts' as never)
    .select('created_time' as never)
    .order('created_time' as never, { ascending: true })
    .limit(1);

  const oldestCreatedAt = toNullableText((oldestPosts?.[0] as { created_time?: unknown } | undefined)?.created_time);
  if (oldestCreatedAt) {
    const parsed = new Date(oldestCreatedAt);
    if (!Number.isNaN(parsed.getTime())) {
      const oldestYear = parsed.getUTCFullYear();
      const oldestMonth = parsed.getUTCMonth() + 1;
      const next = shiftMonth(oldestYear, oldestMonth, -1);
      const bounds = getMonthBounds(next.year, next.month);
      return {
        ...bounds,
        backfillMonth: toYearMonth(next.year, next.month),
        source: 'oldest_post' as const,
      };
    }
  }

  const now = new Date();
  const fallback = shiftMonth(now.getUTCFullYear(), now.getUTCMonth() + 1, -1);
  const bounds = getMonthBounds(fallback.year, fallback.month);
  return {
    ...bounds,
    backfillMonth: toYearMonth(fallback.year, fallback.month),
    source: 'fallback_last_month' as const,
  };
}

function resolvePagesLatestMonthRange(args: {
  since: string | null;
  until: string | null;
}) {
  if (args.since && args.until) {
    return {
      since: args.since,
      until: args.until,
      latestMonth: args.since.slice(0, 7),
      source: 'explicit_range' as const,
    };
  }

  const now = new Date();
  const lastClosedMonth = shiftMonth(now.getUTCFullYear(), now.getUTCMonth() + 1, -1);
  const bounds = getMonthBounds(lastClosedMonth.year, lastClosedMonth.month);
  return {
    ...bounds,
    latestMonth: toYearMonth(lastClosedMonth.year, lastClosedMonth.month),
    source: 'last_closed_month' as const,
  };
}

function resolveInstagramUserId(req: VercelRequest, body: JsonRecord) {
  const requestValue = getRequestParam(req, body, 'instagram_user_id')?.trim();
  if (requestValue) return requestValue;

  const envValue = process.env[DEFAULT_INSTAGRAM_USER_ID_ENV]?.trim();
  if (envValue) return envValue;

  throw new Error('instagram_user_id es obligatorio. También podés configurar META_INSTAGRAM_USER_ID.');
}

function resolveOembedMode(req: VercelRequest, body: JsonRecord) {
  return (getRequestParam(req, body, 'mode') ?? '').trim().toLowerCase();
}

function buildOembedCandidateUrls(rawValue: string) {
  const normalized = rawValue.trim();
  if (!normalized) return [];

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    return [normalized.replace(/^http:\/\//i, 'https://')];
  }

  const candidates: string[] = [];
  const [pageId, postId] = normalized.split('_');

  if (pageId && postId) {
    candidates.push(`https://www.facebook.com/${pageId}/posts/${postId}`);
    candidates.push(`https://www.facebook.com/permalink.php?story_fbid=${postId}&id=${pageId}`);
  }

  candidates.push(`https://www.facebook.com/${normalized}`);

  return [...new Set(candidates.map((item) => item.trim()).filter(Boolean))];
}

async function resolveObjectStoryPermalink(token: string, objectStoryId: string) {
  try {
    const payload = await fetchMetaJson(token, objectStoryId, { fields: 'permalink_url' });
    return toNullableText(payload.permalink_url);
  } catch {
    return null;
  }
}

async function fetchOembedPreview(
  token: string,
  candidateUrls: string[],
): Promise<{
  endpoint: MetaOembedEndpoint;
  source_url: string;
  html: string;
  provider_name: string | null;
  type: string | null;
  width: number | null;
  height: number | null;
} | null> {
  const endpoints: MetaOembedEndpoint[] = ['oembed_post', 'oembed_video', 'instagram_oembed', 'oembed_page'];

  for (const sourceUrl of candidateUrls) {
    for (const endpoint of endpoints) {
      try {
        const payload = await fetchMetaJson(token, endpoint, {
          url: sourceUrl,
          maxwidth: '560',
          useiframe: 'true',
          omitscript: 'true',
        });

        const html = toNullableText(payload.html);
        if (!html) {
          continue;
        }

        return {
          endpoint,
          source_url: sourceUrl,
          html,
          provider_name: toNullableText(payload.provider_name),
          type: toNullableText(payload.type),
          width: toNullableNumber(payload.width),
          height: toNullableNumber(payload.height),
        };
      } catch {
        // Intentional no-op: probamos el siguiente endpoint/url.
      }
    }
  }

  return null;
}

async function fetchCreativePreviewFallback(token: string, creativeId: string): Promise<{
  image_url: string | null;
  source_url: string | null;
  creative_name: string | null;
}> {
  try {
    const payload = await fetchMetaJson(token, creativeId, {
      fields: 'id,name,image_url,thumbnail_url,object_url,object_story_spec,effective_object_story_id,object_story_id',
    });

    const objectStorySpec = ensureObject(payload.object_story_spec);
    const linkData = ensureObject(objectStorySpec.link_data);
    const videoData = ensureObject(objectStorySpec.video_data);

    const imageUrl = [
      toNullableText(payload.image_url),
      toNullableText(payload.thumbnail_url),
      toNullableText(linkData.picture),
      toNullableText(videoData.image_url),
    ].find(Boolean) ?? null;

    const sourceUrl = [
      toNullableText(payload.object_url),
      toNullableText(linkData.link),
    ].find(Boolean) ?? null;

    return {
      image_url: imageUrl,
      source_url: sourceUrl,
      creative_name: toNullableText(payload.name),
    };
  } catch {
    return {
      image_url: null,
      source_url: null,
      creative_name: null,
    };
  }
}

function asObjectArray(value: unknown): JsonRecord[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => ensureObject(item))
    .filter((item) => Object.keys(item).length > 0);
}

function sanitizePagePayload(payload: JsonRecord) {
  const clone: JsonRecord = { ...payload };
  delete clone.access_token;
  return clone;
}

async function fetchPostInsightMetrics(
  pageToken: string,
  postId: string,
): Promise<{
  rows: Array<{ metric: string; period: string; value: number; raw_payload: JsonRecord }>;
  attempted_batches: number;
  last_error: string | null;
}> {
  const metricBatches = [
    'post_clicks,post_engaged_users,post_impressions,post_total_media_view',
    'post_impressions',
    'post_total_media_view',
    'post_video_views',
    'post_video_views_organic',
    'post_video_views_paid',
    'post_clicks,post_engaged_users',
    'post_clicks',
    'post_engaged_users',
  ];

  let lastError: string | null = null;
  for (const batch of metricBatches) {
    try {
      const payload = await fetchMetaJson(pageToken, `${postId}/insights`, {
        metric: batch,
      });

      const items = asObjectArray(payload.data);
      const rawRows = items
        .map((item) => {
          const metric = toNullableText(item.name);
          const period = toNullableText(item.period) ?? 'lifetime';
          const values = asObjectArray(item.values);
          const latestValue = values[values.length - 1];
          const value = toNumberOrZero(ensureObject(latestValue).value);

          if (!metric) return null;

          return {
            metric,
            period,
            value,
            raw_payload: item,
          };
        })
        .filter((item): item is { metric: string; period: string; value: number; raw_payload: JsonRecord } => item !== null);

      const normalized = (() => {
        const impressionMetrics = new Set([
          'post_impressions',
        ]);
        const videoViewMetrics = new Set([
          'post_total_media_view',
          'post_video_views',
          'post_video_views_organic',
          'post_video_views_paid',
        ]);

        const byMetric = new Map<string, { metric: string; period: string; value: number; raw_payload: JsonRecord }>();

        for (const row of rawRows) {
          const metric = impressionMetrics.has(row.metric)
            ? 'post_impressions'
            : videoViewMetrics.has(row.metric)
              ? 'post_video_views'
              : row.metric;
          const current = byMetric.get(metric);

          if (!current) {
            byMetric.set(metric, {
              metric,
              period: row.period,
              value: row.value,
              raw_payload: row.raw_payload,
            });
            continue;
          }

          byMetric.set(metric, {
            ...current,
            value: current.value + row.value,
          });
        }

        return Array.from(byMetric.values());
      })();

      if (normalized.length > 0) {
        return {
          rows: normalized,
          attempted_batches: metricBatches.indexOf(batch) + 1,
          last_error: null,
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      // Seguimos intentando con el siguiente batch de métricas.
    }
  }

  return {
    rows: [],
    attempted_batches: metricBatches.length,
    last_error: lastError,
  };
}

async function fetchPageInsightMetrics(
  pageToken: string,
  pageId: string,
  since: string | null,
  until: string | null,
): Promise<{
  rows: MetaPageInsightDailyRow[];
  attempted_batches: number;
  last_error: string | null;
}> {
  const metricBatches = [
    'page_impressions,page_reach,page_engaged_users',
    'page_impressions,page_reach',
    'page_impressions',
    'page_reach',
  ];

  let lastError: string | null = null;

  for (const batch of metricBatches) {
    try {
      const insightsParams: Record<string, string> = {
        metric: batch,
        period: 'day',
      };
      if (since) insightsParams.since = since;
      if (until) insightsParams.until = until;

      const insightsPayload = await fetchMetaJson(pageToken, `${pageId}/insights`, insightsParams);
      const insightItems = asObjectArray(insightsPayload.data);

      const rows: MetaPageInsightDailyRow[] = [];
      for (const item of insightItems) {
        const metric = toNullableText(item.name);
        if (!metric) continue;

        const values = asObjectArray(item.values);
        for (const point of values) {
          const endTime = toNullableIsoTimestamp(point.end_time);
          const dateEnd = endTime?.slice(0, 10);
          if (!dateEnd) continue;

          rows.push({
            page_business_id: pageId,
            page_name: null,
            metric,
            date_end: dateEnd,
            value: toNumberOrZero(point.value),
            raw_payload: {
              metric,
              point,
            },
          });
        }
      }

      if (rows.length > 0) {
        return {
          rows,
          attempted_batches: metricBatches.indexOf(batch) + 1,
          last_error: null,
        };
      }
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }
  }

  return {
    rows: [],
    attempted_batches: metricBatches.length,
    last_error: lastError,
  };
}

function requireMetaAccessToken() {
  const token = process.env.META_ACCESS_TOKEN;
  if (!token) {
    throw new Error('Falta la variable de entorno requerida: META_ACCESS_TOKEN');
  }

  return token;
}

function chunkArray<T>(items: T[], chunkSize: number) {
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }

  return chunks;
}

function hasRuntimeBudget(startedAt: number, maxRuntimeMs: number) {
  return Date.now() - startedAt < Math.max(1_000, maxRuntimeMs - RUNTIME_BUFFER_MS);
}

function toNullableText(value: unknown) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim();
  return normalized ? normalized : null;
}

function toNullableIsoTimestamp(value: unknown) {
  const normalized = toNullableText(value);
  if (!normalized) return null;

  const parsed = new Date(normalized);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function toNumberOrZero(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toNullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function ensureObject(value: unknown): JsonRecord {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function getPagingNext(payload: JsonRecord) {
  const paging = ensureObject(payload.paging);
  const next = paging.next;
  return typeof next === 'string' && next.trim() ? next : null;
}

async function parseMetaResponse(response: Response, context: string): Promise<JsonRecord> {
  const raw = await response.text();

  let payload: unknown = {};
  if (raw.trim()) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(`Meta ${context} devolvió JSON inválido: ${reason}`);
    }
  }

  if (!response.ok) {
    const errorPayload = ensureObject(payload);
    const metaError = ensureObject(errorPayload.error);
    const message = toNullableText(metaError.message) ?? raw.trim() ?? 'Error desconocido';
    const code = toNullableText(metaError.code);
    const subcode = toNullableText(metaError.error_subcode);
    const codeLabel = [code, subcode ? `subcode=${subcode}` : null].filter(Boolean).join(', ');
    throw new Error(`Meta ${context} error (${response.status}${codeLabel ? ` | ${codeLabel}` : ''}): ${message}`);
  }

  return ensureObject(payload);
}

async function fetchMetaJson(token: string, pathOrUrl: string, params?: Record<string, string>) {
  const url = pathOrUrl.startsWith('http')
    ? new URL(pathOrUrl)
    : new URL(`${META_GRAPH_BASE_URL}/${pathOrUrl.replace(/^\/+/, '')}`);

  if (params) {
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(key, value);
    }
  }

  url.searchParams.set('access_token', token);

  const response = await fetch(url.toString(), { method: 'GET' });
  return parseMetaResponse(response, pathOrUrl);
}

async function upsertRows(
  table: string,
  rows: JsonRecord[],
  onConflict: string,
) {
  if (rows.length === 0) return 0;

  const supabase = getSupabaseAdminClient();
  let processed = 0;

  for (const chunk of chunkArray(rows, UPSERT_CHUNK_SIZE)) {
    const { error } = await supabase
      .from(table as never)
      .upsert(chunk as never, { onConflict, ignoreDuplicates: false });

    if (error) {
      throw new Error(`No se pudo upsertear ${table}: ${error.message}`);
    }

    processed += chunk.length;
  }

  return processed;
}

async function createSyncRun(row: SyncRunInsertRow) {
  try {
    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('meta_sync_runs')
      .insert(row as never)
      .select('id')
      .single();

    if (error) {
      console.error('[meta-ads-sync] No se pudo crear meta_sync_runs:', error.message);
      return null;
    }

    return toNullableText((data as { id?: unknown } | null)?.id);
  } catch (error) {
    console.error('[meta-ads-sync] Error creando meta_sync_runs:', error);
    return null;
  }
}

async function finalizeSyncRun(syncRunId: string | null, patch: SyncRunUpdateRow) {
  if (!syncRunId) return;

  try {
    const supabase = getSupabaseAdminClient();
    const { error } = await supabase
      .from('meta_sync_runs')
      .update(patch as never)
      .eq('id', syncRunId);

    if (error) {
      console.error('[meta-ads-sync] No se pudo actualizar meta_sync_runs:', error.message);
    }
  } catch (error) {
    console.error('[meta-ads-sync] Error actualizando meta_sync_runs:', error);
  }
}

async function syncPagedResource<TItem, TRow extends JsonRecord>(options: {
  token: string;
  label: keyof SyncSummary;
  path: string;
  params: Record<string, string>;
  maxPages: number;
  startedAt: number;
  maxRuntimeMs: number;
  mapItem: (item: TItem) => TRow | null;
  table: string;
  onConflict: string;
}) {
  const summary: SyncResourceSummary = {
    pages_fetched: 0,
    pulled: 0,
    upserted: 0,
    has_more: false,
  };

  let nextUrl: string | null = options.path;
  let requestParams: Record<string, string> | undefined = options.params;
  let stoppedEarly = false;

  while (nextUrl && summary.pages_fetched < options.maxPages) {
    if (!hasRuntimeBudget(options.startedAt, options.maxRuntimeMs)) {
      stoppedEarly = true;
      break;
    }

    const payload = await fetchMetaJson(options.token, nextUrl, requestParams);
    requestParams = undefined;

    const items = Array.isArray(payload.data) ? payload.data as TItem[] : [];
    const rows = items
      .map((item) => options.mapItem(item))
      .filter((row): row is TRow => row !== null);

    summary.pages_fetched += 1;
    summary.pulled += items.length;
    summary.upserted += await upsertRows(options.table, rows, options.onConflict);

    nextUrl = getPagingNext(payload);
  }

  summary.has_more = stoppedEarly || nextUrl !== null;

  return {
    summary,
    earlyStop: stoppedEarly
      ? ({ resource: options.label, reason: 'max_runtime_ms' } satisfies EarlyStopInfo)
      : null,
  };
}

function getActionMetricValue(payload: JsonRecord, actionType: string) {
  const actions = Array.isArray(payload.actions) ? payload.actions : [];
  let total = 0;
  for (const item of actions) {
    const action = ensureObject(item);
    if (toNullableText(action.action_type) !== actionType) continue;
    total += toNumberOrZero(action.value);
  }
  return Math.trunc(total);
}

function getArrayMetricValue(payload: JsonRecord, key: string) {
  const values = Array.isArray(payload[key]) ? payload[key] : [];
  let total = 0;
  for (const item of values) {
    const metric = ensureObject(item);
    total += toNumberOrZero(metric.value);
  }
  return Math.trunc(total);
}

async function getAdIdsForAccount(accountBusinessId: string, limit = 40) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('meta_ads' as never)
    .select('business_id' as never)
    .eq('account_business_id' as never, accountBusinessId as never)
    .limit(limit);

  if (error) {
    throw new Error(`No se pudo leer ads para hourly fallback: ${error.message}`);
  }

  return ((data ?? []) as Array<{ business_id?: string | null }>)
    .map((row) => toNullableText(row.business_id))
    .filter((value): value is string => Boolean(value));
}

async function fetchMetaCollection(options: {
  token: string;
  path: string;
  params: Record<string, string>;
  maxPages: number;
  startedAt: number;
  maxRuntimeMs: number;
}) {
  const rows: JsonRecord[] = [];
  let pagesFetched = 0;
  let nextUrl: string | null = options.path;
  let params: Record<string, string> | undefined = options.params;
  let stoppedEarly = false;

  while (nextUrl && pagesFetched < options.maxPages) {
    if (!hasRuntimeBudget(options.startedAt, options.maxRuntimeMs)) {
      stoppedEarly = true;
      break;
    }

    const payload = await fetchMetaJson(options.token, nextUrl, params);
    params = undefined;
    const items = Array.isArray(payload.data) ? payload.data as JsonRecord[] : [];
    rows.push(...items);
    pagesFetched += 1;
    nextUrl = getPagingNext(payload);
  }

  return {
    rows,
    pages_fetched: pagesFetched,
    has_more: stoppedEarly || nextUrl !== null,
    stopped_early: stoppedEarly,
  };
}

function mapAccountRow(accountBusinessId: string, payload: JsonRecord): MetaAccountRow {
  return {
    business_id: accountBusinessId,
    account_id: toNullableText(payload.account_id),
    name: toNullableText(payload.name),
    account_status: toNullableText(payload.account_status),
    currency: toNullableText(payload.currency),
    timezone_name: toNullableText(payload.timezone_name),
    raw_payload: payload,
  };
}

function mapCampaignRow(accountBusinessId: string, payload: JsonRecord): MetaCampaignRow | null {
  const businessId = toNullableText(payload.id);
  if (!businessId) return null;

  return {
    business_id: businessId,
    account_business_id: accountBusinessId,
    name: toNullableText(payload.name),
    status: toNullableText(payload.status),
    effective_status: toNullableText(payload.effective_status),
    objective: toNullableText(payload.objective),
    start_time: toNullableIsoTimestamp(payload.start_time),
    stop_time: toNullableIsoTimestamp(payload.stop_time),
    raw_payload: payload,
  };
}

function mapAdsetRow(accountBusinessId: string, payload: JsonRecord): MetaAdsetRow | null {
  const businessId = toNullableText(payload.id);
  const campaignBusinessId = toNullableText(payload.campaign_id);
  if (!businessId || !campaignBusinessId) return null;

  return {
    business_id: businessId,
    campaign_business_id: campaignBusinessId,
    account_business_id: accountBusinessId,
    name: toNullableText(payload.name),
    status: toNullableText(payload.status),
    effective_status: toNullableText(payload.effective_status),
    optimization_goal: toNullableText(payload.optimization_goal),
    billing_event: toNullableText(payload.billing_event),
    raw_payload: payload,
  };
}

function mapAdRow(accountBusinessId: string, payload: JsonRecord): MetaAdRow | null {
  const businessId = toNullableText(payload.id);
  const adsetBusinessId = toNullableText(payload.adset_id);
  const campaignBusinessId = toNullableText(payload.campaign_id);
  if (!businessId || !adsetBusinessId || !campaignBusinessId) return null;

  const creative = ensureObject(payload.creative);

  return {
    business_id: businessId,
    adset_business_id: adsetBusinessId,
    campaign_business_id: campaignBusinessId,
    account_business_id: accountBusinessId,
    name: toNullableText(payload.name),
    status: toNullableText(payload.status),
    effective_status: toNullableText(payload.effective_status),
    creative_id: toNullableText(creative.id),
    creative_name: toNullableText(creative.name),
    object_story_id: toNullableText(creative.object_story_id),
    effective_object_story_id: toNullableText(creative.effective_object_story_id),
    raw_payload: payload,
  };
}

function mapInsightRow(payload: JsonRecord): MetaInsightRow | null {
  const adBusinessId = toNullableText(payload.ad_id);
  const dateStart = toNullableText(payload.date_start);
  const dateStop = toNullableText(payload.date_stop);

  if (!adBusinessId || !dateStart || !dateStop) {
    return null;
  }

  return {
    ad_business_id: adBusinessId,
    date_start: dateStart,
    date_stop: dateStop,
    spend: toNumberOrZero(payload.spend),
    impressions: Math.trunc(toNumberOrZero(payload.impressions)),
    reach: Math.trunc(toNumberOrZero(payload.reach)),
    clicks: Math.trunc(toNumberOrZero(payload.clicks)),
    reactions: getActionMetricValue(payload, 'post_reaction'),
    comments: getActionMetricValue(payload, 'comment'),
    shares: getActionMetricValue(payload, 'post'),
    video_views: Math.max(
      getActionMetricValue(payload, 'video_view'),
      getArrayMetricValue(payload, 'video_play_actions'),
    ),
    video_p25_views: getArrayMetricValue(payload, 'video_p25_watched_actions'),
    video_p50_views: getArrayMetricValue(payload, 'video_p50_watched_actions'),
    video_p75_views: getArrayMetricValue(payload, 'video_p75_watched_actions'),
    video_p95_views: getArrayMetricValue(payload, 'video_p95_watched_actions'),
    video_p100_views: getArrayMetricValue(payload, 'video_p100_watched_actions'),
    ctr: toNullableNumber(payload.ctr),
    cpc: toNullableNumber(payload.cpc),
    raw_payload: payload,
  };
}

function mapInsightBreakdownRow(
  payload: JsonRecord,
  breakdownType: MetaAdInsightBreakdownType,
): MetaAdInsightBreakdownRow | null {
  const adBusinessId = toNullableText(payload.ad_id);
  const dateStart = toNullableText(payload.date_start);
  const dateStop = toNullableText(payload.date_stop);

  if (!adBusinessId || !dateStart || !dateStop) {
    return null;
  }

  let breakdownValue1: string | null = null;
  let breakdownValue2: string | null = null;

  if (breakdownType === 'age_gender') {
    breakdownValue1 = toNullableText(payload.age);
    breakdownValue2 = toNullableText(payload.gender);
  } else if (breakdownType === 'country') {
    breakdownValue1 = toNullableText(payload.country);
  } else if (breakdownType === 'region') {
    breakdownValue1 = toNullableText(payload.region);
  } else if (breakdownType === 'publisher_platform') {
    breakdownValue1 = toNullableText(payload.publisher_platform);
  } else if (breakdownType === 'device_platform') {
    breakdownValue1 = toNullableText(payload.device_platform);
  }

  if (!breakdownValue1) {
    return null;
  }

  return {
    ad_business_id: adBusinessId,
    date_start: dateStart,
    date_stop: dateStop,
    breakdown_type: breakdownType,
    breakdown_value_1: breakdownValue1,
    breakdown_value_2: breakdownValue2 ?? '',
    spend: toNumberOrZero(payload.spend),
    impressions: Math.trunc(toNumberOrZero(payload.impressions)),
    reach: Math.trunc(toNumberOrZero(payload.reach)),
    clicks: Math.trunc(toNumberOrZero(payload.clicks)),
    reactions: getActionMetricValue(payload, 'post_reaction'),
    comments: getActionMetricValue(payload, 'comment'),
    shares: getActionMetricValue(payload, 'post'),
    video_views: Math.max(
      getActionMetricValue(payload, 'video_view'),
      getArrayMetricValue(payload, 'video_play_actions'),
    ),
    video_p25_views: getArrayMetricValue(payload, 'video_p25_watched_actions'),
    video_p50_views: getArrayMetricValue(payload, 'video_p50_watched_actions'),
    video_p75_views: getArrayMetricValue(payload, 'video_p75_watched_actions'),
    video_p95_views: getArrayMetricValue(payload, 'video_p95_watched_actions'),
    video_p100_views: getArrayMetricValue(payload, 'video_p100_watched_actions'),
    ctr: toNullableNumber(payload.ctr),
    cpc: toNullableNumber(payload.cpc),
    raw_payload: payload,
  };
}

function mapInsightHourlyRow(payload: JsonRecord, fallbackBusinessId: string): MetaInsightHourlyRow | null {
  const adBusinessId = toNullableText(payload.ad_id) ?? fallbackBusinessId;
  const dateStart = toNullableText(payload.date_start);
  const hourBucket = toNullableText(payload.hourly_stats_aggregated_by_advertiser_time_zone);

  if (!adBusinessId || !dateStart || !hourBucket) {
    return null;
  }

  return {
    ad_business_id: adBusinessId,
    date_start: dateStart,
    hour_bucket: hourBucket,
    spend: toNumberOrZero(payload.spend),
    impressions: Math.trunc(toNumberOrZero(payload.impressions)),
    reach: Math.trunc(toNumberOrZero(payload.reach)),
    clicks: Math.trunc(toNumberOrZero(payload.clicks)),
    reactions: getActionMetricValue(payload, 'post_reaction'),
    comments: getActionMetricValue(payload, 'comment'),
    shares: getActionMetricValue(payload, 'post'),
    video_views: Math.max(
      getActionMetricValue(payload, 'video_view'),
      getArrayMetricValue(payload, 'video_play_actions'),
    ),
    video_p25_views: getArrayMetricValue(payload, 'video_p25_watched_actions'),
    video_p50_views: getArrayMetricValue(payload, 'video_p50_watched_actions'),
    video_p75_views: getArrayMetricValue(payload, 'video_p75_watched_actions'),
    video_p95_views: getArrayMetricValue(payload, 'video_p95_watched_actions'),
    video_p100_views: getArrayMetricValue(payload, 'video_p100_watched_actions'),
    ctr: toNullableNumber(payload.ctr),
    cpc: toNullableNumber(payload.cpc),
    raw_payload: payload,
  };
}

export default async function metaAdsSyncHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  let syncRunId: string | null = null;
  let startedAt = Date.now();
  let accountBusinessIdForRun: string | null = null;

  try {
    const secretAuthorized = isSecretAuthorized(req, SYNC_SECRET_ENV, SYNC_SECRET_HEADER);
    const cronAuthorized = isVercelCronAuthorized(req);
    if (!secretAuthorized && !cronAuthorized) {
      const auth = verifyAdminSession(req);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error ?? 'No autorizado' });
      }
    }

    const body = parseBodyObject(req);
    const mode = resolveOembedMode(req, body);

    if (mode === 'oembed_preview') {
      const token = requireMetaAccessToken();
      const creativeId = getRequestParam(req, body, 'creative_id')?.trim() ?? '';
      const objectStoryId =
        getRequestParam(req, body, 'effective_object_story_id')?.trim()
        || getRequestParam(req, body, 'object_story_id')?.trim()
        || '';
      const directUrl = getRequestParam(req, body, 'url')?.trim() ?? '';

      if (!objectStoryId && !directUrl) {
        return res.status(400).json({
          error: 'Debés enviar object_story_id (o effective_object_story_id) o url para probar oEmbed.',
        });
      }

      const candidateUrls: string[] = [];
      if (directUrl) {
        candidateUrls.push(...buildOembedCandidateUrls(directUrl));
      }

      if (objectStoryId) {
        const permalink = await resolveObjectStoryPermalink(token, objectStoryId);
        if (permalink) {
          candidateUrls.push(...buildOembedCandidateUrls(permalink));
        }
        candidateUrls.push(...buildOembedCandidateUrls(objectStoryId));
      }

      const dedupedCandidateUrls = [...new Set(candidateUrls.filter(Boolean))];
      if (dedupedCandidateUrls.length === 0) {
        return res.status(400).json({
          error: 'No se pudo construir una URL candidata para oEmbed con los parámetros enviados.',
        });
      }

      const preview = await fetchOembedPreview(token, dedupedCandidateUrls);
      if (!preview) {
        if (creativeId) {
          const fallback = await fetchCreativePreviewFallback(token, creativeId);
          if (fallback.image_url) {
            return res.status(200).json({
              success: true,
              mode,
              preview_type: 'creative_image',
              object_story_id: objectStoryId || null,
              creative_id: creativeId,
              creative_name: fallback.creative_name,
              image_url: fallback.image_url,
              source_url: fallback.source_url,
              warning: 'oEmbed no estuvo disponible para este contenido; se devolvió preview desde creative.',
            });
          }
        }

        return res.status(404).json({
          error: 'No se pudo resolver oEmbed para este ad/publicación. Puede no ser contenido público o no estar disponible para embed.',
          candidates: dedupedCandidateUrls,
          creative_id: creativeId || null,
        });
      }

      return res.status(200).json({
        success: true,
        mode,
        preview_type: 'oembed_html',
        object_story_id: objectStoryId || null,
        matched_endpoint: preview.endpoint,
        source_url: preview.source_url,
        provider_name: preview.provider_name,
        type: preview.type,
        width: preview.width,
        height: preview.height,
        html: preview.html,
      });
    }

    if (mode === 'pages_sql') {
      const { since, until } = resolvePagesDateRange(req, body);
      const supabase = getSupabaseAdminClient();

      const pagesQuery = supabase
        .from('meta_pages' as never)
        .select('business_id,name,category,fan_count,followers_count,link,picture_url,has_page_token' as never)
        .order('followers_count' as never, { ascending: false })
        .order('fan_count' as never, { ascending: false });

      const postsDateStart = since ? `${since}T00:00:00.000Z` : null;
      const postsDateEnd = until ? `${until}T23:59:59.999Z` : null;

      let postsQuery = supabase
        .from('meta_page_posts' as never)
        .select('business_id,page_business_id,page_name,message,created_time,permalink_url,full_picture,reactions,comments,shares' as never)
        .order('created_time' as never, { ascending: false })
        .limit(500);

      if (postsDateStart) postsQuery = postsQuery.gte('created_time' as never, postsDateStart as never);
      if (postsDateEnd) postsQuery = postsQuery.lte('created_time' as never, postsDateEnd as never);

      let insightsQuery = supabase
        .from('meta_page_insights_daily' as never)
        .select('page_business_id,page_name,metric,date_end,value' as never)
        .order('date_end' as never, { ascending: true });

      if (since) insightsQuery = insightsQuery.gte('date_end' as never, since as never);
      if (until) insightsQuery = insightsQuery.lte('date_end' as never, until as never);

      const [pagesResult, postsResult, insightsResult] = await Promise.all([
        pagesQuery,
        postsQuery,
        insightsQuery,
      ]);

      if (pagesResult.error) {
        throw new Error(`No se pudo cargar páginas desde SQL: ${pagesResult.error.message}`);
      }
      if (postsResult.error) {
        throw new Error(`No se pudo cargar posts desde SQL: ${postsResult.error.message}`);
      }
      if (insightsResult.error) {
        throw new Error(`No se pudo cargar page insights desde SQL: ${insightsResult.error.message}`);
      }

      const postIds = Array.from(new Set(
        ((postsResult.data ?? []) as JsonRecord[])
          .map((item) => toNullableText(item.business_id))
          .filter((id): id is string => Boolean(id)),
      ));

      let postInsightsSnapshotsResult:
        | { data: unknown[]; error: null }
        | { data: null; error: { message: string } };

      if (postIds.length === 0) {
        postInsightsSnapshotsResult = { data: [], error: null };
      } else {
        const snapshotsQuery = await supabase
          .from('meta_page_post_insights_snapshots' as never)
          .select('post_business_id,page_business_id,page_name,metric,period,snapshot_date,value' as never)
          .in('post_business_id' as never, postIds as never)
          .order('snapshot_date' as never, { ascending: true });

        postInsightsSnapshotsResult = snapshotsQuery.error
          ? { data: null, error: { message: snapshotsQuery.error.message } }
          : { data: snapshotsQuery.data ?? [], error: null };
      }

      if (postInsightsSnapshotsResult.error) {
        throw new Error(`No se pudo cargar post insights snapshots desde SQL: ${postInsightsSnapshotsResult.error.message}`);
      }

      return res.status(200).json({
        success: true,
        resource: 'pages',
        duration_ms: 0,
        since: since ?? '',
        until: until ?? '',
        pages: (pagesResult.data ?? []).map((item) => ({
          id: toNullableText((item as JsonRecord).business_id),
          name: toNullableText((item as JsonRecord).name),
          category: toNullableText((item as JsonRecord).category),
          fan_count: Math.trunc(toNumberOrZero((item as JsonRecord).fan_count)),
          followers_count: Math.trunc(toNumberOrZero((item as JsonRecord).followers_count)),
          link: toNullableText((item as JsonRecord).link),
          picture_url: toNullableText((item as JsonRecord).picture_url),
          has_page_token: Boolean((item as JsonRecord).has_page_token),
        })),
        posts: (postsResult.data ?? []).map((item) => ({
          id: toNullableText((item as JsonRecord).business_id),
          page_id: toNullableText((item as JsonRecord).page_business_id),
          page_name: toNullableText((item as JsonRecord).page_name),
          message: toNullableText((item as JsonRecord).message),
          created_time: toNullableIsoTimestamp((item as JsonRecord).created_time),
          permalink_url: toNullableText((item as JsonRecord).permalink_url),
          full_picture: toNullableText((item as JsonRecord).full_picture),
          reactions: Math.trunc(toNumberOrZero((item as JsonRecord).reactions)),
          comments: Math.trunc(toNumberOrZero((item as JsonRecord).comments)),
          shares: Math.trunc(toNumberOrZero((item as JsonRecord).shares)),
        })),
        insights: (insightsResult.data ?? []).map((item) => ({
          page_id: toNullableText((item as JsonRecord).page_business_id),
          page_name: toNullableText((item as JsonRecord).page_name),
          metric: toNullableText((item as JsonRecord).metric),
          end_time: toNullableText((item as JsonRecord).date_end)
            ? `${toNullableText((item as JsonRecord).date_end)}T00:00:00.000Z`
            : null,
          value: toNumberOrZero((item as JsonRecord).value),
        })),
        post_insights_snapshots: (postInsightsSnapshotsResult.data ?? []).map((item) => ({
          post_id: toNullableText((item as JsonRecord).post_business_id),
          page_id: toNullableText((item as JsonRecord).page_business_id),
          page_name: toNullableText((item as JsonRecord).page_name),
          metric: toNullableText((item as JsonRecord).metric),
          period: toNullableText((item as JsonRecord).period),
          snapshot_date: toNullableText((item as JsonRecord).snapshot_date),
          value: toNumberOrZero((item as JsonRecord).value),
        })),
        errors: [],
        permissions_hint: ['sql_mode_only'],
      });
    }

    if (mode === 'ads_audience_sql') {
      const dateFrom = getRequestParam(req, body, 'date_from')?.trim() ?? '';
      const dateTo = getRequestParam(req, body, 'date_to')?.trim() ?? '';
      const adId = getRequestParam(req, body, 'ad_id')?.trim() ?? '';

      const supabase = getSupabaseAdminClient();

      let audienceQuery = supabase
        .from('meta_ad_insights_breakdown_daily' as never)
        .select('ad_business_id,date_start,date_stop,breakdown_type,breakdown_value_1,breakdown_value_2,spend,impressions,reach,clicks,reactions,comments,shares,video_views,video_p25_views,video_p50_views,video_p75_views,video_p95_views,video_p100_views,ctr,cpc' as never)
        .order('date_start' as never, { ascending: false });

      if (dateFrom) {
        audienceQuery = audienceQuery.gte('date_start' as never, dateFrom as never);
      }
      if (dateTo) {
        audienceQuery = audienceQuery.lte('date_start' as never, dateTo as never);
      }
      if (adId) {
        audienceQuery = audienceQuery.eq('ad_business_id' as never, adId as never);
      }

      const { data, error } = await audienceQuery.limit(5000);
      if (error) {
        throw new Error(`No se pudo cargar audiencia de ads desde SQL: ${error.message}`);
      }

      return res.status(200).json({
        success: true,
        rows: (data ?? []).map((item) => ({
          ad_business_id: toNullableText((item as JsonRecord).ad_business_id),
          date_start: toNullableText((item as JsonRecord).date_start),
          date_stop: toNullableText((item as JsonRecord).date_stop),
          breakdown_type: toNullableText((item as JsonRecord).breakdown_type),
          breakdown_value_1: toNullableText((item as JsonRecord).breakdown_value_1),
          breakdown_value_2: toNullableText((item as JsonRecord).breakdown_value_2) ?? '',
          spend: toNullableNumber((item as JsonRecord).spend),
          impressions: toNullableNumber((item as JsonRecord).impressions),
          reach: toNullableNumber((item as JsonRecord).reach),
          clicks: toNullableNumber((item as JsonRecord).clicks),
          reactions: toNullableNumber((item as JsonRecord).reactions),
          comments: toNullableNumber((item as JsonRecord).comments),
          shares: toNullableNumber((item as JsonRecord).shares),
          video_views: toNullableNumber((item as JsonRecord).video_views),
          video_p25_views: toNullableNumber((item as JsonRecord).video_p25_views),
          video_p50_views: toNullableNumber((item as JsonRecord).video_p50_views),
          video_p75_views: toNullableNumber((item as JsonRecord).video_p75_views),
          video_p95_views: toNullableNumber((item as JsonRecord).video_p95_views),
          video_p100_views: toNullableNumber((item as JsonRecord).video_p100_views),
          ctr: toNullableNumber((item as JsonRecord).ctr),
          cpc: toNullableNumber((item as JsonRecord).cpc),
        })),
      });
    }

    const resource = resolveSyncResource(req, body);
    const accountBusinessId = resource === 'ads' ? resolveAccountId(req, body) : null;
    accountBusinessIdForRun = accountBusinessId;
    const pagesBackfillMonthly =
      resource === 'pages' && isTruthyFlag(getRequestParam(req, body, 'backfill_monthly'));
    const pagesLatestMonthly =
      resource === 'pages'
      && !pagesBackfillMonthly
      && isTruthyFlag(getRequestParam(req, body, 'latest_monthly'));
    const requestedPagesRange = resource === 'pages' ? resolvePagesDateRange(req, body) : { since: null, until: null };
    const resolvedPagesRange = pagesBackfillMonthly
      ? await resolvePagesMonthlyBackfillRange({
        req,
        body,
        since: requestedPagesRange.since,
        until: requestedPagesRange.until,
      })
      : null;
    const resolvedPagesLatestRange = pagesLatestMonthly
      ? resolvePagesLatestMonthRange({
        since: requestedPagesRange.since,
        until: requestedPagesRange.until,
      })
      : null;
    const effectivePagesSince = resolvedPagesRange?.since ?? resolvedPagesLatestRange?.since ?? requestedPagesRange.since;
    const effectivePagesUntil = resolvedPagesRange?.until ?? resolvedPagesLatestRange?.until ?? requestedPagesRange.until;
    const datePreset = resolveDatePreset(req, body);
    const timeIncrement = getRequestParam(req, body, 'time_increment')?.trim() || '1';
    const limit = parsePositiveInt(getRequestParam(req, body, 'limit'), DEFAULT_LIMIT, 500);
    const maxPages = parsePositiveInt(getRequestParam(req, body, 'max_pages'), DEFAULT_MAX_PAGES);
    const postLimit = parsePositiveInt(getRequestParam(req, body, 'post_limit'), limit, 100);
    const postMaxPages = parsePositiveInt(getRequestParam(req, body, 'post_max_pages'), maxPages);
    const hourlyAdLimit = parsePositiveInt(getRequestParam(req, body, 'hourly_ad_limit'), 100, 500);
    const maxRuntimeMs = parsePositiveInt(
      getRequestParam(req, body, 'max_runtime_ms'),
      DEFAULT_MAX_RUNTIME_MS,
    );

    const token = requireMetaAccessToken();
    startedAt = Date.now();

    syncRunId = await createSyncRun({
      provider: 'meta',
      resource,
      sync_type: secretAuthorized ? 'secret' : 'manual',
      account_business_id: accountBusinessId,
      started_at: new Date(startedAt).toISOString(),
      request_params: {
        account_id: accountBusinessId,
        resource,
        date_preset: datePreset,
        time_increment: timeIncrement,
        limit,
        max_pages: maxPages,
        post_limit: postLimit,
        post_max_pages: postMaxPages,
        hourly_ad_limit: hourlyAdLimit,
        max_runtime_ms: maxRuntimeMs,
        since: resource === 'pages' ? effectivePagesSince : null,
        until: resource === 'pages' ? effectivePagesUntil : null,
        backfill_monthly: pagesBackfillMonthly,
        backfill_month: resolvedPagesRange?.backfillMonth ?? null,
        backfill_source: resolvedPagesRange?.source ?? null,
        latest_monthly: pagesLatestMonthly,
        latest_month: resolvedPagesLatestRange?.latestMonth ?? null,
        latest_source: resolvedPagesLatestRange?.source ?? null,
      },
    });

    if (resource === 'instagram') {
      const instagramUserId = resolveInstagramUserId(req, body);

      const profilePayload = await fetchMetaJson(token, instagramUserId, {
        fields: 'id,username,name,followers_count,follows_count,media_count,profile_picture_url',
      });

      const mediaResult = await fetchMetaCollection({
        token,
        path: `${instagramUserId}/media`,
        params: {
          fields: 'id,caption,media_type,media_url,permalink,timestamp,like_count,comments_count',
          limit: String(limit),
        },
        maxPages,
        startedAt,
        maxRuntimeMs,
      });

      const durationMs = Date.now() - startedAt;
      const responsePayload = {
        success: true,
        resource,
        instagram_user_id: instagramUserId,
        duration_ms: durationMs,
        profile: {
          id: toNullableText(profilePayload.id),
          username: toNullableText(profilePayload.username),
          name: toNullableText(profilePayload.name),
          followers_count: toNumberOrZero(profilePayload.followers_count),
          follows_count: toNumberOrZero(profilePayload.follows_count),
          media_count: toNumberOrZero(profilePayload.media_count),
          profile_picture_url: toNullableText(profilePayload.profile_picture_url),
        },
        media: {
          pages_fetched: mediaResult.pages_fetched,
          pulled: mediaResult.rows.length,
          has_more: mediaResult.has_more,
          stopped_early: mediaResult.stopped_early,
          rows: mediaResult.rows,
        },
      };

      await finalizeSyncRun(syncRunId, {
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        success: true,
        early_stop: mediaResult.stopped_early
          ? { resource: 'insights', reason: 'max_runtime_ms' }
          : null,
        totals: {
          pulled: mediaResult.rows.length,
          upserted: 0,
        },
        resources: {
          profile: { pulled: 1, upserted: 0 },
          media: {
            pages_fetched: mediaResult.pages_fetched,
            pulled: mediaResult.rows.length,
            upserted: 0,
            has_more: mediaResult.has_more,
          },
        },
        error_message: null,
      });

      return res.status(200).json(responsePayload);
    }

    if (resource === 'pages') {
      const since = effectivePagesSince;
      const until = effectivePagesUntil;
      const processedBackfillMonth = resolvedPagesRange?.backfillMonth ?? null;
      const parsedProcessedBackfillMonth = parseYearMonth(processedBackfillMonth ?? undefined);
      const nextBackfillMonth = parsedProcessedBackfillMonth
        ? toYearMonth(
          shiftMonth(parsedProcessedBackfillMonth.year, parsedProcessedBackfillMonth.month, -1).year,
          shiftMonth(parsedProcessedBackfillMonth.year, parsedProcessedBackfillMonth.month, -1).month,
        )
        : null;
      const latestMonth = resolvedPagesLatestRange?.latestMonth ?? null;

      const pagesResult = await fetchMetaCollection({
        token,
        path: 'me/accounts',
        params: {
          fields: 'id,name,category,fan_count,followers_count,link,access_token,picture{url}',
          limit: String(Math.min(limit, 50)),
        },
        maxPages,
        startedAt,
        maxRuntimeMs,
      });

      const pageTokenById = new Map<string, string>();
      const pages: MetaPageRow[] = pagesResult.rows.map((page) => {
        const picture = ensureObject(page.picture);
        const pictureData = ensureObject(picture.data);
        const pageId = toNullableText(page.id);
        const pageToken = toNullableText(page.access_token);
        if (pageId && pageToken) {
          pageTokenById.set(pageId, pageToken);
        }

        return {
          business_id: pageId ?? '',
          name: toNullableText(page.name),
          category: toNullableText(page.category),
          fan_count: Math.trunc(toNumberOrZero(page.fan_count)),
          followers_count: Math.trunc(toNumberOrZero(page.followers_count)),
          link: toNullableText(page.link),
          picture_url: toNullableText(pictureData.url),
          has_page_token: Boolean(pageToken),
          last_synced_at: new Date().toISOString(),
          raw_payload: sanitizePagePayload(page),
        };
      }).filter((page) => Boolean(page.business_id));

      const postsRows: MetaPagePostRow[] = [];

      const insightsRows: MetaPageInsightDailyRow[] = [];
      const postInsightSnapshotRows: MetaPagePostInsightSnapshotRow[] = [];

      const pageErrors: Array<{
        page_id: string;
        page_name: string | null;
        stage: 'posts' | 'insights' | 'post_insights';
        message: string;
      }> = [];

      const postsSummary: SyncResourceSummary = { pages_fetched: 0, pulled: 0, upserted: 0, has_more: false };
      const insightsSummary: SyncResourceSummary = { pages_fetched: 0, pulled: 0, upserted: 0, has_more: false };
      const postInsightsSummary: SyncResourceSummary = { pages_fetched: 0, pulled: 0, upserted: 0, has_more: false };

      let pagesLoopStoppedEarly = false;
      for (const page of pages) {
        if (!hasRuntimeBudget(startedAt, maxRuntimeMs)) {
          pagesLoopStoppedEarly = true;
          break;
        }

        const pageId = page.business_id;
        if (!pageId) {
          continue;
        }

        const pageToken = pageTokenById.get(pageId) ?? null;
        if (!pageToken) {
          pageErrors.push({
            page_id: pageId,
            page_name: page.name,
            stage: 'posts',
            message: 'La página no devolvió access_token en /me/accounts.',
          });
          continue;
        }

        try {
          const postParams: Record<string, string> = {
            fields: 'id,message,created_time,permalink_url,full_picture,shares,reactions.summary(true).limit(0),comments.summary(true).limit(0)',
            limit: String(postLimit),
          };
          if (since) postParams.since = since;
          if (until) postParams.until = until;

          const pagePosts = await fetchMetaCollection({
            token: pageToken,
            path: `${pageId}/posts`,
            params: postParams,
            maxPages: postMaxPages,
            startedAt,
            maxRuntimeMs,
          });

          postsSummary.pages_fetched += pagePosts.pages_fetched;
          postsSummary.pulled += pagePosts.rows.length;
          postsSummary.has_more = postsSummary.has_more || pagePosts.has_more;

          for (const post of pagePosts.rows) {
            const reactionsSummary = ensureObject(ensureObject(post.reactions).summary);
            const commentsSummary = ensureObject(ensureObject(post.comments).summary);
            const shares = ensureObject(post.shares);

            const postId = toNullableText(post.id);
            if (!postId) continue;

            postsRows.push({
              business_id: postId,
              page_business_id: pageId,
              page_name: page.name,
              message: toNullableText(post.message),
              created_time: toNullableIsoTimestamp(post.created_time),
              permalink_url: toNullableText(post.permalink_url),
              full_picture: toNullableText(post.full_picture),
              reactions: Math.trunc(toNumberOrZero(reactionsSummary.total_count)),
              comments: Math.trunc(toNumberOrZero(commentsSummary.total_count)),
              shares: Math.trunc(toNumberOrZero(shares.count)),
              raw_payload: post,
            });
          }

          const snapshotDate = new Date().toISOString().slice(0, 10);
          for (const post of postsRows.filter((item) => item.page_business_id === pageId)) {
            if (!hasRuntimeBudget(startedAt, maxRuntimeMs)) {
              postInsightsSummary.has_more = true;
              break;
            }

            const metricsResult = await fetchPostInsightMetrics(pageToken, post.business_id);
            postInsightsSummary.pages_fetched += 1;
            postInsightsSummary.pulled += metricsResult.rows.length;

            if (metricsResult.rows.length === 0 && metricsResult.last_error) {
              pageErrors.push({
                page_id: pageId,
                page_name: page.name,
                stage: 'post_insights',
                message: `No se pudieron leer métricas de post ${post.business_id} tras ${metricsResult.attempted_batches} intento(s): ${metricsResult.last_error}`,
              });
            }

            for (const metricRow of metricsResult.rows) {
              postInsightSnapshotRows.push({
                post_business_id: post.business_id,
                page_business_id: pageId,
                page_name: page.name,
                metric: metricRow.metric,
                period: metricRow.period,
                snapshot_date: snapshotDate,
                value: metricRow.value,
                raw_payload: metricRow.raw_payload,
              });
            }
          }
        } catch (error) {
          pageErrors.push({
            page_id: pageId,
            page_name: page.name,
            stage: 'posts',
            message: error instanceof Error ? error.message : String(error),
          });
        }

        const pageInsightsResult = await fetchPageInsightMetrics(pageToken, pageId, since, until);
        insightsSummary.pages_fetched += 1;

        if (pageInsightsResult.rows.length === 0 && pageInsightsResult.last_error) {
          pageErrors.push({
            page_id: pageId,
            page_name: page.name,
            stage: 'insights',
            message: `No se pudieron leer métricas de página tras ${pageInsightsResult.attempted_batches} intento(s): ${pageInsightsResult.last_error}`,
          });
        }

        for (const row of pageInsightsResult.rows) {
          insightsRows.push({
            ...row,
            page_name: page.name,
          });
          insightsSummary.pulled += 1;
        }
      }

      const durationMs = Date.now() - startedAt;
      const upsertedPages = await upsertRows(
        'meta_pages',
        pages as JsonRecord[],
        'business_id',
      );
      const upsertedPosts = await upsertRows(
        'meta_page_posts',
        postsRows as JsonRecord[],
        'business_id',
      );
      const upsertedInsights = await upsertRows(
        'meta_page_insights_daily',
        insightsRows as JsonRecord[],
        'page_business_id,metric,date_end',
      );
      const upsertedPostInsights = await upsertRows(
        'meta_page_post_insights_snapshots',
        postInsightSnapshotRows as JsonRecord[],
        'post_business_id,metric,snapshot_date',
      );

      postsSummary.upserted = upsertedPosts;
      insightsSummary.upserted = upsertedInsights;
      postInsightsSummary.upserted = upsertedPostInsights;

      const resourcesPayload: JsonRecord = {
        pages: {
          pages_fetched: pagesResult.pages_fetched,
          pulled: pages.length,
          upserted: upsertedPages,
          has_more: pagesResult.has_more || pagesLoopStoppedEarly,
        },
        posts: postsSummary,
        insights: insightsSummary,
        post_insights: postInsightsSummary,
      };

      const totals = {
        pulled: pages.length + postsRows.length + insightsRows.length + postInsightSnapshotRows.length,
        upserted: upsertedPages + upsertedPosts + upsertedInsights + upsertedPostInsights,
      };

      await finalizeSyncRun(syncRunId, {
        finished_at: new Date().toISOString(),
        duration_ms: durationMs,
        success: true,
        early_stop: (pagesResult.stopped_early || pagesLoopStoppedEarly) ? { resource: 'insights', reason: 'max_runtime_ms' } : null,
        totals,
        resources: resourcesPayload,
        error_message: null,
      });

      return res.status(200).json({
        success: true,
        resource,
        duration_ms: durationMs,
        since: since ?? '',
        until: until ?? '',
        backfill: pagesBackfillMonthly
          ? {
            enabled: true,
            month: processedBackfillMonth,
            next_month: nextBackfillMonth,
            source: resolvedPagesRange?.source ?? null,
            status: processedBackfillMonth
              ? `Backfill mensual OK. Mes procesado: ${processedBackfillMonth}. Próximo mes sugerido: ${nextBackfillMonth ?? 'N/D'}.`
              : 'Backfill mensual OK. Mes procesado no disponible.',
          }
          : {
            enabled: false,
            status: 'Backfill mensual desactivado. Usando rango manual o default.',
          },
        latest: pagesLatestMonthly
          ? {
            enabled: true,
            month: latestMonth,
            source: resolvedPagesLatestRange?.source ?? null,
            status: latestMonth
              ? `Sync mensual de actualización OK. Mes objetivo: ${latestMonth}.`
              : 'Sync mensual de actualización OK. Mes objetivo no disponible.',
          }
          : {
            enabled: false,
            status: 'Sync mensual de actualización desactivado.',
          },
        pages: pages.map((item) => ({
          id: item.business_id,
          name: item.name,
          category: item.category,
          fan_count: item.fan_count,
          followers_count: item.followers_count,
          link: item.link,
          picture_url: item.picture_url,
          has_page_token: item.has_page_token,
        })),
        posts: postsRows
          .sort((a, b) => (b.created_time ?? '').localeCompare(a.created_time ?? ''))
          .slice(0, 300)
          .map((item) => ({
            id: item.business_id,
            page_id: item.page_business_id,
            page_name: item.page_name,
            message: item.message,
            created_time: item.created_time,
            permalink_url: item.permalink_url,
            full_picture: item.full_picture,
            reactions: item.reactions,
            comments: item.comments,
            shares: item.shares,
          })),
        insights: insightsRows.map((item) => ({
          page_id: item.page_business_id,
          page_name: item.page_name,
          metric: item.metric,
          end_time: `${item.date_end}T00:00:00.000Z`,
          value: item.value,
        })),
        post_insights_snapshots: postInsightSnapshotRows.map((item) => ({
          post_id: item.post_business_id,
          page_id: item.page_business_id,
          page_name: item.page_name,
          metric: item.metric,
          period: item.period,
          snapshot_date: item.snapshot_date,
          value: item.value,
        })),
        errors: pageErrors,
        permissions_hint: [
          'pages_show_list (listar páginas desde /me/accounts)',
          'pages_read_engagement (leer contenido de página)',
          'pages_read_user_content (según contenido/visibilidad)',
          'read_insights (métricas de página)',
          'business_management (puede ser requerido con business system user)',
          'Page access token requerido para campos con información de usuarios',
        ],
        totals,
        resources: resourcesPayload,
      });
    }

    if (!accountBusinessId) {
      throw new Error('account_id es obligatorio para resource=ads.');
    }

    const baseSummary: SyncSummary = {
      account: { pages_fetched: 1, pulled: 1, upserted: 0, has_more: false },
      campaigns: { pages_fetched: 0, pulled: 0, upserted: 0, has_more: false },
      adsets: { pages_fetched: 0, pulled: 0, upserted: 0, has_more: false },
      ads: { pages_fetched: 0, pulled: 0, upserted: 0, has_more: false },
      insights: { pages_fetched: 0, pulled: 0, upserted: 0, has_more: false },
    };

    const accountPayload = await fetchMetaJson(token, accountBusinessId, {
      fields: 'id,account_id,name,account_status,currency,timezone_name',
    });

    const accountRow = mapAccountRow(accountBusinessId, accountPayload);
    baseSummary.account.upserted = await upsertRows(
      'meta_ad_accounts',
      [accountRow as JsonRecord],
      'business_id',
    );

    let earlyStop: EarlyStopInfo | null = null;

    const campaignsResult = await syncPagedResource<JsonRecord, MetaCampaignRow>({
      token,
      label: 'campaigns',
      path: `${accountBusinessId}/campaigns`,
      params: {
        fields: 'id,name,status,effective_status,objective,start_time,stop_time',
        limit: String(limit),
      },
      maxPages,
      startedAt,
      maxRuntimeMs,
      mapItem: (item) => mapCampaignRow(accountBusinessId, item),
      table: 'meta_campaigns',
      onConflict: 'business_id',
    });
    baseSummary.campaigns = campaignsResult.summary;
    earlyStop = campaignsResult.earlyStop;

    if (!earlyStop) {
      const adsetsResult = await syncPagedResource<JsonRecord, MetaAdsetRow>({
        token,
        label: 'adsets',
        path: `${accountBusinessId}/adsets`,
        params: {
          fields: 'id,campaign_id,name,status,effective_status,optimization_goal,billing_event',
          limit: String(limit),
        },
        maxPages,
        startedAt,
        maxRuntimeMs,
        mapItem: (item) => mapAdsetRow(accountBusinessId, item),
        table: 'meta_adsets',
        onConflict: 'business_id',
      });
      baseSummary.adsets = adsetsResult.summary;
      earlyStop = adsetsResult.earlyStop;
    }

    if (!earlyStop) {
      const adsResult = await syncPagedResource<JsonRecord, MetaAdRow>({
        token,
        label: 'ads',
        path: `${accountBusinessId}/ads`,
        params: {
          fields: 'id,adset_id,campaign_id,name,status,effective_status,creative{id,name,object_story_id,effective_object_story_id}',
          limit: String(limit),
        },
        maxPages,
        startedAt,
        maxRuntimeMs,
        mapItem: (item) => mapAdRow(accountBusinessId, item),
        table: 'meta_ads',
        onConflict: 'business_id',
      });
      baseSummary.ads = adsResult.summary;
      earlyStop = adsResult.earlyStop;
    }

    if (!earlyStop) {
      const insightsResult = await syncPagedResource<JsonRecord, MetaInsightRow>({
        token,
        label: 'insights',
        path: `${accountBusinessId}/insights`,
        params: {
          level: 'ad',
          fields: 'ad_id,date_start,date_stop,spend,impressions,reach,clicks,ctr,cpc,actions,video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,video_p100_watched_actions',
          date_preset: datePreset,
          time_increment: timeIncrement,
          limit: String(limit),
        },
        maxPages,
        startedAt,
        maxRuntimeMs,
        mapItem: mapInsightRow,
        table: 'meta_ad_insights_daily',
        onConflict: 'ad_business_id,date_start,date_stop',
      });
      baseSummary.insights = insightsResult.summary;
      earlyStop = insightsResult.earlyStop;
    }

    const audienceBreakdownSummary: Record<string, SyncResourceSummary> = {
      age_gender: { pages_fetched: 0, pulled: 0, upserted: 0, has_more: false },
      country: { pages_fetched: 0, pulled: 0, upserted: 0, has_more: false },
      region: { pages_fetched: 0, pulled: 0, upserted: 0, has_more: false },
      publisher_platform: { pages_fetched: 0, pulled: 0, upserted: 0, has_more: false },
      device_platform: { pages_fetched: 0, pulled: 0, upserted: 0, has_more: false },
    };

    if (!earlyStop) {
      const syncBreakdown = async (
        breakdownType: MetaAdInsightBreakdownType,
        breakdowns: string,
      ) => syncPagedResource<JsonRecord, MetaAdInsightBreakdownRow>({
        token,
        label: 'insights',
        path: `${accountBusinessId}/insights`,
        params: {
          level: 'ad',
          fields: 'ad_id,date_start,date_stop,spend,impressions,reach,clicks,ctr,cpc,actions,video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,video_p100_watched_actions',
          breakdowns,
          date_preset: datePreset,
          time_increment: timeIncrement,
          limit: String(limit),
        },
        maxPages,
        startedAt,
        maxRuntimeMs,
        mapItem: (item) => mapInsightBreakdownRow(item, breakdownType),
        table: 'meta_ad_insights_breakdown_daily',
        onConflict: 'ad_business_id,date_start,date_stop,breakdown_type,breakdown_value_1,breakdown_value_2',
      });

      const ageGenderResult = await syncBreakdown('age_gender', 'age,gender');
      audienceBreakdownSummary.age_gender = ageGenderResult.summary;
      if (!earlyStop) {
        earlyStop = ageGenderResult.earlyStop;
      }

      if (!earlyStop) {
        const countryResult = await syncBreakdown('country', 'country');
        audienceBreakdownSummary.country = countryResult.summary;
        earlyStop = countryResult.earlyStop;
      }

      if (!earlyStop) {
        const regionResult = await syncBreakdown('region', 'region');
        audienceBreakdownSummary.region = regionResult.summary;
        earlyStop = regionResult.earlyStop;
      }

      if (!earlyStop) {
        const platformResult = await syncBreakdown('publisher_platform', 'publisher_platform');
        audienceBreakdownSummary.publisher_platform = platformResult.summary;
        earlyStop = platformResult.earlyStop;
      }

      if (!earlyStop) {
        const devicePlatformResult = await syncBreakdown('device_platform', 'device_platform');
        audienceBreakdownSummary.device_platform = devicePlatformResult.summary;
        earlyStop = devicePlatformResult.earlyStop;
      }
    }

    let hourlyDebug: HourlySyncDebug = {
      pages_fetched: 0,
      pulled: 0,
      upserted: 0,
      has_more: false,
      skipped: true,
      error: null,
    };

    if (!earlyStop) {
      try {
        const hourlyInsightsResult = await syncPagedResource<JsonRecord, MetaInsightHourlyRow>({
          token,
          label: 'insights',
          path: `${accountBusinessId}/insights`,
          params: {
            fields: 'date_start,spend,impressions,reach,clicks,ctr,cpc,actions,video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,video_p100_watched_actions',
            breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
            date_preset: datePreset,
            time_increment: '1',
            limit: String(limit),
          },
          maxPages,
          startedAt,
          maxRuntimeMs,
          mapItem: (item) => mapInsightHourlyRow(item, accountBusinessId),
          table: 'meta_ad_insights_hourly',
          onConflict: 'ad_business_id,date_start,hour_bucket',
        });

        hourlyDebug = {
          pages_fetched: hourlyInsightsResult.summary.pages_fetched,
          pulled: hourlyInsightsResult.summary.pulled,
          upserted: hourlyInsightsResult.summary.upserted,
          has_more: hourlyInsightsResult.summary.has_more,
          skipped: false,
          error: null,
        };

        if (hourlyDebug.pulled === 0 && hasRuntimeBudget(startedAt, maxRuntimeMs)) {
          const adIds = await getAdIdsForAccount(accountBusinessId, hourlyAdLimit);

          for (const adId of adIds) {
            if (!hasRuntimeBudget(startedAt, maxRuntimeMs)) {
              break;
            }

            const perAdHourly = await syncPagedResource<JsonRecord, MetaInsightHourlyRow>({
              token,
              label: 'insights',
              path: `${adId}/insights`,
              params: {
                fields: 'date_start,spend,impressions,reach,clicks,ctr,cpc,actions,video_play_actions,video_p25_watched_actions,video_p50_watched_actions,video_p75_watched_actions,video_p95_watched_actions,video_p100_watched_actions',
                breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
                date_preset: datePreset,
                time_increment: '1',
                limit: String(limit),
              },
              maxPages,
              startedAt,
              maxRuntimeMs,
              mapItem: (item) => mapInsightHourlyRow(item, adId),
              table: 'meta_ad_insights_hourly',
              onConflict: 'ad_business_id,date_start,hour_bucket',
            });

            hourlyDebug.pages_fetched += perAdHourly.summary.pages_fetched;
            hourlyDebug.pulled += perAdHourly.summary.pulled;
            hourlyDebug.upserted += perAdHourly.summary.upserted;
            hourlyDebug.has_more = hourlyDebug.has_more || perAdHourly.summary.has_more;

            if (perAdHourly.summary.pulled > 0) {
              hourlyDebug.skipped = false;
            }
          }
        }

        if (!earlyStop) {
          earlyStop = hourlyInsightsResult.earlyStop;
        }
      } catch (hourlyError) {
        const message = hourlyError instanceof Error ? hourlyError.message : String(hourlyError);
        hourlyDebug = {
          pages_fetched: 0,
          pulled: 0,
          upserted: 0,
          has_more: false,
          skipped: true,
          error: message,
        };
        console.warn('[meta-ads-sync] hourly insights skipped:', message);
      }
    }

    const durationMs = Date.now() - startedAt;
    const totals = Object.values(baseSummary).reduce(
      (acc, resource) => {
        acc.pulled += resource.pulled;
        acc.upserted += resource.upserted;
        return acc;
      },
      { pulled: 0, upserted: 0 },
    );

    const resourcesPayload: JsonRecord = {
      ...baseSummary,
      insights_breakdown: audienceBreakdownSummary,
      insights_hourly: hourlyDebug,
    };

    await finalizeSyncRun(syncRunId, {
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      success: true,
      early_stop: earlyStop,
      totals,
      resources: resourcesPayload,
      error_message: null,
    });

    return res.status(200).json({
      success: true,
      account_id: accountBusinessId,
      date_preset: datePreset,
      time_increment: timeIncrement,
      limit,
      max_pages: maxPages,
      max_runtime_ms: maxRuntimeMs,
      early_stop: earlyStop,
      duration_ms: durationMs,
      totals,
      resources: resourcesPayload,
    });
  } catch (error) {
    const durationMs = Date.now() - startedAt;
    const message = error instanceof Error ? error.message : 'Error desconocido al sincronizar Meta Ads.';

    await finalizeSyncRun(syncRunId, {
      finished_at: new Date().toISOString(),
      duration_ms: durationMs,
      success: false,
      early_stop: null,
      totals: null,
      resources: null,
      error_message: message,
    });

    return res.status(500).json({
      error: message,
      account_id: accountBusinessIdForRun,
    });
  }
}
