import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRequire } from 'node:module';
import { z, ZodError } from 'zod';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');

const AUTH_COOKIE_NAME = 'auth_token';
const AUTH_MAX_AGE_SECONDS = 60 * 60 * 8;

const authBodySchema = z.object({
  password: z.string().min(1, 'La contraseña es obligatoria'),
});

function parseCookies(cookieHeader: string | undefined) {
  if (!cookieHeader) return {} as Record<string, string>;

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return acc;

    acc[rawKey] = decodeURIComponent(rawValue.join('='));
    return acc;
  }, {});
}

function getCookieToken(req: VercelRequest) {
  const cookies = parseCookies(req.headers.cookie);
  return cookies[AUTH_COOKIE_NAME];
}

function buildAuthCookie(token: string) {
  const parts = [
    `${AUTH_COOKIE_NAME}=${encodeURIComponent(token)}`,
    'Path=/',
    `Max-Age=${AUTH_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

function buildLogoutCookie() {
  const parts = [
    `${AUTH_COOKIE_NAME}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Lax',
  ];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const jwtSecret = process.env.JWT_SECRET;

    if (!jwtSecret) {
      return res.status(500).json({ error: 'Falta la variable de entorno requerida: JWT_SECRET' });
    }

    if (req.method === 'GET') {
      const token = getCookieToken(req);
      if (!token) {
        return res.status(401).json({ authenticated: false });
      }

      try {
        jwt.verify(token, jwtSecret);
        return res.status(200).json({ authenticated: true });
      } catch {
        return res.status(401).json({ authenticated: false });
      }
    }

    if (req.method === 'DELETE') {
      res.setHeader('Set-Cookie', buildLogoutCookie());
      return res.status(200).json({ success: true });
    }

    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido' });
    }

    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword) {
      return res.status(500).json({ error: 'Falta la variable de entorno requerida: ADMIN_PASSWORD' });
    }

    const rawBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { password } = authBodySchema.parse(rawBody ?? {});

    if (password !== adminPassword) {
      return res.status(401).json({ error: 'Contraseña inválida' });
    }

    const token = jwt.sign({ role: 'admin' }, jwtSecret, { expiresIn: '8h' });
    res.setHeader('Set-Cookie', buildAuthCookie(token));
    return res.status(200).json({ success: true });
  } catch (error: unknown) {
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Cuerpo de solicitud inválido', details: error.issues });
    }

    if (error instanceof SyntaxError) {
      return res.status(400).json({ error: 'JSON inválido en la solicitud' });
    }

    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return res.status(500).json({ error: message });
  }
}
