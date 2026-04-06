import { randomBytes, scryptSync, timingSafeEqual } from 'node:crypto';

const SCRYPT_PREFIX = 'scrypt';
const DEFAULT_SCRYPT_N = 16_384;
const DEFAULT_SCRYPT_R = 8;
const DEFAULT_SCRYPT_P = 1;
const DEFAULT_KEY_LENGTH = 64;
const DEFAULT_SALT_LENGTH = 16;

interface ParsedScryptHash {
  N: number;
  r: number;
  p: number;
  salt: Buffer;
  hash: Buffer;
}

// Parsea un hash de contraseña generado con scrypt
function parseScryptHash(storedHash: string): ParsedScryptHash | null {
  const parts = storedHash.split('$');

  if (parts.length !== 6) return null;
  if (parts[0] !== SCRYPT_PREFIX) return null;

  const N = Number(parts[1]);
  const r = Number(parts[2]);
  const p = Number(parts[3]);
  const saltB64 = parts[4];
  const hashB64 = parts[5];

  if (!Number.isInteger(N) || !Number.isInteger(r) || !Number.isInteger(p)) return null;
  if (N <= 0 || r <= 0 || p <= 0) return null;

  try {
    const salt = Buffer.from(saltB64, 'base64');
    const hash = Buffer.from(hashB64, 'base64');

    if (salt.length === 0 || hash.length === 0) return null;

    return { N, r, p, salt, hash };
  } catch {
    return null;
  }
}

// Verifica una contraseña contra un hash almacenado usando scrypt
export function verifyPasswordWithScrypt(password: string, storedHash: string): boolean {
  const parsed = parseScryptHash(storedHash);
  if (!parsed) return false;

  const { N, r, p, salt, hash } = parsed;

  const derived = scryptSync(password, salt, hash.length, {
    N,
    r,
    p,
    maxmem: 256 * 1024 * 1024,
  });

  if (derived.length !== hash.length) {
    return false;
  }

  return timingSafeEqual(derived, hash);
}

// Genera un hash de contraseña usando scrypt con parámetros seguros por defecto
export function generateScryptPasswordHash(password: string) {
  const salt = randomBytes(DEFAULT_SALT_LENGTH);
  const hash = scryptSync(password, salt, DEFAULT_KEY_LENGTH, {
    N: DEFAULT_SCRYPT_N,
    r: DEFAULT_SCRYPT_R,
    p: DEFAULT_SCRYPT_P,
    maxmem: 256 * 1024 * 1024,
  });

  return [
    SCRYPT_PREFIX,
    String(DEFAULT_SCRYPT_N),
    String(DEFAULT_SCRYPT_R),
    String(DEFAULT_SCRYPT_P),
    salt.toString('base64'),
    hash.toString('base64'),
  ].join('$');
}
