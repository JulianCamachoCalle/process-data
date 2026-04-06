import type { SupabaseClient } from '@supabase/supabase-js';

type JsonObject = Record<string, unknown>;

type KommoLeadRow = {
  business_id: number;
  name: string | null;
  pipeline_id: number | null;
  status_id: number | null;
  created_at: string | null;
  closed_at: string | null;
  tags: unknown;
  raw_payload: unknown;
};

type KommoPipelineStatusRow = {
  pipeline_id: number;
  business_id: number;
  name: string | null;
};

type KommoPipelineRow = {
  business_id: number;
  name: string | null;
};

type KommoUnsortedLeadRow = {
  lead_id: number | null;
  created_at: string | null;
};

const WON_STATUS_REGEX = /(ganad|closed\s*-?\s*won|\bwon\b|success|exito|éxito)/i;
const LOST_STATUS_REGEX = /(lost|perdid|cancel|anulad|rechaz|fail|fallid)/i;

const DISTRITO_OPTIONS = [
  'Ancón',
  'Ate',
  'Barranco',
  'Breña',
  'Carabayllo',
  'Chaclacayo',
  'Chorrillos',
  'Cieneguilla',
  'Comas',
  'El Agustino',
  'Independencia',
  'Jesús María',
  'La Molina',
  'La Victoria',
  'Lima (Cercado)',
  'Lince',
  'Los Olivos',
  'Lurigancho-Chosica',
  'Lurín',
  'Magdalena del Mar',
  'Miraflores',
  'Pachacámac',
  'Pucusana',
  'Pueblo Libre',
  'Puente Piedra',
  'Punta Hermosa',
  'Punta Negra',
  'Rímac',
  'San Bartolo',
  'San Borja',
  'San Isidro',
  'San Juan de Lurigancho',
  'San Juan de Miraflores',
  'San Luis',
  'San Martín de Porres',
  'San Miguel',
  'Santa Anita',
  'Santa María del Mar',
  'Santa Rosa',
  'Santiago de Surco',
  'Surquillo',
  'Villa El Salvador',
  'Villa María del Triunfo',
  'Callao',
  'Bellavista',
  'Carmen de la Legua-Reynoso',
  'La Perla',
  'La Punta',
  'Ventanilla',
  'Mi Perú',
] as const;

const NORMALIZED_DISTRITO_MAP = new Map(
  DISTRITO_OPTIONS.map((value) => [normalizeText(value), value] as const),
);

function normalizeText(value: unknown): string {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function toDateOnlyIso(value: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function diffDays(fromIso: string, toIso: string): number {
  if (!fromIso || !toIso) return 0;
  const fromDate = new Date(`${fromIso}T00:00:00Z`);
  const toDate = new Date(`${toIso}T00:00:00Z`);
  if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) return 0;
  return Math.round((toDate.getTime() - fromDate.getTime()) / 86_400_000);
}

function asArray(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  return [];
}

function extractTagNamesFromUnknown(value: unknown): string[] {
  const tags = asArray(value);
  const names: string[] = [];

  for (const tag of tags) {
    if (typeof tag === 'string') {
      const clean = tag.trim();
      if (clean) names.push(clean);
      continue;
    }

    if (tag && typeof tag === 'object') {
      const candidate = (tag as JsonObject).name;
      const clean = String(candidate ?? '').trim();
      if (clean) names.push(clean);
    }
  }

  return names;
}

export function extractLeadTagNames(lead: Pick<KommoLeadRow, 'tags' | 'raw_payload'>): string[] {
  const direct = extractTagNamesFromUnknown(lead.tags);
  if (direct.length > 0) {
    return direct;
  }

  if (lead.raw_payload && typeof lead.raw_payload === 'object') {
    const embedded = (lead.raw_payload as JsonObject)._embedded;
    if (embedded && typeof embedded === 'object') {
      return extractTagNamesFromUnknown((embedded as JsonObject).tags);
    }
  }

  return [];
}

function inferDistritoFromTags(tags: string[]): string {
  for (const tag of tags) {
    const normalizedTag = normalizeText(tag);
    for (const [normalizedDistrito, distrito] of NORMALIZED_DISTRITO_MAP.entries()) {
      if (normalizedTag === normalizedDistrito || normalizedTag.includes(normalizedDistrito)) {
        return distrito;
      }
    }
  }

  return '';
}

function inferOrigenFromTags(tags: string[]): string {
  const normalizedTags = tags.map(normalizeText);

  if (normalizedTags.some((tag) => tag.includes('saliente') || tag.includes('outbound'))) {
    return 'Saliente';
  }

  return 'Entrante';
}

function inferFullfilmentFromTags(tags: string[]): boolean {
  return tags.some((tag) => normalizeText(tag).includes('fullfilment'));
}

export function isWonLead(args: {
  lead: Pick<KommoLeadRow, 'status_id' | 'closed_at'>;
  statusName: string | null;
}): boolean {
  const statusName = args.statusName ?? '';
  const normalizedStatus = normalizeText(statusName);

  if (LOST_STATUS_REGEX.test(normalizedStatus)) {
    return false;
  }

  if (WON_STATUS_REGEX.test(normalizedStatus)) {
    return true;
  }

  // Heurística estándar de Kommo/amoCRM: 142 suele representar "ganado".
  if (Number(args.lead.status_id ?? 0) === 142) {
    return true;
  }

  // Si no pudimos resolver nombre de estado, closed_at por sí solo NO garantiza "ganado".
  return false;
}

export async function syncLeadsGanadosFromKommoLeadIds(
  supabase: SupabaseClient,
  leadIdsInput: number[],
) {
  const leadIds = Array.from(new Set(leadIdsInput.map((value) => Math.trunc(Number(value))).filter((value) => value > 0)));
  if (leadIds.length === 0) {
    return { processed: 0, upserted: 0 };
  }

  const { data: leadsData, error: leadsError } = await supabase
    .from('kommo_leads' as never)
    .select('business_id,name,pipeline_id,status_id,created_at,closed_at,tags,raw_payload')
    .in('business_id', leadIds);

  if (leadsError) {
    throw new Error(leadsError.message || 'No se pudieron leer leads de Kommo para auto-sync de leads ganados');
  }

  const leads = (leadsData ?? []) as KommoLeadRow[];
  if (leads.length === 0) {
    return { processed: 0, upserted: 0 };
  }

  const pipelineIds = Array.from(new Set(leads.map((lead) => Number(lead.pipeline_id ?? 0)).filter((id) => id > 0)));
  const statusIds = Array.from(new Set(leads.map((lead) => Number(lead.status_id ?? 0)).filter((id) => id > 0)));

  let statuses: KommoPipelineStatusRow[] = [];
  if (pipelineIds.length > 0 && statusIds.length > 0) {
    const { data: statusesData, error: statusesError } = await supabase
      .from('kommo_pipeline_statuses' as never)
      .select('pipeline_id,business_id,name')
      .in('pipeline_id', pipelineIds)
      .in('business_id', statusIds);

    if (statusesError) {
      throw new Error(statusesError.message || 'No se pudieron leer estados de pipeline de Kommo');
    }

    statuses = (statusesData ?? []) as KommoPipelineStatusRow[];
  }

  const statusNameByPipelineAndStatus = new Map<string, string>();
  for (const status of statuses) {
    const key = `${Number(status.pipeline_id)}:${Number(status.business_id)}`;
    statusNameByPipelineAndStatus.set(key, String(status.name ?? ''));
  }

  let pipelines: KommoPipelineRow[] = [];
  if (pipelineIds.length > 0) {
    const { data: pipelinesData, error: pipelinesError } = await supabase
      .from('kommo_pipelines' as never)
      .select('business_id,name')
      .in('business_id', pipelineIds);

    if (pipelinesError) {
      throw new Error(pipelinesError.message || 'No se pudieron leer pipelines de Kommo');
    }

    pipelines = (pipelinesData ?? []) as KommoPipelineRow[];
  }

  const pipelineNameById = new Map<number, string>();
  for (const pipeline of pipelines) {
    pipelineNameById.set(Number(pipeline.business_id), String(pipeline.name ?? '').trim());
  }

  const { data: unsortedData, error: unsortedError } = await supabase
    .from('kommo_unsorted_leads' as never)
    .select('lead_id,created_at')
    .in('lead_id', leadIds)
    .order('created_at', { ascending: true });

  if (unsortedError) {
    throw new Error(unsortedError.message || 'No se pudieron leer fechas de ingreso desde kommo_unsorted_leads');
  }

  const unsortedRows = (unsortedData ?? []) as KommoUnsortedLeadRow[];
  const ingresoLeadDateByLeadId = new Map<number, string>();
  for (const row of unsortedRows) {
    const leadId = Number(row.lead_id ?? 0);
    if (leadId <= 0 || ingresoLeadDateByLeadId.has(leadId)) continue;
    ingresoLeadDateByLeadId.set(leadId, toDateOnlyIso(row.created_at));
  }

  const rowsToUpsert: Array<Record<string, unknown>> = [];

  const { data: existingLeadsGanadosData, error: existingLeadsGanadosError } = await supabase
    .from('leads_ganados' as never)
    .select('kommo_lead_id,tienda_nombre_snapshot,vendedor_nombre_snapshot,pipeline_id_snapshot,origen_snapshot,fullfilment_snapshot,distrito')
    .in('kommo_lead_id', leadIds);

  if (existingLeadsGanadosError) {
    throw new Error(existingLeadsGanadosError.message || 'No se pudieron leer leads_ganados existentes para preservar snapshots');
  }

  const existingByKommoLeadId = new Map<
    number,
    {
      tienda_nombre_snapshot: string | null;
      vendedor_nombre_snapshot: string | null;
      pipeline_id_snapshot: number | null;
      origen_snapshot: string | null;
      fullfilment_snapshot: boolean | null;
      distrito: string | null;
    }
  >();

  for (const row of ((existingLeadsGanadosData ?? []) as Array<{
    kommo_lead_id: number | null;
    tienda_nombre_snapshot: string | null;
    vendedor_nombre_snapshot: string | null;
    pipeline_id_snapshot: number | null;
    origen_snapshot: string | null;
    fullfilment_snapshot: boolean | null;
    distrito: string | null;
  }>)) {
    const kommoLeadId = Number(row.kommo_lead_id ?? 0);
    if (kommoLeadId <= 0) continue;
    existingByKommoLeadId.set(kommoLeadId, {
      tienda_nombre_snapshot: row.tienda_nombre_snapshot,
      vendedor_nombre_snapshot: row.vendedor_nombre_snapshot,
      pipeline_id_snapshot: row.pipeline_id_snapshot,
      origen_snapshot: row.origen_snapshot,
      fullfilment_snapshot: row.fullfilment_snapshot,
      distrito: row.distrito,
    });
  }

  for (const lead of leads) {
    const leadId = Number(lead.business_id);
    const pipelineId = Number(lead.pipeline_id ?? 0);
    const statusId = Number(lead.status_id ?? 0);
    const statusName = statusNameByPipelineAndStatus.get(`${pipelineId}:${statusId}`) ?? null;

    if (!isWonLead({ lead, statusName })) {
      continue;
    }

    const fechaIngresoLead = ingresoLeadDateByLeadId.get(leadId) ?? toDateOnlyIso(lead.created_at);
    const fechaLeadGanado = toDateOnlyIso(lead.closed_at);
    const tags = extractLeadTagNames(lead);
    const existing = existingByKommoLeadId.get(leadId);

    const tiendaNombreSnapshotComputed = String(lead.name ?? '').trim() || 'Lead sin nombre';
    const vendedorNombreSnapshotComputed = pipelineNameById.get(pipelineId) ?? '';
    const pipelineIdSnapshotComputed = pipelineId > 0 ? pipelineId : null;
    const origenSnapshotComputed = inferOrigenFromTags(tags);
    const fullfilmentSnapshotComputed = inferFullfilmentFromTags(tags);
    const distritoComputed = inferDistritoFromTags(tags);
    const existingDistrito = String(existing?.distrito ?? '').trim();

    rowsToUpsert.push({
      kommo_lead_id: leadId,
      tienda_nombre_snapshot: existing?.tienda_nombre_snapshot || tiendaNombreSnapshotComputed,
      vendedor_nombre_snapshot: existing?.vendedor_nombre_snapshot || vendedorNombreSnapshotComputed,
      pipeline_id_snapshot: existing?.pipeline_id_snapshot ?? pipelineIdSnapshotComputed,
      origen_snapshot: existing?.origen_snapshot || origenSnapshotComputed,
      fullfilment_snapshot: existing?.fullfilment_snapshot ?? fullfilmentSnapshotComputed,
      // Preserva edición manual cuando ya existe valor; sólo autocompleta si está vacío.
      distrito: existingDistrito || distritoComputed,
      fecha_ingreso_lead: fechaIngresoLead,
      fecha_lead_ganado: fechaLeadGanado,
      dias_lead_a_ganado: diffDays(fechaIngresoLead, fechaLeadGanado),
    });
  }

  if (rowsToUpsert.length === 0) {
    return { processed: leads.length, upserted: 0 };
  }

  const { error: upsertError } = await supabase
    .from('leads_ganados' as never)
    .upsert(rowsToUpsert as never, { onConflict: 'kommo_lead_id' });

  if (upsertError) {
    throw new Error(upsertError.message || 'No se pudo upsert a leads_ganados desde Kommo');
  }

  return {
    processed: leads.length,
    upserted: rowsToUpsert.length,
  };
}

function isAnuladoResultado(resultado: string): boolean {
  const normalized = normalizeText(resultado);
  return (
    normalized.includes('anulado') ||
    normalized.includes('cancelado') ||
    normalized.includes('no entregado') ||
    normalized.includes('no_entregado') ||
    normalized.includes('noentregado')
  );
}

export async function recalculateLeadGanadoCountersByBusinessId(
  supabase: SupabaseClient,
  leadGanadoBusinessIdInput: number,
) {
  const leadGanadoBusinessId = Math.trunc(Number(leadGanadoBusinessIdInput));
  if (!Number.isFinite(leadGanadoBusinessId) || leadGanadoBusinessId <= 0) {
    return { updated: false };
  }

  const { data: enviosData, error: enviosError } = await supabase
    .from('envios' as never)
    .select('id_resultado')
    .eq('id_lead_ganado', leadGanadoBusinessId);

  if (enviosError) {
    throw new Error(enviosError.message || 'No se pudieron leer envíos para recalcular lead ganado');
  }

  const envios = ((enviosData ?? []) as Array<{ id_resultado: number | null }>);
  const cantidadEnvios = envios.length;
  const resultadoIds = Array.from(new Set(envios.map((row) => Number(row.id_resultado ?? 0)).filter((id) => id > 0)));

  const resultadoById = new Map<number, string>();
  if (resultadoIds.length > 0) {
    const { data: resultadosData, error: resultadosError } = await supabase
      .from('resultados' as never)
      .select('business_id,resultado')
      .in('business_id', resultadoIds);

    if (resultadosError) {
      throw new Error(resultadosError.message || 'No se pudieron leer resultados para recalcular lead ganado');
    }

    for (const row of ((resultadosData ?? []) as Array<{ business_id: number; resultado: string | null }>)) {
      resultadoById.set(Number(row.business_id), String(row.resultado ?? ''));
    }
  }

  let anuladosFullfilment = 0;
  for (const envio of envios) {
    const resultText = resultadoById.get(Number(envio.id_resultado ?? 0)) ?? '';
    if (isAnuladoResultado(resultText)) {
      anuladosFullfilment += 1;
    }
  }

  const ingresoAnuladosFullfilment = anuladosFullfilment * 2;

  const { error: updateError } = await supabase
    .from('leads_ganados' as never)
    .update({
      cantidad_envios: cantidadEnvios,
      anulados_fullfilment: anuladosFullfilment,
      ingreso_anulados_fullfilment: ingresoAnuladosFullfilment,
    } as never)
    .eq('business_id', leadGanadoBusinessId);

  if (updateError) {
    throw new Error(updateError.message || 'No se pudo actualizar contadores de lead ganado');
  }

  return {
    updated: true,
    cantidadEnvios,
    anuladosFullfilment,
    ingresoAnuladosFullfilment,
  };
}

export function extractLeadGanadoBusinessIdsFromEnvioPayload(payload: unknown): number[] {
  const asObject = payload && typeof payload === 'object' ? (payload as JsonObject) : null;
  const oldRow = asObject?.old && typeof asObject.old === 'object' ? (asObject.old as JsonObject) : null;
  const newRow = asObject?.new && typeof asObject.new === 'object' ? (asObject.new as JsonObject) : null;

  const candidates = [oldRow?.id_lead_ganado, newRow?.id_lead_ganado]
    .map((value) => Math.trunc(Number(value ?? 0)))
    .filter((value) => Number.isFinite(value) && value > 0);

  return Array.from(new Set(candidates));
}
