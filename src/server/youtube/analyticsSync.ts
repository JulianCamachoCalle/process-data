import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getSupabaseAdminClient,
  isSecretAuthorized,
  isVercelCronAuthorized,
  verifyAdminSession,
} from '../kommo/shared.js';

const OAUTH_TOKEN_ENDPOINT = 'https://oauth2.googleapis.com/token';
const YOUTUBE_ANALYTICS_REPORTS_ENDPOINT = 'https://youtubeanalytics.googleapis.com/v2/reports';

const SYNC_SECRET_HEADER = 'x-youtube-sync-secret';
const SYNC_SECRET_ENV = 'YOUTUBE_SYNC_SECRET';
const CHANNEL_ID_ENV = 'YOUTUBE_CHANNEL_ID';
const DEFAULT_CHANNEL_ID = 'UCS9a3juMIrRfeXrRjd9DDlw';
const DEFAULT_MAX_RUNTIME_MS = 45_000;
const RUNTIME_BUFFER_MS = 1_500;
const UPSERT_CHUNK_SIZE = 200;
const ANALYTICS_PAGE_SIZE = 200;

type JsonRecord = Record<string, unknown>;

type AudienceDimensionType =
  | 'country'
  | 'deviceType'
  | 'subscribedStatus'
  | 'trafficSourceType'
  | 'playbackLocationType';

type ChannelDemographicDailyRow = {
  channel_business_id: string;
  stat_date: string;
  age_group: string;
  gender: string;
  views: number;
  viewer_percentage: number;
  estimated_minutes_watched: number;
  raw_payload: JsonRecord;
};

type ChannelAudienceBreakdownDailyRow = {
  channel_business_id: string;
  stat_date: string;
  dimension_type: AudienceDimensionType;
  dimension_value: string;
  views: number;
  estimated_minutes_watched: number;
  average_view_duration: number;
  raw_payload: JsonRecord;
};

type VideoDailyStatsRow = {
  video_business_id: string;
  channel_business_id: string;
  stat_date: string;
  views: number;
  likes: number;
  comments: number;
  estimated_minutes_watched: number;
  average_view_duration: number;
  raw_payload: JsonRecord;
};

type AnalyticsColumnHeader = {
  name?: string;
};

type AnalyticsReportResponse = {
  columnHeaders?: AnalyticsColumnHeader[];
  rows?: unknown[][];
};

type AnalyticsQueryResult = {
  rows: JsonRecord[];
  pulled: number;
  runtimeExceeded: boolean;
};

type SectionSummary = {
  pulled: number;
  upserted: number;
};

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

function asSingleParam(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' || typeof first === 'number' ? String(first) : undefined;
  }

  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function getRequestParam(req: VercelRequest, body: JsonRecord, key: string): string | undefined {
  const fromBody = asSingleParam(body[key]);
  if (fromBody !== undefined) return fromBody;
  return asSingleParam(req.query[key]);
}

function parsePositiveInt(raw: string | undefined, fallback: number, min = 1, max = 1_000_000) {
  if (!raw?.trim()) return fallback;
  const value = Number.parseInt(raw, 10);
  if (!Number.isInteger(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

function formatDateUTC(input: Date) {
  const year = input.getUTCFullYear();
  const month = String(input.getUTCMonth() + 1).padStart(2, '0');
  const day = String(input.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function parseIsoDate(raw: string | undefined) {
  if (!raw) return undefined;
  const trimmed = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error('Las fechas deben usar formato YYYY-MM-DD.');
  }

  const asDate = new Date(`${trimmed}T00:00:00.000Z`);
  if (Number.isNaN(asDate.getTime()) || formatDateUTC(asDate) !== trimmed) {
    throw new Error(`Fecha inválida: ${trimmed}`);
  }

  return trimmed;
}

function getRequiredEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Falta variable de entorno ${name}`);
  }

  return value;
}

function toNumber(value: unknown, fallback = 0) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : fallback;
  }

  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  return fallback;
}

function toInteger(value: unknown, fallback = 0) {
  return Math.trunc(toNumber(value, fallback));
}

function toText(value: unknown) {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  return '';
}

function isPastDeadline(deadlineMs: number) {
  return Date.now() >= deadlineMs;
}

async function fetchYoutubeAccessToken() {
  const clientId = getRequiredEnv('YOUTUBE_CLIENT_ID');
  const clientSecret = getRequiredEnv('YOUTUBE_CLIENT_SECRET');
  const refreshToken = getRequiredEnv('YOUTUBE_REFRESH_TOKEN');

  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });

  const response = await fetch(OAUTH_TOKEN_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body: body.toString(),
  });

  const raw = await response.text();
  let payload: unknown = {};
  if (raw) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      payload = { raw };
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload
        ? JSON.stringify((payload as JsonRecord).error)
        : raw || 'Error desconocido al refrescar token OAuth';
    throw new Error(`Google OAuth error (${response.status}): ${message}`);
  }

  const accessToken =
    typeof payload === 'object' && payload && 'access_token' in payload
      ? String((payload as JsonRecord).access_token ?? '')
      : '';

  if (!accessToken) {
    throw new Error('Google OAuth no devolvió access_token.');
  }

  return accessToken;
}

async function fetchAnalyticsReport(
  accessToken: string,
  channelId: string,
  startDate: string,
  endDate: string,
  dimensions: string,
  metrics: string,
  startIndex: number,
) {
  const params = new URLSearchParams({
    ids: `channel==${channelId}`,
    startDate,
    endDate,
    dimensions,
    metrics,
    maxResults: String(ANALYTICS_PAGE_SIZE),
    startIndex: String(startIndex),
  });

  const response = await fetch(`${YOUTUBE_ANALYTICS_REPORTS_ENDPOINT}?${params.toString()}`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  const raw = await response.text();
  let payload: unknown = {};
  if (raw) {
    try {
      payload = JSON.parse(raw) as unknown;
    } catch {
      payload = { raw };
    }
  }

  if (!response.ok) {
    const message =
      typeof payload === 'object' && payload && 'error' in payload
        ? JSON.stringify((payload as JsonRecord).error)
        : raw || 'Error desconocido en YouTube Analytics';
    throw new Error(`YouTube Analytics API error (${response.status}): ${message}`);
  }

  return payload as AnalyticsReportResponse;
}

function mapAnalyticsRow(headers: AnalyticsColumnHeader[], row: unknown[]) {
  const mapped: JsonRecord = {};

  for (let index = 0; index < headers.length; index += 1) {
    const key = headers[index]?.name;
    if (!key) continue;
    mapped[key] = row[index] ?? null;
  }

  return mapped;
}

async function queryAnalyticsRows(
  accessToken: string,
  channelId: string,
  startDate: string,
  endDate: string,
  dimensions: string,
  metrics: string,
  deadlineMs: number,
): Promise<AnalyticsQueryResult> {
  const rows: JsonRecord[] = [];
  let pulled = 0;
  let startIndex = 1;
  let runtimeExceeded = false;

  while (true) {
    if (isPastDeadline(deadlineMs)) {
      runtimeExceeded = true;
      break;
    }

    const report = await fetchAnalyticsReport(
      accessToken,
      channelId,
      startDate,
      endDate,
      dimensions,
      metrics,
      startIndex,
    );

    const headers = report.columnHeaders ?? [];
    const pageRows = report.rows ?? [];
    if (!pageRows.length) {
      break;
    }

    for (const row of pageRows) {
      if (!Array.isArray(row)) continue;
      rows.push(mapAnalyticsRow(headers, row));
    }

    pulled += pageRows.length;
    if (pageRows.length < ANALYTICS_PAGE_SIZE) {
      break;
    }

    startIndex += pageRows.length;
  }

  return { rows, pulled, runtimeExceeded };
}

async function upsertInChunks<T>(table: string, rows: T[], conflict: string) {
  if (!rows.length) return 0;

  const supabase = getSupabaseAdminClient();
  let upserted = 0;

  for (let index = 0; index < rows.length; index += UPSERT_CHUNK_SIZE) {
    const chunk = rows.slice(index, index + UPSERT_CHUNK_SIZE);
    const { error } = await supabase
      .from(table as never)
      .upsert(chunk as never, { onConflict: conflict });

    if (error) {
      throw new Error(`Error al upsert en ${table}: ${error.message}`);
    }

    upserted += chunk.length;
  }

  return upserted;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (!['GET', 'POST'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const secretAuthorized = isSecretAuthorized(req, SYNC_SECRET_ENV, SYNC_SECRET_HEADER);
    const cronAuthorized = isVercelCronAuthorized(req);

    if (!secretAuthorized && !cronAuthorized) {
      const auth = verifyAdminSession(req);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error });
      }
    }

    const body = parseBodyObject(req);

    const channelId = (
      getRequestParam(req, body, 'channel_id')
      ?? process.env[CHANNEL_ID_ENV]
      ?? DEFAULT_CHANNEL_ID
    ).trim();

    if (!channelId) {
      return res.status(400).json({ error: 'Falta channel_id.' });
    }

    const startDateInput = parseIsoDate(getRequestParam(req, body, 'start_date'));
    const endDateInput = parseIsoDate(getRequestParam(req, body, 'end_date'));

    const today = new Date();
    const computedEndDate = endDateInput ?? formatDateUTC(today);
    const computedStartDate = startDateInput
      ?? formatDateUTC(new Date(new Date(`${computedEndDate}T00:00:00.000Z`).getTime() - 29 * 24 * 60 * 60 * 1000));

    if (computedStartDate > computedEndDate) {
      return res.status(400).json({ error: 'start_date no puede ser mayor que end_date.' });
    }

    const maxRuntimeMs = parsePositiveInt(
      getRequestParam(req, body, 'max_runtime_ms'),
      DEFAULT_MAX_RUNTIME_MS,
      5_000,
      120_000,
    );

    const startedAt = Date.now();
    const deadlineMs = startedAt + (maxRuntimeMs - RUNTIME_BUFFER_MS);

    const accessToken = await fetchYoutubeAccessToken();

    let runtimeExceeded = false;

    const demographicsSummary: SectionSummary = { pulled: 0, upserted: 0 };
    const audienceSummary: SectionSummary = { pulled: 0, upserted: 0 };
    const videosSummary: SectionSummary = { pulled: 0, upserted: 0 };

    const audienceByDimension: Record<AudienceDimensionType, SectionSummary> = {
      country: { pulled: 0, upserted: 0 },
      deviceType: { pulled: 0, upserted: 0 },
      subscribedStatus: { pulled: 0, upserted: 0 },
      trafficSourceType: { pulled: 0, upserted: 0 },
      playbackLocationType: { pulled: 0, upserted: 0 },
    };

    if (!isPastDeadline(deadlineMs)) {
      const demographicsResult = await queryAnalyticsRows(
        accessToken,
        channelId,
        computedStartDate,
        computedEndDate,
        'day,ageGroup,gender',
        'views,viewerPercentage,estimatedMinutesWatched',
        deadlineMs,
      );

      demographicsSummary.pulled = demographicsResult.pulled;

      const demographicsRows: ChannelDemographicDailyRow[] = demographicsResult.rows
        .map((rawRow) => {
          const statDate = toText(rawRow.day);
          const ageGroup = toText(rawRow.ageGroup);
          const gender = toText(rawRow.gender);

          if (!statDate || !ageGroup || !gender) {
            return null;
          }

          return {
            channel_business_id: channelId,
            stat_date: statDate,
            age_group: ageGroup,
            gender,
            views: toInteger(rawRow.views, 0),
            viewer_percentage: toNumber(rawRow.viewerPercentage, 0),
            estimated_minutes_watched: toNumber(rawRow.estimatedMinutesWatched, 0),
            raw_payload: rawRow,
          };
        })
        .filter((row): row is ChannelDemographicDailyRow => row !== null);

      if (demographicsRows.length && !isPastDeadline(deadlineMs)) {
        demographicsSummary.upserted = await upsertInChunks(
          'youtube_channel_demographics_daily',
          demographicsRows,
          'channel_business_id,stat_date,age_group,gender',
        );
      }

      runtimeExceeded = runtimeExceeded || demographicsResult.runtimeExceeded || isPastDeadline(deadlineMs);
    } else {
      runtimeExceeded = true;
    }

    const audienceDimensions: Array<{ type: AudienceDimensionType; apiDimension: string }> = [
      { type: 'country', apiDimension: 'country' },
      { type: 'deviceType', apiDimension: 'deviceType' },
      { type: 'subscribedStatus', apiDimension: 'subscribedStatus' },
      { type: 'trafficSourceType', apiDimension: 'insightTrafficSourceType' },
      { type: 'playbackLocationType', apiDimension: 'playbackLocationType' },
    ];

    for (const config of audienceDimensions) {
      if (isPastDeadline(deadlineMs)) {
        runtimeExceeded = true;
        break;
      }

      const result = await queryAnalyticsRows(
        accessToken,
        channelId,
        computedStartDate,
        computedEndDate,
        `day,${config.apiDimension}`,
        'views,estimatedMinutesWatched,averageViewDuration',
        deadlineMs,
      );

      audienceByDimension[config.type].pulled = result.pulled;
      audienceSummary.pulled += result.pulled;

      const rows: ChannelAudienceBreakdownDailyRow[] = result.rows
        .map((rawRow) => {
          const statDate = toText(rawRow.day);
          const dimensionValue = toText(rawRow[config.apiDimension]);

          if (!statDate || !dimensionValue) {
            return null;
          }

          return {
            channel_business_id: channelId,
            stat_date: statDate,
            dimension_type: config.type,
            dimension_value: dimensionValue,
            views: toInteger(rawRow.views, 0),
            estimated_minutes_watched: toNumber(rawRow.estimatedMinutesWatched, 0),
            average_view_duration: toNumber(rawRow.averageViewDuration, 0),
            raw_payload: rawRow,
          };
        })
        .filter((row): row is ChannelAudienceBreakdownDailyRow => row !== null);

      if (rows.length && !isPastDeadline(deadlineMs)) {
        const upserted = await upsertInChunks(
          'youtube_channel_audience_breakdowns_daily',
          rows,
          'channel_business_id,stat_date,dimension_type,dimension_value',
        );
        audienceByDimension[config.type].upserted = upserted;
        audienceSummary.upserted += upserted;
      }

      runtimeExceeded = runtimeExceeded || result.runtimeExceeded || isPastDeadline(deadlineMs);
      if (runtimeExceeded) {
        break;
      }
    }

    if (!runtimeExceeded && !isPastDeadline(deadlineMs)) {
      const videosResult = await queryAnalyticsRows(
        accessToken,
        channelId,
        computedStartDate,
        computedEndDate,
        'day,video',
        'views,likes,comments,estimatedMinutesWatched,averageViewDuration',
        deadlineMs,
      );

      videosSummary.pulled = videosResult.pulled;

      const videoRows: VideoDailyStatsRow[] = videosResult.rows
        .map((rawRow) => {
          const statDate = toText(rawRow.day);
          const videoBusinessId = toText(rawRow.video);

          if (!statDate || !videoBusinessId) {
            return null;
          }

          return {
            video_business_id: videoBusinessId,
            channel_business_id: channelId,
            stat_date: statDate,
            views: toInteger(rawRow.views, 0),
            likes: toInteger(rawRow.likes, 0),
            comments: toInteger(rawRow.comments, 0),
            estimated_minutes_watched: toNumber(rawRow.estimatedMinutesWatched, 0),
            average_view_duration: toNumber(rawRow.averageViewDuration, 0),
            raw_payload: rawRow,
          };
        })
        .filter((row): row is VideoDailyStatsRow => row !== null);

      if (videoRows.length && !isPastDeadline(deadlineMs)) {
        videosSummary.upserted = await upsertInChunks(
          'youtube_video_daily_stats',
          videoRows,
          'video_business_id,stat_date',
        );
      }

      runtimeExceeded = runtimeExceeded || videosResult.runtimeExceeded || isPastDeadline(deadlineMs);
    } else if (isPastDeadline(deadlineMs)) {
      runtimeExceeded = true;
    }

    return res.status(200).json({
      success: true,
      channel_id: channelId,
      start_date: computedStartDate,
      end_date: computedEndDate,
      max_runtime_ms: maxRuntimeMs,
      duration_ms: Date.now() - startedAt,
      has_more: runtimeExceeded,
      runtime_exceeded: runtimeExceeded,
      sections: {
        demographics: demographicsSummary,
        audience_breakdowns: {
          ...audienceSummary,
          by_dimension: audienceByDimension,
        },
        video_daily_stats: videosSummary,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return res.status(500).json({ error: message });
  }
}
