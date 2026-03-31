import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient, isSecretAuthorized, isVercelCronAuthorized, verifyAdminSession } from './_shared.js';

const PROCESS_SECRET_HEADER = 'x-kommo-process-secret';
const PROCESS_SECRET_ENV = 'KOMMO_PROCESS_SECRET';
const DEFAULT_LIMIT = 50;

interface KommoEventRow {
  id: string;
  account_base_url: string | null;
  event_type: string;
  payload: Record<string, unknown>;
  attempts: number;
}

function asNumber(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function getLeadIdFromPayload(payload: Record<string, unknown>) {
  const id = payload.id;
  const parsed = asNumber(id, 0);
  return parsed > 0 ? parsed : null;
}

function getLeadDateFromPayload(payload: Record<string, unknown>, field: 'created_at' | 'updated_at') {
  const raw = payload[field];
  const seconds = asNumber(raw, 0);
  if (!seconds) return null;
  return new Date(seconds * 1000).toISOString().slice(0, 10);
}

function findNumberCustomField(payload: Record<string, unknown>, codeCandidates: string[]) {
  const embedded = payload._embedded as { custom_fields_values?: Array<Record<string, unknown>> } | undefined;
  const customFields = embedded?.custom_fields_values ?? [];

  for (const field of customFields) {
    const fieldCode = String(field.field_code ?? '').toUpperCase();
    if (!fieldCode || !codeCandidates.includes(fieldCode)) continue;

    const values = field.values as Array<Record<string, unknown>> | undefined;
    const first = values?.[0];
    const parsed = Number(first?.value ?? 0);
    if (Number.isFinite(parsed)) return parsed;
  }

  return 0;
}

function mapKommoLeadToLeadGanado(payload: Record<string, unknown>) {
  const leadId = getLeadIdFromPayload(payload);
  if (!leadId) {
    return null;
  }

  const responsibleUserId = asNumber(payload.responsible_user_id, 0);
  const createdAt = getLeadDateFromPayload(payload, 'created_at');
  const updatedAt = getLeadDateFromPayload(payload, 'updated_at');

  const cantidadEnvios = Math.max(0, Math.round(findNumberCustomField(payload, ['CANTIDAD_ENVIOS', 'QTY_ENVIOS'])));
  const anulados = Math.max(0, Math.round(findNumberCustomField(payload, ['ANULADOS_FULLFILMENT', 'ANULADOS_FULL'])));
  const ingresoAnulados = anulados * 2;

  return {
    stable_id: `kommo-lead-${leadId}`,
    business_id: leadId,
    id_tienda: null,
    id_vendedor: responsibleUserId > 0 ? responsibleUserId : null,
    fecha_ingreso_lead: createdAt,
    fecha_registro_lead: updatedAt ?? createdAt,
    fecha_lead_ganado: updatedAt ?? createdAt,
    dias_lead_a_registro: 0,
    dias_registro_a_ganado: 0,
    dias_lead_a_ganado: 0,
    id_fullfilment: null,
    notas: String(payload.name ?? 'Lead Kommo'),
    distrito: null,
    cantidad_envios: cantidadEnvios,
    id_origen: null,
    anulados_fullfilment: anulados,
    ingreso_anulados_fullfilment: ingresoAnulados,
  };
}

function mapKommoLeadToKommoLeads(payload: Record<string, unknown>) {
  const leadId = asNumber(payload.id, 0);
  if (!leadId) {
    return null;
  }

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
    closed_at: closedAtTs ? new Date(closedAtTs * 1000).toISOString() : null,
    status_id: asNumber(payload.status_id, 0) || null,
    account_id: asNumber(payload.account_id, 0) || null,
    created_by: asNumber(payload.created_by, 0) || null,
    is_deleted: payload.is_deleted ?? false,
    labor_cost: asNumber(payload.labor_cost, 0) || null,
    updated_by: asNumber(payload.updated_by, 0) || null,
    pipeline_id: asNumber(payload.pipeline_id, 0) || null,
    loss_reason_id: asNumber(payload.loss_reason_id, 0) || null,
    closest_task_at: closestTaskAtTs ? new Date(closestTaskAtTs * 1000).toISOString() : null,
    responsible_user_id: asNumber(payload.responsible_user_id, 0) || null,
    custom_fields_values: payload.custom_fields_values ?? null,
    embedded_data: embedded ? { tags: embedded.tags, companies: embedded.companies } : null,
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

  return {
    stable_id: `kommo-tag-${tagId}`,
    business_id: tagId,
    name: payload.name ?? null,
    color: payload.color ?? null,
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
  const completeTillTs = asNumber(payload.complete_till, 0);
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
    complete_till: completeTillTs ? new Date(completeTillTs * 1000).toISOString() : null,
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

  return {
    stable_id: `kommo-note-${noteId}`,
    business_id: noteId,
    note_type: payload.note_type ?? null,
    body: payload.body ?? null,
    element_type: payload.element_type ?? null,
    element_id: asNumber(payload.element_id, 0) || null,
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

async function processEvent(event: KommoEventRow) {
  const supabase = getSupabaseAdminClient();

  if (event.event_type === 'lead.pull' || event.event_type === 'webhook') {
    const mapped = mapKommoLeadToLeadGanado(event.payload);
    if (!mapped) {
      throw new Error('No se pudo derivar lead_id desde payload de Kommo');
    }

    const { error: upsertError } = await supabase.from('leads_ganados' as never).upsert(
      mapped as never,
      {
        onConflict: 'business_id',
      },
    );

    if (upsertError) {
      throw new Error(upsertError.message || 'No se pudo upsert a leads_ganados');
    }

    // Also save to kommo_leads with all fields
    const mappedFull = mapKommoLeadToKommoLeads(event.payload);
    if (mappedFull) {
      const { error: upsertFullError } = await supabase.from('kommo_leads' as never).upsert(
        mappedFull as never,
        {
          onConflict: 'business_id',
        },
      );

      if (upsertFullError) {
        console.error('Error upserting to kommo_leads:', upsertFullError.message);
      }
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
        onConflict: 'business_id',
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
    const limit = Math.max(1, Math.min(2000, Number(limitQuery ?? DEFAULT_LIMIT) || DEFAULT_LIMIT));

    const supabase = getSupabaseAdminClient();
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

    let processed = 0;
    let failed = 0;

    for (const event of events) {
      const { data: lockRows, error: lockError } = await supabase
        .from('kommo_webhook_events' as never)
        .update({ status: 'processing', last_error: null } as never)
        .eq('id', event.id)
        .eq('status', 'pending')
        .select('id')
        .limit(1);

      if (lockError || !lockRows || lockRows.length === 0) {
        continue;
      }

      try {
        await processEvent(event);

        const { error: doneError } = await supabase
          .from('kommo_webhook_events' as never)
          .update({ status: 'done', last_error: null } as never)
          .eq('id', event.id);

        if (doneError) {
          throw new Error(doneError.message || 'No se pudo marcar evento Kommo como done');
        }

        processed += 1;
      } catch (eventError: unknown) {
        const message = eventError instanceof Error ? eventError.message : 'Error procesando evento Kommo';

        await supabase
          .from('kommo_webhook_events' as never)
          .update({
            status: 'failed',
            attempts: (event.attempts ?? 0) + 1,
            last_error: message,
          } as never)
          .eq('id', event.id);

        failed += 1;
      }
    }

    return res.status(200).json({
      success: true,
      fetched: events.length,
      processed,
      failed,
    });
  } catch (error: unknown) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
