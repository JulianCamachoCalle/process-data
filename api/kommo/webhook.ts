import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import { getSupabaseAdminClient, isSecretAuthorized } from './_shared';

const HEADER_SECRET = 'x-kommo-webhook-secret';
const ENV_SECRET = 'KOMMO_WEBHOOK_SECRET';

function toJsonString(value: unknown) {
  try {
    return JSON.stringify(value ?? {});
  } catch {
    return '{}';
  }
}

function stableHash(value: string) {
  return createHash('sha256').update(value).digest('hex');
}

export default async function kommoWebhookHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    if (!isSecretAuthorized(req, ENV_SECRET, HEADER_SECRET)) {
      return res.status(401).json({ error: `No autorizado: falta ${HEADER_SECRET}` });
    }

    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const payload = body ?? {};

    const refererHeader = req.headers.referer;
    const accountBaseUrl =
      typeof refererHeader === 'string' && refererHeader.includes('kommo.com')
        ? `https://${new URL(refererHeader).hostname}`
        : null;

    const payloadJson = toJsonString(payload);
    const dedupeKey = stableHash(payloadJson);

    const supabase = getSupabaseAdminClient();
    const { error: insertError } = await supabase.from('kommo_webhook_events' as never).insert({
      account_base_url: accountBaseUrl,
      event_type: 'webhook',
      payload: payload,
      dedupe_key: dedupeKey,
      status: 'pending',
    } as never);

    if (insertError) {
      throw new Error(insertError.message || 'No se pudo guardar webhook de Kommo');
    }

    return res.status(202).json({ success: true });
  } catch (error: unknown) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
