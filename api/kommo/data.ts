import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient, verifyAdminSession } from './_shared.js';

type SortOrder = 'asc' | 'desc';

type KommoResourceKey =
  | 'leads'
  | 'contacts'
  | 'companies'
  | 'users'
  | 'pipelines'
  | 'tasks'
  | 'notes'
  | 'events'
  | 'catalogs'
  | 'unsorted'
  | 'sources'
  | 'tags'
  | 'custom_fields'
  | 'links';

type ResourceConfig = {
  key: KommoResourceKey;
  label: string;
  table: string;
  /** Column used to fetch a single row (detail). */
  primaryKey: 'business_id' | 'stable_id';
  /** Columns used for list view (keeps payload small). */
  listColumns: string[];
  /** Columns allowed for sorting from UI. */
  sortColumns: string[];
  /** Columns used for iLike search (string-ish columns only). */
  searchColumns: string[];
  /** Default sort column. */
  defaultSort: string;
};

const RESOURCE_CONFIG: Record<KommoResourceKey, ResourceConfig> = {
  leads: {
    key: 'leads',
    label: 'Leads',
    table: 'kommo_leads',
    primaryKey: 'business_id',
    listColumns: [
      'business_id',
      'name',
      'price',
      'status_id',
      'pipeline_id',
      'responsible_user_id',
      'closed_at',
      'closest_task_at',
      'is_deleted',
      'updated_at_db',
    ],
    sortColumns: ['updated_at_db', 'business_id', 'closed_at', 'price'],
    searchColumns: ['name'],
    defaultSort: 'updated_at_db',
  },
  contacts: {
    key: 'contacts',
    label: 'Contacts',
    table: 'kommo_contacts',
    primaryKey: 'business_id',
    listColumns: [
      'business_id',
      'name',
      'first_name',
      'last_name',
      'responsible_user_id',
      'group_id',
      'is_deleted',
      'is_unsorted',
      'updated_at',
    ],
    sortColumns: ['updated_at', 'business_id', 'name'],
    searchColumns: ['name', 'first_name', 'last_name'],
    defaultSort: 'updated_at',
  },
  companies: {
    key: 'companies',
    label: 'Companies',
    table: 'kommo_companies',
    primaryKey: 'business_id',
    listColumns: [
      'business_id',
      'name',
      'responsible_user_id',
      'group_id',
      'is_deleted',
      'updated_at',
    ],
    sortColumns: ['updated_at', 'business_id', 'name'],
    searchColumns: ['name'],
    defaultSort: 'updated_at',
  },
  users: {
    key: 'users',
    label: 'Users',
    table: 'kommo_users',
    primaryKey: 'business_id',
    listColumns: ['business_id', 'name', 'email', 'lang', 'is_admin', 'is_active'],
    sortColumns: ['business_id', 'name', 'email'],
    searchColumns: ['name', 'email'],
    defaultSort: 'business_id',
  },
  pipelines: {
    key: 'pipelines',
    label: 'Pipelines',
    table: 'kommo_pipelines',
    primaryKey: 'business_id',
    listColumns: ['business_id', 'name', 'sort', 'is_main', 'is_unsorted_on', 'is_archive', 'updated_at'],
    sortColumns: ['updated_at', 'business_id', 'name', 'sort'],
    searchColumns: ['name'],
    defaultSort: 'updated_at',
  },
  tasks: {
    key: 'tasks',
    label: 'Tasks',
    table: 'kommo_tasks',
    primaryKey: 'business_id',
    listColumns: [
      'business_id',
      'name',
      'status',
      'task_type_id',
      'responsible_user_id',
      'is_completed',
      'complete_till',
      'updated_at',
    ],
    sortColumns: ['updated_at', 'business_id', 'complete_till'],
    searchColumns: ['name', 'text'],
    defaultSort: 'updated_at',
  },
  notes: {
    key: 'notes',
    label: 'Notes',
    table: 'kommo_notes',
    primaryKey: 'stable_id',
    listColumns: ['stable_id', 'business_id', 'note_type', 'element_type', 'element_id', 'created_by', 'updated_at'],
    sortColumns: ['updated_at', 'business_id', 'element_id'],
    searchColumns: ['note_type', 'body', 'element_type'],
    defaultSort: 'updated_at',
  },
  events: {
    key: 'events',
    label: 'Events',
    table: 'kommo_events',
    primaryKey: 'business_id',
    listColumns: ['business_id', 'type', 'entity_type', 'entity_id', 'user_id', 'user_name', 'created_at'],
    sortColumns: ['created_at', 'business_id'],
    searchColumns: ['type', 'entity_type', 'user_name'],
    defaultSort: 'created_at',
  },
  catalogs: {
    key: 'catalogs',
    label: 'Catalogs',
    table: 'kommo_catalogs',
    primaryKey: 'business_id',
    listColumns: ['business_id', 'name', 'type', 'sort', 'created_at', 'updated_at'],
    sortColumns: ['updated_at', 'business_id', 'name'],
    searchColumns: ['name', 'type'],
    defaultSort: 'updated_at',
  },
  unsorted: {
    key: 'unsorted',
    label: 'Unsorted',
    table: 'kommo_unsorted_leads',
    primaryKey: 'stable_id',
    listColumns: [
      'stable_id',
      'business_id',
      'name',
      'pipeline_id',
      'status_id',
      'source_id',
      'original_creation_date',
      'updated_at',
    ],
    sortColumns: ['updated_at', 'business_id', 'original_creation_date'],
    searchColumns: ['name'],
    defaultSort: 'updated_at',
  },
  sources: {
    key: 'sources',
    label: 'Sources',
    table: 'kommo_sources',
    primaryKey: 'business_id',
    listColumns: ['business_id', 'name', 'type', 'is_default', 'created_at', 'updated_at'],
    sortColumns: ['updated_at', 'business_id', 'name'],
    searchColumns: ['name', 'type'],
    defaultSort: 'updated_at',
  },
  tags: {
    key: 'tags',
    label: 'Tags',
    table: 'kommo_tags',
    primaryKey: 'stable_id',
    listColumns: ['stable_id', 'business_id', 'name', 'color', 'entity_type'],
    sortColumns: ['business_id', 'name'],
    searchColumns: ['name', 'entity_type'],
    defaultSort: 'business_id',
  },
  custom_fields: {
    key: 'custom_fields',
    label: 'Custom Fields',
    table: 'kommo_custom_fields',
    primaryKey: 'stable_id',
    listColumns: ['stable_id', 'business_id', 'entity_type', 'name', 'code', 'field_type', 'sort', 'updated_at'],
    sortColumns: ['updated_at', 'business_id', 'name', 'sort'],
    searchColumns: ['name', 'code', 'entity_type', 'field_type'],
    defaultSort: 'updated_at',
  },
  links: {
    key: 'links',
    label: 'Links',
    table: 'kommo_links',
    primaryKey: 'stable_id',
    listColumns: ['stable_id', 'from_entity_type', 'from_entity_id', 'to_entity_type', 'to_entity_id', 'link_type', 'created_at'],
    sortColumns: ['created_at', 'from_entity_id', 'to_entity_id'],
    searchColumns: ['from_entity_type', 'to_entity_type', 'link_type'],
    defaultSort: 'created_at',
  },
};

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
  // PostgREST 'or()' filter uses ',' as separator. Remove commas to avoid breaking parsing.
  return raw.replaceAll(',', ' ').trim();
}

function escapeLike(raw: string) {
  // We keep % as wildcard but escape backslashes.
  // Also remove commas to avoid breaking 'or()' filter string.
  return escapeOrValue(raw).replaceAll('\\', '\\\\');
}

function uniqueStrings(items: string[]) {
  return Array.from(new Set(items.filter(Boolean)));
}

export default async function kommoDataHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  const auth = verifyAdminSession(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, error: auth.error ?? 'No autorizado' });
  }

  const resourceParam = asSingleQueryParam(req.query.resource);
  const resourceKey = resourceParam as KommoResourceKey | undefined;
  const config = resourceKey ? RESOURCE_CONFIG[resourceKey] : undefined;
  if (!resourceKey || !config) {
    return res.status(400).json({
      success: false,
      error: 'Parámetro resource inválido',
      resources: Object.values(RESOURCE_CONFIG).map((r) => ({ key: r.key, label: r.label })),
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
    (config.primaryKey === 'business_id'
      ? (businessIdParam ?? idParam)
      : (stableIdParam ?? idParam)) ?? null;

  try {
    const supabase = getSupabaseAdminClient();

    // Detail: fetch a single row by primary key.
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
      const columns = row && typeof row === 'object' ? Object.keys(row as Record<string, unknown>) : [];

      return res.status(200).json({
        success: true,
        resource: config.key,
        page: 1,
        pageSize: 1,
        total: row ? 1 : 0,
        rows: row ? [row] : [],
        columns,
      });
    }

    // List view.
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

      // If q is numeric, allow exact match against business_id when present.
      const asNumber = Number(qRaw);
      if (Number.isFinite(asNumber) && Number.isInteger(asNumber)) {
        filters.push(`business_id.eq.${asNumber}`);
        filters.push(`from_entity_id.eq.${asNumber}`);
        filters.push(`to_entity_id.eq.${asNumber}`);
        filters.push(`entity_id.eq.${asNumber}`);
        filters.push(`element_id.eq.${asNumber}`);
      }

      for (const col of config.searchColumns) {
        // PostgREST expects ilike pattern without escaping % (wildcards ok)
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

    const rows = (data ?? []) as unknown[];
    return res.status(200).json({
      success: true,
      resource: config.key,
      page,
      pageSize,
      total: count ?? 0,
      rows,
      columns: uniqueStrings([config.primaryKey, ...config.listColumns]),
    });
  } catch (error: unknown) {
    return res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
