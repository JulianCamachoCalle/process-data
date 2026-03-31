import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  buildExpiresAtIso,
  exchangeAuthorizationCode,
  extractKommoSubdomain,
  getSupabaseAdminClient,
  readKommoOauthState,
  verifyAdminSession,
} from '../_shared';

const OAUTH_NONCE_COOKIE = 'kommo_oauth_nonce';

function asSingleQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function parseCookies(cookieHeader: string | undefined) {
  if (!cookieHeader) return {} as Record<string, string>;

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return acc;

    acc[rawKey] = decodeURIComponent(rawValue.join('='));
    return acc;
  }, {});
}

function clearNonceCookie() {
  const parts = [`${OAUTH_NONCE_COOKIE}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];
  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }
  return parts.join('; ');
}

function renderHtmlResult(success: boolean, message: string) {
  const safeMessage = message.replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!doctype html>
<html lang="es">
<head>
  <meta charset="utf-8" />
  <title>Kommo OAuth</title>
</head>
<body>
  <p>${safeMessage}</p>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage({ source: 'kommo-oauth', success: ${success ? 'true' : 'false'}, message: ${JSON.stringify(message)} }, '*');
      }
    } catch (_) {}
    setTimeout(() => window.close(), 200);
  </script>
</body>
</html>`;
}

export default async function kommoOauthCallbackHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const auth = verifyAdminSession(req);
    if (!auth.ok) {
      return res.status(auth.status).send(renderHtmlResult(false, auth.error ?? 'No autorizado'));
    }

    const errorParam = asSingleQueryParam(req.query.error);
    if (errorParam) {
      return res.status(400).send(renderHtmlResult(false, `Kommo devolvió error: ${errorParam}`));
    }

    const code = asSingleQueryParam(req.query.code);
    const state = asSingleQueryParam(req.query.state);

    if (!code || !state) {
      return res.status(400).send(renderHtmlResult(false, 'Faltan parámetros code/state en callback OAuth'));
    }

    const stateData = readKommoOauthState(state);
    const nonceCookie = parseCookies(req.headers.cookie)[OAUTH_NONCE_COOKIE];
    if (!nonceCookie || nonceCookie !== stateData.nonce) {
      return res.status(400).send(renderHtmlResult(false, 'State OAuth inválido o expirado'));
    }

    const tokenResponse = await exchangeAuthorizationCode(stateData.baseUrl, code);
    const accountSubdomain = extractKommoSubdomain(stateData.baseUrl);
    const clientId = process.env.KOMMO_CLIENT_ID;

    if (!clientId) {
      return res.status(500).send(renderHtmlResult(false, 'Falta KOMMO_CLIENT_ID'));
    }

    const supabase = getSupabaseAdminClient();

    const { error: upsertError } = await supabase.from('kommo_connections' as never).upsert(
      {
        account_subdomain: accountSubdomain,
        account_base_url: stateData.baseUrl,
        client_id: clientId,
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
        token_type: tokenResponse.token_type,
        scope: tokenResponse.scope ?? null,
        expires_at: buildExpiresAtIso(tokenResponse.expires_in),
        active: true,
        updated_at: new Date().toISOString(),
      } as never,
      {
        onConflict: 'account_subdomain',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo guardar conexión OAuth de Kommo');
    }

    res.setHeader('Set-Cookie', clearNonceCookie());
    return res.status(200).send(renderHtmlResult(true, `Conexión Kommo lista para ${accountSubdomain}`));
  } catch (error: unknown) {
    return res
      .status(500)
      .send(renderHtmlResult(false, error instanceof Error ? error.message : 'Error interno del servidor'));
  }
}
