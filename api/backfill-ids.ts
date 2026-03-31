import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRequire } from 'node:module';
import { ensureRowsHaveStableIdsWithSummary, getAllRawSheets } from '../src/lib/google-sheets.js';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');

function parseCookies(cookieHeader: string | undefined) {
  if (!cookieHeader) return {} as Record<string, string>;

  return cookieHeader.split(';').reduce<Record<string, string>>((acc, part) => {
    const [rawKey, ...rawValue] = part.trim().split('=');
    if (!rawKey) return acc;

    acc[rawKey] = decodeURIComponent(rawValue.join('='));
    return acc;
  }, {});
}

function getTokenFromRequest(req: VercelRequest) {
  const cookieToken = parseCookies(req.headers.cookie).auth_token;
  return typeof cookieToken === 'string' && cookieToken.trim() ? cookieToken : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido' });
    }

    const jwtSecret = process.env.JWT_SECRET;
    if (!jwtSecret) {
      return res.status(500).json({ error: 'Falta la variable de entorno requerida: JWT_SECRET' });
    }

    const token = getTokenFromRequest(req);
    if (!token) {
      return res.status(401).json({ error: 'No autorizado: falta la cookie auth_token' });
    }

    try {
      jwt.verify(token, jwtSecret);
    } catch {
      return res.status(401).json({ error: 'No autorizado: cookie auth_token inválida o expirada' });
    }

    const startedAt = Date.now();
    const sheets = await getAllRawSheets();
    const perSheet = [] as Array<{
      title: string;
      rowCount: number;
      hadBackfill: boolean;
      durationMs: number;
    }>;

    for (const sheet of sheets) {
      const sheetStartedAt = Date.now();
      const { rows, hadBackfill } = await ensureRowsHaveStableIdsWithSummary(sheet);

      perSheet.push({
        title: sheet.title,
        rowCount: rows.length,
        hadBackfill,
        durationMs: Date.now() - sheetStartedAt,
      });
    }

    return res.status(200).json({
      success: true,
      sheetCount: perSheet.length,
      hadAnyBackfill: perSheet.some((item) => item.hadBackfill),
      durationMs: Date.now() - startedAt,
      sheets: perSheet,
    });
  } catch (error: unknown) {
    console.error('Backfill IDs Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return res.status(500).json({ error: message });
  }
}
