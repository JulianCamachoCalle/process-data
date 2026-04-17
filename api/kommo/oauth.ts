import type { VercelRequest, VercelResponse } from '@vercel/node';
import kommoOauthStartHandler from '../../src/server/kommo/oauthStart.js';
import kommoOauthCallbackHandler from '../../src/server/kommo/oauthCallback.js';

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

export default async function kommoOauthHandler(req: VercelRequest, res: VercelResponse) {
  if (!['GET', 'POST'].includes(req.method ?? '')) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  }

  const body = parseBodyObject(req);
  const actionRaw = asSingleParam(body.action) ?? asSingleParam(req.query.action);
  const code = asSingleParam(body.code) ?? asSingleParam(req.query.code);
  const action = actionRaw?.trim().toLowerCase() || (code ? 'callback' : 'start');

  if (action === 'start') {
    return kommoOauthStartHandler(req, res);
  }

  if (action === 'callback') {
    return kommoOauthCallbackHandler(req, res);
  }

  return res.status(400).json({ error: 'Acción inválida. Use action=start o action=callback.' });
}
