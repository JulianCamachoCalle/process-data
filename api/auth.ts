import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z, ZodError } from 'zod';
import { getSupabaseAdminClient } from './kommo/_shared.js';
import {
  buildAuthCookie,
  buildLogoutCookie,
  getAuthTokenFromRequest,
  getJwtSecretOrThrow,
  signAuthJwt,
  verifyAuthToken,
  type AppRole,
} from './_auth.js';
import { verifyPasswordWithScrypt } from './_password.js';

const authBodySchema = z.object({
  email: z.string().trim().email('El email es inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres'),
});

const ADMIN_LOGIN_RATE_WINDOW_MS = 15 * 60 * 1000;
const ADMIN_LOGIN_MAX_ATTEMPTS = 8;
const ADMIN_LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

interface LoginAttemptRecord {
  attempts: number;
  firstAttemptAt: number;
  lockUntil: number;
}

const loginAttemptsByKey = new Map<string, LoginAttemptRecord>();

function getRequestIp(req: VercelRequest) {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string' && xff.trim()) {
    return xff.split(',')[0]?.trim() ?? 'unknown-ip';
  }
  if (Array.isArray(xff) && xff[0]?.trim()) {
    return xff[0].split(',')[0]?.trim() ?? 'unknown-ip';
  }

  return req.socket?.remoteAddress ?? 'unknown-ip';
}

function getRateLimitKey(req: VercelRequest, email: string) {
  return `${getRequestIp(req)}::${email.toLowerCase()}`;
}

function canAttemptLogin(rateKey: string, now: number) {
  const current = loginAttemptsByKey.get(rateKey);
  if (!current) return { allowed: true };

  if (current.lockUntil > now) {
    const retryAfterSeconds = Math.ceil((current.lockUntil - now) / 1000);
    return { allowed: false, retryAfterSeconds };
  }

  if (now - current.firstAttemptAt > ADMIN_LOGIN_RATE_WINDOW_MS) {
    loginAttemptsByKey.delete(rateKey);
    return { allowed: true };
  }

  return { allowed: true };
}

function registerFailedLoginAttempt(rateKey: string, now: number) {
  const current = loginAttemptsByKey.get(rateKey);

  if (!current || now - current.firstAttemptAt > ADMIN_LOGIN_RATE_WINDOW_MS) {
    loginAttemptsByKey.set(rateKey, {
      attempts: 1,
      firstAttemptAt: now,
      lockUntil: 0,
    });
    return;
  }

  const attempts = current.attempts + 1;
  const shouldLock = attempts >= ADMIN_LOGIN_MAX_ATTEMPTS;

  loginAttemptsByKey.set(rateKey, {
    attempts,
    firstAttemptAt: current.firstAttemptAt,
    lockUntil: shouldLock ? now + ADMIN_LOGIN_LOCKOUT_MS : 0,
  });
}

function clearFailedLoginAttempts(rateKey: string) {
  loginAttemptsByKey.delete(rateKey);
}

function isMissingAdminUsersTableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const message = (error as { message?: unknown }).message;
  return typeof message === 'string' && message.includes("Could not find the table 'public.admin_access_users'");
}

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function getInvalidCredentialsError() {
  return { error: 'Credenciales inválidas' };
}

interface AdminAccessUserRow {
  id: string | number;
  email: string;
  password_hash: string;
  is_active: boolean;
  role: AppRole | string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const jwtSecret = getJwtSecretOrThrow();

    if (req.method === 'GET') {
      const token = getAuthTokenFromRequest(req);
      if (!token) {
        return res.status(401).json({ authenticated: false });
      }

      try {
        const claims = verifyAuthToken(token, jwtSecret);
        return res.status(200).json({ authenticated: true, role: claims.role });
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

    const rawBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { email, password } = authBodySchema.parse(rawBody ?? {});

    const normalizedEmail = normalizeEmail(email);
    const rateKey = getRateLimitKey(req, normalizedEmail);
    const now = Date.now();

    const attemptState = canAttemptLogin(rateKey, now);
    if (!attemptState.allowed) {
      if (typeof attemptState.retryAfterSeconds === 'number' && attemptState.retryAfterSeconds > 0) {
        res.setHeader('Retry-After', String(attemptState.retryAfterSeconds));
      }

      return res.status(429).json({ error: 'Demasiados intentos. Probá nuevamente más tarde.' });
    }

    const supabase = getSupabaseAdminClient();
    const { data, error } = await supabase
      .from('admin_access_users' as never)
      .select('id,email,password_hash,is_active,role' as never)
      .eq('email' as never, normalizedEmail as never)
      .limit(1);

    if (error) {
      if (isMissingAdminUsersTableError(error)) {
        return res.status(500).json({
          error: 'No existe la tabla admin_access_users. Ejecutá la configuración de seguridad en la base de datos.',
        });
      }

      throw new Error(error.message || 'No se pudo validar usuario administrador');
    }

    const user = ((data ?? []) as AdminAccessUserRow[])[0] ?? null;
    const isUserActive = user?.is_active === true;
    const role = user?.role === 'admin' || user?.role === 'user' ? user.role : null;
    const isValidPassword =
      typeof user?.password_hash === 'string' && user.password_hash.length > 0
        ? verifyPasswordWithScrypt(password, user.password_hash)
        : false;

    if (!user || !isUserActive || !role || !isValidPassword) {
      registerFailedLoginAttempt(rateKey, now);
      return res.status(401).json(getInvalidCredentialsError());
    }

    clearFailedLoginAttempts(rateKey);

    const token = signAuthJwt(String(user.id), jwtSecret, role);
    res.setHeader('Set-Cookie', buildAuthCookie(token));
    return res.status(200).json({ success: true, role });
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
