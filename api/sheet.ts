import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRequire } from 'node:module';
import { z, ZodError } from 'zod';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
import {
  createStableRowId,
  ensureRowsHaveStableIds,
  getGoogleSheet,
  getRawSheet,
  invalidateSheetDataCache,
  STABLE_ROW_ID_COLUMN,
} from '../src/lib/google-sheets';

const querySchema = z.object({
  name: z.string().min(1, 'El nombre de la hoja es obligatorio'),
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

function getTokenFromRequest(req: VercelRequest) {
  const cookieToken = parseCookies(req.headers.cookie).auth_token;
  return typeof cookieToken === 'string' && cookieToken.trim() ? cookieToken : null;
}

function sanitizeUpdatePayload(data: Record<string, unknown>) {
  const sanitized = { ...data };
  delete sanitized._id;
  delete sanitized.id;
  delete sanitized._rowIndex;
  delete sanitized[STABLE_ROW_ID_COLUMN];
  return sanitized;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    const { name } = querySchema.parse(req.query);

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

    if (req.method === 'GET') {
      const startedAt = Date.now();
      const data = await getGoogleSheet(name);
      console.debug('[sheet:get] ok', {
        sheet: name,
        rows: data.rows.length,
        columns: data.columns.length,
        durationMs: Date.now() - startedAt,
      });
      res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=300');
      return res.status(200).json(data);
    } 
    
    else if (req.method === 'POST') {
      const sheet = await getRawSheet(name);
      await ensureRowsHaveStableIds(sheet);
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const rowData = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
      await sheet.addRow({ ...rowData, [STABLE_ROW_ID_COLUMN]: createStableRowId() });
      invalidateSheetDataCache(name);
      return res.status(201).json({ success: true });
    } 
    
    else if (req.method === 'PUT' || req.method === 'PATCH') {
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
      const rowId = payload._id ?? payload.id;

      if (typeof rowId !== 'string' || !rowId.trim()) {
        return res.status(400).json({ error: 'El campo _id (o id) es obligatorio' });
      }

      const sheet = await getRawSheet(name);
      const rows = await ensureRowsHaveStableIds(sheet);
      const targetRow = rows.find((row) => {
        const data = row.toObject() as Record<string, unknown>;
        return data[STABLE_ROW_ID_COLUMN] === rowId;
      });

      if (!targetRow) {
        return res.status(404).json({ error: 'Registro no encontrado' });
      }
      
      targetRow.assign(sanitizeUpdatePayload(payload));
      await targetRow.save();
      invalidateSheetDataCache(name);
      
      return res.status(200).json({ success: true });
    } 
    
    else if (req.method === 'DELETE') {
      const rowIdParam = req.query._id ?? req.query.id;
      const rowId = Array.isArray(rowIdParam) ? rowIdParam[0] : rowIdParam;

      if (typeof rowId !== 'string' || !rowId.trim()) {
        return res.status(400).json({ error: 'El parámetro _id (o id) es obligatorio' });
      }

      const sheet = await getRawSheet(name);
      const rows = await ensureRowsHaveStableIds(sheet);
      const targetRow = rows.find((row) => {
        const data = row.toObject() as Record<string, unknown>;
        return data[STABLE_ROW_ID_COLUMN] === rowId;
      });

      if (!targetRow) {
        return res.status(404).json({ error: 'Registro no encontrado' });
      }
      
      await targetRow.delete();
      invalidateSheetDataCache(name);
      return res.status(200).json({ success: true });
    }

    return res.status(405).json({ error: 'Método no permitido' });
  } catch (error: unknown) {
    if (req.method === 'GET') {
      console.info('[sheet:get] error', {
        sheet: typeof req.query?.name === 'string' ? req.query.name : 'unknown',
        message: error instanceof Error ? error.message : 'unknown',
      });
    }

    console.error('API Error:', error);
    
    if (error instanceof ZodError) {
      return res.status(400).json({ error: 'Parámetros de consulta inválidos', details: error.issues });
    }
    
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return res.status(500).json({ error: message });
  }
}
