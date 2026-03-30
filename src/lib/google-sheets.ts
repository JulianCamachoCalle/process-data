import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { randomUUID } from 'node:crypto';

export const STABLE_ROW_ID_COLUMN = '__id';

const DOC_INFO_TTL_MS = 60_000;
const SHEET_STABLE_ID_WARMUP_TTL_MS = 15 * 60_000;
const SHEET_DATA_CACHE_TTL_MS = 45_000;

const GOOGLE_SERVICE_ACCOUNT_EMAIL = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
const GOOGLE_PRIVATE_KEY = process.env.GOOGLE_PRIVATE_KEY;
const GOOGLE_SHEET_ID = process.env.GOOGLE_SHEET_ID;

let cachedDoc: GoogleSpreadsheet | null = null;
let cachedDocInfoLoadedAt = 0;
const stableIdWarmupBySheet = new Map<string, number>();
const sheetDataCacheBySheet = new Map<string, {
  expiresAt: number;
  payload: {
    columns: string[];
    rows: Array<Record<string, unknown>>;
  };
}>();

function normalizeSheetNameKey(sheetName: string) {
  return sheetName.trim().toUpperCase();
}

function cloneSheetPayload(payload: { columns: string[]; rows: Array<Record<string, unknown>> }) {
  return {
    columns: [...payload.columns],
    rows: payload.rows.map((row) => ({ ...row })),
  };
}

function getCachedSheetPayload(sheetName: string) {
  const key = normalizeSheetNameKey(sheetName);
  const cached = sheetDataCacheBySheet.get(key);

  if (!cached) return null;

  if (Date.now() >= cached.expiresAt) {
    sheetDataCacheBySheet.delete(key);
    return null;
  }

  return cloneSheetPayload(cached.payload);
}

function setCachedSheetPayload(sheetName: string, payload: { columns: string[]; rows: Array<Record<string, unknown>> }) {
  const key = normalizeSheetNameKey(sheetName);

  sheetDataCacheBySheet.set(key, {
    expiresAt: Date.now() + SHEET_DATA_CACHE_TTL_MS,
    payload: cloneSheetPayload(payload),
  });
}

export function invalidateSheetDataCache(sheetName?: string) {
  if (!sheetName) {
    sheetDataCacheBySheet.clear();
    return;
  }

  sheetDataCacheBySheet.delete(normalizeSheetNameKey(sheetName));
}

function getSheetCacheKey(sheet: Awaited<ReturnType<typeof getRawSheet>>) {
  return String(sheet.sheetId);
}

function shouldRefreshDocInfo(force = false) {
  if (force) return true;
  if (!cachedDocInfoLoadedAt) return true;
  return Date.now() - cachedDocInfoLoadedAt >= DOC_INFO_TTL_MS;
}

async function refreshDocInfoIfNeeded(force = false) {
  if (!cachedDoc) {
    return;
  }

  if (!shouldRefreshDocInfo(force)) {
    return;
  }

  await cachedDoc.loadInfo();
  cachedDocInfoLoadedAt = Date.now();
}

function shouldWarmupStableIds(sheet: Awaited<ReturnType<typeof getRawSheet>>) {
  const key = getSheetCacheKey(sheet);
  const lastWarmupAt = stableIdWarmupBySheet.get(key);
  if (!lastWarmupAt) return true;
  return Date.now() - lastWarmupAt >= SHEET_STABLE_ID_WARMUP_TTL_MS;
}

function markStableIdWarmup(sheet: Awaited<ReturnType<typeof getRawSheet>>) {
  stableIdWarmupBySheet.set(getSheetCacheKey(sheet), Date.now());
}

async function getSpreadsheetDoc() {
  if (!GOOGLE_SERVICE_ACCOUNT_EMAIL || !GOOGLE_PRIVATE_KEY || !GOOGLE_SHEET_ID) {
    throw new Error('Faltan credenciales de Google Service Account o el ID de hoja en variables de entorno');
  }

  const privateKey = GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n');

  if (!cachedDoc) {
    const jwt = new JWT({
      email: GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: privateKey,
      scopes: [
        'https://www.googleapis.com/auth/spreadsheets',
        'https://www.googleapis.com/auth/drive.file',
      ],
    });

    cachedDoc = new GoogleSpreadsheet(GOOGLE_SHEET_ID, jwt);
  }

  await refreshDocInfoIfNeeded();
  return cachedDoc;
}

function mapRowsWithStableIds(
  rows: Awaited<ReturnType<Awaited<ReturnType<typeof getRawSheet>>['getRows']>>,
  visibleColumns: string[],
) {
  let hasMissingStableIds = false;

  const mappedRows = rows.map((row) => {
    const obj = row.toObject() as Record<string, unknown>;
    const stableId = obj[STABLE_ROW_ID_COLUMN];

    if (typeof stableId !== 'string' || !stableId.trim()) {
      hasMissingStableIds = true;
    }

    return {
      ...visibleColumns.reduce<Record<string, unknown>>((acc, column) => {
        acc[column] = obj[column];
        return acc;
      }, {}),
      _id: typeof stableId === 'string' ? stableId : '',
      _rowNumber: row.rowNumber,
    };
  });

  return { mappedRows, hasMissingStableIds };
}

async function ensureStableIdColumn(sheet: Awaited<ReturnType<typeof getRawSheet>>) {
  await sheet.loadHeaderRow();

  if (sheet.headerValues.includes(STABLE_ROW_ID_COLUMN)) {
    return false;
  }

  await sheet.setHeaderRow([...sheet.headerValues, STABLE_ROW_ID_COLUMN]);
  await sheet.loadHeaderRow();
  return true;
}

export function createStableRowId() {
  return randomUUID();
}

function hasMissingStableId(
  row: Awaited<ReturnType<Awaited<ReturnType<typeof getRawSheet>>['getRows']>>[number],
) {
  const data = row.toObject() as Record<string, unknown>;
  const stableId = data[STABLE_ROW_ID_COLUMN];
  return typeof stableId !== 'string' || !stableId.trim();
}

export async function ensureRowsHaveStableIdsWithSummary(sheet: Awaited<ReturnType<typeof getRawSheet>>) {
  const addedStableIdColumn = await ensureStableIdColumn(sheet);
  const rows = await sheet.getRows();
  const hasRowsMissingStableId = rows.some((row) => hasMissingStableId(row));

  if (hasRowsMissingStableId) {
    for (const row of rows) {
      if (!hasMissingStableId(row)) {
        continue;
      }

      const generatedStableId = createStableRowId();
      row.assign({ [STABLE_ROW_ID_COLUMN]: generatedStableId });
      await row.save();
    }
  }

  markStableIdWarmup(sheet);

  return {
    rows,
    hadBackfill: addedStableIdColumn || hasRowsMissingStableId,
  };
}

export async function ensureRowsHaveStableIds(sheet: Awaited<ReturnType<typeof getRawSheet>>) {
  const { rows } = await ensureRowsHaveStableIdsWithSummary(sheet);
  return rows;
}

export async function getRawSheet(sheetName: string) {
  const doc = await getSpreadsheetDoc();

  let sheet = doc.sheetsByTitle[sheetName];
  if (!sheet) {
    await refreshDocInfoIfNeeded(true);
    sheet = doc.sheetsByTitle[sheetName];
  }

  if (!sheet) {
    throw new Error(`No se encontró una hoja con el nombre "${sheetName}" en el documento`);
  }

  return sheet;
}

export async function getAllRawSheets() {
  const doc = await getSpreadsheetDoc();
  return doc.sheetsByIndex;
}

export async function getGoogleSheet(sheetName: string, options?: { forceRefresh?: boolean }) {
  const forceRefresh = options?.forceRefresh === true;

  if (!forceRefresh) {
    const cachedPayload = getCachedSheetPayload(sheetName);
    if (cachedPayload) {
      return cachedPayload;
    }
  }

  const sheet = await getRawSheet(sheetName);
  await sheet.loadHeaderRow();
  const visibleColumns = sheet.headerValues.filter((column) => column !== STABLE_ROW_ID_COLUMN);

  let rows = await sheet.getRows();
  let { mappedRows, hasMissingStableIds } = mapRowsWithStableIds(rows, visibleColumns);

  if (shouldWarmupStableIds(sheet) || hasMissingStableIds) {
    rows = await ensureRowsHaveStableIds(sheet);
    const remapped = mapRowsWithStableIds(rows, visibleColumns);
    mappedRows = remapped.mappedRows;
    hasMissingStableIds = remapped.hasMissingStableIds;
  }

  if (hasMissingStableIds) {
    throw new Error('Se detectó una fila sin __id persistido después de la normalización');
  }
  
  const payload = {
    columns: visibleColumns,
    rows: mappedRows,
  };

  setCachedSheetPayload(sheetName, payload);
  return payload;
}
