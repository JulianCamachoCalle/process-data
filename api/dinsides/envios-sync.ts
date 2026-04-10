import type { VercelRequest, VercelResponse } from '@vercel/node';
import { isSecretAuthorized, isVercelCronAuthorized, verifyAdminSession } from '../kommo/_shared.js';

const DINSIDES_BASE_URL = 'https://dinsidescourier.com';
const DINSIDES_LOGIN_VALIDATE_URL = `${DINSIDES_BASE_URL}/login/validar`;
const DINSIDES_ENVIOS_URL = `${DINSIDES_BASE_URL}/Admin/getlistadoBuscadorActualiza`;

type DinsidesEnvioRow = Record<string, unknown>;

function parsePositiveInt(value: string | undefined, fallback: number, max: number) {
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, max);
}

function getRequestParam(req: VercelRequest, key: string) {
  const queryValue = req.query?.[key];
  if (Array.isArray(queryValue)) return queryValue[0];
  if (typeof queryValue === 'string') return queryValue;
  return undefined;
}

function toCookieHeaderFromSetCookie(rawSetCookieValues: string[]) {
  return rawSetCookieValues
    .map((item) => item.split(';')[0]?.trim())
    .filter(Boolean)
    .join('; ');
}

function extractSetCookieValues(response: Response) {
  const headers = response.headers as Headers & { getSetCookie?: () => string[] };

  if (typeof headers.getSetCookie === 'function') {
    return headers.getSetCookie();
  }

  const fallback = response.headers.get('set-cookie');
  if (!fallback) return [];
  return fallback.split(/,(?=\s*[A-Za-z0-9_\-]+=)/g);
}

async function loginAndGetCookieHeader(args: { tlf: string; clave: string }) {
  const body = new URLSearchParams({
    tlf: args.tlf,
    clave: args.clave,
  });

  const loginResponse = await fetch(DINSIDES_LOGIN_VALIDATE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
      'X-Requested-With': 'XMLHttpRequest',
      Origin: DINSIDES_BASE_URL,
      Referer: `${DINSIDES_BASE_URL}/login`,
    },
    body: body.toString(),
  });

  const rawText = await loginResponse.text();

  let loginRole: number | null = null;
  try {
    const parsed = JSON.parse(rawText) as unknown;
    if (typeof parsed === 'number') {
      loginRole = parsed;
    }
  } catch {
    // noop: si no es JSON, lo reportamos en error más abajo
  }

  if (!loginResponse.ok || !loginRole || loginRole <= 0) {
    throw new Error(`Login Dinsides inválido. status=${loginResponse.status}, body=${rawText.slice(0, 180)}`);
  }

  const setCookieValues = extractSetCookieValues(loginResponse);
  const cookieHeader = toCookieHeaderFromSetCookie(setCookieValues);
  if (!cookieHeader) {
    throw new Error('Login exitoso pero no se recibió cookie de sesión.');
  }

  return { cookieHeader, loginRole };
}

async function fetchEnviosWithSession(args: { cookieHeader: string }) {
  const response = await fetch(DINSIDES_ENVIOS_URL, {
    method: 'GET',
    headers: {
      Cookie: args.cookieHeader,
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${DINSIDES_BASE_URL}/admin/listado`,
    },
  });

  const rawText = await response.text();
  if (!response.ok) {
    throw new Error(`Error al leer envíos. status=${response.status}, body=${rawText.slice(0, 180)}`);
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawText);
  } catch {
    throw new Error(`La respuesta de envíos no es JSON válido: ${rawText.slice(0, 220)}`);
  }

  if (!Array.isArray(payload)) {
    throw new Error('La respuesta de envíos no es un array.');
  }

  return payload as DinsidesEnvioRow[];
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  try {
    const secretAuthorized = isSecretAuthorized(req, 'DINSIDES_SYNC_SECRET', 'x-dinsides-sync-secret');
    const cronAuthorized = isVercelCronAuthorized(req);

    if (!secretAuthorized && !cronAuthorized) {
      const auth = verifyAdminSession(req);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error ?? 'No autorizado' });
      }
    }

    const tlf = process.env.DINSIDES_ADMIN_TLF?.trim();
    const clave = process.env.DINSIDES_ADMIN_CLAVE?.trim();
    if (!tlf || !clave) {
      return res.status(500).json({
        error: 'Faltan DINSIDES_ADMIN_TLF y/o DINSIDES_ADMIN_CLAVE en el entorno.',
      });
    }

    const limit = parsePositiveInt(getRequestParam(req, 'limit'), 100, 2000);
    const { cookieHeader, loginRole } = await loginAndGetCookieHeader({ tlf, clave });
    const rows = await fetchEnviosWithSession({ cookieHeader });

    return res.status(200).json({
      success: true,
      source: 'dinsidescourier.com/Admin/getlistadoBuscadorActualiza',
      login_role: loginRole,
      total_rows: rows.length,
      returned_rows: Math.min(rows.length, limit),
      rows: rows.slice(0, limit),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error desconocido';
    return res.status(500).json({ error: message });
  }
}
