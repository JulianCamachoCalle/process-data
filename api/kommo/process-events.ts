import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient, isSecretAuthorized, isVercelCronAuthorized, verifyAdminSession } from './_shared';

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

async function processEvent(event: KommoEventRow) {
  if (event.event_type !== 'lead.pull' && event.event_type !== 'webhook') {
    throw new Error(`Tipo de evento no soportado: ${event.event_type}`);
  }

  const supabase = getSupabaseAdminClient();
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
    const limit = Math.max(1, Math.min(200, Number(limitQuery ?? DEFAULT_LIMIT) || DEFAULT_LIMIT));

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
