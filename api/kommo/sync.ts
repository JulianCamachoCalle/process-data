import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash } from 'node:crypto';
import {
  ensureFreshConnection,
  getActiveKommoConnection,
  getSupabaseAdminClient,
  isSecretAuthorized,
  isVercelCronAuthorized,
  normalizeKommoBaseUrl,
  verifyAdminSession,
} from './_shared.js';

const SYNC_SECRET_HEADER = 'x-kommo-sync-secret';
const SYNC_SECRET_ENV = 'KOMMO_SYNC_SECRET';
const STANDARD_CUSTOM_FIELD_ENTITY_TYPES = ['leads', 'contacts', 'companies'] as const;
const CUSTOM_FIELD_ENTITY_TYPES = [...STANDARD_CUSTOM_FIELD_ENTITY_TYPES, 'catalogs'] as const;
const LINK_ENTITY_TYPES = ['leads', 'contacts', 'companies'] as const;
type StandardCustomFieldEntityType = typeof STANDARD_CUSTOM_FIELD_ENTITY_TYPES[number];
type CustomFieldEntityType = typeof CUSTOM_FIELD_ENTITY_TYPES[number];
type LinkEntityType = typeof LINK_ENTITY_TYPES[number];

// Todos los recursos disponibles en Kommo API v4
// Algunos necesitan manejo especial (tags, custom_fields, links, notes) porque no siguen el patrón estándar de endpoints o necesitan parámetros adicionales.
const ALL_RESOURCES = [
  'leads',
  'loss_reasons',
  'contacts', 
  'companies',
  'users',
  'roles',
  'pipelines',
  'pipeline_statuses',
  'tasks',
  // pueden existir subtipos
  'events',
  'catalogs',
  'catalog_elements',
  'unsorted',
  'unsorted_summary',
  'sources',
  // Estos recursos requieren manejo especial
  'tags',
  'custom_fields',
  'custom_field_groups',
  'links',
  'notes',
] as const;

type KommoResource = typeof ALL_RESOURCES[number];

// Mapeo de recursos a sus endpoints correspondientes
const RESOURCE_ENDPOINTS: Record<KommoResource, string> = {
  leads: '/api/v4/leads',
  loss_reasons: '/api/v4/leads/loss_reasons',
  contacts: '/api/v4/contacts',
  companies: '/api/v4/companies',
  users: '/api/v4/users',
  roles: '/api/v4/roles',
  pipelines: '/api/v4/leads/pipelines',
  pipeline_statuses: '',
  tasks: '/api/v4/tasks',
  // notes, tags, custom_fields y links se manejan por separado debido a sus particularidades en la API
  events: '/api/v4/events',
  catalogs: '/api/v4/catalogs',
  catalog_elements: '',
  unsorted: '/api/v4/leads/unsorted',
  unsorted_summary: '/api/v4/leads/unsorted/summary',
  sources: '/api/v4/sources',
  // Recursos especiales sin endpoint directo
  tags: '',
  custom_fields: '',
  custom_field_groups: '',
  links: '',
  notes: '',
};

// Tipos de eventos para cada recurso
const RESOURCE_EVENT_TYPES: Record<string, string> = {
  leads: 'lead.pull',
  loss_reasons: 'loss_reason.pull',
  contacts: 'contact.pull',
  companies: 'companie.pull',
  users: 'user.pull',
  roles: 'role.pull',
  pipelines: 'pipeline.pull',
  pipeline_statuses: 'pipeline_status.pull',
  tasks: 'task.pull',
  notes: 'note.pull',
  events: 'event.pull',
  catalogs: 'catalog.pull',
  catalog_elements: 'catalog_element.pull',
  unsorted: 'unsorted.pull',
  unsorted_summary: 'unsorted.summary.pull',
  sources: 'source.pull',
  tags: 'tag.pull',
  custom_fields: 'custom_field.pull',
  custom_field_groups: 'custom_field_group.pull',
  links: 'link.pull',
};

// Algunos recursos tienen la lista de items embebida bajo una clave diferente a su nombre pluralizado, por ejemplo 'events' tiene 'items'.
const EMBEDDED_KEY_MAP: Record<string, string> = {
  events: 'items',  // Usa items en lugar de events
  catalogs: 'catalogs',
  catalog_elements: 'elements',
  leads: 'leads',
  loss_reasons: 'loss_reasons',
  contacts: 'contacts',
  companies: 'companies',
  users: 'users',
  roles: 'roles',
  pipelines: 'pipelines',
  pipeline_statuses: 'statuses',
  tasks: 'tasks',
  notes: 'notes',
  tags: 'tags',
  custom_fields: 'custom_fields',
  custom_field_groups: 'custom_field_groups',
};

// Helper para manejar query params que pueden ser string o string[]
function asSingleQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function asArrayQueryParam(value: string | string[] | undefined) {
  if (value === undefined) return [];
  const values = Array.isArray(value) ? value : [value];
  return values.map((v) => v.trim()).filter(Boolean);
}

function getNestedQueryValue(
  root: unknown,
  path: string[],
): string | string[] | undefined {
  let current: unknown = root;

  for (const key of path) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[key];
  }

  if (Array.isArray(current) && current.every((item) => typeof item === 'string')) {
    return current as string[];
  }

  return typeof current === 'string' ? current : undefined;
}

type UnsortedSummaryFilters = {
  uid?: string[];
  created_at?: string;
  created_at_from?: string;
  created_at_to?: string;
  pipeline_id?: string[];
};

function normalizeSummaryFilters(filters: UnsortedSummaryFilters): UnsortedSummaryFilters {
  const normalized: UnsortedSummaryFilters = {};

  if (filters.uid && filters.uid.length > 0) {
    normalized.uid = Array.from(new Set(filters.uid)).sort();
  }

  if (filters.created_at) {
    normalized.created_at = filters.created_at;
  }

  if (filters.created_at_from) {
    normalized.created_at_from = filters.created_at_from;
  }

  if (filters.created_at_to) {
    normalized.created_at_to = filters.created_at_to;
  }

  if (filters.pipeline_id && filters.pipeline_id.length > 0) {
    normalized.pipeline_id = Array.from(new Set(filters.pipeline_id)).sort();
  }

  return normalized;
}

// Convierte una fecha ISO a segundos Unix, que es el formato que Kommo espera para los filtros de fecha.
function toUnixSeconds(value: string) {
  return Math.floor(new Date(value).getTime() / 1000);
}

// Dado un array de items con campo updated_at, encuentra el máximo updated_at y lo devuelve como ISO string.
function getMaxUpdatedAtIso(rows: Array<Record<string, unknown>>) {
  let maxTs = 0;
  for (const row of rows) {
    const updatedAt = row.updated_at;
    const seconds = typeof updatedAt === 'number' ? updatedAt : Number(updatedAt ?? 0);
    if (Number.isFinite(seconds) && seconds > maxTs) {
      maxTs = seconds;
    }
  }

  if (!maxTs) {
    return null;
  }

  return new Date(maxTs * 1000).toISOString();
}

// Divide un array en chunks de tamaño específico. Útil para staging progresivo y evitar sobrecargar memoria o límites de API.
function chunkArray<T>(items: T[], chunkSize: number) {
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function getPipelineDedupeVersion(item: Record<string, unknown>) {
  const updatedAt = item.updated_at;
  if (updatedAt !== undefined && updatedAt !== null && String(updatedAt) !== '') {
    return String(updatedAt);
  }

  const createdAt = item.created_at;
  if (createdAt !== undefined && createdAt !== null && String(createdAt) !== '') {
    return String(createdAt);
  }

  const embedded = item._embedded as Record<string, unknown> | undefined;
  const stableSeed = JSON.stringify({
    id: item.id ?? null,
    name: item.name ?? null,
    sort: item.sort ?? null,
    is_main: item.is_main ?? null,
    is_unsorted_on: item.is_unsorted_on ?? null,
    is_archive: item.is_archive ?? null,
    account_id: item.account_id ?? null,
    statuses: embedded?.statuses ?? null,
  });

  return createHash('sha256').update(stableSeed).digest('hex');
}

function getPipelineStatusDedupeVersion(item: Record<string, unknown>) {
  const updatedAt = item.updated_at;
  if (updatedAt !== undefined && updatedAt !== null && String(updatedAt) !== '') {
    return String(updatedAt);
  }

  const createdAt = item.created_at;
  if (createdAt !== undefined && createdAt !== null && String(createdAt) !== '') {
    return String(createdAt);
  }

  const stableSeed = JSON.stringify({
    id: item.id ?? item.status_id ?? null,
    pipeline_id: item.pipeline_id ?? null,
    name: item.name ?? null,
    sort: item.sort ?? null,
    is_editable: item.is_editable ?? null,
    color: item.color ?? null,
    type: item.type ?? null,
    account_id: item.account_id ?? null,
    description: item.description ?? null,
  });

  return createHash('sha256').update(stableSeed).digest('hex');
}

function isCustomFieldEntityType(value: string): value is CustomFieldEntityType {
  return (CUSTOM_FIELD_ENTITY_TYPES as readonly string[]).includes(value);
}

function isStandardCustomFieldEntityType(value: string): value is StandardCustomFieldEntityType {
  return (STANDARD_CUSTOM_FIELD_ENTITY_TYPES as readonly string[]).includes(value);
}

function isLinkEntityType(value: string): value is LinkEntityType {
  return (LINK_ENTITY_TYPES as readonly string[]).includes(value);
}

function getCustomFieldDedupeVersion(item: Record<string, unknown>) {
  const updatedAt = item.updated_at;
  if (updatedAt !== undefined && updatedAt !== null && String(updatedAt) !== '') {
    return String(updatedAt);
  }

  const createdAt = item.created_at;
  if (createdAt !== undefined && createdAt !== null && String(createdAt) !== '') {
    return String(createdAt);
  }

  const stableSeed = JSON.stringify(item);
  return createHash('sha256').update(stableSeed).digest('hex');
}

function getCustomFieldGroupDedupeVersion(item: Record<string, unknown>) {
  const stableSeed = JSON.stringify(item);
  return createHash('sha256').update(stableSeed).digest('hex');
}

function getUserDedupeVersion(item: Record<string, unknown>) {
  const updatedAt = item.updated_at;
  if (updatedAt !== undefined && updatedAt !== null && String(updatedAt) !== '') {
    return String(updatedAt);
  }

  const createdAt = item.created_at;
  if (createdAt !== undefined && createdAt !== null && String(createdAt) !== '') {
    return String(createdAt);
  }

  const stableSeed = JSON.stringify(item);
  return createHash('sha256').update(stableSeed).digest('hex');
}

function getRoleDedupeVersion(item: Record<string, unknown>) {
  const updatedAt = item.updated_at;
  if (updatedAt !== undefined && updatedAt !== null && String(updatedAt) !== '') {
    return String(updatedAt);
  }

  const createdAt = item.created_at;
  if (createdAt !== undefined && createdAt !== null && String(createdAt) !== '') {
    return String(createdAt);
  }

  const stableSeed = JSON.stringify(item);
  return createHash('sha256').update(stableSeed).digest('hex');
}

function getTaskDedupeVersion(item: Record<string, unknown>) {
  const updatedAt = item.updated_at;
  if (updatedAt !== undefined && updatedAt !== null && String(updatedAt) !== '') {
    return String(updatedAt);
  }

  const createdAt = item.created_at;
  if (createdAt !== undefined && createdAt !== null && String(createdAt) !== '') {
    return String(createdAt);
  }

  const stableSeed = JSON.stringify(item);
  return createHash('sha256').update(stableSeed).digest('hex');
}

// Dado un array de eventos a insertar, los inserta en la tabla kommo_webhook_events y evita los errores por duplicados. Si hay un error, divide el batch y reintenta para aislar filas problemáticas.
type WebhookEventInsert = {
  account_base_url: string;
  event_type: string;
  payload: Record<string, unknown>;
  dedupe_key: string;
  status: 'pending';
};

type QueueStats = {
  pending: number;
  processing: number;
  failed: number;
};

async function getQueueStatsForAccountBaseUrl(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  accountBaseUrl: string,
): Promise<QueueStats> {
  const [pendingCount, processingCount, failedCount] = await Promise.all([
    supabase
      .from('kommo_webhook_events' as never)
      .select('id', { count: 'exact', head: true })
      .eq('account_base_url', accountBaseUrl)
      .eq('status', 'pending'),
    supabase
      .from('kommo_webhook_events' as never)
      .select('id', { count: 'exact', head: true })
      .eq('account_base_url', accountBaseUrl)
      .eq('status', 'processing'),
    supabase
      .from('kommo_webhook_events' as never)
      .select('id', { count: 'exact', head: true })
      .eq('account_base_url', accountBaseUrl)
      .eq('status', 'failed'),
  ]);

  const error = pendingCount.error ?? processingCount.error ?? failedCount.error;
  if (error) {
    throw new Error(error.message || 'No se pudieron obtener métricas de cola Kommo');
  }

  return {
    pending: pendingCount.count ?? 0,
    processing: processingCount.count ?? 0,
    failed: failedCount.count ?? 0,
  };
}

// Retorna el número de filas que fueron efectivamente insertadas (no duplicados).
async function stageWebhookEvents(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  rows: WebhookEventInsert[],
  opts?: { chunkSize?: number },
) {
  const chunkSize = Math.max(1, Math.min(1000, opts?.chunkSize ?? 500));
  let staged = 0;

  async function stageChunk(chunk: WebhookEventInsert[]) {
    if (chunk.length === 0) return;

    const { data, error } = await supabase
      .from('kommo_webhook_events' as never)
      .upsert(chunk as never, {
        onConflict: 'dedupe_key',
        ignoreDuplicates: true,
      })
      // Retornamos solo el id para minimizar payload y acelerar la consulta.
      .select('id');

    if (!error) {
      staged += (data as unknown[] | null)?.length ?? 0;
      return;
    }

    // Si hay un error, intentamos dividir el chunk para aislar la fila problemática.
    if (chunk.length === 1) {
      console.error('Failed staging kommo_webhook_events row:', error.message);
      return;
    }

    const mid = Math.ceil(chunk.length / 2);
    await stageChunk(chunk.slice(0, mid));
    await stageChunk(chunk.slice(mid));
  }

  for (const chunk of chunkArray(rows, chunkSize)) {
    await stageChunk(chunk);
  }

  return staged;
}

// Función para paginar a través de todos los items de un recurso específico
async function fetchAllPages(
  baseUrl: string,
  endpoint: string,
  accessToken: string,
  resource: KommoResource,
  fromDateIso: string | null,
  withValue?: string,
  maxPages: number = 5, // Limit pages per run to avoid timeout
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number; hasMore: boolean }> {
  const allItems: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;
  const embeddedKey = EMBEDDED_KEY_MAP[resource] ?? resource;

  while (hasMore && page <= maxPages) {
    const url = new URL(`${baseUrl}${endpoint}`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', String(page));
    
    const supportsUpdatedAtFilter = resource !== 'unsorted';
    if (fromDateIso && supportsUpdatedAtFilter) {
      url.searchParams.set('filter[updated_at][from]', String(toUnixSeconds(fromDateIso)));
    }

    if (withValue && (resource === 'leads' || resource === 'contacts' || resource === 'companies' || resource === 'users' || resource === 'roles')) {
      url.searchParams.set('with', withValue);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Kommo ${resource} page ${page} error (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const items = ((payload._embedded as Record<string, unknown> | undefined)?.[embeddedKey] as Array<Record<string, unknown>>) ?? [];

    allItems.push(...items);
    
    // Verificar si hay una página siguiente. Kommo API v4 usa enlaces HATEOAS para paginación, así que buscamos un enlace "next" en _links.
    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length, hasMore };
}

// Funciones específicas para recursos que requieren iteración por entity_type (tags, custom_fields, notes) o por entidad (links).
async function fetchEntityTypeTags(
  baseUrl: string,
  accessToken: string,
  entityType: string,
  maxPages: number,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number }> {
  const allItems: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const url = new URL(`${baseUrl}/api/v4/${entityType}/tags`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Kommo tags (${entityType}) page ${page} error (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const items = (payload._embedded as Record<string, unknown> | undefined)?.tags as Array<Record<string, unknown>> ?? [];
    allItems.push(...items);

    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length };
}

// Recurso de custom_fields también requiere iteración por entity_type
async function fetchEntityTypeCustomFields(
  baseUrl: string,
  accessToken: string,
  entityType: string,
  maxPages: number,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number }> {
  const allItems: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const url = new URL(`${baseUrl}/api/v4/${entityType}/custom_fields`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Kommo custom_fields (${entityType}) page ${page} error (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const items = (payload._embedded as Record<string, unknown> | undefined)?.custom_fields as Array<Record<string, unknown>> ?? [];
    allItems.push(...items);

    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length };
}

async function fetchEntityTypeCustomFieldGroups(
  baseUrl: string,
  accessToken: string,
  entityType: StandardCustomFieldEntityType,
  maxPages: number,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number }> {
  const allItems: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const url = new URL(`${baseUrl}/api/v4/${entityType}/custom_fields/groups`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Kommo custom_field_groups (${entityType}) page ${page} error (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const items = (payload._embedded as Record<string, unknown> | undefined)?.custom_field_groups as Array<Record<string, unknown>> ?? [];
    allItems.push(...items);

    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length };
}

async function fetchCatalogCustomFields(
  baseUrl: string,
  accessToken: string,
  listId: number,
  maxPages: number,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number }> {
  const allItems: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const url = new URL(`${baseUrl}/api/v4/catalogs/${encodeURIComponent(String(listId))}/custom_fields`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Kommo custom_fields (catalogs/${listId}) page ${page} error (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const items = (payload._embedded as Record<string, unknown> | undefined)?.custom_fields as Array<Record<string, unknown>> ?? [];
    allItems.push(...items);

    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length };
}

// Recurso de notes también requiere iteración por entity_type
async function fetchEntityNotes(
  baseUrl: string,
  accessToken: string,
  entityType: string,
  maxPages: number,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number }> {
  const allItems: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const url = new URL(`${baseUrl}/api/v4/${entityType}/notes`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Kommo notes (${entityType}) page ${page} error (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const items = (payload._embedded as Record<string, unknown> | undefined)?.notes as Array<Record<string, unknown>> ?? [];
    allItems.push(...items);

    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length };
}

// Recurso de links requiere iteración por entidad, es decir, primero obtenemos las entidades actualizadas (leads, contacts, companies). Luego para cada entidad obtenemos sus links.
async function fetchEntityLinks(
  baseUrl: string,
  accessToken: string,
  entity: string,
  entityId: number,
  maxPages: number,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number }> {
  const allItems: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const url = new URL(`${baseUrl}/api/v4/${entity}/${entityId}/links`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Kommo links (${entity}/${entityId}) page ${page} error (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const items = (payload._embedded as Record<string, unknown> | undefined)?.links as Array<Record<string, unknown>> ?? [];
    allItems.push(...items);

    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length };
}

async function fetchPipelineStatusesPages(
  baseUrl: string,
  accessToken: string,
  pipelineId: number,
  withValue: string | undefined,
  maxPages: number,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number; hasMore: boolean }> {
  const allItems: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const endpoint = `/api/v4/leads/pipelines/${encodeURIComponent(String(pipelineId))}/statuses`;
    const url = new URL(`${baseUrl}${endpoint}`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', String(page));

    if (withValue) {
      url.searchParams.set('with', withValue);
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Kommo pipeline_statuses (${pipelineId}) page ${page} error (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const items = (payload._embedded as Record<string, unknown> | undefined)?.statuses as Array<Record<string, unknown>> ?? [];
    allItems.push(...items);

    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length, hasMore };
}

async function fetchCatalogElementsPages(
  baseUrl: string,
  accessToken: string,
  catalogId: number,
  maxPages: number,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number; hasMore: boolean }> {
  const allItems: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const endpoint = `/api/v4/catalogs/${encodeURIComponent(String(catalogId))}/elements`;
    const url = new URL(`${baseUrl}${endpoint}`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Kommo catalog_elements (${catalogId}) page ${page} error (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const items = (payload._embedded as Record<string, unknown> | undefined)?.elements as Array<Record<string, unknown>> ?? [];
    allItems.push(...items);

    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length, hasMore };
}

// Handler principal para sincronización. Soporta sincronización incremental basada en un cursor de updated_at almacenado en la base de datos.
export default async function kommoSyncHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const secretAuthorized = isSecretAuthorized(req, SYNC_SECRET_ENV, SYNC_SECRET_HEADER);
    const cronAuthorized = isVercelCronAuthorized(req);
    if (!secretAuthorized && !cronAuthorized) {
      const auth = verifyAdminSession(req);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error ?? 'No autorizado' });
      }
    }

    const baseUrlRaw = asSingleQueryParam(req.query.base_url) ?? asSingleQueryParam(req.query.baseUrl);
    const baseUrl = baseUrlRaw ? normalizeKommoBaseUrl(baseUrlRaw) : null;
    const subdomain = baseUrl ? new URL(baseUrl).hostname.split('.')[0] : undefined;

    const connection = await getActiveKommoConnection(subdomain);
    if (!connection) {
      return res.status(404).json({ error: 'No hay conexión Kommo activa. Ejecutá OAuth primero.' });
    }

    const freshConnection = await ensureFreshConnection(connection);
    const supabase = getSupabaseAdminClient();

    // Si se especifica un recurso en query params, solo sincronizamos ese recurso. Si no, sincronizamos todos los recursos.
    const resourceParam = asSingleQueryParam(req.query.resource);
    const selectedResource = (resourceParam && ALL_RESOURCES.includes(resourceParam as KommoResource)) 
      ? resourceParam as KommoResource 
      : 'leads';
    const resourcesToSync: KommoResource[] = [selectedResource];
    const includeQueueStatsParam = asSingleQueryParam(req.query.include_queue_stats);
    const includeQueueStats = includeQueueStatsParam === 'true' || includeQueueStatsParam === '1';
    const requestedWith = asSingleQueryParam(req.query.with)?.trim();
    const leadsWith = requestedWith || 'contacts,loss_reason,is_price_modified_by_robot,catalog_elements,source_id,source';
    const contactsWith = requestedWith || 'leads,catalog_elements';
    const companiesWith = requestedWith || 'leads,contacts,catalog_elements';
    const usersWith = requestedWith || 'role,group,uuid,amojo_id,user_rank,phone_number';
    const rolesWith = requestedWith || 'users';

    // Manejo especial para lead puntual por ID.
    // Si viene id con resource=leads, usamos GET /api/v4/leads/{id} y stageamos un único evento lead.pull.
    if (selectedResource === 'leads') {
      const leadIdParam = asSingleQueryParam(req.query.id);

      if (leadIdParam !== undefined) {
        const leadIdRaw = leadIdParam.trim();
        const leadId = Number(leadIdRaw);

        if (!leadIdRaw || !Number.isInteger(leadId) || leadId <= 0) {
          return res.status(400).json({ error: 'El parámetro id debe ser un número entero positivo para resource=leads.' });
        }

        const endpoint = `/api/v4/leads/${encodeURIComponent(String(leadId))}`;
        const url = new URL(`${freshConnection.account_base_url}${endpoint}`);
        if (leadsWith) {
          url.searchParams.set('with', leadsWith);
        }

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshConnection.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const raw = await response.text();
          throw new Error(`Kommo lead id ${leadId} error (${response.status}): ${raw}`);
        }

        const lead = (await response.json()) as Record<string, unknown>;
        const dedupeVersion = String(lead.updated_at ?? lead.created_at ?? '');
        const dedupeKey = `lead:${leadId}:${dedupeVersion}`;

        const staged = await stageWebhookEvents(supabase, [
          {
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.leads,
            payload: lead,
            dedupe_key: dedupeKey,
            status: 'pending',
          },
        ]);

        const resources = [
          {
            resource: 'leads',
            pulled: 1,
            staged,
            cursorFrom: null,
            cursorTo: null,
            hasMore: false,
          },
        ];

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources,
          totalPulled: 1,
          totalStaged: staged,
        });
      }
    }

    // Manejo especial para user puntual por ID.
    // Si viene id con resource=users, usamos GET /api/v4/users/{id}
    // y stageamos un único evento user.pull.
    if (selectedResource === 'users') {
      const userIdParam = asSingleQueryParam(req.query.id);

      if (userIdParam !== undefined) {
        const userIdRaw = userIdParam.trim();
        const userId = Number(userIdRaw);

        if (!userIdRaw || !Number.isInteger(userId) || userId <= 0) {
          return res.status(400).json({
            error: 'El parámetro id debe ser un número entero positivo para resource=users.',
          });
        }

        const endpoint = `/api/v4/users/${encodeURIComponent(String(userId))}`;
        const url = new URL(`${freshConnection.account_base_url}${endpoint}`);
        if (usersWith) {
          url.searchParams.set('with', usersWith);
        }

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshConnection.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.status === 404) {
          const raw = await response.text();
          return res.status(404).json({
            error: `Kommo users id ${userId} no encontrado (404).`,
            resource: 'users',
            id: userId,
            details: raw,
          });
        }

        if (!response.ok) {
          const raw = await response.text();
          throw new Error(`Kommo user id ${userId} error (${response.status}): ${raw}`);
        }

        const user = (await response.json()) as Record<string, unknown>;
        const dedupeVersion = getUserDedupeVersion(user);
        const dedupeKey = `user:${userId}:${dedupeVersion}`;

        const staged = await stageWebhookEvents(supabase, [
          {
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.users,
            payload: user,
            dedupe_key: dedupeKey,
            status: 'pending',
          },
        ]);

        const resources = [
          {
            resource: 'users',
            pulled: 1,
            staged,
            cursorFrom: null,
            cursorTo: null,
            hasMore: false,
          },
        ];

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources,
          totalPulled: 1,
          totalStaged: staged,
        });
      }
    }

    // Manejo especial para role puntual por ID.
    // Si viene id con resource=roles, usamos GET /api/v4/roles/{id}
    // y stageamos un único evento role.pull.
    if (selectedResource === 'roles') {
      const roleIdParam = asSingleQueryParam(req.query.id);

      if (roleIdParam !== undefined) {
        const roleIdRaw = roleIdParam.trim();
        const roleId = Number(roleIdRaw);

        if (!roleIdRaw || !Number.isInteger(roleId) || roleId <= 0) {
          return res.status(400).json({
            error: 'El parámetro id debe ser un número entero positivo para resource=roles.',
          });
        }

        const endpoint = `/api/v4/roles/${encodeURIComponent(String(roleId))}`;
        const url = new URL(`${freshConnection.account_base_url}${endpoint}`);
        if (rolesWith) {
          url.searchParams.set('with', rolesWith);
        }

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshConnection.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.status === 404) {
          const raw = await response.text();
          return res.status(404).json({
            error: `Kommo roles id ${roleId} no encontrado (404).`,
            resource: 'roles',
            id: roleId,
            details: raw,
          });
        }

        if (!response.ok) {
          const raw = await response.text();
          throw new Error(`Kommo role id ${roleId} error (${response.status}): ${raw}`);
        }

        const role = (await response.json()) as Record<string, unknown>;
        const dedupeVersion = getRoleDedupeVersion(role);
        const dedupeKey = `role:${roleId}:${dedupeVersion}`;

        const staged = await stageWebhookEvents(supabase, [
          {
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.roles,
            payload: role,
            dedupe_key: dedupeKey,
            status: 'pending',
          },
        ]);

        const resources = [
          {
            resource: 'roles',
            pulled: 1,
            staged,
            cursorFrom: null,
            cursorTo: null,
            hasMore: false,
          },
        ];

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources,
          totalPulled: 1,
          totalStaged: staged,
        });
      }
    }

    // Manejo especial para task puntual por ID.
    // Si viene id con resource=tasks, usamos GET /api/v4/tasks/{id}
    // y stageamos un único evento task.pull.
    if (selectedResource === 'tasks') {
      const taskIdParam = asSingleQueryParam(req.query.id);

      if (taskIdParam !== undefined) {
        const taskIdRaw = taskIdParam.trim();
        const taskId = Number(taskIdRaw);

        if (!taskIdRaw || !Number.isInteger(taskId) || taskId <= 0) {
          return res.status(400).json({
            error: 'El parámetro id debe ser un número entero positivo para resource=tasks.',
          });
        }

        const endpoint = `/api/v4/tasks/${encodeURIComponent(String(taskId))}`;
        const response = await fetch(`${freshConnection.account_base_url}${endpoint}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshConnection.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.status === 404) {
          const raw = await response.text();
          return res.status(404).json({
            error: `Kommo tasks id ${taskId} no encontrado (404).`,
            resource: 'tasks',
            id: taskId,
            details: raw,
          });
        }

        if (!response.ok) {
          const raw = await response.text();
          throw new Error(`Kommo task id ${taskId} error (${response.status}): ${raw}`);
        }

        const task = (await response.json()) as Record<string, unknown>;
        const dedupeVersion = getTaskDedupeVersion(task);
        const dedupeKey = `task:${taskId}:${dedupeVersion}`;

        const staged = await stageWebhookEvents(supabase, [
          {
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.tasks,
            payload: task,
            dedupe_key: dedupeKey,
            status: 'pending',
          },
        ]);

        const resources = [
          {
            resource: 'tasks',
            pulled: 1,
            staged,
            cursorFrom: null,
            cursorTo: null,
            hasMore: false,
          },
        ];

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources,
          totalPulled: 1,
          totalStaged: staged,
        });
      }
    }

    // Manejo especial para catalog puntual por ID.
    // Si viene id con resource=catalogs, usamos GET /api/v4/catalogs/{id}
    // y stageamos un único evento catalog.pull.
    if (selectedResource === 'catalogs') {
      const catalogIdParam = asSingleQueryParam(req.query.id);

      if (catalogIdParam !== undefined) {
        const catalogIdRaw = catalogIdParam.trim();
        const catalogId = Number(catalogIdRaw);

        if (!catalogIdRaw || !Number.isInteger(catalogId) || catalogId <= 0) {
          return res.status(400).json({
            error: 'El parámetro id debe ser un número entero positivo para resource=catalogs.',
          });
        }

        const endpoint = `/api/v4/catalogs/${encodeURIComponent(String(catalogId))}`;
        const response = await fetch(`${freshConnection.account_base_url}${endpoint}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshConnection.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.status === 404) {
          const raw = await response.text();
          return res.status(404).json({
            error: `Kommo catalogs id ${catalogId} no encontrado (404).`,
            resource: 'catalogs',
            id: catalogId,
            details: raw,
          });
        }

        if (!response.ok) {
          const raw = await response.text();
          throw new Error(`Kommo catalog id ${catalogId} error (${response.status}): ${raw}`);
        }

        const catalog = (await response.json()) as Record<string, unknown>;
        const dedupeVersion = String(catalog.updated_at ?? catalog.created_at ?? '');
        const dedupeKey = `catalog:${catalogId}:${dedupeVersion}`;

        const staged = await stageWebhookEvents(supabase, [
          {
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.catalogs,
            payload: catalog,
            dedupe_key: dedupeKey,
            status: 'pending',
          },
        ]);

        const resources = [
          {
            resource: 'catalogs',
            pulled: 1,
            staged,
            cursorFrom: null,
            cursorTo: null,
            hasMore: false,
          },
        ];

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources,
          totalPulled: 1,
          totalStaged: staged,
        });
      }
    }

    // Manejo especial para contact puntual por ID.
    // Si viene id con resource=contacts, usamos GET /api/v4/contacts/{id}
    // y stageamos un único evento contact.pull.
    if (selectedResource === 'contacts') {
      const contactIdParam = asSingleQueryParam(req.query.id);

      if (contactIdParam !== undefined) {
        const contactIdRaw = contactIdParam.trim();
        const contactId = Number(contactIdRaw);

        if (!contactIdRaw || !Number.isInteger(contactId) || contactId <= 0) {
          return res.status(400).json({
            error: 'El parámetro id debe ser un número entero positivo para resource=contacts.',
          });
        }

        const endpoint = `/api/v4/contacts/${encodeURIComponent(String(contactId))}`;
        const url = new URL(`${freshConnection.account_base_url}${endpoint}`);
        if (contactsWith) {
          url.searchParams.set('with', contactsWith);
        }

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshConnection.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.status === 404) {
          const raw = await response.text();
          return res.status(404).json({
            error: `Kommo contacts id ${contactId} no encontrado (404).`,
            resource: 'contacts',
            id: contactId,
            details: raw,
          });
        }

        if (!response.ok) {
          const raw = await response.text();
          throw new Error(`Kommo contact id ${contactId} error (${response.status}): ${raw}`);
        }

        const contact = (await response.json()) as Record<string, unknown>;
        const dedupeVersion = String(contact.updated_at ?? contact.created_at ?? '');
        const dedupeKey = `contact:${contactId}:${dedupeVersion}`;

        const staged = await stageWebhookEvents(supabase, [
          {
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.contacts,
            payload: contact,
            dedupe_key: dedupeKey,
            status: 'pending',
          },
        ]);

        const resources = [
          {
            resource: 'contacts',
            pulled: 1,
            staged,
            cursorFrom: null,
            cursorTo: null,
            hasMore: false,
          },
        ];

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources,
          totalPulled: 1,
          totalStaged: staged,
        });
      }
    }

    // Manejo especial para company puntual por ID.
    // Si viene id con resource=companies, usamos GET /api/v4/companies/{id}
    // y stageamos un único evento companie.pull.
    if (selectedResource === 'companies') {
      const companyIdParam = asSingleQueryParam(req.query.id);

      if (companyIdParam !== undefined) {
        const companyIdRaw = companyIdParam.trim();
        const companyId = Number(companyIdRaw);

        if (!companyIdRaw || !Number.isInteger(companyId) || companyId <= 0) {
          return res.status(400).json({
            error: 'El parámetro id debe ser un número entero positivo para resource=companies.',
          });
        }

        const endpoint = `/api/v4/companies/${encodeURIComponent(String(companyId))}`;
        const url = new URL(`${freshConnection.account_base_url}${endpoint}`);
        if (companiesWith) {
          url.searchParams.set('with', companiesWith);
        }

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshConnection.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.status === 404) {
          const raw = await response.text();
          return res.status(404).json({
            error: `Kommo companies id ${companyId} no encontrado (404).`,
            resource: 'companies',
            id: companyId,
            details: raw,
          });
        }

        if (!response.ok) {
          const raw = await response.text();
          throw new Error(`Kommo company id ${companyId} error (${response.status}): ${raw}`);
        }

        const company = (await response.json()) as Record<string, unknown>;
        const dedupeVersion = String(company.updated_at ?? company.created_at ?? '');
        const dedupeKey = `company:${companyId}:${dedupeVersion}`;

        const staged = await stageWebhookEvents(supabase, [
          {
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.companies,
            payload: company,
            dedupe_key: dedupeKey,
            status: 'pending',
          },
        ]);

        const resources = [
          {
            resource: 'companies',
            pulled: 1,
            staged,
            cursorFrom: null,
            cursorTo: null,
            hasMore: false,
          },
        ];

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources,
          totalPulled: 1,
          totalStaged: staged,
        });
      }
    }

    // Manejo especial para loss_reason puntual por ID.
    // Si viene id con resource=loss_reasons, usamos GET /api/v4/leads/loss_reasons/{id}
    // y stageamos un único evento loss_reason.pull.
    if (selectedResource === 'loss_reasons') {
      const lossReasonIdParam = asSingleQueryParam(req.query.id);

      if (lossReasonIdParam !== undefined) {
        const lossReasonIdRaw = lossReasonIdParam.trim();
        const lossReasonId = Number(lossReasonIdRaw);

        if (!lossReasonIdRaw || !Number.isInteger(lossReasonId) || lossReasonId <= 0) {
          return res.status(400).json({
            error: 'El parámetro id debe ser un número entero positivo para resource=loss_reasons.',
          });
        }

        const endpoint = `/api/v4/leads/loss_reasons/${encodeURIComponent(String(lossReasonId))}`;
        const response = await fetch(`${freshConnection.account_base_url}${endpoint}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshConnection.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.status === 404) {
          const raw = await response.text();
          return res.status(404).json({
            error: `Kommo loss_reasons id ${lossReasonId} no encontrado (404).`,
            resource: 'loss_reasons',
            id: lossReasonId,
            details: raw,
          });
        }

        if (!response.ok) {
          const raw = await response.text();
          throw new Error(`Kommo loss_reason id ${lossReasonId} error (${response.status}): ${raw}`);
        }

        const lossReason = (await response.json()) as Record<string, unknown>;
        const dedupeVersion = String(lossReason.updated_at ?? lossReason.created_at ?? '');
        const dedupeKey = `loss_reason:${lossReasonId}:${dedupeVersion}`;

        const staged = await stageWebhookEvents(supabase, [
          {
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.loss_reasons,
            payload: lossReason,
            dedupe_key: dedupeKey,
            status: 'pending',
          },
        ]);

        const resources = [
          {
            resource: 'loss_reasons',
            pulled: 1,
            staged,
            cursorFrom: null,
            cursorTo: null,
            hasMore: false,
          },
        ];

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources,
          totalPulled: 1,
          totalStaged: staged,
        });
      }
    }

    // Manejo especial para pipeline puntual por ID.
    // Si viene id con resource=pipelines, usamos GET /api/v4/leads/pipelines/{id}
    // y stageamos un único evento pipeline.pull.
    if (selectedResource === 'pipelines') {
      const pipelineIdParam = asSingleQueryParam(req.query.id);

      if (pipelineIdParam !== undefined) {
        const pipelineIdRaw = pipelineIdParam.trim();
        const pipelineId = Number(pipelineIdRaw);

        if (!pipelineIdRaw || !Number.isInteger(pipelineId) || pipelineId <= 0) {
          return res.status(400).json({
            error: 'El parámetro id debe ser un número entero positivo para resource=pipelines.',
          });
        }

        const endpoint = `/api/v4/leads/pipelines/${encodeURIComponent(String(pipelineId))}`;
        const response = await fetch(`${freshConnection.account_base_url}${endpoint}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshConnection.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const raw = await response.text();
          throw new Error(`Kommo pipeline id ${pipelineId} error (${response.status}): ${raw}`);
        }

        const pipeline = (await response.json()) as Record<string, unknown>;
        const dedupeVersion = getPipelineDedupeVersion(pipeline);
        const dedupeKey = `pipeline:${pipelineId}:${dedupeVersion}`;

        const staged = await stageWebhookEvents(supabase, [
          {
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.pipelines,
            payload: pipeline,
            dedupe_key: dedupeKey,
            status: 'pending',
          },
        ]);

        const resources = [
          {
            resource: 'pipelines',
            pulled: 1,
            staged,
            cursorFrom: null,
            cursorTo: null,
            hasMore: false,
          },
        ];

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources,
          totalPulled: 1,
          totalStaged: staged,
        });
      }
    }

    if (selectedResource === 'custom_fields') {
      const entityTypeParam = asSingleQueryParam(req.query.entity_type);
      const listIdParam = asSingleQueryParam(req.query.list_id);
      const customFieldIdParam = asSingleQueryParam(req.query.custom_field_id) ?? asSingleQueryParam(req.query.id);

      if (listIdParam !== undefined && customFieldIdParam !== undefined) {
        const listIdRaw = listIdParam.trim();
        const customFieldIdRaw = customFieldIdParam.trim();
        const listId = Number(listIdRaw);
        const customFieldId = Number(customFieldIdRaw);

        if (!listIdRaw || !Number.isInteger(listId) || listId <= 0) {
          return res.status(400).json({
            error: 'El parámetro list_id debe ser un número entero positivo para resource=custom_fields.',
          });
        }

        if (!customFieldIdRaw || !Number.isInteger(customFieldId) || customFieldId <= 0) {
          return res.status(400).json({
            error: 'El parámetro custom_field_id (o id) debe ser un número entero positivo para resource=custom_fields.',
          });
        }

        const endpoint = `/api/v4/catalogs/${encodeURIComponent(String(listId))}/custom_fields/${encodeURIComponent(String(customFieldId))}`;
        const response = await fetch(`${freshConnection.account_base_url}${endpoint}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshConnection.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.status === 404) {
          const raw = await response.text();
          return res.status(404).json({
            error: `Kommo custom_fields catalogs list_id ${listId} custom_field_id ${customFieldId} no encontrado (404).`,
            resource: 'custom_fields',
            list_id: listId,
            custom_field_id: customFieldId,
            details: raw,
          });
        }

        if (!response.ok) {
          const raw = await response.text();
          throw new Error(`Kommo custom_field catalogs list_id ${listId} id ${customFieldId} error (${response.status}): ${raw}`);
        }

        const customField = (await response.json()) as Record<string, unknown>;
        const customFieldWithContext: Record<string, unknown> = {
          ...customField,
          entity_type: 'catalogs',
          catalog_id: listId,
          id: Number(customField.id ?? customFieldId) || customFieldId,
        };

        const dedupeVersion = getCustomFieldDedupeVersion(customFieldWithContext);
        const dedupeKey = `custom_field:catalogs:${listId}:${customFieldWithContext.id}:${dedupeVersion}`;

        const staged = await stageWebhookEvents(supabase, [
          {
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.custom_fields,
            payload: customFieldWithContext,
            dedupe_key: dedupeKey,
            status: 'pending',
          },
        ]);

        const resources = [
          {
            resource: 'custom_fields',
            pulled: 1,
            staged,
            cursorFrom: null,
            cursorTo: null,
            hasMore: false,
          },
        ];

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources,
          totalPulled: 1,
          totalStaged: staged,
        });
      }

      if (entityTypeParam !== undefined && customFieldIdParam !== undefined) {
        const entityTypeRaw = entityTypeParam.trim().toLowerCase();
        const customFieldIdRaw = customFieldIdParam.trim();
        const customFieldId = Number(customFieldIdRaw);

        if (!isStandardCustomFieldEntityType(entityTypeRaw)) {
          return res.status(400).json({
            error: 'El parámetro entity_type debe ser leads, contacts o companies para resource=custom_fields.',
          });
        }

        if (!customFieldIdRaw || !Number.isInteger(customFieldId) || customFieldId <= 0) {
          return res.status(400).json({
            error: 'El parámetro id debe ser un número entero positivo para resource=custom_fields.',
          });
        }

        const endpoint = `/api/v4/${entityTypeRaw}/custom_fields/${encodeURIComponent(String(customFieldId))}`;
        const response = await fetch(`${freshConnection.account_base_url}${endpoint}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshConnection.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.status === 404) {
          const raw = await response.text();
          return res.status(404).json({
            error: `Kommo custom_fields entity_type ${entityTypeRaw} id ${customFieldId} no encontrado (404).`,
            resource: 'custom_fields',
            entity_type: entityTypeRaw,
            id: customFieldId,
            details: raw,
          });
        }

        if (!response.ok) {
          const raw = await response.text();
          throw new Error(`Kommo custom_field entity_type ${entityTypeRaw} id ${customFieldId} error (${response.status}): ${raw}`);
        }

        const customField = (await response.json()) as Record<string, unknown>;
        const customFieldWithEntityType: Record<string, unknown> = {
          ...customField,
          entity_type: entityTypeRaw,
        };

        const dedupeVersion = getCustomFieldDedupeVersion(customFieldWithEntityType);
        const dedupeKey = `custom_field:${entityTypeRaw}:${customFieldId}:${dedupeVersion}`;

        const staged = await stageWebhookEvents(supabase, [
          {
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.custom_fields,
            payload: customFieldWithEntityType,
            dedupe_key: dedupeKey,
            status: 'pending',
          },
        ]);

        const resources = [
          {
            resource: 'custom_fields',
            pulled: 1,
            staged,
            cursorFrom: null,
            cursorTo: null,
            hasMore: false,
          },
        ];

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources,
          totalPulled: 1,
          totalStaged: staged,
        });
      }
    }

    if (selectedResource === 'custom_field_groups') {
      const entityTypeParam = asSingleQueryParam(req.query.entity_type);
      const groupIdParam = asSingleQueryParam(req.query.id);

      if (groupIdParam !== undefined && entityTypeParam === undefined) {
        return res.status(400).json({
          error: 'El parámetro entity_type es obligatorio cuando se envía id para resource=custom_field_groups.',
        });
      }

      if (entityTypeParam !== undefined && groupIdParam !== undefined) {
        const entityTypeRaw = entityTypeParam.trim().toLowerCase();
        const groupIdRaw = groupIdParam.trim();
        const groupId = Number(groupIdRaw);

        if (!isStandardCustomFieldEntityType(entityTypeRaw)) {
          return res.status(400).json({
            error: 'El parámetro entity_type debe ser leads, contacts o companies para resource=custom_field_groups.',
          });
        }

        if (!groupIdRaw || !Number.isInteger(groupId) || groupId <= 0) {
          return res.status(400).json({
            error: 'El parámetro id debe ser un número entero positivo para resource=custom_field_groups.',
          });
        }

        const endpoint = `/api/v4/${entityTypeRaw}/custom_fields/groups/${encodeURIComponent(String(groupId))}`;
        const response = await fetch(`${freshConnection.account_base_url}${endpoint}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshConnection.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.status === 404) {
          const raw = await response.text();
          return res.status(404).json({
            error: `Kommo custom_field_groups entity_type ${entityTypeRaw} id ${groupId} no encontrado (404).`,
            resource: 'custom_field_groups',
            entity_type: entityTypeRaw,
            id: groupId,
            details: raw,
          });
        }

        if (!response.ok) {
          const raw = await response.text();
          throw new Error(`Kommo custom_field_group entity_type ${entityTypeRaw} id ${groupId} error (${response.status}): ${raw}`);
        }

        const group = (await response.json()) as Record<string, unknown>;
        const groupWithEntityType: Record<string, unknown> = {
          ...group,
          entity_type: entityTypeRaw,
        };

        const dedupeVersion = getCustomFieldGroupDedupeVersion(groupWithEntityType);
        const dedupeKey = `custom_field_group:${entityTypeRaw}:${groupId}:${dedupeVersion}`;

        const staged = await stageWebhookEvents(supabase, [
          {
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.custom_field_groups,
            payload: groupWithEntityType,
            dedupe_key: dedupeKey,
            status: 'pending',
          },
        ]);

        const resources = [
          {
            resource: 'custom_field_groups',
            pulled: 1,
            staged,
            cursorFrom: null,
            cursorTo: null,
            hasMore: false,
          },
        ];

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources,
          totalPulled: 1,
          totalStaged: staged,
        });
      }
    }

    const results: Array<{
      resource: string;
      pulled: number;
      staged: number;
      cursorFrom: string | null;
      cursorTo: string | null;
      hasMore?: boolean;
      truncated?: boolean;
      truncationReason?: 'hasMore' | 'max_entities' | 'max_runtime' | null;
      entitiesScanned?: number;
      entitiesProcessed?: number;
      linksFetched?: number;
    }> = [];

    // Manejo especial para recursos que requieren iteración por entity_type (tags, custom_fields, notes) o por entidad (links).
    if (selectedResource === 'tags' || selectedResource === 'custom_fields' || selectedResource === 'custom_field_groups' || selectedResource === 'notes') {
      const requestedEntityType = asSingleQueryParam(req.query.entity_type)?.trim().toLowerCase();
      let entityTypes: string[] = ['leads', 'contacts', 'companies'];
      const listIdParam = asSingleQueryParam(req.query.list_id);

      if (selectedResource === 'custom_fields' && requestedEntityType) {
        if (!isCustomFieldEntityType(requestedEntityType)) {
          return res.status(400).json({
            error: 'El parámetro entity_type debe ser leads, contacts, companies o catalogs para resource=custom_fields.',
          });
        }
        entityTypes = [requestedEntityType];
      }

      if (selectedResource === 'custom_field_groups' && requestedEntityType) {
        if (!isStandardCustomFieldEntityType(requestedEntityType)) {
          return res.status(400).json({
            error: 'El parámetro entity_type debe ser leads, contacts o companies para resource=custom_field_groups.',
          });
        }
        entityTypes = [requestedEntityType];
      }

      const maxPagesParam = asSingleQueryParam(req.query.max_pages);
      const maxPages = maxPagesParam ? Math.min(50, parseInt(maxPagesParam, 10) || 5) : 5;

      if (selectedResource === 'custom_fields' && requestedEntityType === 'catalogs') {
        let catalogIds: number[] = [];

        if (listIdParam !== undefined) {
          const listIdRaw = listIdParam.trim();
          const listId = Number(listIdRaw);

          if (!listIdRaw || !Number.isInteger(listId) || listId <= 0) {
            return res.status(400).json({
              error: 'El parámetro list_id debe ser un número entero positivo para resource=custom_fields cuando entity_type=catalogs.',
            });
          }

          catalogIds = [listId];
        } else {
          const catalogsResult = await fetchAllPages(
            freshConnection.account_base_url,
            RESOURCE_ENDPOINTS.catalogs,
            freshConnection.access_token,
            'catalogs',
            null,
            undefined,
            maxPages,
          );

          catalogIds = uniquePipelineIdsFromItems(catalogsResult.items);
        }

        for (const catalogId of catalogIds) {
          const result = await fetchCatalogCustomFields(
            freshConnection.account_base_url,
            freshConnection.access_token,
            catalogId,
            maxPages,
          );

          const rows: WebhookEventInsert[] = [];
          for (const item of result.items) {
            const itemWithContext: Record<string, unknown> = {
              ...item,
              entity_type: 'catalogs',
              catalog_id: Number(item.catalog_id ?? item.list_id ?? catalogId) || catalogId,
            };

            const dedupeIdentity = String(
              itemWithContext.id
              ?? createHash('sha256').update(JSON.stringify(itemWithContext)).digest('hex'),
            );
            const dedupeVersion = getCustomFieldDedupeVersion(itemWithContext);
            const dedupeKey = `custom_field:catalogs:${catalogId}:${dedupeIdentity}:${dedupeVersion}`;

            rows.push({
              account_base_url: freshConnection.account_base_url,
              event_type: RESOURCE_EVENT_TYPES.custom_fields,
              payload: itemWithContext,
              dedupe_key: dedupeKey,
              status: 'pending',
            });
          }

          const staged = await stageWebhookEvents(supabase, rows);

          results.push({
            resource: `custom_fields_catalogs_${catalogId}`,
            pulled: result.items.length,
            staged,
            cursorFrom: null,
            cursorTo: null,
          });
        }

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources: results,
          totalPulled: results.reduce((sum, r) => sum + r.pulled, 0),
          totalStaged: results.reduce((sum, r) => sum + r.staged, 0),
        });
      }

      for (const entityType of entityTypes) {
        let items: Array<Record<string, unknown>> = [];
        
        if (selectedResource === 'tags') {
          const result = await fetchEntityTypeTags(
            freshConnection.account_base_url,
            freshConnection.access_token,
            entityType,
            maxPages,
          );
          items = result.items;
        } else if (selectedResource === 'custom_fields') {
          const result = await fetchEntityTypeCustomFields(
            freshConnection.account_base_url,
            freshConnection.access_token,
            entityType,
            maxPages,
          );
          items = result.items;
        } else if (selectedResource === 'custom_field_groups') {
          const result = await fetchEntityTypeCustomFieldGroups(
            freshConnection.account_base_url,
            freshConnection.access_token,
            entityType as StandardCustomFieldEntityType,
            maxPages,
          );
          items = result.items;
        } else if (selectedResource === 'notes') {
          const result = await fetchEntityNotes(
            freshConnection.account_base_url,
            freshConnection.access_token,
            entityType,
            maxPages,
          );
          items = result.items;
        }

        // Adaptamos el event_type para incluir el entity_type, por ejemplo: tag.pull.leads, tag.pull.contacts, etc.
        const eventType = RESOURCE_EVENT_TYPES[selectedResource];
        const rows: WebhookEventInsert[] = [];
        for (const item of items) {
          const itemWithEntityType = { ...item, entity_type: entityType };
          const dedupeIdentity = selectedResource === 'custom_fields' || selectedResource === 'custom_field_groups'
            ? String(item.id ?? createHash('sha256').update(JSON.stringify(itemWithEntityType)).digest('hex'))
            : String(item.id ?? '');
          const dedupeVersion = selectedResource === 'custom_fields'
            ? getCustomFieldDedupeVersion(itemWithEntityType)
            : selectedResource === 'custom_field_groups'
              ? getCustomFieldGroupDedupeVersion(itemWithEntityType)
            : String(item.updated_at ?? item.created_at ?? createHash('sha256').update(JSON.stringify(itemWithEntityType)).digest('hex'));
          const dedupeKey = selectedResource === 'custom_field_groups'
            ? `custom_field_group:${entityType}:${dedupeIdentity}:${dedupeVersion}`
            : `${selectedResource}:${entityType}:${dedupeIdentity}:${dedupeVersion}`;
          rows.push({
            account_base_url: freshConnection.account_base_url,
            event_type: eventType,
            payload: itemWithEntityType,
            dedupe_key: dedupeKey,
            status: 'pending',
          });
        }

        const staged = await stageWebhookEvents(supabase, rows);

        results.push({
          resource: `${selectedResource}_${entityType}`,
          pulled: items.length,
          staged,
          cursorFrom: null,
          cursorTo: null,
        });
      }

      return res.status(200).json({
        success: true,
        account: freshConnection.account_subdomain,
        resources: results,
        totalPulled: results.reduce((sum, r) => sum + r.pulled, 0),
        totalStaged: results.reduce((sum, r) => sum + r.staged, 0),
        queueStats: includeQueueStats
          ? await getQueueStatsForAccountBaseUrl(supabase, freshConnection.account_base_url)
          : undefined,
      });
    }

    // Manejo especial para links, que requiere iteración por entidad. Para cada entidad actualizada (leads, contacts, companies).
    if (selectedResource === 'links') {
      const requestedEntityTypeRaw = asSingleQueryParam(req.query.entity_type)?.trim().toLowerCase();
      let requestedEntityType: LinkEntityType | null = null;
      if (requestedEntityTypeRaw) {
        if (!isLinkEntityType(requestedEntityTypeRaw)) {
          return res.status(400).json({
            error: 'El parámetro entity_type debe ser leads, contacts o companies para resource=links.',
          });
        }
        requestedEntityType = requestedEntityTypeRaw;
      }

      const entities: LinkEntityType[] = requestedEntityType
        ? [requestedEntityType]
        : [...LINK_ENTITY_TYPES];

      const maxPagesParam = asSingleQueryParam(req.query.max_pages);
      const maxPages = maxPagesParam ? Math.min(50, parseInt(maxPagesParam, 10) || 5) : 5;

      const maxEntitiesParam = asSingleQueryParam(req.query.max_entities)?.trim();
      if (maxEntitiesParam !== undefined) {
        const maxEntitiesNumber = Number(maxEntitiesParam);
        if (!Number.isInteger(maxEntitiesNumber) || maxEntitiesNumber <= 0) {
          return res.status(400).json({
            error: 'El parámetro max_entities debe ser un número entero positivo para resource=links.',
          });
        }
      }
      const parsedMaxEntities = maxEntitiesParam !== undefined ? Number(maxEntitiesParam) : 100;
      const maxEntities = Math.min(1000, parsedMaxEntities);

      const queryMaxRuntimeMsParam = asSingleQueryParam(req.query.max_runtime_ms)?.trim();
      if (queryMaxRuntimeMsParam !== undefined) {
        const runtimeNumber = Number(queryMaxRuntimeMsParam);
        if (!Number.isInteger(runtimeNumber) || runtimeNumber <= 0) {
          return res.status(400).json({
            error: 'El parámetro max_runtime_ms debe ser un número entero positivo para resource=links.',
          });
        }
      }

      const envMaxRuntimeMsRaw = (
        process.env.KOMMO_SYNC_LINKS_MAX_RUNTIME_MS
        ?? process.env.KOMMO_LINKS_MAX_RUNTIME_MS
        ?? process.env.KOMMO_SYNC_MAX_RUNTIME_MS
      )?.trim();
      const envMaxRuntimeMs = envMaxRuntimeMsRaw && Number.isInteger(Number(envMaxRuntimeMsRaw)) && Number(envMaxRuntimeMsRaw) > 0
        ? Number(envMaxRuntimeMsRaw)
        : null;
      const requestedRuntimeMs = queryMaxRuntimeMsParam !== undefined
        ? Number(queryMaxRuntimeMsParam)
        : envMaxRuntimeMs ?? 45_000;
      const maxRuntimeMs = Math.min(120_000, requestedRuntimeMs);
      const linksStartedAt = Date.now();
      let budgetExceeded = false;

      // Iteramos por cada tipo de entidad para obtener sus links asociados.
      for (const entity of entities) {
        if (Date.now() - linksStartedAt >= maxRuntimeMs) {
          budgetExceeded = true;
          break;
        }

        // Obtenemos el cursor específico para los links de esta entidad, por ejemplo: links_leads, links_contacts, etc. 
        const cursorResource = `links_${entity}`;
        const { data: cursorRows, error: cursorError } = await supabase
          .from('kommo_sync_cursor' as never)
          .select('*')
          .eq('account_subdomain', freshConnection.account_subdomain)
          .eq('resource', cursorResource)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (cursorError) {
          throw new Error(cursorError.message || `No se pudo leer cursor de sync para ${cursorResource}`);
        }

        const cursor = ((cursorRows ?? []) as Array<{ cursor_updated_at: string | null }>)[0] ?? null;
        const fromDateIso = cursor?.cursor_updated_at ?? null;

        const { items: updatedEntities, totalPulled, hasMore } = await fetchAllPages(
          freshConnection.account_base_url,
          `/api/v4/${entity}`,
          freshConnection.access_token,
          entity as KommoResource,
          fromDateIso,
          undefined,
          maxPages,
        );

        const nextCursor = getMaxUpdatedAtIso(updatedEntities);

        let stagedLinks = 0;
        let linksFetched = 0;
        const rows: WebhookEventInsert[] = [];
        const entitiesToProcess = updatedEntities.slice(0, maxEntities);
        const maxEntitiesReached = updatedEntities.length > entitiesToProcess.length;
        let entitiesProcessed = 0;
        let entityRuntimeExceeded = false;

        for (const item of entitiesToProcess) {
          if (Date.now() - linksStartedAt >= maxRuntimeMs) {
            budgetExceeded = true;
            entityRuntimeExceeded = true;
            break;
          }

          entitiesProcessed++;
          const entityId = Number(item.id);
          if (!entityId) continue;

          try {
            const linksResult = await fetchEntityLinks(
              freshConnection.account_base_url,
              freshConnection.access_token,
              entity,
              entityId,
              maxPages,
            );
            linksFetched += linksResult.totalPulled;

            for (const link of linksResult.items) {
              const toEntityType = String(link.to_entity_type ?? link.to ?? '');
              const toEntityIdRaw = link.to_entity_id ?? link.to_id ?? '';
              const toEntityId = Number(toEntityIdRaw);
              if (!toEntityType || !toEntityId) continue;

              const dedupeKey = `links:${entity}:${entityId}:${toEntityType}:${String(toEntityId)}`;

              // Normalizamos el payload para los links, ya que la estructura de la API puede variar y queremos mantener consistencia en los eventos.
              const linkPayload = {
                from: entity,
                from_id: entityId,
                to_entity_type: toEntityType,
                to_entity_id: toEntityId,
                link_type: (link as Record<string, unknown>).link_type ?? null,
                created_at: (link as Record<string, unknown>).created_at ?? null,
                metadata: (link as Record<string, unknown>).metadata ?? null,
              };
              rows.push({
                account_base_url: freshConnection.account_base_url,
                event_type: 'link.pull',
                payload: linkPayload,
                dedupe_key: dedupeKey,
                status: 'pending',
              });
            }

            // Para evitar sobrecargar memoria o límites de la base de datos, hacemos staging progresivo cada 500 links obtenidos.
            if (rows.length >= 500) {
              stagedLinks += await stageWebhookEvents(supabase, rows.splice(0, rows.length));
            }
          } catch (e) {
            console.error(`Error fetching links for ${entity}/${entityId}:`, e);
          }
        }

        if (rows.length > 0) {
          stagedLinks += await stageWebhookEvents(supabase, rows);
        }

        const shouldAdvanceCursor = !!nextCursor && !hasMore && !maxEntitiesReached && !entityRuntimeExceeded;

        // Actualizamos el cursor específico para los links de esta entidad solo si procesamos completamente el lote sin truncamiento.
        if (shouldAdvanceCursor) {
          const { error: upsertCursorError } = await supabase.from('kommo_sync_cursor' as never).upsert(
            {
              account_subdomain: freshConnection.account_subdomain,
              resource: cursorResource,
              cursor_updated_at: nextCursor,
              updated_at: new Date().toISOString(),
            } as never,
            {
              onConflict: 'account_subdomain,resource',
            },
          );

          if (upsertCursorError) {
            console.error(`Error updating cursor for ${cursorResource}:`, upsertCursorError.message);
          }
        }

        const truncationReason: 'hasMore' | 'max_entities' | 'max_runtime' | null = entityRuntimeExceeded
          ? 'max_runtime'
          : maxEntitiesReached
            ? 'max_entities'
            : hasMore
              ? 'hasMore'
              : null;

        const truncated = truncationReason !== null;

        results.push({
          resource: cursorResource,
          pulled: totalPulled,
          staged: stagedLinks,
          cursorFrom: fromDateIso,
          cursorTo: shouldAdvanceCursor ? nextCursor : fromDateIso,
          hasMore,
          truncated,
          truncationReason,
          entitiesScanned: updatedEntities.length,
          entitiesProcessed,
          linksFetched,
        });

        if (budgetExceeded) {
          break;
        }
      }

      return res.status(200).json({
        success: true,
        account: freshConnection.account_subdomain,
        resources: results,
        totalPulled: results.reduce((sum, r) => sum + r.pulled, 0),
        totalStaged: results.reduce((sum, r) => sum + r.staged, 0),
        truncated: budgetExceeded || results.some((r) => r.truncated === true),
        queueStats: includeQueueStats
          ? await getQueueStatsForAccountBaseUrl(supabase, freshConnection.account_base_url)
          : undefined,
      });
    }

    // Manejo especial para pipeline_statuses, ya que el endpoint requiere pipeline_id como path param.
    if (selectedResource === 'pipeline_statuses') {
      const maxPagesParam = asSingleQueryParam(req.query.max_pages);
      const maxPages = maxPagesParam ? Math.min(50, parseInt(maxPagesParam, 10) || 5) : 5;

      const pipelineIdParam = asSingleQueryParam(req.query.pipeline_id);
      const statusIdParam = asSingleQueryParam(req.query.id);
      let pipelineIds: number[] = [];

      // Si vienen pipeline_id e id, hacemos fetch puntual de un stage:
      // GET /api/v4/leads/pipelines/{pipeline_id}/statuses/{id}
      if (pipelineIdParam !== undefined && statusIdParam !== undefined) {
        const pipelineIdRaw = pipelineIdParam.trim();
        const statusIdRaw = statusIdParam.trim();
        const pipelineId = Number(pipelineIdRaw);
        const statusId = Number(statusIdRaw);

        if (!pipelineIdRaw || !Number.isInteger(pipelineId) || pipelineId <= 0) {
          return res.status(400).json({
            error: 'El parámetro pipeline_id debe ser un número entero positivo para resource=pipeline_statuses.',
          });
        }

        if (!statusIdRaw || !Number.isInteger(statusId) || statusId <= 0) {
          return res.status(400).json({
            error: 'El parámetro id debe ser un número entero positivo para resource=pipeline_statuses.',
          });
        }

        const endpoint = `/api/v4/leads/pipelines/${encodeURIComponent(String(pipelineId))}/statuses/${encodeURIComponent(String(statusId))}`;
        const url = new URL(`${freshConnection.account_base_url}${endpoint}`);
        if (requestedWith) {
          url.searchParams.set('with', requestedWith);
        }

        const response = await fetch(url.toString(), {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshConnection.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (response.status === 404) {
          const raw = await response.text();
          return res.status(404).json({
            error: `Kommo pipeline_statuses pipeline_id ${pipelineId} id ${statusId} no encontrado (404).`,
            resource: 'pipeline_statuses',
            pipeline_id: pipelineId,
            id: statusId,
            details: raw,
          });
        }

        if (!response.ok) {
          const raw = await response.text();
          throw new Error(`Kommo pipeline_status pipeline_id ${pipelineId} id ${statusId} error (${response.status}): ${raw}`);
        }

        const status = (await response.json()) as Record<string, unknown>;
        const statusWithPipeline: Record<string, unknown> = {
          ...status,
          pipeline_id: Number(status.pipeline_id ?? pipelineId) || pipelineId,
          id: Number(status.id ?? status.status_id ?? statusId) || statusId,
        };

        const statusIdentity = String(statusWithPipeline.id ?? statusId);
        const dedupeVersion = getPipelineStatusDedupeVersion(statusWithPipeline);
        const dedupeKey = `pipeline_status:${pipelineId}:${statusIdentity}:${dedupeVersion}`;

        const staged = await stageWebhookEvents(supabase, [
          {
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.pipeline_statuses,
            payload: statusWithPipeline,
            dedupe_key: dedupeKey,
            status: 'pending',
          },
        ]);

        const resources = [
          {
            resource: 'pipeline_statuses',
            pulled: 1,
            staged,
            cursorFrom: null,
            cursorTo: null,
            hasMore: false,
          },
        ];

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources,
          totalPulled: 1,
          totalStaged: staged,
        });
      }

      if (pipelineIdParam !== undefined) {
        const pipelineIdRaw = pipelineIdParam.trim();
        const pipelineId = Number(pipelineIdRaw);

        if (!pipelineIdRaw || !Number.isInteger(pipelineId) || pipelineId <= 0) {
          return res.status(400).json({
            error: 'El parámetro pipeline_id debe ser un número entero positivo para resource=pipeline_statuses.',
          });
        }

        pipelineIds = [pipelineId];
      } else {
        const pipelinesResult = await fetchAllPages(
          freshConnection.account_base_url,
          RESOURCE_ENDPOINTS.pipelines,
          freshConnection.access_token,
          'pipelines',
          null,
          undefined,
          maxPages,
        );

        pipelineIds = uniquePipelineIdsFromItems(pipelinesResult.items);
      }

      const stageRows: WebhookEventInsert[] = [];
      let pulled = 0;
      let hasMore = false;

      for (const pipelineId of pipelineIds) {
        const statusesResult = await fetchPipelineStatusesPages(
          freshConnection.account_base_url,
          freshConnection.access_token,
          pipelineId,
          requestedWith,
          maxPages,
        );

        pulled += statusesResult.totalPulled;
        hasMore = hasMore || statusesResult.hasMore;

        for (const status of statusesResult.items) {
          const statusWithPipeline: Record<string, unknown> = {
            ...status,
            pipeline_id: Number(status.pipeline_id ?? pipelineId) || pipelineId,
          };

          const statusIdentity = String(
            statusWithPipeline.id
            ?? statusWithPipeline.status_id
            ?? createHash('sha256').update(JSON.stringify(statusWithPipeline)).digest('hex'),
          );
          const dedupeVersion = getPipelineStatusDedupeVersion(statusWithPipeline);
          const dedupeKey = `pipeline_status:${pipelineId}:${statusIdentity}:${dedupeVersion}`;

          stageRows.push({
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.pipeline_statuses,
            payload: statusWithPipeline,
            dedupe_key: dedupeKey,
            status: 'pending',
          });
        }
      }

      const staged = await stageWebhookEvents(supabase, stageRows);

      const resources = [
        {
          resource: 'pipeline_statuses',
          pulled,
          staged,
          cursorFrom: null,
          cursorTo: null,
          hasMore,
        },
      ];

      return res.status(200).json({
        success: true,
        account: freshConnection.account_subdomain,
        resources,
        totalPulled: pulled,
        totalStaged: staged,
      });
    }

    // Manejo especial para catalog_elements, ya que el endpoint requiere list_id como path param.
    if (selectedResource === 'catalog_elements') {
      const maxPagesParam = asSingleQueryParam(req.query.max_pages);
      const maxPages = maxPagesParam ? Math.min(50, parseInt(maxPagesParam, 10) || 5) : 5;

      const listIdParam = asSingleQueryParam(req.query.list_id);
      const elementIdParam = asSingleQueryParam(req.query.element_id);

      if (listIdParam !== undefined && elementIdParam !== undefined) {
        const listIdRaw = listIdParam.trim();
        const elementIdRaw = elementIdParam.trim();
        const listId = Number(listIdRaw);
        const elementId = Number(elementIdRaw);

        if (!listIdRaw || !Number.isInteger(listId) || listId <= 0 || !elementIdRaw || !Number.isInteger(elementId) || elementId <= 0) {
          return res.status(400).json({
            error: 'Los parámetros list_id y element_id deben ser números enteros positivos para resource=catalog_elements.',
          });
        }

        const endpoint = `/api/v4/catalogs/${encodeURIComponent(String(listId))}/elements/${encodeURIComponent(String(elementId))}`;
        const response = await fetch(`${freshConnection.account_base_url}${endpoint}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshConnection.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const raw = await response.text();

          if (response.status === 404) {
            return res.status(404).json({
              error: 'Elemento de catálogo no encontrado en Kommo.',
              resource: 'catalog_elements',
              list_id: listId,
              element_id: elementId,
              details: raw,
            });
          }

          throw new Error(`Kommo catalog_elements (${listId}/${elementId}) error (${response.status}): ${raw}`);
        }

        const item = (await response.json()) as Record<string, unknown>;
        const normalizedElement: Record<string, unknown> = {
          ...item,
          catalog_id: Number(item.catalog_id ?? listId) || listId,
          id: Number(item.id ?? item.element_id ?? elementId) || elementId,
        };

        const dedupeVersion = String(normalizedElement.updated_at ?? normalizedElement.created_at ?? '');
        const dedupeKey = `catalog_element:${normalizedElement.catalog_id}:${normalizedElement.id}:${dedupeVersion}`;

        const staged = await stageWebhookEvents(supabase, [
          {
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.catalog_elements,
            payload: normalizedElement,
            dedupe_key: dedupeKey,
            status: 'pending',
          },
        ]);

        const resources = [
          {
            resource: 'catalog_elements',
            pulled: 1,
            staged,
            cursorFrom: null,
            cursorTo: null,
            hasMore: false,
          },
        ];

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources,
          totalPulled: 1,
          totalStaged: staged,
        });
      }

      let catalogIds: number[] = [];

      if (listIdParam !== undefined) {
        const listIdRaw = listIdParam.trim();
        const listId = Number(listIdRaw);

        if (!listIdRaw || !Number.isInteger(listId) || listId <= 0) {
          return res.status(400).json({
            error: 'El parámetro list_id debe ser un número entero positivo para resource=catalog_elements.',
          });
        }

        catalogIds = [listId];
      } else {
        const catalogsResult = await fetchAllPages(
          freshConnection.account_base_url,
          RESOURCE_ENDPOINTS.catalogs,
          freshConnection.access_token,
          'catalogs',
          null,
          undefined,
          maxPages,
        );

        catalogIds = uniquePipelineIdsFromItems(catalogsResult.items);
      }

      const stageRows: WebhookEventInsert[] = [];
      let pulled = 0;
      let hasMore = false;

      for (const catalogId of catalogIds) {
        const elementsResult = await fetchCatalogElementsPages(
          freshConnection.account_base_url,
          freshConnection.access_token,
          catalogId,
          maxPages,
        );

        pulled += elementsResult.totalPulled;
        hasMore = hasMore || elementsResult.hasMore;

        for (const element of elementsResult.items) {
          const normalizedElement: Record<string, unknown> = {
            ...element,
            catalog_id: Number(element.catalog_id ?? catalogId) || catalogId,
          };

          const catalogIdentity = String(normalizedElement.catalog_id ?? catalogId);
          const elementIdentity = String(
            normalizedElement.id
            ?? normalizedElement.element_id
            ?? createHash('sha256').update(JSON.stringify(normalizedElement)).digest('hex'),
          );
          const dedupeVersion = String(normalizedElement.updated_at ?? normalizedElement.created_at ?? '');
          const dedupeKey = `catalog_element:${catalogIdentity}:${elementIdentity}:${dedupeVersion}`;

          stageRows.push({
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.catalog_elements,
            payload: normalizedElement,
            dedupe_key: dedupeKey,
            status: 'pending',
          });
        }
      }

      const staged = await stageWebhookEvents(supabase, stageRows);

      const resources = [
        {
          resource: 'catalog_elements',
          pulled,
          staged,
          cursorFrom: null,
          cursorTo: null,
          hasMore,
        },
      ];

      return res.status(200).json({
        success: true,
        account: freshConnection.account_subdomain,
        resources,
        totalPulled: pulled,
        totalStaged: staged,
      });
    }

    // Manejo especial para unsorted por UID puntual.
    // Si viene uid, usamos GET /api/v4/leads/unsorted/{uid} y mantenemos el modelo UID-céntrico.
    if (selectedResource === 'unsorted') {
      const uidParam = asSingleQueryParam(req.query.uid);

      if (uidParam !== undefined) {
        const uid = uidParam.trim();
        if (!uid) {
          return res.status(400).json({ error: 'El parámetro uid no puede estar vacío para resource=unsorted.' });
        }

        const endpoint = `/api/v4/leads/unsorted/${encodeURIComponent(uid)}`;
        const response = await fetch(`${freshConnection.account_base_url}${endpoint}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${freshConnection.access_token}`,
            'Content-Type': 'application/json',
          },
        });

        if (!response.ok) {
          const raw = await response.text();
          throw new Error(`Kommo unsorted uid ${uid} error (${response.status}): ${raw}`);
        }

        const item = (await response.json()) as Record<string, unknown>;
        const dedupeIdentity = String(item.uid ?? uid);
        const dedupeVersion = String(item.created_at ?? item.updated_at ?? '');
        const dedupeKey = `unsorted:${dedupeIdentity}:${dedupeVersion}`;

        const staged = await stageWebhookEvents(supabase, [
          {
            account_base_url: freshConnection.account_base_url,
            event_type: RESOURCE_EVENT_TYPES.unsorted,
            payload: item,
            dedupe_key: dedupeKey,
            status: 'pending',
          },
        ]);

        const resources = [
          {
            resource: 'unsorted',
            pulled: 1,
            staged,
            cursorFrom: null,
            cursorTo: null,
            hasMore: false,
          },
        ];

        return res.status(200).json({
          success: true,
          account: freshConnection.account_subdomain,
          resources,
          totalPulled: 1,
          totalStaged: staged,
        });
      }
    }

    // Manejo especial para summary de unsorted.
    // Es una llamada única (sin paginación), con filtros opcionales forwardeados desde query params.
    if (selectedResource === 'unsorted_summary') {
      const filters: UnsortedSummaryFilters = normalizeSummaryFilters({
        uid: asArrayQueryParam(
          asArrayQueryParam(req.query['filter[uid]'])
            .concat(
              asArrayQueryParam(getNestedQueryValue(req.query.filter, ['uid'])),
            ),
        ),
        created_at:
          asSingleQueryParam(req.query['filter[created_at]'])
          ?? asSingleQueryParam(getNestedQueryValue(req.query.filter, ['created_at'])),
        created_at_from:
          asSingleQueryParam(req.query['filter[created_at][from]'])
          ?? asSingleQueryParam(getNestedQueryValue(req.query.filter, ['created_at', 'from'])),
        created_at_to:
          asSingleQueryParam(req.query['filter[created_at][to]'])
          ?? asSingleQueryParam(getNestedQueryValue(req.query.filter, ['created_at', 'to'])),
        pipeline_id: asArrayQueryParam(
          asArrayQueryParam(req.query['filter[pipeline_id]'])
            .concat(
              asArrayQueryParam(getNestedQueryValue(req.query.filter, ['pipeline_id'])),
            ),
        ),
      });

      const endpoint = RESOURCE_ENDPOINTS.unsorted_summary;
      const url = new URL(`${freshConnection.account_base_url}${endpoint}`);

      for (const uid of filters.uid ?? []) {
        url.searchParams.append('filter[uid]', uid);
      }

      if (filters.created_at) {
        url.searchParams.set('filter[created_at]', filters.created_at);
      }

      if (filters.created_at_from) {
        url.searchParams.set('filter[created_at][from]', filters.created_at_from);
      }

      if (filters.created_at_to) {
        url.searchParams.set('filter[created_at][to]', filters.created_at_to);
      }

      for (const pipelineId of filters.pipeline_id ?? []) {
        url.searchParams.append('filter[pipeline_id]', pipelineId);
      }

      const response = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${freshConnection.access_token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const raw = await response.text();
        throw new Error(`Kommo unsorted summary error (${response.status}): ${raw}`);
      }

      const summaryPayload = (await response.json()) as Record<string, unknown>;

      const scopeSeed = JSON.stringify({
        account_base_url: freshConnection.account_base_url,
        filters,
      });
      const scopeKey = `kommo-unsorted-summary:${createHash('sha256').update(scopeSeed).digest('hex')}`;

      const payloadWithMeta: Record<string, unknown> = {
        ...summaryPayload,
        meta: {
          scope_key: scopeKey,
          filters,
          account_base_url: freshConnection.account_base_url,
        },
      };

      const dedupeSeed = JSON.stringify({
        scope_key: scopeKey,
        total: summaryPayload.total ?? null,
        accepted: summaryPayload.accepted ?? null,
        declined: summaryPayload.declined ?? null,
        average_sort_time: summaryPayload.average_sort_time ?? null,
        categories: summaryPayload.categories ?? null,
      });
      const dedupeKey = `unsorted_summary:${createHash('sha256').update(dedupeSeed).digest('hex')}`;

      const staged = await stageWebhookEvents(supabase, [
        {
          account_base_url: freshConnection.account_base_url,
          event_type: RESOURCE_EVENT_TYPES.unsorted_summary,
          payload: payloadWithMeta,
          dedupe_key: dedupeKey,
          status: 'pending',
        },
      ]);

      const resources = [
        {
          resource: 'unsorted_summary',
          pulled: 1,
          staged,
          cursorFrom: null,
          cursorTo: null,
          hasMore: false,
        },
      ];

      return res.status(200).json({
        success: true,
        account: freshConnection.account_subdomain,
        resources,
        totalPulled: 1,
        totalStaged: staged,
      });
    }

    // Recursos Estandar (leads, contacts, companies, users, roles, pipelines, tasks, notes, events, catalogs, unsorted)

    for (const resource of resourcesToSync) {
      const endpoint = RESOURCE_ENDPOINTS[resource];
      const eventType = RESOURCE_EVENT_TYPES[resource];

      // Leemos el cursor de sync para este recurso desde la base de datos. Si no existe, sincronizamos todo.
      const { data: cursorRows, error: cursorError } = await supabase
        .from('kommo_sync_cursor' as never)
        .select('*')
        .eq('account_subdomain', freshConnection.account_subdomain)
        .eq('resource', resource)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (cursorError) {
        throw new Error(cursorError.message || `No se pudo leer cursor de sync para ${resource}`);
      }

      const cursor = ((cursorRows ?? []) as Array<{ cursor_updated_at: string | null }>)[0] ?? null;
      const fromDateIso = cursor?.cursor_updated_at ?? null;

      // Obtener max_pages desde query params, con un valor por defecto de 5 páginas y un máximo de 50 para evitar tiempos de ejecución demasiado largos. 
      const maxPagesParam = asSingleQueryParam(req.query.max_pages);
      const maxPages = maxPagesParam ? Math.min(50, parseInt(maxPagesParam, 10) || 5) : 5;

      // Obtenemos todos los items actualizados desde la última sincronización usando paginación. 
      const { items, totalPulled, hasMore } = await fetchAllPages(
        freshConnection.account_base_url,
        endpoint,
        freshConnection.access_token,
        resource,
        fromDateIso,
        resource === 'leads'
          ? leadsWith
          : resource === 'contacts'
            ? contactsWith
            : resource === 'companies'
              ? companiesWith
              : resource === 'users'
                ? usersWith
                : resource === 'roles'
                  ? rolesWith
                : undefined,
        maxPages,
      );

      const stageRows: WebhookEventInsert[] = [];
      for (const item of items) {
        const dedupeIdentity =
          resource === 'unsorted'
            ? String(item.uid ?? item.id ?? '')
            : String(item.id ?? '');
        const dedupeVersion =
          resource === 'unsorted'
            ? String(item.created_at ?? item.updated_at ?? '')
              : resource === 'pipelines'
                ? getPipelineDedupeVersion(item)
                : resource === 'contacts'
                  ? String(item.updated_at ?? item.created_at ?? '')
                  : resource === 'companies'
                    ? String(item.updated_at ?? item.created_at ?? '')
                      : resource === 'users'
                        ? getUserDedupeVersion(item)
                        : resource === 'roles'
                          ? getRoleDedupeVersion(item)
                          : resource === 'tasks'
                            ? getTaskDedupeVersion(item)
                    : String(item.updated_at ?? '');
        const dedupeKey = `${resource}:${dedupeIdentity}:${dedupeVersion}`;
        stageRows.push({
          account_base_url: freshConnection.account_base_url,
          event_type: eventType,
          payload: item,
          dedupe_key: dedupeKey,
          status: 'pending',
        });
      }

      const staged = await stageWebhookEvents(supabase, stageRows);

      // Actualizamos el cursor con el máximo updated_at de los items que acabamos de sincronizar.
      const nextCursor = getMaxUpdatedAtIso(items);
      if (nextCursor && !hasMore) {
        const { error: upsertCursorError } = await supabase.from('kommo_sync_cursor' as never).upsert(
          {
            account_subdomain: freshConnection.account_subdomain,
            resource: resource,
            cursor_updated_at: nextCursor,
            updated_at: new Date().toISOString(),
          } as never,
          {
            onConflict: 'account_subdomain,resource',
          },
        );

        if (upsertCursorError) {
          console.error(`Error updating cursor for ${resource}:`, upsertCursorError.message);
        }
      }

      results.push({
        resource,
        pulled: totalPulled,
        staged,
        cursorFrom: fromDateIso,
        cursorTo: hasMore ? fromDateIso : nextCursor,
        hasMore,
        truncated: hasMore,
      });
    }

    return res.status(200).json({
      success: true,
      account: freshConnection.account_subdomain,
      resources: results,
      totalPulled: results.reduce((sum, r) => sum + r.pulled, 0),
      totalStaged: results.reduce((sum, r) => sum + r.staged, 0),
      queueStats: includeQueueStats
        ? await getQueueStatsForAccountBaseUrl(supabase, freshConnection.account_base_url)
        : undefined,
    });
  } catch (error: unknown) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}

function uniquePipelineIdsFromItems(items: Array<Record<string, unknown>>) {
  const ids = new Set<number>();
  for (const item of items) {
    const id = Number(item.id);
    if (Number.isInteger(id) && id > 0) {
      ids.add(id);
    }
  }
  return Array.from(ids);
}
