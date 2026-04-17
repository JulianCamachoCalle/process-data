import type { VercelRequest, VercelResponse } from '@vercel/node';
import youtubeSyncHandler from '../../src/server/youtube/sync.js';
import youtubeAnalyticsSyncHandler from '../../src/server/youtube/analyticsSync.js';

function asSingleParam(value: unknown): string | undefined {
  if (Array.isArray(value)) {
    const first = value[0];
    return typeof first === 'string' || typeof first === 'number' ? String(first) : undefined;
  }

  return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
}

function parseBodyObject(req: VercelRequest) {
  if (!req.body) return {} as Record<string, unknown>;
  if (typeof req.body === 'string') {
    try {
      const parsed = JSON.parse(req.body) as unknown;
      return parsed && typeof parsed === 'object' && !Array.isArray(parsed)
        ? parsed as Record<string, unknown>
        : {};
    } catch {
      return {};
    }
  }

  return typeof req.body === 'object' && !Array.isArray(req.body)
    ? req.body as Record<string, unknown>
    : {};
}

export default async function youtubeHandler(req: VercelRequest, res: VercelResponse) {
  const body = parseBodyObject(req);
  const mode = (asSingleParam(body.mode) ?? asSingleParam(req.query.mode) ?? 'sync').trim().toLowerCase();

  if (mode === 'analytics') {
    return youtubeAnalyticsSyncHandler(req, res);
  }

  return youtubeSyncHandler(req, res);
}
