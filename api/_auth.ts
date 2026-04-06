import type { VercelRequest } from '@vercel/node';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');

// Constantes y funciones relacionadas con autenticación y autorización
export const AUTH_COOKIE_NAME = 'auth_token';
export const AUTH_MAX_AGE_SECONDS = 60 * 60 * 8;

const JWT_ISSUER = 'process-data-admin';
const JWT_AUDIENCE = 'process-data-api';
const ADMIN_ROLE = 'admin';

interface JwtClaims {
  sub: string;
  role: string;
  iat?: number;
  exp?: number;
  iss?: string;
  aud?: string | string[];
}

export interface AuthResult {
  ok: boolean;
  status: number;
  error?: string;
  claims?: JwtClaims;
}

// Funciones para manejo de cookies, generación y verificación de JWT, y verificación de sesiones de admin
export function parseCookies(cookieHeader: string | undefined) {
  if (!cookieHeader) return {} as Record<string, string>;

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return acc;

    acc[rawKey] = decodeURIComponent(rawValue.join('='));
    return acc;
  }, {});
}

// Extrae el token JWT de la cookie de autenticación en la solicitud
export function getAuthTokenFromRequest(req: VercelRequest) {
  const cookieToken = parseCookies(req.headers.cookie)[AUTH_COOKIE_NAME];
  return typeof cookieToken === 'string' && cookieToken.trim() ? cookieToken : null;
}

// Obtiene el secreto JWT de las variables de entorno o lanza un error si no está configurado
export function getJwtSecretOrThrow() {
  const jwtSecret = process.env.JWT_SECRET;
  if (!jwtSecret) {
    throw new Error('Falta la variable de entorno requerida: JWT_SECRET');
  }

  return jwtSecret;
}

// Genera un token JWT para un usuario admin con el ID proporcionado
export function signAdminJwt(userId: string, jwtSecret: string) {
  return jwt.sign(
    {
      role: ADMIN_ROLE,
      sub: userId,
    },
    jwtSecret,
    {
      expiresIn: '8h',
      issuer: JWT_ISSUER,
      audience: JWT_AUDIENCE,
    },
  );
}

// Verifica un token JWT de admin y devuelve sus claims si es válido, o lanza un error si no lo es
export function verifyAdminToken(token: string, jwtSecret: string): JwtClaims {
  const decoded = jwt.verify(token, jwtSecret, {
    issuer: JWT_ISSUER,
    audience: JWT_AUDIENCE,
  }) as JwtClaims;

  if (!decoded || typeof decoded !== 'object') {
    throw new Error('Token inválido');
  }

  if (typeof decoded.sub !== 'string' || !decoded.sub.trim()) {
    throw new Error('Token inválido: falta sub');
  }

  if (decoded.role !== ADMIN_ROLE) {
    throw new Error('Token inválido: rol no autorizado');
  }

  return decoded;
}

// Verifica la sesión de admin en la solicitud y devuelve un resultado con el estado de autenticación y los claims del token si es válido
export function verifyAdminSession(req: VercelRequest): AuthResult {
  let jwtSecret: string;
  try {
    jwtSecret = getJwtSecretOrThrow();
  } catch (error: unknown) {
    return {
      ok: false,
      status: 500,
      error: error instanceof Error ? error.message : 'Error de configuración de autenticación',
    };
  }

  // Verifica el token JWT de admin en la cookie de la solicitud
  const token = getAuthTokenFromRequest(req);
  if (!token) {
    return { ok: false, status: 401, error: 'No autorizado: falta la cookie auth_token' };
  }

  try {
    const claims = verifyAdminToken(token, jwtSecret);
    return { ok: true, status: 200, claims };
  } catch {
    return { ok: false, status: 401, error: 'No autorizado: cookie auth_token inválida o expirada' };
  }
}

export function buildAuthCookie(token: string) {
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

export function buildLogoutCookie() {
  const parts = [`${AUTH_COOKIE_NAME}=`, 'Path=/', 'Max-Age=0', 'HttpOnly', 'SameSite=Lax'];

  if (process.env.NODE_ENV === 'production') {
    parts.push('Secure');
  }

  return parts.join('; ');
}
