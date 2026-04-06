#!/usr/bin/env node

import { randomBytes, scryptSync } from 'node:crypto';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

const SCRYPT_N = 16_384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

function generateScryptPasswordHash(password) {
  const salt = randomBytes(SALT_LENGTH);
  const hash = scryptSync(password, salt, KEY_LENGTH, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 256 * 1024 * 1024,
  });

  return ['scrypt', String(SCRYPT_N), String(SCRYPT_R), String(SCRYPT_P), salt.toString('base64'), hash.toString('base64')].join('$');
}

function readPasswordFromArgs() {
  const raw = process.argv[2];
  return typeof raw === 'string' ? raw.trim() : '';
}

async function readPasswordInteractive() {
  const rl = readline.createInterface({ input, output });
  try {
    const password = await rl.question('Ingresá la contraseña para hashear: ');
    return password.trim();
  } finally {
    rl.close();
  }
}

async function main() {
  const password = readPasswordFromArgs() || (await readPasswordInteractive());

  if (!password) {
    throw new Error('La contraseña no puede estar vacía.');
  }

  if (password.length < 8) {
    throw new Error('La contraseña debe tener al menos 8 caracteres.');
  }

  const hash = generateScryptPasswordHash(password);
  output.write(`${hash}\n`);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : 'Error desconocido';
  console.error(`[generate-admin-password-hash] ${message}`);
  process.exit(1);
});
