import type { VercelRequest, VercelResponse } from '@vercel/node';
import { z, ZodError } from 'zod';
import { getSupabaseAdminClient } from '../src/server/kommo/shared.js';
import { verifyAdminSession } from '../src/server/auth.js';
import { KOMMO_RESOURCE_CONFIG, type KommoResourceKey } from '../src/features/kommo/config/kommoResourceConfig.js';
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

type SortOrder = 'asc' | 'desc';

const stableIdHeaderReadyBySheet = new Map<string, true>();
const nextBusinessIdBySheet = new Map<string, number>();

function getSheetCacheKey(sheet: Awaited<ReturnType<typeof getRawSheet>>) {
  return String(sheet.sheetId);
}

function getBusinessIdCacheKey(sheet: Awaited<ReturnType<typeof getRawSheet>>, businessIdColumn: string) {
  return `${getSheetCacheKey(sheet)}::${businessIdColumn}`;
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

function asSingleQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function clampInt(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === 'string' ? Number.parseInt(value, 10) : typeof value === 'number' ? value : NaN;
  const safe = Number.isFinite(parsed) ? parsed : fallback;
  return Math.min(max, Math.max(min, safe));
}

function normalizeSortOrder(value: unknown): SortOrder {
  return value === 'asc' ? 'asc' : 'desc';
}

function escapeOrValue(raw: string) {
  return raw.replaceAll(',', ' ').trim();
}

function escapeLike(raw: string) {
  return escapeOrValue(raw).replaceAll('\\', '\\\\');
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

function hasColumn(config: (typeof KOMMO_RESOURCE_CONFIG)[KommoResourceKey], column: string) {
  return uniqueStrings([config.primaryKey, ...config.listColumns, ...config.searchColumns]).includes(column);
}

type KommoRow = Record<string, unknown>;

function toBusinessId(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return Math.trunc(value);
  }

  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;

  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? Math.trunc(parsed) : null;
}

function getStringField(row: KommoRow, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' && value.trim() ? value : null;
}

async function fetchNameMapByBusinessId(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  table: string,
  ids: Set<number>,
) {
  if (ids.size === 0) return new Map<number, string>();

  const { data, error } = await supabase
    .from(table as never)
    .select('business_id,name' as never)
    .in('business_id' as never, Array.from(ids) as never);

  if (error || !Array.isArray(data)) {
    return new Map<number, string>();
  }

  const map = new Map<number, string>();

  for (const item of data as unknown[]) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const businessId = toBusinessId(row.business_id);
    const name = getStringField(row, 'name');
    if (businessId !== null && name) {
      map.set(businessId, name);
    }
  }

  return map;
}

function normalizeStatusEntries(rawStatuses: unknown): Array<{ id: number; name: string }> {
  if (!Array.isArray(rawStatuses)) return [];

  const normalized: Array<{ id: number; name: string }> = [];

  for (const status of rawStatuses) {
    if (!status || typeof status !== 'object') continue;
    const row = status as Record<string, unknown>;
    const statusId = toBusinessId(row.id ?? row.status_id);
    const statusName = getStringField(row, 'name');

    if (statusId !== null && statusName) {
      normalized.push({ id: statusId, name: statusName });
    }
  }

  return normalized;
}

async function fetchPipelineStatusMap(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  pipelineIds: Set<number>,
) {
  if (pipelineIds.size === 0) return new Map<string, string>();

  const normalizedStatusMap = await fetchPipelineStatusMapFromNormalizedTable(supabase, pipelineIds);
  const fallbackStatusMap = await fetchPipelineStatusMapFromPipelinesJson(supabase, pipelineIds);

  const map = new Map<string, string>();

  for (const [key, value] of fallbackStatusMap.entries()) {
    map.set(key, value);
  }

  // Prefer normalized resource first; overwrite fallback when present.
  for (const [key, value] of normalizedStatusMap.entries()) {
    map.set(key, value);
  }

  return map;
}

async function fetchPipelineStatusMapFromNormalizedTable(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  pipelineIds: Set<number>,
) {
  const { data, error } = await supabase
    .from('kommo_pipeline_statuses' as never)
    .select('business_id,pipeline_id,name' as never)
    .in('pipeline_id' as never, Array.from(pipelineIds) as never);

  if (error || !Array.isArray(data)) {
    return new Map<string, string>();
  }

  const map = new Map<string, string>();

  for (const item of data as unknown[]) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const pipelineId = toBusinessId(row.pipeline_id);
    const statusId = toBusinessId(row.business_id);
    const statusName = getStringField(row, 'name');

    if (pipelineId !== null && statusId !== null && statusName) {
      map.set(`${pipelineId}:${statusId}`, statusName);
    }
  }

  return map;
}

async function fetchPipelineStatusMapFromPipelinesJson(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  pipelineIds: Set<number>,
) {
  const { data, error } = await supabase
    .from('kommo_pipelines' as never)
    .select('business_id,statuses' as never)
    .in('business_id' as never, Array.from(pipelineIds) as never);

  if (error || !Array.isArray(data)) {
    return new Map<string, string>();
  }

  const map = new Map<string, string>();

  for (const item of data as unknown[]) {
    if (!item || typeof item !== 'object') continue;
    const row = item as Record<string, unknown>;
    const pipelineId = toBusinessId(row.business_id);
    if (pipelineId === null) continue;

    for (const status of normalizeStatusEntries(row.statuses)) {
      map.set(`${pipelineId}:${status.id}`, status.name);
    }
  }

  return map;
}

const genericLeadNameRegex = /^Lead\s*#\d+$/i;

function withFriendlyLeadName(row: KommoRow): KommoRow {
  if (typeof row.name === 'string' && genericLeadNameRegex.test(row.name.trim())) {
    return { ...row, name: 'Lead sin nombre' };
  }
  return row;
}

function getKommoListColumns(config: (typeof KOMMO_RESOURCE_CONFIG)[KommoResourceKey]): string[] {
  switch (config.key) {
    case 'leads':
      return [
        'name',
        'price',
        'status_name',
        'pipeline_name',
        'responsible_user_name',
        'closed_at',
        'closest_task_at',
        'is_deleted',
        'updated_at_db',
      ];
    case 'contacts':
    case 'companies':
    case 'tasks':
      return config.listColumns.map((column) =>
        column === 'responsible_user_id' ? 'responsible_user_name' : column,
      );
    case 'unsorted':
      return config.listColumns
        .map((column) => {
          if (column === 'pipeline_id') return 'pipeline_name';
          if (column === 'status_id') return 'status_name';
          if (column === 'source_id') return 'source_name';
          if (column === 'lead_id') return 'lead_name';
          if (column === 'contact_id') return 'contact_name';
          if (column === 'company_id') return 'company_name';
          if (column === 'responsible_user_id') return 'responsible_user_name';
          return column;
        })
        .filter((column, index, all) => all.indexOf(column) === index);
    case 'sources':
      return config.listColumns.map((column) => (column === 'pipeline_id' ? 'pipeline_name' : column));
    default:
      return uniqueStrings([config.primaryKey, ...config.listColumns]);
  }
}

async function enrichKommoRows(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  rows: KommoRow[],
  options?: { normalizeLeadName?: boolean },
) {
  if (rows.length === 0) return rows;

  const responsibleUserIds = new Set<number>();
  const pipelineIds = new Set<number>();
  const sourceIds = new Set<number>();
  const leadIds = new Set<number>();
  const contactIds = new Set<number>();
  const companyIds = new Set<number>();

  for (const row of rows) {
    const responsibleUserId = toBusinessId(row.responsible_user_id);
    const pipelineId = toBusinessId(row.pipeline_id);
    const sourceId = toBusinessId(row.source_id);
    const leadId = toBusinessId(row.lead_id);
    const contactId = toBusinessId(row.contact_id);
    const companyId = toBusinessId(row.company_id);

    if (responsibleUserId !== null) responsibleUserIds.add(responsibleUserId);
    if (pipelineId !== null) pipelineIds.add(pipelineId);
    if (sourceId !== null) sourceIds.add(sourceId);
    if (leadId !== null) leadIds.add(leadId);
    if (contactId !== null) contactIds.add(contactId);
    if (companyId !== null) companyIds.add(companyId);
  }

  const [userNames, pipelineNames, sourceNames, statusNames, leadNames, contactNames, companyNames] = await Promise.all([
    fetchNameMapByBusinessId(supabase, 'kommo_users', responsibleUserIds),
    fetchNameMapByBusinessId(supabase, 'kommo_pipelines', pipelineIds),
    fetchNameMapByBusinessId(supabase, 'kommo_sources', sourceIds),
    fetchPipelineStatusMap(supabase, pipelineIds),
    fetchNameMapByBusinessId(supabase, 'kommo_leads', leadIds),
    fetchNameMapByBusinessId(supabase, 'kommo_contacts', contactIds),
    fetchNameMapByBusinessId(supabase, 'kommo_companies', companyIds),
  ]);

  return rows.map((row) => {
    const enriched: KommoRow = { ...row };

    const responsibleUserId = toBusinessId(row.responsible_user_id);
    if (responsibleUserId !== null) {
      enriched.responsible_user_name = userNames.get(responsibleUserId) ?? null;
    }

    const pipelineId = toBusinessId(row.pipeline_id);
    if (pipelineId !== null) {
      enriched.pipeline_name = pipelineNames.get(pipelineId) ?? null;
    }

    const sourceId = toBusinessId(row.source_id);
    if (sourceId !== null) {
      enriched.source_name = sourceNames.get(sourceId) ?? null;
    }

    const statusId = toBusinessId(row.status_id);
    if (pipelineId !== null && statusId !== null) {
      enriched.status_name = statusNames.get(`${pipelineId}:${statusId}`) ?? null;
    }

    const leadId = toBusinessId(row.lead_id);
    if (leadId !== null) {
      enriched.lead_name = leadNames.get(leadId) ?? null;
    }

    const contactId = toBusinessId(row.contact_id);
    if (contactId !== null) {
      enriched.contact_name = contactNames.get(contactId) ?? null;
    }

    const companyId = toBusinessId(row.company_id);
    if (companyId !== null) {
      enriched.company_name = companyNames.get(companyId) ?? null;
    }

    return options?.normalizeLeadName ? withFriendlyLeadName(enriched) : enriched;
  });
}

async function handleKommoGet(req: VercelRequest, res: VercelResponse) {
  const resourceParam = asSingleQueryParam(req.query.resource);
  const resourceKey = resourceParam?.trim().toLowerCase() as KommoResourceKey | undefined;
  const config = resourceKey ? KOMMO_RESOURCE_CONFIG[resourceKey] : undefined;

  if (!resourceKey || !config) {
    return res.status(400).json({
      success: false,
      error: 'Parámetro resource inválido',
      page: 1,
      pageSize: 0,
      total: 0,
      rows: [],
      columns: [],
    });
  }

  const page = clampInt(asSingleQueryParam(req.query.page), 1, 1, 1_000_000);
  const pageSize = clampInt(asSingleQueryParam(req.query.pageSize), 50, 1, 200);
  const order = normalizeSortOrder(asSingleQueryParam(req.query.order));

  const sortParam = asSingleQueryParam(req.query.sort);
  const sortCandidate = typeof sortParam === 'string' && sortParam.trim() ? sortParam.trim() : config.defaultSort;
  const sort = config.sortColumns.includes(sortCandidate) ? sortCandidate : config.defaultSort;

  const qParam = asSingleQueryParam(req.query.q);
  const qRaw = typeof qParam === 'string' ? qParam.trim() : '';
  const q = qRaw ? escapeLike(qRaw) : '';

  const fullParam = asSingleQueryParam(req.query.full);
  const full = fullParam === 'true' || fullParam === '1';

  const idParam = asSingleQueryParam(req.query.id);
  const businessIdParam = asSingleQueryParam(req.query.business_id);
  const stableIdParam = asSingleQueryParam(req.query.stable_id);
  const primaryKeyValue =
    (config.primaryKey === 'business_id' ? (businessIdParam ?? idParam) : (stableIdParam ?? idParam)) ?? null;

  try {
    const supabase = getSupabaseAdminClient();

    if (primaryKeyValue !== null && String(primaryKeyValue).trim()) {
      const keyValue = String(primaryKeyValue).trim();
      const selectColumns = full ? '*' : uniqueStrings([config.primaryKey, ...config.listColumns]).join(',');
      const { data, error } = await supabase
        .from(config.table as never)
        .select(selectColumns as never)
        .eq(config.primaryKey as never, keyValue as never)
        .limit(1);

      if (error) {
        return res.status(500).json({ success: false, error: error.message || 'Error consultando datos' });
      }

      const row = (data as unknown[] | null)?.[0] ?? null;
      const enrichedRows = row && typeof row === 'object' ? await enrichKommoRows(supabase, [row as KommoRow]) : [];
      const enrichedRow = enrichedRows[0] ?? null;
      const columns =
        enrichedRow && typeof enrichedRow === 'object' ? Object.keys(enrichedRow as Record<string, unknown>) : [];

      return res.status(200).json({
        success: true,
        resource: config.key,
        page: 1,
        pageSize: 1,
        total: enrichedRow ? 1 : 0,
        rows: enrichedRow ? [enrichedRow] : [],
        columns,
      });
    }

    const from = (page - 1) * pageSize;
    const to = from + pageSize - 1;
    const listSelect = uniqueStrings([config.primaryKey, ...config.listColumns]).join(',');

    let query = supabase
      .from(config.table as never)
      .select(listSelect as never, { count: 'exact' })
      .order(sort as never, { ascending: order === 'asc' })
      .range(from, to);

    if (q) {
      const filters: string[] = [];
      const asNumber = Number(qRaw);
      if (Number.isFinite(asNumber) && Number.isInteger(asNumber)) {
        if (hasColumn(config, 'business_id')) filters.push(`business_id.eq.${asNumber}`);
        if (hasColumn(config, 'from_entity_id')) filters.push(`from_entity_id.eq.${asNumber}`);
        if (hasColumn(config, 'to_entity_id')) filters.push(`to_entity_id.eq.${asNumber}`);
        if (hasColumn(config, 'entity_id')) filters.push(`entity_id.eq.${asNumber}`);
        if (hasColumn(config, 'element_id')) filters.push(`element_id.eq.${asNumber}`);
      }

      for (const col of config.searchColumns) {
        filters.push(`${col}.ilike.%${q}%`);
      }

      if (filters.length) {
        query = query.or(filters.join(','));
      }
    }

    const { data, error, count } = await query;
    if (error) {
      return res.status(500).json({ success: false, error: error.message || 'Error consultando datos' });
    }

    const rows = await enrichKommoRows(
      supabase,
      ((data ?? []) as unknown[]).filter((row): row is KommoRow => !!row && typeof row === 'object'),
      { normalizeLeadName: config.key === 'leads' },
    );

    return res.status(200).json({
      success: true,
      resource: config.key,
      page,
      pageSize,
      total: count ?? 0,
      rows,
      columns: getKommoListColumns(config),
    });
  } catch (error: unknown) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
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

    const auth = verifyAdminSession(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }

    if (req.method === 'GET') {
      if (name.trim().toUpperCase() === 'KOMMO') {
        return handleKommoGet(req, res);
      }

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
