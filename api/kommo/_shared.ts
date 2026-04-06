import type { VercelRequest } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { createRequire } from 'node:module';
import {
  getJwtSecretOrThrow,
  verifyAdminSession as verifyAdminSessionBase,
  type AuthResult,
} from '../_auth.js';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');

let cachedSupabaseAdminClient: ReturnType<typeof createClient> | null = null;

export interface KommoTokenResponse {
  token_type: string;
  expires_in: number;
  access_token: string;
  refresh_token: string;
  scope?: string;
}

export interface KommoConnectionRow {
  account_subdomain: string;
  account_base_url: string;
  client_id: string;
  access_token: string;
  refresh_token: string;
  expires_at: string;
  token_type: string | null;
  scope: string | null;
  active: boolean;
}

interface KommoOauthEnv {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

interface KommoOauthState {
  baseUrl: string;
  nonce: string;
  iat?: number;
  exp?: number;
}

export function verifyAdminSession(req: VercelRequest): AuthResult {
  return verifyAdminSessionBase(req);
}

export function isSecretAuthorized(
  req: VercelRequest,
  envVarName: string,
  headerName: string,
  queryParam = 'secret',
) {
  const expectedSecret = process.env[envVarName];
  if (!expectedSecret) return false;

  const incomingHeader = req.headers[headerName.toLowerCase()];
  const headerSecret = Array.isArray(incomingHeader) ? incomingHeader[0] : incomingHeader;

  const queryValue = req.query?.[queryParam];
  const querySecret = Array.isArray(queryValue) ? queryValue[0] : queryValue;

  return headerSecret === expectedSecret || querySecret === expectedSecret;
}

export function isVercelCronAuthorized(req: VercelRequest) {
  const expectedCronSecret = process.env.CRON_SECRET;
  if (!expectedCronSecret) return false;

  const authHeader = req.headers.authorization;
  if (typeof authHeader !== 'string') return false;

  const bearerPrefix = 'Bearer ';
  if (!authHeader.startsWith(bearerPrefix)) return false;

  const token = authHeader.slice(bearerPrefix.length).trim();
  return token === expectedCronSecret;
}

export function getSupabaseAdminClient() {
  if (cachedSupabaseAdminClient) {
    return cachedSupabaseAdminClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Faltan SUPABASE_URL (o VITE_SUPABASE_URL) y/o SUPABASE_SERVICE_ROLE_KEY');
  }

  cachedSupabaseAdminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cachedSupabaseAdminClient;
}

export function normalizeKommoBaseUrl(raw: string) {
  const input = raw.trim();
  if (!input) {
    throw new Error('Base URL de Kommo inválida');
  }

  const withProtocol = /^https?:\/\//i.test(input) ? input : `https://${input}`;
  const url = new URL(withProtocol);

  if (!url.hostname.endsWith('.kommo.com')) {
    throw new Error('El dominio de Kommo debe terminar en .kommo.com');
  }

  return `${url.protocol}//${url.hostname}`;
}

export function extractKommoSubdomain(baseUrl: string) {
  const hostname = new URL(baseUrl).hostname;
  const [subdomain] = hostname.split('.');
  if (!subdomain) {
    throw new Error('No se pudo derivar el subdominio de Kommo');
  }

  return subdomain;
}

function getKommoOauthEnv(): KommoOauthEnv {
  const clientId = process.env.KOMMO_CLIENT_ID;
  const clientSecret = process.env.KOMMO_CLIENT_SECRET;
  const redirectUri = process.env.KOMMO_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error('Faltan variables KOMMO_CLIENT_ID, KOMMO_CLIENT_SECRET y/o KOMMO_REDIRECT_URI');
  }

  return { clientId, clientSecret, redirectUri };
}

function getJwtSecret() {
  return getJwtSecretOrThrow();
}

export function createKommoOauthState(baseUrl: string, nonce: string) {
  const jwtSecret = getJwtSecret();
  return jwt.sign({ baseUrl, nonce } satisfies KommoOauthState, jwtSecret, { expiresIn: '15m' });
}

export function readKommoOauthState(stateToken: string) {
  const jwtSecret = getJwtSecret();
  const decoded = jwt.verify(stateToken, jwtSecret) as KommoOauthState;

  if (!decoded || typeof decoded.baseUrl !== 'string' || typeof decoded.nonce !== 'string') {
    throw new Error('State OAuth de Kommo inválido');
  }

  return {
    baseUrl: normalizeKommoBaseUrl(decoded.baseUrl),
    nonce: decoded.nonce,
  };
}

function parseTokenPayload(payload: unknown): KommoTokenResponse {
  const candidate = payload as Partial<KommoTokenResponse> | null;

  if (
    !candidate ||
    typeof candidate.access_token !== 'string' ||
    typeof candidate.refresh_token !== 'string' ||
    typeof candidate.token_type !== 'string' ||
    typeof candidate.expires_in !== 'number'
  ) {
    throw new Error('Respuesta de token de Kommo inválida');
  }

  return {
    access_token: candidate.access_token,
    refresh_token: candidate.refresh_token,
    token_type: candidate.token_type,
    expires_in: candidate.expires_in,
    scope: typeof candidate.scope === 'string' ? candidate.scope : undefined,
  };
}

async function postTokenRequest(baseUrl: string, body: Record<string, unknown>) {
  const response = await fetch(`${baseUrl}/oauth2/access_token`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const rawText = await response.text();

  let payload: unknown = {};
  if (rawText) {
    try {
      payload = JSON.parse(rawText) as unknown;
    } catch {
      payload = { raw: rawText };
    }
  }

  if (!response.ok) {
    const fallback = rawText || 'Error desconocido';
    const messageFromPayload =
      typeof payload === 'object' && payload && 'detail' in payload
        ? String((payload as Record<string, unknown>).detail)
        : fallback;
    throw new Error(`Kommo OAuth error (${response.status}): ${messageFromPayload}`);
  }

  return parseTokenPayload(payload);
}

export async function exchangeAuthorizationCode(baseUrl: string, code: string) {
  const oauth = getKommoOauthEnv();

  return postTokenRequest(baseUrl, {
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    grant_type: 'authorization_code',
    code,
    redirect_uri: oauth.redirectUri,
  });
}

export async function refreshAccessToken(baseUrl: string, refreshToken: string) {
  const oauth = getKommoOauthEnv();

  return postTokenRequest(baseUrl, {
    client_id: oauth.clientId,
    client_secret: oauth.clientSecret,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    redirect_uri: oauth.redirectUri,
  });
}

export function buildKommoOauthUrl(state: string) {
  const oauth = getKommoOauthEnv();
  const url = new URL('https://www.kommo.com/oauth');
  url.searchParams.set('client_id', oauth.clientId);
  url.searchParams.set('state', state);
  url.searchParams.set('mode', 'popup');
  return url.toString();
}

export function buildExpiresAtIso(expiresInSeconds: number) {
  return new Date(Date.now() + Math.max(0, expiresInSeconds - 30) * 1000).toISOString();
}

export async function getActiveKommoConnection(subdomain?: string) {
  const supabase = getSupabaseAdminClient();

  let query = supabase
    .from('kommo_connections' as never)
    .select('*')
    .eq('active', true)
    .order('updated_at', { ascending: false })
    .limit(1);

  if (subdomain) {
    query = query.eq('account_subdomain', subdomain);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(error.message || 'No se pudo leer kommo_connections');
  }

  const row = ((data ?? []) as KommoConnectionRow[])[0] ?? null;
  return row;
}

export async function ensureFreshConnection(connection: KommoConnectionRow) {
  const expiresAtMs = new Date(connection.expires_at).getTime();
  if (!Number.isFinite(expiresAtMs) || expiresAtMs > Date.now() + 60_000) {
    return connection;
  }

  const refreshed = await refreshAccessToken(connection.account_base_url, connection.refresh_token);
  const supabase = getSupabaseAdminClient();

  const { data, error } = await supabase
    .from('kommo_connections' as never)
    .update({
      access_token: refreshed.access_token,
      refresh_token: refreshed.refresh_token,
      token_type: refreshed.token_type,
      scope: refreshed.scope ?? null,
      expires_at: buildExpiresAtIso(refreshed.expires_in),
      updated_at: new Date().toISOString(),
    } as never)
    .eq('account_subdomain', connection.account_subdomain)
    .select('*')
    .limit(1);

  if (error) {
    throw new Error(error.message || 'No se pudo persistir refresh token de Kommo');
  }

  const updated = ((data ?? []) as KommoConnectionRow[])[0] ?? null;
  if (!updated) {
    throw new Error('No se encontró conexión de Kommo para actualizar token');
  }

  return updated;
}
