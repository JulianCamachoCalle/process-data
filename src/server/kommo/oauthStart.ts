import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomBytes } from 'node:crypto';
import {
  buildKommoOauthUrl,
  createKommoOauthState,
  normalizeKommoBaseUrl,
  verifyAdminSession,
} from './shared.js';

const OAUTH_NONCE_COOKIE = 'kommo_oauth_nonce';
const NONCE_MAX_AGE_SECONDS = 60 * 15;

function asSingleQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function asSingleBodyParam(value: unknown) {
  if (Array.isArray(value)) return typeof value[0] === 'string' ? value[0] : undefined;
  return typeof value === 'string' ? value : undefined;
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

function buildNonceCookie(nonce: string) {
  const parts = [
    `${OAUTH_NONCE_COOKIE}=${encodeURIComponent(nonce)}`,
    'Path=/',
    `Max-Age=${NONCE_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export default async function kommoOauthStartHandler(req: VercelRequest, res: VercelResponse) {
  try {
    const auth = verifyAdminSession(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error ?? 'No autorizado' });
    }

    const body = parseBodyObject(req);

    const baseUrlRaw =
      asSingleBodyParam(body.base_url)
      ?? asSingleBodyParam(body.baseUrl)
      ?? asSingleQueryParam(req.query.base_url)
      ?? asSingleQueryParam(req.query.baseUrl);
    if (!baseUrlRaw) {
      return res.status(400).json({ error: 'Falta query param base_url (ej: https://tu-subdominio.kommo.com)' });
    }

    const baseUrl = normalizeKommoBaseUrl(baseUrlRaw);
    const nonce = randomBytes(16).toString('hex');
    const state = createKommoOauthState(baseUrl, nonce);
    const authorizeUrl = buildKommoOauthUrl(state);

    res.setHeader('Set-Cookie', buildNonceCookie(nonce));

    const mode = asSingleBodyParam(body.mode) ?? asSingleQueryParam(req.query.mode);
    if (mode === 'json') {
      return res.status(200).json({ authorizeUrl, baseUrl });
    }

    return res.redirect(302, authorizeUrl);
  } catch (error: unknown) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
