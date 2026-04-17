import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getSupabaseAdminClient,
  isSecretAuthorized,
  isVercelCronAuthorized,
  verifyAdminSession,
} from '../kommo/_shared.js';

const YOUTUBE_API_BASE_URL = 'https://www.googleapis.com/youtube/v3';
const SYNC_SECRET_HEADER = 'x-youtube-sync-secret';
const SYNC_SECRET_ENV = 'YOUTUBE_SYNC_SECRET';
const API_KEY_ENV = 'YOUTUBE_API_KEY';
const CHANNEL_ID_ENV = 'YOUTUBE_CHANNEL_ID';
const DEFAULT_CHANNEL_ID = 'UCS9a3juMIrRfeXrRjd9DDlw';
const DEFAULT_MAX_PAGES = 10;
const DEFAULT_MAX_RUNTIME_MS = 45_000;
const UPSERT_CHUNK_SIZE = 200;
const RUNTIME_BUFFER_MS = 1_500;

type JsonRecord = Record<string, unknown>;

type ThumbnailSet = {
  default?: { url?: string };
  medium?: { url?: string };
  high?: { url?: string };
  maxres?: { url?: string };
};

type YoutubeChannelApi = {
  id?: string;
  snippet?: {
    title?: string;
    description?: string;
    customUrl?: string;
    publishedAt?: string;
    thumbnails?: ThumbnailSet;
  };
  contentDetails?: {
    relatedPlaylists?: {
      uploads?: string;
    };
  };
  statistics?: {
    subscriberCount?: string;
    videoCount?: string;
    viewCount?: string;
  };
};

type YoutubePlaylistItemApi = {
  snippet?: {
    resourceId?: {
      videoId?: string;
    };
  };
  contentDetails?: {
    videoId?: string;
  };
};

type YoutubeVideoApi = {
  id?: string;
  snippet?: {
    channelId?: string;
    title?: string;
    description?: string;
    publishedAt?: string;
    tags?: string[];
    thumbnails?: ThumbnailSet;
  };
  contentDetails?: {
    duration?: string;
    definition?: string;
    caption?: string;
    licensedContent?: boolean;
  };
  statistics?: {
    viewCount?: string;
    likeCount?: string;
    commentCount?: string;
  };
};

type YoutubeChannelRow = {
  business_id: string;
  title: string | null;
  description: string | null;
  custom_url: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  uploads_playlist_id: string | null;
  subscriber_count: number;
  video_count: number;
  view_count: number;
  raw_payload: JsonRecord;
  last_synced_at: string;
};

type YoutubeVideoRow = {
  business_id: string;
  channel_business_id: string;
  title: string | null;
  description: string | null;
  published_at: string | null;
  thumbnail_url: string | null;
  duration_iso8601: string | null;
  definition: string | null;
  caption_status: string | null;
  licensed_content: boolean;
  tags: string[];
  view_count: number;
  like_count: number;
  comment_count: number;
  raw_payload: JsonRecord;
  last_synced_at: string;
};

type YouTubeListResponse<T> = {
  items?: T[];
  nextPageToken?: string;
};

function toInt(value: unknown, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return parsed;
}

function pickThumbnail(input: { thumbnails?: ThumbnailSet } | undefined) {
  return (
    input?.thumbnails?.maxres?.url
    ?? input?.thumbnails?.high?.url
    ?? input?.thumbnails?.medium?.url
    ?? input?.thumbnails?.default?.url
    ?? null
  );
}

function parsePositiveInt(raw: unknown, fallback: number, min = 1, max = 1_000_000) {
  const value = Number.parseInt(String(raw ?? ''), 10);
  if (!Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

async function fetchYouTube<T>(path: string, params: Record<string, string>) {
  const apiKey = process.env[API_KEY_ENV];
  if (!apiKey) {
    throw new Error(`Falta ${API_KEY_ENV}`);
  }

  const search = new URLSearchParams({ ...params, key: apiKey });
  const response = await fetch(`${YOUTUBE_API_BASE_URL}${path}?${search.toString()}`, {
    method: 'GET',
    headers: { Accept: 'application/json' },
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
        ? JSON.stringify((payload as Record<string, unknown>).error)
        : raw;
    throw new Error(`YouTube API error (${response.status}): ${message}`);
  }

  return payload as T;
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

    const channelIdRaw = req.query.channel_id;
    const channelId = Array.isArray(channelIdRaw)
      ? String(channelIdRaw[0] ?? '').trim()
      : String(channelIdRaw ?? process.env[CHANNEL_ID_ENV] ?? DEFAULT_CHANNEL_ID).trim();

    if (!channelId) {
      return res.status(400).json({ error: 'Falta channel_id.' });
    }

    const maxPages = parsePositiveInt(req.query.max_pages, DEFAULT_MAX_PAGES, 1, 200);
    const maxRuntimeMs = parsePositiveInt(req.query.max_runtime_ms, DEFAULT_MAX_RUNTIME_MS, 5_000, 120_000);
    const startAt = Date.now();
    const hardDeadline = startAt + (maxRuntimeMs - RUNTIME_BUFFER_MS);

    const channelResponse = await fetchYouTube<YouTubeListResponse<YoutubeChannelApi>>('/channels', {
      part: 'snippet,contentDetails,statistics',
      id: channelId,
      maxResults: '1',
    });

    const channel = channelResponse.items?.[0];
    if (!channel?.id) {
      return res.status(404).json({ error: `No se encontró el canal ${channelId}` });
    }

    const uploadsPlaylistId = channel.contentDetails?.relatedPlaylists?.uploads ?? null;
    const syncedAt = new Date().toISOString();

    const channelRow: YoutubeChannelRow = {
      business_id: channel.id,
      title: channel.snippet?.title ?? null,
      description: channel.snippet?.description ?? null,
      custom_url: channel.snippet?.customUrl ?? null,
      published_at: channel.snippet?.publishedAt ?? null,
      thumbnail_url: pickThumbnail(channel.snippet),
      uploads_playlist_id: uploadsPlaylistId,
      subscriber_count: toInt(channel.statistics?.subscriberCount, 0),
      video_count: toInt(channel.statistics?.videoCount, 0),
      view_count: toInt(channel.statistics?.viewCount, 0),
      raw_payload: channel as JsonRecord,
      last_synced_at: syncedAt,
    };

    const upsertedChannels = await upsertInChunks('youtube_channels', [channelRow], 'business_id');

    if (!uploadsPlaylistId) {
      return res.status(200).json({
        success: true,
        channel_id: channelId,
        upserted_channels: upsertedChannels,
        upserted_videos: 0,
        pages_fetched: 0,
        has_more: false,
        reason: 'El canal no tiene uploads playlist',
      });
    }

    let nextPageToken: string | undefined;
    let pagesFetched = 0;
    let hasMore = false;
    const videoIds: string[] = [];

    while (pagesFetched < maxPages) {
      if (Date.now() >= hardDeadline) {
        hasMore = true;
        break;
      }

      const playlistResponse = await fetchYouTube<YouTubeListResponse<YoutubePlaylistItemApi>>('/playlistItems', {
        part: 'snippet,contentDetails',
        playlistId: uploadsPlaylistId,
        maxResults: '50',
        ...(nextPageToken ? { pageToken: nextPageToken } : {}),
      });

      pagesFetched += 1;
      const items = playlistResponse.items ?? [];

      for (const item of items) {
        const videoId = item.contentDetails?.videoId ?? item.snippet?.resourceId?.videoId ?? null;
        if (!videoId) continue;
        videoIds.push(videoId);
      }

      nextPageToken = playlistResponse.nextPageToken;
      if (!nextPageToken) {
        hasMore = false;
        break;
      }

      hasMore = true;
    }

    const uniqueVideoIds = Array.from(new Set(videoIds));
    const videoRows: YoutubeVideoRow[] = [];

    for (let index = 0; index < uniqueVideoIds.length; index += 50) {
      if (Date.now() >= hardDeadline) {
        hasMore = true;
        break;
      }

      const ids = uniqueVideoIds.slice(index, index + 50);
      const videosResponse = await fetchYouTube<YouTubeListResponse<YoutubeVideoApi>>('/videos', {
        part: 'snippet,contentDetails,statistics',
        id: ids.join(','),
        maxResults: String(ids.length),
      });

      const videos = videosResponse.items ?? [];
      for (const video of videos) {
        if (!video.id) continue;

        videoRows.push({
          business_id: video.id,
          channel_business_id: video.snippet?.channelId ?? channel.id,
          title: video.snippet?.title ?? null,
          description: video.snippet?.description ?? null,
          published_at: video.snippet?.publishedAt ?? null,
          thumbnail_url: pickThumbnail(video.snippet),
          duration_iso8601: video.contentDetails?.duration ?? null,
          definition: video.contentDetails?.definition ?? null,
          caption_status: video.contentDetails?.caption ?? null,
          licensed_content: Boolean(video.contentDetails?.licensedContent),
          tags: Array.isArray(video.snippet?.tags) ? video.snippet.tags : [],
          view_count: toInt(video.statistics?.viewCount, 0),
          like_count: toInt(video.statistics?.likeCount, 0),
          comment_count: toInt(video.statistics?.commentCount, 0),
          raw_payload: video as JsonRecord,
          last_synced_at: syncedAt,
        });
      }
    }

    const upsertedVideos = await upsertInChunks('youtube_videos', videoRows, 'business_id');

    return res.status(200).json({
      success: true,
      channel_id: channelId,
      uploads_playlist_id: uploadsPlaylistId,
      pages_fetched: pagesFetched,
      pulled_video_ids: uniqueVideoIds.length,
      upserted_channels: upsertedChannels,
      upserted_videos: upsertedVideos,
      has_more: hasMore,
      max_pages: maxPages,
      max_runtime_ms: maxRuntimeMs,
      duration_ms: Date.now() - startAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return res.status(500).json({ error: message });
  }
}
