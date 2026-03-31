import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createRequire } from 'node:module';
import { z, ZodError } from 'zod';

const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken') as typeof import('jsonwebtoken');
import {
  createStableRowId,
  getGoogleSheet,
  getRawSheet,
  invalidateSheetDataCache,
  STABLE_ROW_ID_COLUMN,
} from '../src/lib/google-sheets.js';

const querySchema = z.object({
  name: z.string().min(1, 'El nombre de la hoja es obligatorio'),
});

const stableIdHeaderReadyBySheet = new Map<string, true>();
const nextBusinessIdBySheet = new Map<string, number>();

function getSheetCacheKey(sheet: Awaited<ReturnType<typeof getRawSheet>>) {
  return String(sheet.sheetId);
}

function getBusinessIdCacheKey(sheet: Awaited<ReturnType<typeof getRawSheet>>, businessIdColumn: string) {
  return `${getSheetCacheKey(sheet)}::${businessIdColumn}`;
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

function getTokenFromRequest(req: VercelRequest) {
  const cookieToken = parseCookies(req.headers.cookie).auth_token;
  return typeof cookieToken === 'string' && cookieToken.trim() ? cookieToken : null;
}

function sanitizeUpdatePayload(data: Record<string, unknown>) {
  const sanitized = { ...data };
  delete sanitized._id;
  delete sanitized.id;
  delete sanitized._rowIndex;
  delete sanitized._rowNumber;
  delete sanitized.rowNumber;
  delete sanitized[STABLE_ROW_ID_COLUMN];
  return sanitized;
}

function isBusinessIdColumn(columnName: string): boolean {
  const raw = columnName.trim();

  if (!raw) return false;
  if (raw === STABLE_ROW_ID_COLUMN) return false;

  if (/^_?id$/i.test(raw)) return true;
  if (/^id[\s_-]/i.test(raw)) return true;
  if (/^id[A-ZÁÉÍÓÚÑ]/.test(raw) || /^ID[A-ZÁÉÍÓÚÑ]/.test(raw)) return true;

  return false;
}

function sanitizePayloadRemovingIdColumns(data: Record<string, unknown>, headerValues: string[]) {
  const sanitized = { ...data };

  for (const header of headerValues) {
    if (!isBusinessIdColumn(header)) continue;
    delete sanitized[header];
  }

  delete sanitized._id;
  delete sanitized.id;
  delete sanitized._rowIndex;
  delete sanitized._rowNumber;
  delete sanitized.rowNumber;
  delete sanitized[STABLE_ROW_ID_COLUMN];

  return sanitized;
}

function parseAutoIncrementId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value) && value > 0) {
    return Math.trunc(value);
  }

  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;
  if (!/^\d+$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;

  return Math.trunc(parsed);
}

function getBusinessIdColumn(headerValues: string[]): string | null {
  return headerValues.find((header) => isBusinessIdColumn(header) && header !== STABLE_ROW_ID_COLUMN) ?? null;
}

function columnIndexToLetter(columnIndex1Based: number): string {
  let index = columnIndex1Based;
  let letter = '';

  while (index > 0) {
    const remainder = (index - 1) % 26;
    letter = String.fromCharCode(65 + remainder) + letter;
    index = Math.floor((index - 1) / 26);
  }

  return letter;
}

function parseRowNumberHint(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value) && value >= 2) {
    return value;
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return Number.isInteger(parsed) && parsed >= 2 ? parsed : null;
}

async function ensureStableIdHeader(
  sheet: Awaited<ReturnType<typeof getRawSheet>>,
) {
  const sheetCacheKey = getSheetCacheKey(sheet);
  if (stableIdHeaderReadyBySheet.has(sheetCacheKey)) {
    return;
  }

  await sheet.loadHeaderRow();

  if (sheet.headerValues.includes(STABLE_ROW_ID_COLUMN)) {
    stableIdHeaderReadyBySheet.set(sheetCacheKey, true);
    return;
  }

  await sheet.setHeaderRow([...sheet.headerValues, STABLE_ROW_ID_COLUMN]);
  await sheet.loadHeaderRow();
  stableIdHeaderReadyBySheet.set(sheetCacheKey, true);
}

async function getRowByRowNumber(
  sheet: Awaited<ReturnType<typeof getRawSheet>>,
  rowNumber: number,
) {
  const offset = rowNumber - 2;
  if (offset < 0) return null;

  const rows = await sheet.getRows({ offset, limit: 1 });
  return rows[0] ?? null;
}

async function findRowNumberByStableId(
  sheet: Awaited<ReturnType<typeof getRawSheet>>,
  stableRowId: string,
) {
  const stableIdColumnIndex = sheet.headerValues.findIndex((header) => header === STABLE_ROW_ID_COLUMN);
  if (stableIdColumnIndex === -1) return null;

  const colLetter = columnIndexToLetter(stableIdColumnIndex + 1);
  const rawValues = await sheet.getCellsInRange(`${colLetter}2:${colLetter}${sheet.rowCount}`);
  const values = Array.isArray(rawValues) ? rawValues : [];

  for (let i = 0; i < values.length; i += 1) {
    const current = values[i]?.[0];
    if (typeof current === 'string' && current === stableRowId) {
      return i + 2;
    }
  }

  return null;
}

async function getNextBusinessId(
  sheet: Awaited<ReturnType<typeof getRawSheet>>,
  businessIdColumn: string,
) {
  const cacheKey = getBusinessIdCacheKey(sheet, businessIdColumn);
  const cachedNextId = nextBusinessIdBySheet.get(cacheKey);
  if (typeof cachedNextId === 'number' && Number.isFinite(cachedNextId) && cachedNextId > 0) {
    return cachedNextId;
  }

  const businessIdColumnIndex = sheet.headerValues.findIndex((header) => header === businessIdColumn);
  if (businessIdColumnIndex === -1) return 1;

  const colLetter = columnIndexToLetter(businessIdColumnIndex + 1);
  const rawValues = await sheet.getCellsInRange(`${colLetter}2:${colLetter}${sheet.rowCount}`);
  const values = Array.isArray(rawValues) ? rawValues : [];

  let maxId = 0;

  for (const row of values) {
    const parsedId = parseAutoIncrementId(row?.[0]);

    if (parsedId !== null && parsedId > maxId) {
      maxId = parsedId;
    }
  }

  const nextId = maxId + 1;
  nextBusinessIdBySheet.set(cacheKey, nextId);
  return nextId;
}

async function copyPreviousRowFormat(
  sheet: Awaited<ReturnType<typeof getRawSheet>>,
  newRowNumber: number,
) {
  if (newRowNumber <= 2) return;

  const previousRowNumber = newRowNumber - 1;

  await sheet.copyPaste(
    {
      startRowIndex: previousRowNumber - 1,
      endRowIndex: previousRowNumber,
      startColumnIndex: 0,
      endColumnIndex: sheet.columnCount,
    },
    {
      startRowIndex: newRowNumber - 1,
      endRowIndex: newRowNumber,
      startColumnIndex: 0,
      endColumnIndex: sheet.columnCount,
    },
    'PASTE_FORMAT',
  );
}

function mapRowForResponse(
  row: Awaited<ReturnType<Awaited<ReturnType<typeof getRawSheet>>['getRows']>>[number],
  headerValues: string[],
) {
  const data = row.toObject() as Record<string, unknown>;
  const visibleColumns = headerValues.filter((header) => header !== STABLE_ROW_ID_COLUMN);

  const mapped: Record<string, unknown> = {
    _id: typeof data[STABLE_ROW_ID_COLUMN] === 'string' ? data[STABLE_ROW_ID_COLUMN] : '',
    _rowNumber: row.rowNumber,
  };

  for (const column of visibleColumns) {
    mapped[column] = data[column];
  }

  return mapped;
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

    if (req.method === 'POST') {
      const startedAt = Date.now();
      const sheet = await getRawSheet(name);
      await ensureStableIdHeader(sheet);

      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const rawRowData = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
      const rowData = sanitizePayloadRemovingIdColumns(rawRowData, sheet.headerValues);

      const businessIdColumn = getBusinessIdColumn(sheet.headerValues);
      const businessIdPayload =
        businessIdColumn !== null
          ? { [businessIdColumn]: await getNextBusinessId(sheet, businessIdColumn) }
          : {};

      const createdRow = await sheet.addRow({
        ...rowData,
        ...businessIdPayload,
        [STABLE_ROW_ID_COLUMN]: createStableRowId(),
      });

      // Modo A: no bloquear la respuesta por copiado de formato.
      // Se dispara en segundo plano para priorizar velocidad percibida de guardado.
      void copyPreviousRowFormat(sheet, createdRow.rowNumber)
        .then(() => {
          console.debug('[sheet:post] format-copy ok', { sheet: name, rowNumber: createdRow.rowNumber });
        })
        .catch((formatError: unknown) => {
          console.info('[sheet:post] format-copy skipped', {
            sheet: name,
            message: formatError instanceof Error ? formatError.message : 'unknown',
          });
        });

      invalidateSheetDataCache(name);

      if (businessIdColumn !== null) {
        const businessIdCacheKey = getBusinessIdCacheKey(sheet, businessIdColumn);
        const usedId = parseAutoIncrementId(businessIdPayload[businessIdColumn]);
        if (usedId !== null) {
          nextBusinessIdBySheet.set(businessIdCacheKey, usedId + 1);
        }
      }

      const createdPayload = mapRowForResponse(createdRow, sheet.headerValues);
      console.debug('[sheet:post] ok', {
        sheet: name,
        durationMs: Date.now() - startedAt,
      });
      return res.status(201).json({ success: true, row: createdPayload });
    }

    if (req.method === 'PUT' || req.method === 'PATCH') {
      const startedAt = Date.now();
      const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
      const payload = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
      const rowId = payload._id ?? payload.id;
      const rowNumberHint = parseRowNumberHint(payload._rowNumber ?? payload.rowNumber);

      if (typeof rowId !== 'string' || !rowId.trim()) {
        return res.status(400).json({ error: 'El campo _id (o id) es obligatorio' });
      }

      const sheet = await getRawSheet(name);
      await ensureStableIdHeader(sheet);

      let targetRow: Awaited<ReturnType<Awaited<ReturnType<typeof getRawSheet>>['getRows']>>[number] | null = null;

      if (rowNumberHint !== null) {
        const rowByHint = await getRowByRowNumber(sheet, rowNumberHint);
        if (rowByHint) {
          const data = rowByHint.toObject() as Record<string, unknown>;
          if (data[STABLE_ROW_ID_COLUMN] === rowId) {
            targetRow = rowByHint;
          }
        }
      }

      if (!targetRow) {
        const resolvedRowNumber = await findRowNumberByStableId(sheet, rowId);
        if (resolvedRowNumber !== null) {
          targetRow = await getRowByRowNumber(sheet, resolvedRowNumber);
        }
      }

      if (!targetRow) {
        return res.status(404).json({ error: 'Registro no encontrado' });
      }

      if (rowNumberHint === null) {
        console.info('[sheet:put] fallback-stable-id-lookup', { sheet: name, rowId });
      }

      const sanitizedPayload = sanitizePayloadRemovingIdColumns(sanitizeUpdatePayload(payload), sheet.headerValues);
      targetRow.assign(sanitizedPayload);
      await targetRow.save();
      invalidateSheetDataCache(name);
      const updatedPayload = mapRowForResponse(targetRow, sheet.headerValues);
      console.debug('[sheet:put] ok', {
        sheet: name,
        durationMs: Date.now() - startedAt,
      });

      return res.status(200).json({ success: true, row: updatedPayload });
    }

    if (req.method === 'DELETE') {
      const startedAt = Date.now();
      const rowIdParam = req.query._id ?? req.query.id;
      const rowId = Array.isArray(rowIdParam) ? rowIdParam[0] : rowIdParam;
      const rowNumberParam = req.query._rowNumber ?? req.query.rowNumber;
      const rowNumberHint = parseRowNumberHint(Array.isArray(rowNumberParam) ? rowNumberParam[0] : rowNumberParam);

      if (typeof rowId !== 'string' || !rowId.trim()) {
        return res.status(400).json({ error: 'El parámetro _id (o id) es obligatorio' });
      }

      const sheet = await getRawSheet(name);
      await ensureStableIdHeader(sheet);

      let targetRowNumber: number | null = null;

      if (rowNumberHint !== null) {
        const rowByHint = await getRowByRowNumber(sheet, rowNumberHint);
        if (rowByHint) {
          const data = rowByHint.toObject() as Record<string, unknown>;
          if (data[STABLE_ROW_ID_COLUMN] === rowId) {
            targetRowNumber = rowByHint.rowNumber;
          }
        }
      }

      if (targetRowNumber === null) {
        targetRowNumber = await findRowNumberByStableId(sheet, rowId);
      }

      if (targetRowNumber === null) {
        return res.status(404).json({ error: 'Registro no encontrado' });
      }

      if (rowNumberHint === null) {
        console.info('[sheet:delete] fallback-stable-id-lookup', { sheet: name, rowId });
      }

      await sheet.deleteRows(targetRowNumber - 1, targetRowNumber);
      invalidateSheetDataCache(name);
      console.debug('[sheet:delete] ok', {
        sheet: name,
        durationMs: Date.now() - startedAt,
      });
      return res.status(200).json({ success: true, deletedId: rowId });
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
