import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient, isSecretAuthorized, isVercelCronAuthorized, verifyAdminSession } from './_shared.js';

const PROCESS_SECRET_HEADER = 'x-kommo-process-secret';
const PROCESS_SECRET_ENV = 'KOMMO_PROCESS_SECRET';
const DEFAULT_LIMIT = 50;

const DEFAULT_UPSERT_CHUNK_SIZE = 250;

// Funcion auxiliar para manejar query params que pueden venir como string o array de strings (en caso de múltiples valores con el mismo nombre)
function asSingleQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

interface KommoEventRow {
  id: string;
  account_base_url: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

// Funciones auxiliares para procesamiento de datos Kommo, mapeo a tablas, y operaciones de base de datos.
function chunkArray<T>(items: T[], chunkSize: number) {
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Agrupa un array de items por una clave obtenida mediante la función getKey.
function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    const arr = map.get(key);
    if (arr) arr.push(item);
    else map.set(key, [item]);
  }
  return map;
}

// Convierte un valor a número, devolviendo un fallback si no es posible parsear un número finito.
function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

// Convierte un valor a segundos Unix, aceptando tanto números como strings (que pueden ser timestamps o fechas parseables).
function asUnixSeconds(value: unknown) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.floor(value) : 0;
  }

  if (typeof value === 'string') {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return Math.floor(numeric);

    const ms = Date.parse(value);
    if (Number.isFinite(ms)) return Math.floor(ms / 1000);
  }

  return 0;
}

function mapKommoLeadToKommoLeads(payload: Record<string, unknown>) {
  const leadId = asNumber(payload.id, 0);
  if (!leadId) {
    return null;
  }

  const createdAtTs = asNumber(payload.created_at, 0);
  const updatedAtTs = asNumber(payload.updated_at, 0);
  const closedAtTs = asNumber(payload.closed_at, 0);
  const closestTaskAtTs = asNumber(payload.closest_task_at, 0);

  const embedded = payload._embedded as Record<string, unknown> | undefined;

  return {
    stable_id: `kommo-lead-${leadId}`,
    business_id: leadId,
    name: payload.name ?? null,
    price: asNumber(payload.price, 0) || null,
    score: asNumber(payload.score, 0) || null,
    group_id: asNumber(payload.group_id, 0) || null,
    created_at: createdAtTs ? new Date(createdAtTs * 1000).toISOString() : null,
    updated_at: updatedAtTs ? new Date(updatedAtTs * 1000).toISOString() : null,
    closed_at: closedAtTs ? new Date(closedAtTs * 1000).toISOString() : null,
    status_id: asNumber(payload.status_id, 0) || null,
    account_id: asNumber(payload.account_id, 0) || null,
    created_by: asNumber(payload.created_by, 0) || null,
    is_deleted: payload.is_deleted ?? false,
    labor_cost: asNumber(payload.labor_cost, 0) || null,
    updated_by: asNumber(payload.updated_by, 0) || null,
    pipeline_id: asNumber(payload.pipeline_id, 0) || null,
    loss_reason_id: asNumber(payload.loss_reason_id, 0) || null,
    source_id: asNumber(payload.source_id, 0) || null,
    closest_task_at: closestTaskAtTs ? new Date(closestTaskAtTs * 1000).toISOString() : null,
    responsible_user_id: asNumber(payload.responsible_user_id, 0) || null,
    is_price_modified_by_robot: payload.is_price_modified_by_robot ?? null,
    custom_fields_values: payload.custom_fields_values ?? embedded?.custom_fields_values ?? null,
    loss_reason: payload.loss_reason ?? embedded?.loss_reason ?? null,
    tags: embedded?.tags ?? null,
    contacts: embedded?.contacts ?? null,
    companies: embedded?.companies ?? null,
    catalog_elements: embedded?.catalog_elements ?? null,
    source: payload.source ?? embedded?.source ?? null,
    raw_payload: payload,
  };
}

function mapKommoContactToTable(payload: Record<string, unknown>) {
  const contactId = asNumber(payload.id, 0);
  if (!contactId) {
    return null;
  }

  const createdAtTs = asNumber(payload.created_at, 0);
  const updatedAtTs = asNumber(payload.updated_at, 0);
  const closestTaskAtTs = asNumber(payload.closest_task_at, 0);

  const embedded = payload._embedded as Record<string, unknown> | undefined;

  return {
    stable_id: `kommo-contact-${contactId}`,
    business_id: contactId,
    name: payload.name ?? null,
    first_name: payload.first_name ?? null,
    last_name: payload.last_name ?? null,
    responsible_user_id: asNumber(payload.responsible_user_id, 0) || null,
    group_id: asNumber(payload.group_id, 0) || null,
    created_at: createdAtTs ? new Date(createdAtTs * 1000).toISOString() : null,
    updated_at: updatedAtTs ? new Date(updatedAtTs * 1000).toISOString() : null,
    closest_task_at: closestTaskAtTs ? new Date(closestTaskAtTs * 1000).toISOString() : null,
    is_deleted: payload.is_deleted ?? false,
    is_unsorted: payload.is_unsorted ?? false,
    custom_fields_values: payload.custom_fields_values ?? null,
    account_id: asNumber(payload.account_id, 0) || null,
    embedded_data: embedded ? { tags: embedded.tags, companies: embedded.companies } : null,
  };
}

function mapKommoUserToTable(payload: Record<string, unknown>) {
  const userId = asNumber(payload.id, 0);
  if (!userId) {
    return null;
  }

  return {
    stable_id: `kommo-user-${userId}`,
    business_id: userId,
    lang: payload.lang ?? null,
    name: payload.name ?? null,
    email: payload.email ?? null,
    is_admin: payload.is_admin ?? false,
    is_active: (payload.rights as Record<string, unknown>)?.is_active ?? true,
    group_id: asNumber(payload.group_id, 0) || null,
    rights: payload.rights ?? null,
  };
}

function mapKommoCompanyToTable(payload: Record<string, unknown>) {
  const companyId = asNumber(payload.id, 0);
  if (!companyId) {
    return null;
  }

  const createdAtTs = asNumber(payload.created_at, 0);
  const updatedAtTs = asNumber(payload.updated_at, 0);
  const closestTaskAtTs = asNumber(payload.closest_task_at, 0);
  const embedded = payload._embedded as Record<string, unknown> | undefined;

  return {
    stable_id: `kommo-company-${companyId}`,
    business_id: companyId,
    name: payload.name ?? null,
    group_id: asNumber(payload.group_id, 0) || null,
    account_id: asNumber(payload.account_id, 0) || null,
    responsible_user_id: asNumber(payload.responsible_user_id, 0) || null,
    is_deleted: payload.is_deleted ?? false,
    created_at: createdAtTs ? new Date(createdAtTs * 1000).toISOString() : null,
    updated_at: updatedAtTs ? new Date(updatedAtTs * 1000).toISOString() : null,
    closest_task_at: closestTaskAtTs ? new Date(closestTaskAtTs * 1000).toISOString() : null,
    custom_fields_values: payload.custom_fields_values ?? null,
    embedded_data: embedded ? { tags: embedded.tags } : null,
  };
}

function mapKommoTagToTable(payload: Record<string, unknown>) {
  const tagId = asNumber(payload.id, 0);
  if (!tagId) {
    return null;
  }

  // entity_type comes from the sync (passed in payload for disambiguation)
  const entityType = String(payload.entity_type ?? 'leads');

  return {
    stable_id: `kommo-tag-${entityType}-${tagId}`,
    business_id: tagId,
    name: payload.name ?? null,
    color: payload.color ?? null,
    entity_type: entityType,
  };
}

function mapKommoTaskToTable(payload: Record<string, unknown>) {
  const taskId = asNumber(payload.id, 0);
  if (!taskId) {
    return null;
  }

  const createdAtTs = asNumber(payload.created_at, 0);
  const updatedAtTs = asNumber(payload.updated_at, 0);
  const closestTaskAtTs = asNumber(payload.closest_task_at, 0);
  const completeTillTs = asUnixSeconds(payload.complete_till);
  const completedAtTs = asNumber(payload.completed_at, 0);

  return {
    stable_id: `kommo-task-${taskId}`,
    business_id: taskId,
    name: payload.name ?? null,
    text: payload.text ?? null,
    task_type_id: asNumber(payload.task_type_id, 0) || null,
    status: payload.status ?? null,
    group_id: asNumber(payload.group_id, 0) || null,
    created_by: asNumber(payload.created_by, 0) || null,
    duration: asNumber(payload.duration, 0) || null,
    // DB column: bigint (unix seconds)
    complete_till: completeTillTs || null,
    is_completed: payload.is_completed ?? false,
    result: payload.result ?? null,
    responsible_user_id: asNumber(payload.responsible_user_id, 0) || null,
    created_at: createdAtTs ? new Date(createdAtTs * 1000).toISOString() : null,
    updated_at: updatedAtTs ? new Date(updatedAtTs * 1000).toISOString() : null,
    closest_task_at: closestTaskAtTs ? new Date(closestTaskAtTs * 1000).toISOString() : null,
    completed_at: completedAtTs ? new Date(completedAtTs * 1000).toISOString() : null,
  };
}

function mapKommoNoteToTable(payload: Record<string, unknown>) {
  const noteId = asNumber(payload.id, 0);
  if (!noteId) {
    return null;
  }

  const createdAtTs = asNumber(payload.created_at, 0);
  const updatedAtTs = asNumber(payload.updated_at, 0);

  // entity_type comes from sync (passed in payload for disambiguation), fallback to element_type
  const entityType = String(payload.entity_type ?? payload.element_type ?? '');

  return {
    stable_id: `kommo-note-${entityType}-${noteId}`,
    business_id: noteId,
    note_type: payload.note_type ?? null,
    body: payload.body ?? null,
    element_type: entityType || null,
    element_id: asNumber(payload.entity_id ?? payload.element_id, 0) || null,
    created_by: asNumber(payload.created_by, 0) || null,
    created_at: createdAtTs ? new Date(createdAtTs * 1000).toISOString() : null,
    updated_at: updatedAtTs ? new Date(updatedAtTs * 1000).toISOString() : null,
  };
}

function mapKommoCallToTable(payload: Record<string, unknown>) {
  const callId = asNumber(payload.id, 0);
  if (!callId) {
    return null;
  }

  const createdAtTs = asNumber(payload.created_at, 0);
  const updatedAtTs = asNumber(payload.updated_at, 0);

  return {
    stable_id: `kommo-call-${callId}`,
    business_id: callId,
    call_type: payload.call_type ?? null,
    call_status: payload.call_status ?? null,
    phone: payload.phone ?? null,
    caller_id: payload.caller_id ?? null,
    direction: payload.direction ?? null,
    duration: asNumber(payload.duration, 0) || null,
    source: payload.source ?? null,
    link: payload.link ?? null,
    element_type: payload.element_type ?? null,
    element_id: asNumber(payload.element_id, 0) || null,
    created_by: asNumber(payload.created_by, 0) || null,
    responsible_user_id: asNumber(payload.responsible_user_id, 0) || null,
    created_at: createdAtTs ? new Date(createdAtTs * 1000).toISOString() : null,
    updated_at: updatedAtTs ? new Date(updatedAtTs * 1000).toISOString() : null,
  };
}

// INSERT MISSING FUNCTIONS HERE
function mapKommoUnsortedLeadToTable(payload: Record<string, unknown>) {
  const uid = String(payload.uid ?? '').trim();
  if (!uid) {
    return null;
  }

  const embedded = payload._embedded as {
    leads?: Array<Record<string, unknown>>;
    contacts?: Array<Record<string, unknown>>;
    companies?: Array<Record<string, unknown>>;
  } | undefined;

  const source = payload.source as Record<string, unknown> | undefined;
  const metadata = (payload.metadata as Record<string, unknown> | undefined) ?? null;

  const createdAtTs = asUnixSeconds(payload.created_at);

  return {
    stable_id: `kommo-unsorted-${uid}`,
    uid,
    source_uid: String(payload.source_uid ?? source?.uid ?? '').trim() || null,
    source_name: String(payload.source_name ?? source?.name ?? '').trim() || null,
    category: String(payload.category ?? '').trim() || null,
    pipeline_id: asNumber(payload.pipeline_id, 0) || null,
    created_at: createdAtTs ? new Date(createdAtTs * 1000).toISOString() : null,
    account_id: asNumber(payload.account_id, 0) || null,
    metadata,
    lead_id: asNumber(embedded?.leads?.[0]?.id, 0) || null,
    contact_id: asNumber(embedded?.contacts?.[0]?.id, 0) || null,
    company_id: asNumber(embedded?.companies?.[0]?.id, 0) || null,
    raw_payload: payload,
  };
}

function mapKommoLinkToTable(payload: Record<string, unknown>) {
  // Accept both shapes:
  // - { from, from_id, to, to_id }
  // - { from, from_id, to_entity_type, to_entity_id }
  // Also accept { from_entity_type, from_entity_id } as fallback.
  const fromEntityType = String(payload.from ?? payload.from_entity_type ?? '');
  const fromEntityId = asNumber(payload.from_id ?? payload.from_entity_id ?? 0, 0);
  const toEntityType = String(payload.to_entity_type ?? payload.to ?? '');
  const toEntityId = asNumber(payload.to_entity_id ?? payload.to_id ?? 0, 0);

  if (!fromEntityType || !fromEntityId || !toEntityType || !toEntityId) {
    return null;
  }

  const stableId = `kommo-link-${fromEntityType}-${fromEntityId}-${toEntityType}-${toEntityId}`;

  const createdAtSeconds = asUnixSeconds(payload.created_at);

  return {
    stable_id: stableId,
    from_entity_type: fromEntityType,
    from_entity_id: fromEntityId,
    to_entity_type: toEntityType,
    to_entity_id: toEntityId,
    link_type: payload.link_type ?? null,
    created_at: createdAtSeconds ? new Date(createdAtSeconds * 1000).toISOString() : null,
  };
}

function mapKommoCustomFieldToTable(payload: Record<string, unknown>) {
  const fieldId = asNumber(payload.id, 0);
  if (!fieldId) {
    return null;
  }

  const entityType = String(payload.entity_type ?? '');
  if (!entityType) {
    return null;
  }

  const createdAtTs = asNumber(payload.created_at, 0);
  const updatedAtTs = asNumber(payload.updated_at, 0);

  return {
    stable_id: `kommo-cf-${entityType}-${fieldId}`,
    business_id: fieldId,
    entity_type: entityType,
    name: payload.name ?? null,
    code: payload.code ?? null,
    field_type: payload.field_type ?? null,
    sort: asNumber(payload.sort, 0) || null,
    is_predefined: payload.is_predefined ?? false,
    is_required: payload.is_required ?? false,
    is_deletable: payload.is_deletable ?? true,
    is_filter_enabled: payload.is_filter_enabled ?? false,
    default_value: payload.default ?? null,
    values: payload.values ?? null,
    checkboxes: payload.checkboxes ?? null,
    created_at: createdAtTs ? new Date(createdAtTs * 1000).toISOString() : null,
    updated_at: updatedAtTs ? new Date(updatedAtTs * 1000).toISOString() : null,
  };
}

function mapKommoEventToTable(payload: Record<string, unknown>) {
  const eventId = asNumber(payload.id, 0);
  if (!eventId) {
    return null;
  }

  const createdAtTs = asNumber(payload.created_at, 0);

  return {
    stable_id: `kommo-event-${eventId}`,
    business_id: eventId,
    type: payload.type ?? null,
    entity_type: payload.entity_type ?? null,
    entity_id: asNumber(payload.entity_id, 0) || null,
    user_id: asNumber(payload.user_id, 0) || null,
    user_name: payload.user_name ?? null,
    created_at: createdAtTs ? new Date(createdAtTs * 1000).toISOString() : null,
    created_by: asNumber(payload.created_by, 0) || null,
    responsible_user_id: asNumber(payload.responsible_user_id, 0) || null,
    metadata: payload.metadata ?? null,
  };
}

function mapKommoCatalogToTable(payload: Record<string, unknown>) {
  const catalogId = asNumber(payload.id, 0);
  if (!catalogId) {
    return null;
  }

  const createdAtTs = asNumber(payload.created_at, 0);
  const updatedAtTs = asNumber(payload.updated_at, 0);

  return {
    stable_id: `kommo-catalog-${catalogId}`,
    business_id: catalogId,
    name: payload.name ?? null,
    catalog_type: payload.catalog_type ?? null,
    has_products: payload.has_products ?? false,
    can_show_in_menu: payload.can_show_in_menu ?? false,
    sort_by: asNumber(payload.sort, 0) || null,
    custom_fields: payload.custom_fields ?? null,
    created_at: createdAtTs ? new Date(createdAtTs * 1000).toISOString() : null,
    updated_at: updatedAtTs ? new Date(updatedAtTs * 1000).toISOString() : null,
  };
}

function mapKommoWebhookConfigToTable(payload: Record<string, unknown>) {
  const webhookId = asNumber(payload.id, 0);
  if (!webhookId) {
    return null;
  }

  const createdAtTs = asNumber(payload.created_at, 0);
  const updatedAtTs = asNumber(payload.updated_at, 0);

  return {
    stable_id: `kommo-webhook-${webhookId}`,
    business_id: webhookId,
    url: payload.url ?? null,
    name: payload.name ?? null,
    events: payload.events ?? null,
    settings: payload.settings ?? null,
    is_active: payload.is_active ?? true,
    created_at: createdAtTs ? new Date(createdAtTs * 1000).toISOString() : null,
    updated_at: updatedAtTs ? new Date(updatedAtTs * 1000).toISOString() : null,
  };
}

function mapKommoSourceToTable(payload: Record<string, unknown>) {
  const sourceId = asNumber(payload.id, 0);
  if (!sourceId) {
    return null;
  }

  return {
    stable_id: `kommo-source-${sourceId}`,
    business_id: sourceId,
    name: payload.name ?? null,
    pipeline_id: asNumber(payload.pipeline_id, 0) || null,
    external_id: payload.external_id ?? null,
    is_default: payload.is_default ?? payload.default ?? false,
    origin_code: payload.origin_code ?? null,
    services: payload.services ?? null,
  };
}

function mapKommoPipelineToTable(payload: Record<string, unknown>) {
  const pipelineId = asNumber(payload.id, 0);
  if (!pipelineId) {
    return null;
  }

  const embedded = payload._embedded as Record<string, unknown> | undefined;

  return {
    stable_id: `kommo-pipeline-${pipelineId}`,
    business_id: pipelineId,
    name: payload.name ?? null,
    sort: asNumber(payload.sort, 0) || null,
    is_main: payload.is_main ?? null,
    is_archive: payload.is_archive ?? null,
    is_unsorted_on: payload.is_unsorted_on ?? null,
    is_deleted: payload.is_deleted ?? false,
    statuses: embedded?.statuses ?? null,
    raw_payload: payload,
  };
}

function mapKommoUnsortedSummaryToTable(payload: Record<string, unknown>) {
  const meta = payload.meta as Record<string, unknown> | undefined;
  const stableId = String(meta?.scope_key ?? '').trim();
  if (!stableId) {
    return null;
  }

  const accountBaseUrlRaw = meta?.account_base_url;
  const accountBaseUrl = typeof accountBaseUrlRaw === 'string' ? accountBaseUrlRaw : null;

  const filters = (meta?.filters as Record<string, unknown> | undefined) ?? null;

  return {
    stable_id: stableId,
    account_base_url: accountBaseUrl,
    total: asNumber(payload.total, 0),
    accepted: asNumber(payload.accepted, 0),
    declined: asNumber(payload.declined, 0),
    average_sort_time: asNumber(payload.average_sort_time, 0),
    categories: payload.categories ?? null,
    filters,
  };
}

function mapKommoLossReasonToTable(payload: Record<string, unknown>) {
  const lossReasonId = asNumber(payload.id, 0);
  if (!lossReasonId) {
    return null;
  }

  const createdAtTs = asNumber(payload.created_at, 0);
  const updatedAtTs = asNumber(payload.updated_at, 0);

  return {
    stable_id: `kommo-loss-reason-${lossReasonId}`,
    business_id: lossReasonId,
    name: payload.name ?? null,
    sort: asNumber(payload.sort, 0) || null,
    created_at: createdAtTs ? new Date(createdAtTs * 1000).toISOString() : null,
    updated_at: updatedAtTs ? new Date(updatedAtTs * 1000).toISOString() : null,
    raw_payload: payload,
  };
}

type WorkItem<T extends Record<string, unknown>> = {
  eventId: string;
  attempts: number;
  row: T;
};

async function bulkUpsertWithFallback<T extends Record<string, unknown>>(
  args: {
    supabase: ReturnType<typeof getSupabaseAdminClient>;
    table: string;
    onConflict: string;
    items: Array<WorkItem<T>>;
    chunkSize?: number;
  },
): Promise<{ okIds: string[]; failed: Array<{ id: string; message: string }>; }> {
  const { supabase, table, onConflict } = args;
  const chunkSize = Math.max(1, Math.min(1000, args.chunkSize ?? DEFAULT_UPSERT_CHUNK_SIZE));

  const okIds: string[] = [];
  const failed: Array<{ id: string; message: string }> = [];

  async function upsertChunk(chunk: Array<WorkItem<T>>): Promise<void> {
    if (chunk.length === 0) return;

    const rows = chunk.map(c => c.row);
    const { error } = await supabase
      .from(table as never)
      .upsert(rows as never, { onConflict });

    if (!error) {
      okIds.push(...chunk.map(c => c.eventId));
      return;
    }

    // Split until we can isolate the failing row(s).
    if (chunk.length === 1) {
      failed.push({ id: chunk[0].eventId, message: error.message || `No se pudo upsert a ${table}` });
      return;
    }

    const mid = Math.ceil(chunk.length / 2);
    await upsertChunk(chunk.slice(0, mid));
    await upsertChunk(chunk.slice(mid));
  }

  for (const chunk of chunkArray(args.items, chunkSize)) {
    await upsertChunk(chunk);
  }

  return { okIds, failed };
}

async function markEventsDone(supabase: ReturnType<typeof getSupabaseAdminClient>, ids: string[]) {
  if (ids.length === 0) return;
  const { error } = await supabase
    .from('kommo_webhook_events' as never)
    .update({ status: 'done', last_error: null } as never)
    .in('id', ids);

  if (error) {
    throw new Error(error.message || 'No se pudo marcar eventos Kommo como done');
  }
}

async function markEventsFailed(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  failed: Array<{ id: string; attempts: number; message: string }>,
) {
  if (failed.length === 0) return;

  // Attempts increment is per-row, so we do per-row updates (should be low volume).
  for (const f of failed) {
    const { error } = await supabase
      .from('kommo_webhook_events' as never)
      .update({
        status: 'failed',
        attempts: (f.attempts ?? 0) + 1,
        last_error: f.message,
      } as never)
      .eq('id', f.id);

    if (error) {
      console.error('Failed marking kommo event as failed:', f.id, error.message);
    }
  }
}

function mapKommoTalkToTable(payload: Record<string, unknown>) {
  const talkId = asNumber(payload.id, 0);
  if (!talkId) {
    return null;
  }

  const createdAtTs = asNumber(payload.created_at, 0);
  const updatedAtTs = asNumber(payload.updated_at, 0);

  return {
    stable_id: `kommo-talk-${talkId}`,
    business_id: talkId,
    talk_type: payload.talk_type ?? null,
    conversation_id: payload.conversation_id ?? null,
    participant_id: asNumber(payload.participant_id, 0) || null,
    request_id: payload.request_id ?? null,
    status: payload.status ?? null,
    created_at: createdAtTs ? new Date(createdAtTs * 1000).toISOString() : null,
    updated_at: updatedAtTs ? new Date(updatedAtTs * 1000).toISOString() : null,
  };
}

async function processEvent(event: KommoEventRow) {
  const supabase = getSupabaseAdminClient();

  if (event.event_type === 'lead.pull' || event.event_type === 'webhook') {
    const mapped = mapKommoLeadToKommoLeads(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar lead_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_leads' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_leads');
    }
    return;
  }

  if (event.event_type === 'contact.pull') {
    const mapped = mapKommoContactToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar contact_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_contacts' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_contacts');
    }
    return;
  }

  if (event.event_type === 'user.pull') {
    const mapped = mapKommoUserToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar user_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_users' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_users');
    }
    return;
  }

  if (event.event_type === 'companie.pull') {
    const mapped = mapKommoCompanyToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar company_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_companies' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_companies');
    }
    return;
  }

  if (event.event_type === 'tag.pull') {
    const mapped = mapKommoTagToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar tag_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_tags' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id,entity_type',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_tags');
    }
    return;
  }

  if (event.event_type === 'task.pull') {
    const mapped = mapKommoTaskToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar task_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_tasks' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_tasks');
    }
    return;
  }

  if (event.event_type === 'note.pull') {
    const mapped = mapKommoNoteToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar note_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_notes' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_notes');
    }
    return;
  }

  if (event.event_type === 'call.pull') {
    const mapped = mapKommoCallToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar call_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_calls' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_calls');
    }
    return;
  }

  // NEW: Event types for additional resources
  if (event.event_type === 'event.pull') {
    const mapped = mapKommoEventToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar event_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_events' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_events');
    }
    return;
  }

  if (event.event_type === 'catalog.pull') {
    const mapped = mapKommoCatalogToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar catalog_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_catalogs' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_catalogs');
    }
    return;
  }

  if (event.event_type === 'unsorted.pull') {
    const mapped = mapKommoUnsortedLeadToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar uid de unsorted desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_unsorted_leads' as never).upsert(
      mapped as never,
      {
        onConflict: 'uid',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_unsorted_leads');
    }
    return;
  }

  if (event.event_type === 'link.pull') {
    const mapped = mapKommoLinkToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar link desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_links' as never).upsert(
      mapped as never,
      {
        onConflict: 'stable_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_links');
    }
    return;
  }

  if (event.event_type === 'custom_field.pull') {
    const mapped = mapKommoCustomFieldToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar custom_field_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_custom_fields' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_custom_fields');
    }
    return;
  }

  if (event.event_type === 'webhook.pull') {
    const mapped = mapKommoWebhookConfigToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar webhook_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_webhooks' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_webhooks');
    }
    return;
  }

  if (event.event_type === 'talk.pull') {
    const mapped = mapKommoTalkToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar talk_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_talks' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_talks');
    }
    return;
  }

  if (event.event_type === 'source.pull') {
    const mapped = mapKommoSourceToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar source_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_sources' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_sources');
    }
    return;
  }

  if (event.event_type === 'pipeline.pull') {
    const mapped = mapKommoPipelineToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar pipeline_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_pipelines' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_pipelines');
    }
    return;
  }

  if (event.event_type === 'loss_reason.pull') {
    const mapped = mapKommoLossReasonToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar loss_reason_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_loss_reasons' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_loss_reasons');
    }
    return;
  }

  if (event.event_type === 'unsorted.summary.pull') {
    const mapped = mapKommoUnsortedSummaryToTable(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar stable_id de unsorted summary desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('kommo_unsorted_summary' as never).upsert(
      mapped as never,
      {
        onConflict: 'stable_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a kommo_unsorted_summary');
    }
    return;
  }

  throw new Error(`Tipo de evento no soportado: ${event.event_type}`);
}

export default async function kommoProcessEventsHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const secretAuthorized = isSecretAuthorized(req, PROCESS_SECRET_ENV, PROCESS_SECRET_HEADER);
    const cronAuthorized = isVercelCronAuthorized(req);
    if (!secretAuthorized && !cronAuthorized) {
      const auth = verifyAdminSession(req);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error ?? 'No autorizado' });
      }
    }

    const limitQuery = Array.isArray(req.query.limit) ? req.query.limit[0] : req.query.limit;
    const limit = Math.max(1, Math.min(500, Number(limitQuery ?? DEFAULT_LIMIT) || DEFAULT_LIMIT));

    // Check if should loop until all processed
    const loopParam = asSingleQueryParam(req.query.loop);
    const shouldLoop = loopParam === 'true' || loopParam === '1';

    const supabase = getSupabaseAdminClient();
    
    let totalProcessed = 0;
    let totalFailed = 0;
    let iterations = 0;
    const maxIterations = 10; // Max loops to prevent infinite running

    // Loop until no more pending events or max iterations reached
    while (iterations < maxIterations) {
      iterations++;
      
      const { data, error } = await supabase
        .from('kommo_webhook_events' as never)
        .select('id,account_base_url,event_type,payload,attempts')
        .eq('status', 'pending')
        .order('created_at', { ascending: true })
        .limit(limit);

      if (error) {
        throw new Error(error.message || 'No se pudo leer cola de eventos Kommo');
      }

      const events = (data ?? []) as KommoEventRow[];
      
      if (events.length === 0) {
        break; // No more pending events
      }

      // Lock the batch in a single update.
      const eventIds = events.map(e => e.id);
      const { data: lockedRows, error: lockError } = await supabase
        .from('kommo_webhook_events' as never)
        .update({ status: 'processing', last_error: null } as never)
        .in('id', eventIds)
        .eq('status', 'pending')
        .select('id,account_base_url,event_type,payload,attempts');

      if (lockError) {
        throw new Error(lockError.message || 'No se pudo lockear eventos Kommo');
      }

      const lockedEvents = (lockedRows ?? []) as KommoEventRow[];
      if (lockedEvents.length === 0) {
        // Another worker took them.
        if (!shouldLoop) break;
        continue;
      }

      const failures: Array<{ id: string; attempts: number; message: string }> = [];
      const doneIds: string[] = [];

      const groups = groupBy(lockedEvents, e => e.event_type);

      for (const [eventType, group] of groups.entries()) {
        const attemptsById = new Map<string, number>();
        for (const ev of group) attemptsById.set(ev.id, ev.attempts ?? 0);

        try {
          // Special case: leads primary sink is kommo_leads
          if (eventType === 'lead.pull' || eventType === 'webhook') {
            const mappedItems: Array<WorkItem<Record<string, unknown>>> = [];

            for (const ev of group) {
              const mapped = mapKommoLeadToKommoLeads(ev.payload);
              if (!mapped) {
                failures.push({ id: ev.id, attempts: ev.attempts, message: 'No se pudo derivar lead_id desde payload de Kommo' });
                continue;
              }
              mappedItems.push({ eventId: ev.id, attempts: ev.attempts, row: mapped as unknown as Record<string, unknown> });
            }

            const { okIds, failed } = await bulkUpsertWithFallback({
              supabase,
              table: 'kommo_leads',
              onConflict: 'business_id',
              items: mappedItems,
            });

            doneIds.push(...okIds);
            failures.push(...failed.map(f => {
              return { id: f.id, attempts: attemptsById.get(f.id) ?? 0, message: f.message };
            }));
            continue;
          }

          // Generic mapper-based upserts
          const processMapped = async (table: string, onConflict: string, mapper: (p: Record<string, unknown>) => Record<string, unknown> | null) => {
            const items: Array<WorkItem<Record<string, unknown>>> = [];
            for (const ev of group) {
              const mapped = mapper(ev.payload);
              if (!mapped) {
                failures.push({ id: ev.id, attempts: ev.attempts, message: `No se pudo mapear payload para ${eventType}` });
                continue;
              }
              items.push({ eventId: ev.id, attempts: ev.attempts, row: mapped });
            }

            const { okIds, failed } = await bulkUpsertWithFallback({ supabase, table, onConflict, items });
            doneIds.push(...okIds);
            failures.push(...failed.map(f => {
              return { id: f.id, attempts: attemptsById.get(f.id) ?? 0, message: f.message };
            }));
          };

          if (eventType === 'contact.pull') {
            await processMapped('kommo_contacts', 'business_id', mapKommoContactToTable);
          } else if (eventType === 'user.pull') {
            await processMapped('kommo_users', 'business_id', mapKommoUserToTable);
          } else if (eventType === 'companie.pull') {
            await processMapped('kommo_companies', 'business_id', mapKommoCompanyToTable);
          } else if (eventType === 'tag.pull') {
            await processMapped('kommo_tags', 'business_id,entity_type', mapKommoTagToTable);
          } else if (eventType === 'task.pull') {
            await processMapped('kommo_tasks', 'business_id', mapKommoTaskToTable);
          } else if (eventType === 'note.pull') {
            await processMapped('kommo_notes', 'business_id', mapKommoNoteToTable);
          } else if (eventType === 'call.pull') {
            await processMapped('kommo_calls', 'business_id', mapKommoCallToTable);
          } else if (eventType === 'event.pull') {
            await processMapped('kommo_events', 'business_id', mapKommoEventToTable);
          } else if (eventType === 'catalog.pull') {
            await processMapped('kommo_catalogs', 'business_id', mapKommoCatalogToTable);
          } else if (eventType === 'unsorted.pull') {
            await processMapped('kommo_unsorted_leads', 'uid', mapKommoUnsortedLeadToTable);
          } else if (eventType === 'link.pull') {
            await processMapped('kommo_links', 'stable_id', mapKommoLinkToTable);
          } else if (eventType === 'custom_field.pull') {
            await processMapped('kommo_custom_fields', 'business_id', mapKommoCustomFieldToTable);
          } else if (eventType === 'webhook.pull') {
            await processMapped('kommo_webhooks', 'business_id', mapKommoWebhookConfigToTable);
          } else if (eventType === 'talk.pull') {
            await processMapped('kommo_talks', 'business_id', mapKommoTalkToTable);
          } else if (eventType === 'source.pull') {
            await processMapped('kommo_sources', 'business_id', mapKommoSourceToTable);
          } else if (eventType === 'loss_reason.pull') {
            await processMapped('kommo_loss_reasons', 'business_id', mapKommoLossReasonToTable);
          } else if (eventType === 'pipeline.pull') {
            await processMapped('kommo_pipelines', 'business_id', mapKommoPipelineToTable);
          } else if (eventType === 'unsorted.summary.pull') {
            await processMapped('kommo_unsorted_summary', 'stable_id', mapKommoUnsortedSummaryToTable);
          } else {
            // Unknown event type → mark all failed
            for (const ev of group) {
              failures.push({ id: ev.id, attempts: ev.attempts, message: `Tipo de evento no soportado: ${eventType}` });
            }
          }
        } catch (e: unknown) {
          // If the whole group blows up, fall back to per-row processing.
          console.error(`Batch processing failed for ${eventType}, falling back to per-row`, e);
          for (const ev of group) {
            try {
              await processEvent(ev);
              doneIds.push(ev.id);
            } catch (eventError: unknown) {
              const message = eventError instanceof Error ? eventError.message : 'Error procesando evento Kommo';
              failures.push({ id: ev.id, attempts: ev.attempts, message });
            }
          }
        }
      }

      // Persist event statuses in bulk
      const failedIdSet = new Set(failures.map(f => f.id));
      const uniqueDoneIds = Array.from(new Set(doneIds.filter(id => !failedIdSet.has(id))));

      try {
        await markEventsDone(supabase, uniqueDoneIds);
      } catch (e: unknown) {
        const message = e instanceof Error ? e.message : 'Error marcando eventos Kommo como done';
        console.error(message);
        // Requeue as pending so they can be retried (upserts are idempotent).
        const { error: requeueError } = await supabase
          .from('kommo_webhook_events' as never)
          .update({ status: 'pending', last_error: message } as never)
          .in('id', uniqueDoneIds);
        if (requeueError) {
          console.error('Failed requeueing kommo events after done-mark error:', requeueError.message);
        }
      }

      await markEventsFailed(supabase, failures);

      totalProcessed += uniqueDoneIds.length;
      totalFailed += failures.length;

      // Si no se quiere hacer loop, o si no se procesó ningún evento (para evitar loops vacíos), salimos.
      if (!shouldLoop) {
        break;
      }

      // Pequeña pausa para evitar sobrecargar la base de datos en caso de muchos eventos.
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    return res.status(200).json({
      success: true,
      iterations,
      processed: totalProcessed,
      failed: totalFailed,
    });
  } catch (error: unknown) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
