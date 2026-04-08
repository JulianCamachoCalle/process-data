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

type MetaSyncResource = 'ads' | 'instagram';

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
  ctr: number | null;
  cpc: number | null;
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

function resolveSyncResource(req: VercelRequest, body: JsonRecord): MetaSyncResource {
  const value = (getRequestParam(req, body, 'resource') ?? 'ads').trim().toLowerCase();

  if (value === 'ads' || value === 'instagram') {
    return value;
  }

  throw new Error('resource inválido. Permitidos: ads | instagram');
}

function resolveInstagramUserId(req: VercelRequest, body: JsonRecord) {
  const requestValue = getRequestParam(req, body, 'instagram_user_id')?.trim();
  if (requestValue) return requestValue;

  const envValue = process.env[DEFAULT_INSTAGRAM_USER_ID_ENV]?.trim();
  if (envValue) return envValue;

  throw new Error('instagram_user_id es obligatorio. También podés configurar META_INSTAGRAM_USER_ID.');
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
    throw new Error(`Meta ${context} error (${response.status}): ${message}`);
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
    ctr: toNullableNumber(payload.ctr),
    cpc: toNullableNumber(payload.cpc),
    raw_payload: payload,
  };
}

function mapInsightHourlyRow(payload: JsonRecord): MetaInsightHourlyRow | null {
  const adBusinessId = toNullableText(payload.ad_id);
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
    const resource = resolveSyncResource(req, body);
    const accountBusinessId = resource === 'ads' ? resolveAccountId(req, body) : null;
    accountBusinessIdForRun = accountBusinessId;
    const datePreset = getRequestParam(req, body, 'date_preset')?.trim() || 'last_30d';
    const timeIncrement = getRequestParam(req, body, 'time_increment')?.trim() || '1';
    const limit = parsePositiveInt(getRequestParam(req, body, 'limit'), DEFAULT_LIMIT, 500);
    const maxPages = parsePositiveInt(getRequestParam(req, body, 'max_pages'), DEFAULT_MAX_PAGES);
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
        max_runtime_ms: maxRuntimeMs,
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
          fields: 'ad_id,date_start,date_stop,spend,impressions,reach,clicks,ctr,cpc',
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
            level: 'ad',
            fields: 'ad_id,date_start,spend,impressions,reach,clicks,ctr,cpc,hourly_stats_aggregated_by_advertiser_time_zone',
            breakdowns: 'hourly_stats_aggregated_by_advertiser_time_zone',
            date_preset: datePreset,
            time_increment: '1',
            limit: String(limit),
          },
          maxPages,
          startedAt,
          maxRuntimeMs,
          mapItem: mapInsightHourlyRow,
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
