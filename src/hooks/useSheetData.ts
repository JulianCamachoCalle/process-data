import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import { normalizeText, parseNumericValue } from '../lib/tableHelpers';
import { DISTRITO_OPTIONS } from '../lib/distritos';

export interface SheetRow extends Record<string, string | number | boolean | null | undefined> {
  _id: string;
  _rowNumber?: number;
}

export interface SheetData {
  columns: string[];
  rows: SheetRow[];
}

interface MutationRowResponse {
  success?: boolean;
  row?: SheetRow;
  deletedId?: string;
}

type UpdateMutationPayload = Record<string, unknown> & {
  _id: string;
  _rowNumber?: number;
};

type DeleteMutationPayload = {
  rowId: string;
  rowNumber?: number | null;
};

type Row = Record<string, unknown>;

interface BaseSupabaseRecord {
  stable_id: string;
  business_id: number;
}

type BaseSupabaseRecordRaw = BaseSupabaseRecord & Record<string, unknown>;

interface BaseSheetMapConfig {
  table: string;
  columns: readonly [string, string];
  dbTextField: string;
  rowTextField: string;
}

interface TarifaRecord {
  stable_id: string;
  business_id: number;
  id_destino: number;
  cobro_entrega: number;
  pago_moto: number;
  notas: string | null;
}

interface EnvioRecord {
  stable_id: string;
  business_id: number;
  fecha_envio: string | null;
  id_destino: number;
  id_resultado: number;
  cobro_entrega: number;
  pago_moto: number;
  excedente_pagado_moto: number | null;
  ingreso_total_fila: number;
  costo_total_fila: number;
  observaciones: string | null;
  id_lead_ganado: number;
  id_tipo_punto: number;
  extra_punto_moto: number;
  extra_punto_empresa: number;
}

interface RecojoRecord {
  stable_id: string;
  business_id: number;
  fecha: string | null;
  id_lead_ganado: number;
  tipo_cobro: string | null;
  veces: number;
  cobro_a_tienda: number;
  pago_a_moto: number;
  ingreso_recojo_total: number;
  costo_recojo_total: number;
  observaciones: string | null;
}

interface LeadGanadoRecord {
  stable_id: string;
  business_id: number;
  fecha_ingreso_lead: string | null;
  fecha_lead_ganado: string | null;
  dias_lead_a_ganado: number;
  notas: string | null;
  distrito: string | null;
  cantidad_envios: number;
  anulados_fullfilment: number;
  ingreso_anulados_fullfilment: number;
  kommo_lead_id?: number | null;
  tienda_nombre_snapshot?: string | null;
  vendedor_nombre_snapshot?: string | null;
  pipeline_id_snapshot?: number | null;
  origen_snapshot?: string | null;
  fullfilment_snapshot?: boolean | string | null;
}

const BASE_SHEETS_CONFIG: Record<string, BaseSheetMapConfig> = {
  DESTINOS: {
    table: 'destinos',
    columns: ['idDestinos', 'Destinos'],
    dbTextField: 'destino',
    rowTextField: 'Destinos',
  },
  TIENDAS: {
    table: 'tiendas',
    columns: ['idTiendas', 'Nombre'],
    dbTextField: 'nombre',
    rowTextField: 'Nombre',
  },
  COURIER: {
    table: 'courier',
    columns: ['idCourier', 'Nombre'],
    dbTextField: 'nombre',
    rowTextField: 'Nombre',
  },
  FULLFILMENT: {
    table: 'fullfilment',
    columns: ['idFullfilment', '¿Es FullFilment?'],
    dbTextField: 'es_fullfilment',
    rowTextField: '¿Es FullFilment?',
  },
  ORIGEN: {
    table: 'origen',
    columns: ['idOrigen', 'Opcion'],
    dbTextField: 'opcion',
    rowTextField: 'Opcion',
  },
  RESULTADOS: {
    table: 'resultados',
    columns: ['idResultados', 'Resultado'],
    dbTextField: 'resultado',
    rowTextField: 'Resultado',
  },
  'TIPO DE PUNTO': {
    table: 'tipo_punto',
    columns: ['idTipoPunto', 'tipo punto'],
    dbTextField: 'tipo_punto',
    rowTextField: 'tipo punto',
  },
  'TIPO DE RECOJO': {
    table: 'tipo_recojo',
    columns: ['idTipoRecojo', 'tipo de recojo'],
    dbTextField: 'tipo_recojo',
    rowTextField: 'tipo de recojo',
  },
};

const TARIFAS_SHEET_NAME = 'TARIFAS';
const TARIFAS_COLUMNS = ['idTarifa', 'Destino', 'Cobro Entrega', 'Pago Moto', 'Notas'] as const;
const ENVIOS_SHEET_NAME = 'ENVIOS';
const ENVIOS_COLUMNS = [
  'idEnvios',
  'Fecha envio',
  'Lead Ganado',
  'Tienda',
  'Vendedor',
  'FullFilment',
  'Destino',
  'Resultado',
  'Cobro Entrega',
  'Pago moto',
  'Excedente pagado moto',
  'ingreso total fila',
  'costo total fila',
  'observaciones',
  'Tipo Punto',
  'Extra punto moto',
  'Extra punto empresa',
] as const;
const RECOJOS_SHEET_NAME = 'RECOJOS';
const RECOJOS_COLUMNS = [
  'idRecojo',
  'Fecha',
  'Lead Ganado',
  'Tienda',
  'Vendedor',
  'Tipo de cobro',
  'Veces',
  'Cobro a tienda',
  'Pago a moto',
  'Ingreso recojo total',
  'Costo recojo total',
  'Observaciones',
] as const;
const LEADS_GANADOS_SHEET_NAME = 'LEADS GANADOS';
const LEADS_GANADOS_COLUMNS = [
  'idLeadGanado',
  'Tienda',
  'Vendedor',
  'Fecha ingreso lead',
  'Fecha Lead Ganado',
  'Dias lead a ganado',
  'FullFilment',
  'Notas',
  'Distrito',
  'Cantidad de envios',
  'Origen',
  'Anulados Fullfilment',
  'Ingreso anulados fullfilment',
] as const;

const DISTRITO_LOOKUP = new Map(DISTRITO_OPTIONS.map((value) => [normalizeText(value), value]));

function normalizeDistritoValue(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!value) {
    return '';
  }

  const normalized = DISTRITO_LOOKUP.get(normalizeText(value));
  if (normalized) {
    return normalized;
  }

  return value;
}

let lastSupabaseSessionCheckAt = 0;
let cachedSupabaseSessionAvailable = false;

export const SHEET_QUERY_STALE_TIME_MS = 60 * 1000;
export const SHEET_QUERY_REFETCH_INTERVAL_MS = 5 * 60 * 1000;
const SUPABASE_PAGE_SIZE = 1000;

async function fetchAllRowsPaged<T>(
  fetchPage: (from: number, to: number) => { data: T[] | null; error: { message?: string } | null } | Promise<{ data: T[] | null; error: { message?: string } | null }>,
) {
  const rows: T[] = [];
  let from = 0;

  while (true) {
    const to = from + SUPABASE_PAGE_SIZE - 1;
    const { data, error } = await fetchPage(from, to);
    if (error) {
      throw new Error(error.message || 'No se pudieron cargar filas desde Supabase');
    }

    const batch = data ?? [];
    rows.push(...batch);

    if (batch.length < SUPABASE_PAGE_SIZE) {
      break;
    }

    from += SUPABASE_PAGE_SIZE;
  }

  return rows;
}

export function getSheetQueryKey(sheetName: string) {
  return ['sheet', sheetName] as const;
}

function getBaseSheetConfig(sheetName: string) {
  return BASE_SHEETS_CONFIG[sheetName] ?? null;
}

function shouldUseSupabaseForSheet(sheetName: string) {
  return (
    isSupabaseConfigured() &&
    (
      Boolean(getBaseSheetConfig(sheetName)) ||
      sheetName === TARIFAS_SHEET_NAME ||
      sheetName === ENVIOS_SHEET_NAME ||
      sheetName === RECOJOS_SHEET_NAME ||
      sheetName === LEADS_GANADOS_SHEET_NAME
    )
  );
}

function parseCostValue(raw: unknown): number {
  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) {
      throw new Error('Los costos deben ser numéricos');
    }

    return raw;
  }

  const rawText = String(raw ?? '').trim();
  if (!rawText) return 0;

  if (!/^\d+(?:[.,]\d{1,2})?$/.test(rawText)) {
    throw new Error('Los costos deben tener formato numérico con máximo 2 decimales');
  }

  const normalized = rawText.replace(',', '.');

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    throw new Error('Los costos deben ser numéricos');
  }

  return value;
}

function formatCostForStorage(raw: unknown): string {
  const parsed = parseCostValue(raw);
  return (Math.round(parsed * 100) / 100).toFixed(2);
}

function formatCostForDisplay(raw: unknown): string {
  const parsed = Number(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(parsed)) return '0.00';
  return parsed.toFixed(2);
}

function toTarifaSheetRow(
  record: TarifaRecord,
  destinoLabelById: Map<number, string>,
): SheetRow {
  return {
    _id: record.stable_id,
    idTarifa: record.business_id,
    Destino: destinoLabelById.get(record.id_destino) ?? `#${record.id_destino}`,
    'Cobro Entrega': formatCostForDisplay(record.cobro_entrega),
    'Pago Moto': formatCostForDisplay(record.pago_moto),
    Notas: record.notas ?? '',
  };
}

function toDestinoOptionLabel(value: unknown) {
  return String(value ?? '').trim();
}

function normalizeLookupKey(value: unknown): string {
  return normalizeText(String(value ?? ''));
}

function getCandidateColumns(columns: string[], candidates: string[]) {
  const normalizedCandidates = candidates.map((candidate) => normalizeLookupKey(candidate));
  return columns.filter((column) => normalizedCandidates.includes(normalizeLookupKey(column)));
}

function pickFirstValue(row: Row, columns: string[]): unknown {
  for (const column of columns) {
    if (row[column] !== undefined && row[column] !== null && String(row[column]).trim() !== '') {
      return row[column];
    }
  }
  return undefined;
}

interface EnvioReferenceData {
  destinoLabelById: Map<number, string>;
  resultadoLabelById: Map<number, string>;
  tipoPuntoLabelById: Map<number, string>;
  leadGanadoLabelById: Map<number, string>;
  leadGanadoSnapshotById: Map<number, { tienda: string; vendedor: string; fullfilment: string }>;
  normalTipoPuntoId: number | null;
  deliveredResultadoId: number | null;
  tarifaByDestinoId: Map<number, { cobroEntrega: number; pagoMoto: number }>;
}

interface RecojoReferenceData {
  leadGanadoLabelById: Map<number, string>;
  leadGanadoSnapshotById: Map<number, { tienda: string; vendedor: string; fullfilment: string }>;
  tipoCobroOptions: string[];
}

function toEnvioSheetRow(record: EnvioRecord, refs: EnvioReferenceData): SheetRow {
  const leadGanado = refs.leadGanadoLabelById.get(record.id_lead_ganado) ?? `#${record.id_lead_ganado}`;
  const snapshot = refs.leadGanadoSnapshotById.get(record.id_lead_ganado);
  const tienda = snapshot?.tienda ?? '';
  const destino = refs.destinoLabelById.get(record.id_destino) ?? `#${record.id_destino}`;
  const resultado = refs.resultadoLabelById.get(record.id_resultado) ?? `#${record.id_resultado}`;
  const vendedor = snapshot?.vendedor ?? '';
  const tipoPunto = refs.tipoPuntoLabelById.get(record.id_tipo_punto) ?? `#${record.id_tipo_punto}`;
  const fullfilment = snapshot?.fullfilment ?? '';

  return {
    _id: record.stable_id,
    idEnvios: record.business_id,
    'Fecha envio': toDmyDisplayDate(record.fecha_envio),
    'Lead Ganado': leadGanado,
    Tienda: tienda,
    Vendedor: vendedor,
    FullFilment: fullfilment,
    Destino: destino,
    Resultado: resultado,
    'Cobro Entrega': formatCostForDisplay(record.cobro_entrega),
    'Pago moto': formatCostForDisplay(record.pago_moto),
    'Excedente pagado moto': formatCostForDisplay(record.excedente_pagado_moto ?? 0),
    'ingreso total fila': formatCostForDisplay(record.ingreso_total_fila),
    'costo total fila': formatCostForDisplay(record.costo_total_fila),
    observaciones: record.observaciones ?? '',
    'Tipo Punto': tipoPunto,
    'Extra punto moto': formatCostForDisplay(record.extra_punto_moto),
    'Extra punto empresa': formatCostForDisplay(record.extra_punto_empresa),
  };
}

function toIsoDateInput(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return value;
  }

  const dmyMatch = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  }

  const parsed = new Date(value);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = parsed.getFullYear();
    const mm = String(parsed.getMonth() + 1).padStart(2, '0');
    const dd = String(parsed.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
  }

  return '';
}

function toDmyDisplayDate(raw: unknown): string {
  const iso = toIsoDateInput(raw);
  if (!iso) return '';
  const [yyyy, mm, dd] = iso.split('-');
  return `${dd}-${mm}-${yyyy}`;
}

function parseIsoDate(raw: unknown): Date | null {
  const iso = toIsoDateInput(raw);
  if (!iso) return null;
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function diffDays(from: Date | null, to: Date | null): number {
  if (!from || !to) return 0;
  const ms = to.getTime() - from.getTime();
  return Math.round(ms / (1000 * 60 * 60 * 24));
}

function calculateLeadDerivedValues(input: {
  fechaIngresoLead: unknown;
  fechaLeadGanado: unknown;
  anuladosFullfilmentRaw: unknown;
  cantidadEnviosRaw: unknown;
}) {
  const fechaIngreso = parseIsoDate(input.fechaIngresoLead);
  const fechaGanado = parseIsoDate(input.fechaLeadGanado);

  const diasLeadAGanado = diffDays(fechaIngreso, fechaGanado);

  const anuladosFullfilment = Math.round(parseNumericValue(input.anuladosFullfilmentRaw) ?? 0);
  const cantidadEnvios = Math.max(0, Math.round(parseNumericValue(input.cantidadEnviosRaw) ?? 0));
  const ingresoAnuladosFullfilment = anuladosFullfilment * 2;

  return {
    fecha_ingreso_lead: toIsoDateInput(input.fechaIngresoLead),
    fecha_lead_ganado: toIsoDateInput(input.fechaLeadGanado),
    dias_lead_a_ganado: diasLeadAGanado,
    cantidad_envios: cantidadEnvios,
    anulados_fullfilment: formatCostForStorage(anuladosFullfilment),
    ingreso_anulados_fullfilment: formatCostForStorage(ingresoAnuladosFullfilment),
  };
}

function toRecojoSheetRow(record: RecojoRecord, refs: RecojoReferenceData): SheetRow {
  const leadGanado = refs.leadGanadoLabelById.get(record.id_lead_ganado) ?? `#${record.id_lead_ganado}`;
  const snapshot = refs.leadGanadoSnapshotById.get(record.id_lead_ganado);

  return {
    _id: record.stable_id,
    idRecojo: record.business_id,
    'Fecha': toDmyDisplayDate(record.fecha),
    'Lead Ganado': leadGanado,
    Tienda: snapshot?.tienda ?? '',
    Vendedor: snapshot?.vendedor ?? '',
    'Tipo de cobro': String(record.tipo_cobro ?? '').trim(),
    Veces: String(record.veces ?? 0),
    'Cobro a tienda': formatCostForDisplay(record.cobro_a_tienda),
    'Pago a moto': formatCostForDisplay(record.pago_a_moto),
    'Ingreso recojo total': formatCostForDisplay(record.ingreso_recojo_total),
    'Costo recojo total': formatCostForDisplay(record.costo_recojo_total),
    Observaciones: record.observaciones ?? '',
  };
}

function buildLeadGanadoEnvioMaps(rows: Array<{
  business_id: number | null;
  tienda_nombre_snapshot: string | null;
  vendedor_nombre_snapshot: string | null;
  fullfilment_snapshot: boolean | string | null;
}>) {
  const leadGanadoLabelById = new Map<number, string>();
  const leadGanadoSnapshotById = new Map<number, { tienda: string; vendedor: string; fullfilment: string }>();

  for (const row of rows) {
    const leadGanadoId = Number(row.business_id ?? 0);
    if (leadGanadoId <= 0) continue;

    const tienda = String(row.tienda_nombre_snapshot ?? '').trim();
    const vendedor = String(row.vendedor_nombre_snapshot ?? '').trim();
    const fullfilment = toFullfilmentSnapshotLabel(row.fullfilment_snapshot);
    const baseLabel = tienda || 'Lead sin tienda';

    leadGanadoLabelById.set(leadGanadoId, `${baseLabel} — #${leadGanadoId}`);
    leadGanadoSnapshotById.set(leadGanadoId, {
      tienda,
      vendedor,
      fullfilment,
    });
  }

  return {
    leadGanadoLabelById,
    leadGanadoSnapshotById,
  };
}

function toFullfilmentSnapshotLabel(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  if (typeof value === 'number') return value !== 0 ? 'Sí' : 'No';

  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const normalized = normalizeLookupKey(raw);
  if (['true', '1', 'si', 'sí', 'yes'].includes(normalized)) return 'Sí';
  if (['false', '0', 'no'].includes(normalized)) return 'No';
  return raw;
}

function toLeadGanadoSheetRow(record: LeadGanadoRecord): SheetRow {
  const tiendaFromSnapshot = String(record.tienda_nombre_snapshot ?? '').trim();
  const vendedorFromSnapshot = String(record.vendedor_nombre_snapshot ?? '').trim();
  const origenFromSnapshot = String(record.origen_snapshot ?? '').trim();
  const fullfilmentFromSnapshot = toFullfilmentSnapshotLabel(record.fullfilment_snapshot);

  return {
    _id: record.stable_id,
    idLeadGanado: record.business_id,
    Tienda: tiendaFromSnapshot,
    Vendedor: vendedorFromSnapshot,
    'Fecha ingreso lead': toDmyDisplayDate(record.fecha_ingreso_lead),
    'Fecha Lead Ganado': toDmyDisplayDate(record.fecha_lead_ganado),
    'Dias lead a ganado': String(record.dias_lead_a_ganado ?? 0),
    FullFilment: fullfilmentFromSnapshot,
    Notas: record.notas ?? '',
    Distrito: record.distrito ?? '',
    'Cantidad de envios': String(record.cantidad_envios ?? 0),
    Origen: origenFromSnapshot,
    'Anulados Fullfilment': formatCostForDisplay(record.anulados_fullfilment),
    'Ingreso anulados fullfilment': formatCostForDisplay(record.ingreso_anulados_fullfilment),
  };
}

function mapBaseRecordToRow(record: BaseSupabaseRecord & Record<string, unknown>, config: BaseSheetMapConfig): SheetRow {
  const [, textColumn] = config.columns;
  const textValue = record[config.dbTextField];

  return {
    _id: record.stable_id,
    [config.columns[0]]: record.business_id,
    [textColumn]: typeof textValue === 'string' ? textValue : String(textValue ?? ''),
  };
}

function mapBaseRowsToSheetData(records: BaseSupabaseRecordRaw[], config: BaseSheetMapConfig): SheetData {
  return {
    columns: [...config.columns],
    rows: records.map((record) => mapBaseRecordToRow(record, config)),
  };
}

function asBaseSupabaseRecordRaw(value: unknown): BaseSupabaseRecordRaw {
  return value as BaseSupabaseRecordRaw;
}

function asBaseSupabaseRecordRawArray(value: unknown): BaseSupabaseRecordRaw[] {
  return (value as BaseSupabaseRecordRaw[]) ?? [];
}

function getTextValueFromRowData(rowData: Record<string, unknown>, config: BaseSheetMapConfig) {
  return String(rowData[config.rowTextField] ?? rowData[config.dbTextField] ?? '').trim();
}

function triggerOutboxSyncBestEffort() {
  // Google Sheets quedó desacoplado del flujo operativo.
}

function invalidateEnvioRelatedQueries(queryClient: QueryClient, sheetName: string) {
  if (sheetName !== ENVIOS_SHEET_NAME) return;

  queryClient.invalidateQueries({ queryKey: getSheetQueryKey(LEADS_GANADOS_SHEET_NAME), refetchType: 'none' });
}

async function requireSupabaseSession(force = false): Promise<void> {
  if (!supabase) {
    throw new Error('Supabase no está configurado. Revisá VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY.');
  }

  const now = Date.now();
  if (!force && now - lastSupabaseSessionCheckAt < 30_000) {
    if (cachedSupabaseSessionAvailable) return;
    throw new Error('No hay sesión Supabase activa (cache local).');
  }

  lastSupabaseSessionCheckAt = now;

  const { data: sessionData, error: sessionError } = await supabase.auth.getSession();
  if (sessionError) {
    cachedSupabaseSessionAvailable = false;
    throw new Error(`No se pudo validar sesión Supabase: ${sessionError.message}`);
  }

  if (sessionData.session) {
    cachedSupabaseSessionAvailable = true;
    return;
  }

  const { error: anonError } = await supabase.auth.signInAnonymously();
  if (anonError) {
    cachedSupabaseSessionAvailable = false;
    throw new Error(
      `Falló signInAnonymously en Supabase: ${anonError.message}. ` +
        'Habilitá Anonymous Provider en Supabase Auth > Providers o ajustá el método de login.',
    );
  }

  cachedSupabaseSessionAvailable = true;
}

async function fetchBaseSheetFromSupabase(sheetName: string): Promise<SheetData> {
  if (!supabase) {
    throw new Error('Supabase no está configurado');
  }

  const config = getBaseSheetConfig(sheetName);
  if (!config) {
    throw new Error(`La hoja ${sheetName} no está configurada para Supabase`);
  }

  const client = supabase;
  if (!client) throw new Error('Supabase no está configurado');

  await requireSupabaseSession();

  const data = await fetchAllRowsPaged<BaseSupabaseRecordRaw>(async (from, to) => {
    const response = await client
      .from(config.table)
      .select(`stable_id,business_id,${config.dbTextField}`)
      .order('business_id', { ascending: true })
      .order('stable_id', { ascending: true })
      .range(from, to);

    return { data: (response.data ?? []) as unknown as BaseSupabaseRecordRaw[], error: response.error };
  });

  return mapBaseRowsToSheetData(asBaseSupabaseRecordRawArray(data ?? []), config);
}

async function getDestinoMapById() {
  if (!supabase) {
    throw new Error('Supabase no está configurado');
  }
  const client = supabase;

  const data = await fetchAllRowsPaged<{ business_id: number; destino: string }>(async (from, to) => {
    const response = await client
      .from('destinos')
      .select('business_id,destino')
      .order('business_id', { ascending: true })
      .range(from, to);

    return { data: (response.data ?? []) as Array<{ business_id: number; destino: string }>, error: response.error };
  });

  const map = new Map<number, string>();
  for (const row of (data ?? []) as Array<{ business_id: number; destino: string }>) {
    map.set(Number(row.business_id), toDestinoOptionLabel(row.destino));
  }

  return map;
}

async function fetchTarifasFromSupabase(): Promise<SheetData> {
  if (!supabase) {
    throw new Error('Supabase no está configurado');
  }
  const client = supabase;

  await requireSupabaseSession();

  const [destinoMapById, tarifasRows] = await Promise.all([
    getDestinoMapById(),
    fetchAllRowsPaged<TarifaRecord>(async (from, to) => {
      const response = await client
        .from('tarifas')
        .select('stable_id,business_id,id_destino,cobro_entrega,pago_moto,notas')
        .order('business_id', { ascending: true })
        .order('stable_id', { ascending: true })
        .range(from, to);

      return { data: (response.data ?? []) as TarifaRecord[], error: response.error };
    }),
  ]);

  return {
    columns: [...TARIFAS_COLUMNS],
    rows: tarifasRows.map((record) => toTarifaSheetRow(record, destinoMapById)),
  };
}

async function fetchReferenceMap(
  table: string,
  idCandidates: string[],
  labelCandidates: string[],
): Promise<Map<number, string>> {
  if (!supabase) throw new Error('Supabase no está configurado');

  const isSafeIdentifier = (value: string) => /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(value);

  const idSelectColumns = Array.from(
    new Set(
      idCandidates
        .map((candidate) => candidate.trim().toLowerCase())
        .filter((candidate) => candidate.length > 0 && isSafeIdentifier(candidate)),
    ),
  );

  const labelSelectColumns = Array.from(
    new Set(
      labelCandidates
        .map((candidate) => candidate.trim().toLowerCase())
        .filter((candidate) => candidate.length > 0 && isSafeIdentifier(candidate)),
    ),
  );

  if (!idSelectColumns.length || !labelSelectColumns.length) {
    throw new Error(`Configuración inválida de columnas para referencia ${table}`);
  }

  const selectColumns = [...idSelectColumns, ...labelSelectColumns].join(',');

  const { data, error } = await supabase
    .from(table)
    .select(selectColumns)
    .limit(5000);

  if (error) {
    throw new Error(error.message || `No se pudo cargar referencia ${table}`);
  }

  const map = new Map<number, string>();
  for (const rawRow of ((data ?? []) as unknown as Row[])) {
    const rowColumns = Object.keys(rawRow);
    const idColumns = getCandidateColumns(rowColumns, idCandidates);
    const labelColumns = getCandidateColumns(rowColumns, labelCandidates);

    const idValue = parseNumericValue(pickFirstValue(rawRow, idColumns));
    const label = String(pickFirstValue(rawRow, labelColumns) ?? '').trim();

    if (idValue !== null && label) {
      map.set(idValue, label);
    }
  }

  return map;
}

async function fetchEnvioReferenceData(): Promise<EnvioReferenceData> {
  if (!supabase) throw new Error('Supabase no está configurado');

  const [destinoLabelById, resultadoLabelById, tipoPuntoLabelById] =
    await Promise.all([
      fetchReferenceMap('destinos', ['business_id', 'id'], ['destino']),
      fetchReferenceMap('resultados', ['business_id', 'id'], ['resultado']),
      fetchReferenceMap('tipo_punto', ['business_id', 'id'], ['tipo_punto']),
    ]);

  const normalTipoPuntoId =
    Array.from(tipoPuntoLabelById.entries()).find(([, label]) => normalizeLookupKey(label) === normalizeLookupKey('Normal'))?.[0] ??
    null;

  const deliveredResultadoId =
    Array.from(resultadoLabelById.entries()).find(([, label]) => normalizeLookupKey(label) === normalizeLookupKey('Entregado'))?.[0] ??
    null;

  const { data: tarifasData, error: tarifasError } = await supabase
    .from('tarifas')
    .select('id_destino,cobro_entrega,pago_moto')
    .limit(5000);

  if (tarifasError) {
    throw new Error(tarifasError.message || 'No se pudo cargar tarifas de referencia para ENVIOS');
  }

  const tarifaByDestinoId = new Map<number, { cobroEntrega: number; pagoMoto: number }>();
  for (const row of (tarifasData ?? []) as Array<{ id_destino: number; cobro_entrega: number; pago_moto: number }>) {
    tarifaByDestinoId.set(Number(row.id_destino), {
      cobroEntrega: Math.round(Number(row.cobro_entrega ?? 0) * 100) / 100,
      pagoMoto: Math.round(Number(row.pago_moto ?? 0) * 100) / 100,
    });
  }

  const { data: leadsData, error: leadsError } = await supabase
    .from('leads_ganados')
    .select('business_id,tienda_nombre_snapshot,vendedor_nombre_snapshot,fullfilment_snapshot')
    .order('business_id', { ascending: false })
    .limit(20000);

  const { leadGanadoLabelById, leadGanadoSnapshotById } = buildLeadGanadoEnvioMaps(
    (leadsData ?? []) as Array<{
      business_id: number | null;
      tienda_nombre_snapshot: string | null;
      vendedor_nombre_snapshot: string | null;
      fullfilment_snapshot: boolean | string | null;
    }>,
  );

  if (leadsError) {
    // fallback sin romper flujo
  }

  return {
    destinoLabelById,
    resultadoLabelById,
    tipoPuntoLabelById,
    leadGanadoLabelById,
    leadGanadoSnapshotById,
    normalTipoPuntoId,
    deliveredResultadoId,
    tarifaByDestinoId,
  };
}

async function fetchRecojoReferenceData(): Promise<RecojoReferenceData> {
  if (!supabase) throw new Error('Supabase no está configurado');

  const [tipoRecojoLabelById, leadsResponse] = await Promise.all([
    fetchReferenceMap('tipo_recojo', ['business_id', 'id'], ['tipo_recojo']),
    supabase
      .from('leads_ganados')
      .select('business_id,tienda_nombre_snapshot,vendedor_nombre_snapshot,fullfilment_snapshot')
      .order('business_id', { ascending: false })
      .limit(20000),
  ]);

  const { data: leadsData, error: leadsError } = leadsResponse;
  const { leadGanadoLabelById, leadGanadoSnapshotById } = buildLeadGanadoEnvioMaps(
    (leadsData ?? []) as Array<{
      business_id: number | null;
      tienda_nombre_snapshot: string | null;
      vendedor_nombre_snapshot: string | null;
      fullfilment_snapshot: boolean | string | null;
    }>,
  );

  const tipoCobroOptions = Array.from(
    new Set([
      ...Array.from(tipoRecojoLabelById.values()).map((value) => String(value ?? '').trim()).filter(Boolean),
    ]),
  );

  if (leadsError) {
    // fallback sin romper flujo
  }

  return {
    leadGanadoLabelById,
    leadGanadoSnapshotById,
    tipoCobroOptions,
  };
}

async function fetchEnviosFromSupabase(): Promise<SheetData> {
  if (!supabase) throw new Error('Supabase no está configurado');

  await requireSupabaseSession();

  const [refs, enviosResponse] = await Promise.all([
    fetchEnvioReferenceData(),
    supabase
      .from('envios')
      .select(
        'stable_id,business_id,fecha_envio,id_lead_ganado,id_destino,id_resultado,cobro_entrega,pago_moto,excedente_pagado_moto,ingreso_total_fila,costo_total_fila,observaciones,id_tipo_punto,extra_punto_moto,extra_punto_empresa',
      )
      .order('business_id', { ascending: true }),
  ]);

  const { data, error } = enviosResponse;
  if (error) {
    throw new Error(error.message || 'No se pudieron cargar ENVIOS desde Supabase');
  }

  return {
    columns: [...ENVIOS_COLUMNS],
    rows: ((data ?? []) as EnvioRecord[]).map((record) => toEnvioSheetRow(record, refs)),
  };
}

async function fetchRecojosFromSupabase(): Promise<SheetData> {
  if (!supabase) throw new Error('Supabase no está configurado');

  await requireSupabaseSession();

  const [refs, recojosResponse] = await Promise.all([
    fetchRecojoReferenceData(),
    supabase
      .from('recojos')
      .select(
        'stable_id,business_id,fecha,id_lead_ganado,tipo_cobro,veces,cobro_a_tienda,pago_a_moto,ingreso_recojo_total,costo_recojo_total,observaciones',
      )
      .order('business_id', { ascending: true }),
  ]);

  const { data, error } = recojosResponse;
  if (error) {
    throw new Error(error.message || 'No se pudieron cargar RECOJOS desde Supabase');
  }

  return {
    columns: [...RECOJOS_COLUMNS],
    rows: ((data ?? []) as RecojoRecord[]).map((record) => toRecojoSheetRow(record, refs)),
  };
}

async function fetchLeadsGanadosFromSupabase(): Promise<SheetData> {
  if (!supabase) throw new Error('Supabase no está configurado');

  await requireSupabaseSession();

  const leadsResponse = await supabase
    .from('leads_ganados')
    .select(
      'stable_id,business_id,fecha_ingreso_lead,fecha_lead_ganado,dias_lead_a_ganado,notas,distrito,cantidad_envios,anulados_fullfilment,ingreso_anulados_fullfilment,kommo_lead_id,tienda_nombre_snapshot,vendedor_nombre_snapshot,pipeline_id_snapshot,origen_snapshot,fullfilment_snapshot',
    )
    .order('business_id', { ascending: true });

  const { data, error } = leadsResponse;
  if (error) {
    throw new Error(error.message || 'No se pudieron cargar LEADS GANADOS desde Supabase');
  }

  return {
    columns: [...LEADS_GANADOS_COLUMNS],
    rows: ((data ?? []) as LeadGanadoRecord[]).map((record) => toLeadGanadoSheetRow(record)),
  };
}

export async function fetchSheet(name: string): Promise<SheetData> {
  if (name === RECOJOS_SHEET_NAME && isSupabaseConfigured()) {
    const data = await fetchRecojosFromSupabase();
    triggerOutboxSyncBestEffort();
    return data;
  }

  if (name === LEADS_GANADOS_SHEET_NAME && isSupabaseConfigured()) {
    const data = await fetchLeadsGanadosFromSupabase();
    triggerOutboxSyncBestEffort();
    return data;
  }

  if (name === ENVIOS_SHEET_NAME && isSupabaseConfigured()) {
    const data = await fetchEnviosFromSupabase();
    triggerOutboxSyncBestEffort();
    return data;
  }

  if (name === TARIFAS_SHEET_NAME && isSupabaseConfigured()) {
    const data = await fetchTarifasFromSupabase();
    triggerOutboxSyncBestEffort();
    return data;
  }

  if (shouldUseSupabaseForSheet(name)) {
    const data = await fetchBaseSheetFromSupabase(name);
    triggerOutboxSyncBestEffort();
    return data;
  }

  throw new Error(`La tabla ${name} no está habilitada en Supabase.`);
}

export function prefetchSheetData(queryClient: QueryClient, sheetName: string) {
  return queryClient.prefetchQuery({
    queryKey: getSheetQueryKey(sheetName),
    queryFn: () => fetchSheet(sheetName),
    staleTime: SHEET_QUERY_STALE_TIME_MS,
  });
}

export function useSheetData(sheetName: string) {
  return useQuery({
    queryKey: getSheetQueryKey(sheetName),
    queryFn: () => fetchSheet(sheetName),
    enabled: !!sheetName,
    staleTime: SHEET_QUERY_STALE_TIME_MS,
    refetchInterval: SHEET_QUERY_REFETCH_INTERVAL_MS,
  });
}

export function useDestinoOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['sheet-options', 'DESTINOS'],
    queryFn: async () => {
      return fetchBaseSheetFromSupabase('DESTINOS');
    },
    enabled,
    staleTime: SHEET_QUERY_STALE_TIME_MS,
  });
}

export function useEnvioFormOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['sheet-options', 'ENVIOS'],
    queryFn: async () => {
      const refs = await fetchEnvioReferenceData();

      return {
        leadsGanados: Array.from(refs.leadGanadoLabelById.values()).sort((a, b) => a.localeCompare(b, 'es')),
        destinos: Array.from(refs.destinoLabelById.values()).sort((a, b) => a.localeCompare(b, 'es')),
        resultados: Array.from(refs.resultadoLabelById.values()).sort((a, b) => a.localeCompare(b, 'es')),
        tipoPunto: Array.from(refs.tipoPuntoLabelById.values()).sort((a, b) => a.localeCompare(b, 'es')),
      };
    },
    enabled,
    staleTime: SHEET_QUERY_STALE_TIME_MS,
  });
}

export function useRecojoFormOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['sheet-options', 'RECOJOS'],
    queryFn: async () => {
      const refs = await fetchRecojoReferenceData();

      return {
        leadsGanados: Array.from(refs.leadGanadoLabelById.values()).sort((a, b) => a.localeCompare(b, 'es')),
        tipoCobro: [...refs.tipoCobroOptions].sort((a, b) => a.localeCompare(b, 'es')),
      };
    },
    enabled,
    staleTime: SHEET_QUERY_STALE_TIME_MS,
  });
}

export function useDistritoOptions(enabled: boolean) {
  return useQuery({
    queryKey: ['sheet-options', 'DISTRITOS'],
    queryFn: async () => [...DISTRITO_OPTIONS],
    enabled,
    staleTime: SHEET_QUERY_STALE_TIME_MS,
  });
}

export function useEnvioAutoPreview(input: {
  enabled: boolean;
  leadGanado: string;
  destino: string;
  resultado: string;
  tipoPunto: string;
  excedentePagadoMoto: string;
}) {
  return useQuery({
    queryKey: ['sheet-preview', 'ENVIOS', input.leadGanado, input.destino, input.resultado, input.tipoPunto, input.excedentePagadoMoto],
    enabled: input.enabled,
    queryFn: async () => {
      const refs = await fetchEnvioReferenceData();

      const idLeadGanado = input.leadGanado ? findIdByLabelOrThrow(refs.leadGanadoLabelById, input.leadGanado, 'Lead Ganado') : null;
      const idDestino = input.destino ? findIdByLabelOrThrow(refs.destinoLabelById, input.destino, 'Destino') : null;
      const idResultado = input.resultado ? findIdByLabelOrThrow(refs.resultadoLabelById, input.resultado, 'Resultado') : null;
      const idTipoPunto = input.tipoPunto ? findIdByLabelOrThrow(refs.tipoPuntoLabelById, input.tipoPunto, 'Tipo Punto') : null;
      const snapshot = idLeadGanado === null ? null : refs.leadGanadoSnapshotById.get(idLeadGanado) ?? null;

      if (idDestino === null || idResultado === null || idTipoPunto === null) {
        return {
          Tienda: snapshot?.tienda ?? '',
          Vendedor: snapshot?.vendedor ?? '',
          FullFilment: snapshot?.fullfilment ?? '',
          'Cobro Entrega': '0.00',
          'Pago moto': '0.00',
          'Extra punto moto': '0.00',
          'Extra punto empresa': '0.00',
          'ingreso total fila': '0.00',
          'costo total fila': '0.00',
        };
      }

      const derived = calculateEnvioDerivedValues({
        idDestino,
        idResultado,
        idTipoPunto,
        excedentePagadoMotoRaw: input.excedentePagadoMoto,
        refs,
      });

      return {
        Tienda: snapshot?.tienda ?? '',
        Vendedor: snapshot?.vendedor ?? '',
        FullFilment: snapshot?.fullfilment ?? '',
        'Cobro Entrega': formatCostForDisplay(derived.cobro_entrega),
        'Pago moto': formatCostForDisplay(derived.pago_moto),
        'Extra punto moto': formatCostForDisplay(derived.extra_punto_moto),
        'Extra punto empresa': formatCostForDisplay(derived.extra_punto_empresa),
        'ingreso total fila': formatCostForDisplay(derived.ingreso_total_fila),
        'costo total fila': formatCostForDisplay(derived.costo_total_fila),
      };
    },
    staleTime: 5_000,
  });
}

export function useLeadGanadoAutoPreview(input: {
  enabled: boolean;
  fechaIngresoLead: string;
  fechaLeadGanado: string;
  anuladosFullfilment: string;
  tienda: string;
}) {
  return useQuery({
    queryKey: [
      'sheet-preview',
      'LEADS_GANADOS',
      input.fechaIngresoLead,
      input.fechaLeadGanado,
      input.anuladosFullfilment,
      input.tienda,
    ],
    enabled: input.enabled,
    queryFn: async () => {
      const derived = calculateLeadDerivedValues({
        fechaIngresoLead: input.fechaIngresoLead,
        fechaLeadGanado: input.fechaLeadGanado,
        anuladosFullfilmentRaw: input.anuladosFullfilment,
        cantidadEnviosRaw: 0,
      });

      return {
        'Dias lead a ganado': String(derived.dias_lead_a_ganado),
        'Cantidad de envios': String(derived.cantidad_envios),
        'Ingreso anulados fullfilment': formatCostForDisplay(derived.ingreso_anulados_fullfilment),
      };
    },
    staleTime: 5_000,
  });
}

function calculateRecojoDerivedValues(input: {
  tipoCobro: string;
  vecesRaw: unknown;
}) {
  // RECOJOS mantiene costos/totales calculados automáticamente en frontend,
  // igual que el flujo anterior: no se editan manualmente en el formulario.
  const veces = Math.max(0, Math.round(parseNumericValue(input.vecesRaw) ?? 0));
  const pagoMotoPorRecojo = 4;
  const tipoCobro = normalizeLookupKey(input.tipoCobro);
  const isGratis = tipoCobro.includes('gratis');
  const cobroATiendaPorRecojo = isGratis ? 0 : 8;

  const ingresoRecojoTotal = veces * cobroATiendaPorRecojo;
  const costoRecojoTotal = veces * pagoMotoPorRecojo;

  return {
    veces,
    cobro_a_tienda: formatCostForStorage(cobroATiendaPorRecojo),
    pago_a_moto: formatCostForStorage(pagoMotoPorRecojo),
    ingreso_recojo_total: formatCostForStorage(ingresoRecojoTotal),
    costo_recojo_total: formatCostForStorage(costoRecojoTotal),
  };
}

export function useRecojoAutoPreview(input: {
  enabled: boolean;
  leadGanado: string;
  tipoCobro: string;
  veces: string;
}) {
  return useQuery({
    queryKey: ['sheet-preview', 'RECOJOS', input.leadGanado, input.tipoCobro, input.veces],
    enabled: input.enabled,
    queryFn: async () => {
      const refs = await fetchRecojoReferenceData();

      const idLeadGanado = input.leadGanado ? findIdByLabelOrThrow(refs.leadGanadoLabelById, input.leadGanado, 'Lead Ganado') : null;
      const snapshot = idLeadGanado === null ? null : refs.leadGanadoSnapshotById.get(idLeadGanado) ?? null;

      if (!String(input.tipoCobro ?? '').trim()) {
        return {
          Tienda: snapshot?.tienda ?? '',
          Vendedor: snapshot?.vendedor ?? '',
          'Cobro a tienda': '0.00',
          'Pago a moto': '4.00',
          'Ingreso recojo total': '0.00',
          'Costo recojo total': '0.00',
        };
      }

      const derived = calculateRecojoDerivedValues({
        tipoCobro: input.tipoCobro,
        vecesRaw: input.veces,
      });

      return {
        Tienda: snapshot?.tienda ?? '',
        Vendedor: snapshot?.vendedor ?? '',
        'Cobro a tienda': formatCostForDisplay(derived.cobro_a_tienda),
        'Pago a moto': formatCostForDisplay(derived.pago_a_moto),
        'Ingreso recojo total': formatCostForDisplay(derived.ingreso_recojo_total),
        'Costo recojo total': formatCostForDisplay(derived.costo_recojo_total),
      };
    },
    staleTime: 5_000,
  });
}

function getAuthHeaders(): HeadersInit {
  return {
    'Content-Type': 'application/json',
  };
}

async function addBaseSheetSupabase(sheetName: string, rowData: Record<string, unknown>): Promise<MutationRowResponse> {
  if (!supabase) {
    throw new Error('Supabase no está configurado');
  }

  const config = getBaseSheetConfig(sheetName);
  if (!config) {
    throw new Error(`La hoja ${sheetName} no está configurada para Supabase`);
  }

  await requireSupabaseSession();

  const textValue = getTextValueFromRowData(rowData, config);
  if (!textValue) {
    throw new Error(`El campo ${config.rowTextField} es obligatorio`);
  }

  const { data, error } = await supabase
    .from(config.table)
    .insert({ [config.dbTextField]: textValue })
    .select(`stable_id,business_id,${config.dbTextField}`)
    .single();

  if (error) {
    throw new Error(error.message || `No se pudo crear registro en ${sheetName}`);
  }

  return {
    success: true,
    row: mapBaseRecordToRow(asBaseSupabaseRecordRaw(data), config),
  };
}

async function updateBaseSheetSupabase(sheetName: string, rowData: UpdateMutationPayload): Promise<MutationRowResponse> {
  if (!supabase) {
    throw new Error('Supabase no está configurado');
  }

  const config = getBaseSheetConfig(sheetName);
  if (!config) {
    throw new Error(`La hoja ${sheetName} no está configurada para Supabase`);
  }

  await requireSupabaseSession();

  const textValue = getTextValueFromRowData(rowData, config);
  if (!textValue) {
    throw new Error(`El campo ${config.rowTextField} es obligatorio`);
  }

  const { data, error } = await supabase
    .from(config.table)
    .update({ [config.dbTextField]: textValue })
    .eq('stable_id', rowData._id)
    .select(`stable_id,business_id,${config.dbTextField}`)
    .single();

  if (error) {
    throw new Error(error.message || `No se pudo actualizar registro en ${sheetName}`);
  }

  return {
    success: true,
    row: mapBaseRecordToRow(asBaseSupabaseRecordRaw(data), config),
  };
}

async function deleteBaseSheetSupabase(sheetName: string, params: DeleteMutationPayload): Promise<MutationRowResponse> {
  if (!supabase) {
    throw new Error('Supabase no está configurado');
  }

  const config = getBaseSheetConfig(sheetName);
  if (!config) {
    throw new Error(`La hoja ${sheetName} no está configurada para Supabase`);
  }

  await requireSupabaseSession();

  const { error } = await supabase
    .from(config.table)
    .delete()
    .eq('stable_id', params.rowId);

  if (error) {
    throw new Error(error.message || `No se pudo eliminar registro en ${sheetName}`);
  }

  return {
    success: true,
    deletedId: params.rowId,
  };
}

async function resolveDestinoIdByLabel(destinoLabel: string) {
  if (!supabase) {
    throw new Error('Supabase no está configurado');
  }

  const { data, error } = await supabase
    .from('destinos')
    .select('business_id,destino')
    .order('business_id', { ascending: true });

  if (error) {
    throw new Error(error.message || 'No se pudieron cargar destinos para validar TARIFAS');
  }

  const normalizedTarget = destinoLabel.trim().toLowerCase();
  const found = (data ?? []).find((row) => String(row.destino ?? '').trim().toLowerCase() === normalizedTarget);

  if (!found) {
    throw new Error(`No existe el destino "${destinoLabel}"`);
  }

  return Number(found.business_id);
}

async function addTarifaSupabase(rowData: Record<string, unknown>): Promise<MutationRowResponse> {
  if (!supabase) {
    throw new Error('Supabase no está configurado');
  }

  await requireSupabaseSession();

  const destinoLabel = String(rowData.Destino ?? '').trim();
  if (!destinoLabel) {
    throw new Error('El campo Destino es obligatorio');
  }

  const cobroEntrega = formatCostForStorage(rowData['Cobro Entrega']);
  const pagoMoto = formatCostForStorage(rowData['Pago Moto']);

  const idDestino = await resolveDestinoIdByLabel(destinoLabel);

  const { data, error } = await supabase
    .from('tarifas')
    .insert({
      id_destino: idDestino,
      cobro_entrega: cobroEntrega,
      pago_moto: pagoMoto,
      notas: String(rowData.Notas ?? '').trim() || null,
    })
    .select('stable_id,business_id,id_destino,cobro_entrega,pago_moto,notas')
    .single();

  if (error) {
    throw new Error(error.message || 'No se pudo crear tarifa en Supabase');
  }

  const destinoMap = await getDestinoMapById();

  return {
    success: true,
    row: toTarifaSheetRow(data as TarifaRecord, destinoMap),
  };
}

function findIdByLabelOrThrow(map: Map<number, string>, label: unknown, entityLabel: string): number {
  const normalizedTarget = normalizeLookupKey(label);
  const found = Array.from(map.entries()).find(([, currentLabel]) => normalizeLookupKey(currentLabel) === normalizedTarget);

  if (!found) {
    throw new Error(`No existe ${entityLabel} con valor "${String(label ?? '').trim()}"`);
  }

  return found[0];
}

function calculateEnvioDerivedValues(input: {
  idDestino: number;
  idResultado: number;
  idTipoPunto: number;
  excedentePagadoMotoRaw: unknown;
  refs: EnvioReferenceData;
}) {
  const { refs, idDestino, idResultado, idTipoPunto } = input;
  const tarifa = refs.tarifaByDestinoId.get(idDestino);

  const isDelivered = refs.deliveredResultadoId !== null && idResultado === refs.deliveredResultadoId;
  const isNormalTipoPunto = refs.normalTipoPuntoId !== null && idTipoPunto === refs.normalTipoPuntoId;

  const cobroEntregaBase = isDelivered ? Number(tarifa?.cobroEntrega ?? 0) : 0;
  const pagoMotoBase = isDelivered ? Number(tarifa?.pagoMoto ?? 0) : 0;

  const cobroEntrega = cobroEntregaBase / 1.18;
  const pagoMoto = pagoMotoBase;
  const extraPuntoMoto = isNormalTipoPunto ? 0 : pagoMoto;
  const extraPuntoEmpresa = isNormalTipoPunto ? 0 : 8;

  const ingresoTotalFila = cobroEntrega + extraPuntoEmpresa;
  const costoTotalFila = pagoMoto + extraPuntoMoto;

  const excedentePagadoMoto = parseCostValue(input.excedentePagadoMotoRaw);

  return {
    cobro_entrega: formatCostForStorage(cobroEntrega),
    pago_moto: formatCostForStorage(pagoMoto),
    extra_punto_moto: formatCostForStorage(extraPuntoMoto),
    extra_punto_empresa: formatCostForStorage(extraPuntoEmpresa),
    ingreso_total_fila: formatCostForStorage(ingresoTotalFila),
    costo_total_fila: formatCostForStorage(costoTotalFila),
    excedente_pagado_moto: formatCostForStorage(excedentePagadoMoto),
  };
}

async function addEnvioSupabase(rowData: Record<string, unknown>): Promise<MutationRowResponse> {
  if (!supabase) throw new Error('Supabase no está configurado');
  await requireSupabaseSession();

  const refs = await fetchEnvioReferenceData();

  const idLeadGanado = findIdByLabelOrThrow(refs.leadGanadoLabelById, rowData['Lead Ganado'], 'Lead Ganado');
  const idDestino = findIdByLabelOrThrow(refs.destinoLabelById, rowData.Destino, 'Destino');
  const idResultado = findIdByLabelOrThrow(refs.resultadoLabelById, rowData.Resultado, 'Resultado');
  const idTipoPunto = findIdByLabelOrThrow(refs.tipoPuntoLabelById, rowData['Tipo Punto'], 'Tipo Punto');

  const derived = calculateEnvioDerivedValues({
    idDestino,
    idResultado,
    idTipoPunto,
    excedentePagadoMotoRaw: rowData['Excedente pagado moto'],
    refs,
  });

  const { data, error } = await supabase
    .from('envios')
    .insert({
      fecha_envio: toIsoDateInput(rowData['Fecha envio']) || null,
      id_lead_ganado: idLeadGanado,
      id_destino: idDestino,
      id_resultado: idResultado,
      id_tipo_punto: idTipoPunto,
      observaciones: String(rowData.observaciones ?? rowData.Observaciones ?? '').trim() || null,
      ...derived,
    })
    .select(
      'stable_id,business_id,fecha_envio,id_lead_ganado,id_destino,id_resultado,cobro_entrega,pago_moto,excedente_pagado_moto,ingreso_total_fila,costo_total_fila,observaciones,id_tipo_punto,extra_punto_moto,extra_punto_empresa',
    )
    .single();

  if (error) {
    throw new Error(error.message || 'No se pudo crear envío en Supabase');
  }

  return {
    success: true,
    row: toEnvioSheetRow(data as EnvioRecord, refs),
  };
}

async function updateEnvioSupabase(rowData: UpdateMutationPayload): Promise<MutationRowResponse> {
  if (!supabase) throw new Error('Supabase no está configurado');
  await requireSupabaseSession();

  const refs = await fetchEnvioReferenceData();

  const idLeadGanado = findIdByLabelOrThrow(refs.leadGanadoLabelById, rowData['Lead Ganado'], 'Lead Ganado');
  const idDestino = findIdByLabelOrThrow(refs.destinoLabelById, rowData.Destino, 'Destino');
  const idResultado = findIdByLabelOrThrow(refs.resultadoLabelById, rowData.Resultado, 'Resultado');
  const idTipoPunto = findIdByLabelOrThrow(refs.tipoPuntoLabelById, rowData['Tipo Punto'], 'Tipo Punto');

  const derived = calculateEnvioDerivedValues({
    idDestino,
    idResultado,
    idTipoPunto,
    excedentePagadoMotoRaw: rowData['Excedente pagado moto'],
    refs,
  });

  const { data, error } = await supabase
    .from('envios')
    .update({
      fecha_envio: toIsoDateInput(rowData['Fecha envio']) || null,
      id_lead_ganado: idLeadGanado,
      id_destino: idDestino,
      id_resultado: idResultado,
      id_tipo_punto: idTipoPunto,
      observaciones: String(rowData.observaciones ?? rowData.Observaciones ?? '').trim() || null,
      ...derived,
    })
    .eq('stable_id', rowData._id)
    .select(
      'stable_id,business_id,fecha_envio,id_lead_ganado,id_destino,id_resultado,cobro_entrega,pago_moto,excedente_pagado_moto,ingreso_total_fila,costo_total_fila,observaciones,id_tipo_punto,extra_punto_moto,extra_punto_empresa',
    )
    .single();

  if (error) {
    throw new Error(error.message || 'No se pudo actualizar envío en Supabase');
  }

  return {
    success: true,
    row: toEnvioSheetRow(data as EnvioRecord, refs),
  };
}

async function deleteEnvioSupabase(params: DeleteMutationPayload): Promise<MutationRowResponse> {
  if (!supabase) throw new Error('Supabase no está configurado');
  await requireSupabaseSession();

  const { error } = await supabase
    .from('envios')
    .delete()
    .eq('stable_id', params.rowId);

  if (error) {
    throw new Error(error.message || 'No se pudo eliminar envío en Supabase');
  }

  return {
    success: true,
    deletedId: params.rowId,
  };
}

async function addRecojoSupabase(rowData: Record<string, unknown>): Promise<MutationRowResponse> {
  if (!supabase) throw new Error('Supabase no está configurado');
  await requireSupabaseSession();

  const refs = await fetchRecojoReferenceData();

  const idLeadGanado = findIdByLabelOrThrow(refs.leadGanadoLabelById, rowData['Lead Ganado'], 'Lead Ganado');
  const tipoCobro = String(rowData['Tipo de cobro'] ?? '').trim();

  const derived = calculateRecojoDerivedValues({
    tipoCobro,
    vecesRaw: rowData.Veces,
  });

  const { data, error } = await supabase
    .from('recojos')
    .insert({
      fecha: toIsoDateInput(rowData.Fecha) || null,
      id_lead_ganado: idLeadGanado,
      tipo_cobro: tipoCobro,
      observaciones: String(rowData.Observaciones ?? rowData.observaciones ?? '').trim() || null,
      ...derived,
    })
    .select(
      'stable_id,business_id,fecha,id_lead_ganado,tipo_cobro,veces,cobro_a_tienda,pago_a_moto,ingreso_recojo_total,costo_recojo_total,observaciones',
    )
    .single();

  if (error) {
    throw new Error(error.message || 'No se pudo crear recojo en Supabase');
  }

  return {
    success: true,
    row: toRecojoSheetRow(data as RecojoRecord, refs),
  };
}

async function updateRecojoSupabase(rowData: UpdateMutationPayload): Promise<MutationRowResponse> {
  if (!supabase) throw new Error('Supabase no está configurado');
  await requireSupabaseSession();

  const refs = await fetchRecojoReferenceData();

  const idLeadGanado = findIdByLabelOrThrow(refs.leadGanadoLabelById, rowData['Lead Ganado'], 'Lead Ganado');
  const tipoCobro = String(rowData['Tipo de cobro'] ?? '').trim();

  const derived = calculateRecojoDerivedValues({
    tipoCobro,
    vecesRaw: rowData.Veces,
  });

  const { data, error } = await supabase
    .from('recojos')
    .update({
      fecha: toIsoDateInput(rowData.Fecha) || null,
      id_lead_ganado: idLeadGanado,
      tipo_cobro: tipoCobro,
      observaciones: String(rowData.Observaciones ?? rowData.observaciones ?? '').trim() || null,
      ...derived,
    })
    .eq('stable_id', rowData._id)
    .select(
      'stable_id,business_id,fecha,id_lead_ganado,tipo_cobro,veces,cobro_a_tienda,pago_a_moto,ingreso_recojo_total,costo_recojo_total,observaciones',
    )
    .single();

  if (error) {
    throw new Error(error.message || 'No se pudo actualizar recojo en Supabase');
  }

  return {
    success: true,
    row: toRecojoSheetRow(data as RecojoRecord, refs),
  };
}

async function deleteRecojoSupabase(params: DeleteMutationPayload): Promise<MutationRowResponse> {
  if (!supabase) throw new Error('Supabase no está configurado');
  await requireSupabaseSession();

  const { error } = await supabase
    .from('recojos')
    .delete()
    .eq('stable_id', params.rowId);

  if (error) {
    throw new Error(error.message || 'No se pudo eliminar recojo en Supabase');
  }

  return {
    success: true,
    deletedId: params.rowId,
  };
}

async function addLeadGanadoSupabase(rowData: Record<string, unknown>): Promise<MutationRowResponse> {
  if (!supabase) throw new Error('Supabase no está configurado');
  await requireSupabaseSession();

  const tiendaSnapshot = String(rowData.Tienda ?? '').trim();
  if (!tiendaSnapshot) {
    throw new Error('El campo Tienda es obligatorio');
  }

  const fullfilmentLabel = String(rowData.FullFilment ?? '').trim();
  const origenLabel = String(rowData.Origen ?? '').trim();
  const vendedorLabel = String(rowData.Vendedor ?? '').trim();
  const distrito = normalizeDistritoValue(rowData.Distrito);

  if (!fullfilmentLabel) {
    throw new Error('El campo FullFilment es obligatorio');
  }

  if (!origenLabel) {
    throw new Error('El campo Origen es obligatorio');
  }

  const derived = calculateLeadDerivedValues({
    fechaIngresoLead: rowData['Fecha ingreso lead'],
    fechaLeadGanado: rowData['Fecha Lead Ganado'],
    anuladosFullfilmentRaw: rowData['Anulados Fullfilment'],
    cantidadEnviosRaw: rowData['Cantidad de envios'],
  });

  const { data, error } = await supabase
    .from('leads_ganados')
    .insert({
      tienda_nombre_snapshot: tiendaSnapshot,
      vendedor_nombre_snapshot: vendedorLabel || null,
      origen_snapshot: origenLabel || null,
      fullfilment_snapshot: normalizeLookupKey(fullfilmentLabel).includes('si') || normalizeLookupKey(fullfilmentLabel).includes('sí'),
      notas: String(rowData.Notas ?? '').trim() || null,
      distrito: distrito || null,
      ...derived,
    })
    .select(
      'stable_id,business_id,fecha_ingreso_lead,fecha_lead_ganado,dias_lead_a_ganado,notas,distrito,cantidad_envios,anulados_fullfilment,ingreso_anulados_fullfilment,kommo_lead_id,tienda_nombre_snapshot,vendedor_nombre_snapshot,pipeline_id_snapshot,origen_snapshot,fullfilment_snapshot',
    )
    .single();

  if (error) {
    throw new Error(error.message || 'No se pudo crear lead ganado en Supabase');
  }

  return {
    success: true,
    row: toLeadGanadoSheetRow(data as LeadGanadoRecord),
  };
}

async function updateLeadGanadoSupabase(rowData: UpdateMutationPayload): Promise<MutationRowResponse> {
  if (!supabase) throw new Error('Supabase no está configurado');
  await requireSupabaseSession();

  const tiendaSnapshot = String(rowData.Tienda ?? '').trim();
  if (!tiendaSnapshot) {
    throw new Error('El campo Tienda es obligatorio');
  }

  const fullfilmentLabel = String(rowData.FullFilment ?? '').trim();
  const origenLabel = String(rowData.Origen ?? '').trim();
  const vendedorLabel = String(rowData.Vendedor ?? '').trim();
  const distrito = normalizeDistritoValue(rowData.Distrito);

  if (!fullfilmentLabel) {
    throw new Error('El campo FullFilment es obligatorio');
  }

  if (!origenLabel) {
    throw new Error('El campo Origen es obligatorio');
  }

  const derived = calculateLeadDerivedValues({
    fechaIngresoLead: rowData['Fecha ingreso lead'],
    fechaLeadGanado: rowData['Fecha Lead Ganado'],
    anuladosFullfilmentRaw: rowData['Anulados Fullfilment'],
    cantidadEnviosRaw: rowData['Cantidad de envios'],
  });

  const { data, error } = await supabase
    .from('leads_ganados')
    .update({
      tienda_nombre_snapshot: tiendaSnapshot,
      vendedor_nombre_snapshot: vendedorLabel || null,
      origen_snapshot: origenLabel || null,
      fullfilment_snapshot: normalizeLookupKey(fullfilmentLabel).includes('si') || normalizeLookupKey(fullfilmentLabel).includes('sí'),
      notas: String(rowData.Notas ?? '').trim() || null,
      distrito: distrito || null,
      ...derived,
    })
    .eq('stable_id', rowData._id)
    .select(
      'stable_id,business_id,fecha_ingreso_lead,fecha_lead_ganado,dias_lead_a_ganado,notas,distrito,cantidad_envios,anulados_fullfilment,ingreso_anulados_fullfilment,kommo_lead_id,tienda_nombre_snapshot,vendedor_nombre_snapshot,pipeline_id_snapshot,origen_snapshot,fullfilment_snapshot',
    )
    .single();

  if (error) {
    throw new Error(error.message || 'No se pudo actualizar lead ganado en Supabase');
  }

  return {
    success: true,
    row: toLeadGanadoSheetRow(data as LeadGanadoRecord),
  };
}

async function deleteLeadGanadoSupabase(params: DeleteMutationPayload): Promise<MutationRowResponse> {
  if (!supabase) throw new Error('Supabase no está configurado');
  await requireSupabaseSession();

  const { error } = await supabase
    .from('leads_ganados')
    .delete()
    .eq('stable_id', params.rowId);

  if (error) {
    throw new Error(error.message || 'No se pudo eliminar lead ganado en Supabase');
  }

  return {
    success: true,
    deletedId: params.rowId,
  };
}

async function updateTarifaSupabase(rowData: UpdateMutationPayload): Promise<MutationRowResponse> {
  if (!supabase) {
    throw new Error('Supabase no está configurado');
  }

  await requireSupabaseSession();

  const destinoLabel = String(rowData.Destino ?? '').trim();
  if (!destinoLabel) {
    throw new Error('El campo Destino es obligatorio');
  }

  const cobroEntrega = formatCostForStorage(rowData['Cobro Entrega']);
  const pagoMoto = formatCostForStorage(rowData['Pago Moto']);

  const idDestino = await resolveDestinoIdByLabel(destinoLabel);

  const { data, error } = await supabase
    .from('tarifas')
    .update({
      id_destino: idDestino,
      cobro_entrega: cobroEntrega,
      pago_moto: pagoMoto,
      notas: String(rowData.Notas ?? '').trim() || null,
    })
    .eq('stable_id', rowData._id)
    .select('stable_id,business_id,id_destino,cobro_entrega,pago_moto,notas')
    .single();

  if (error) {
    throw new Error(error.message || 'No se pudo actualizar tarifa en Supabase');
  }

  const destinoMap = await getDestinoMapById();

  return {
    success: true,
    row: toTarifaSheetRow(data as TarifaRecord, destinoMap),
  };
}

async function deleteTarifaSupabase(params: DeleteMutationPayload): Promise<MutationRowResponse> {
  if (!supabase) {
    throw new Error('Supabase no está configurado');
  }

  await requireSupabaseSession();

  const { error } = await supabase
    .from('tarifas')
    .delete()
    .eq('stable_id', params.rowId);

  if (error) {
    throw new Error(error.message || 'No se pudo eliminar tarifa en Supabase');
  }

  return {
    success: true,
    deletedId: params.rowId,
  };
}

export function useAddRow(sheetName: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rowData: Record<string, unknown>) => {
      if (sheetName === RECOJOS_SHEET_NAME && isSupabaseConfigured()) {
        return addRecojoSupabase(rowData);
      }

      if (sheetName === LEADS_GANADOS_SHEET_NAME && isSupabaseConfigured()) {
        return addLeadGanadoSupabase(rowData);
      }

      if (sheetName === ENVIOS_SHEET_NAME && isSupabaseConfigured()) {
        return addEnvioSupabase(rowData);
      }

      if (sheetName === TARIFAS_SHEET_NAME && isSupabaseConfigured()) {
        return addTarifaSupabase(rowData);
      }

      if (shouldUseSupabaseForSheet(sheetName)) {
        return addBaseSheetSupabase(sheetName, rowData);
      }

      const res = await fetch(`/api/sheet?name=${encodeURIComponent(sheetName)}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(rowData),
        credentials: 'include',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'No se pudo crear el registro');
      }

      return res.json().catch(() => ({ success: true } as MutationRowResponse));
    },
    onSuccess: (result: MutationRowResponse) => {
      const createdRow = result.row;

      queryClient.setQueryData<SheetData>(getSheetQueryKey(sheetName), (current) => {
        if (!current || !createdRow) return current;

        return {
          ...current,
          rows: [...current.rows, { ...createdRow }],
        };
      });

      queryClient.invalidateQueries({ queryKey: getSheetQueryKey(sheetName), refetchType: 'none' });
      invalidateEnvioRelatedQueries(queryClient, sheetName);

      if (shouldUseSupabaseForSheet(sheetName)) {
        triggerOutboxSyncBestEffort();
      }
    },
  });
}

export function useUpdateRow(sheetName: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (rowData: UpdateMutationPayload) => {
      if (shouldUseSupabaseForSheet(sheetName)) {
        if (sheetName === RECOJOS_SHEET_NAME && isSupabaseConfigured()) {
          return updateRecojoSupabase(rowData);
        }

        if (sheetName === LEADS_GANADOS_SHEET_NAME && isSupabaseConfigured()) {
          return updateLeadGanadoSupabase(rowData);
        }

        if (sheetName === ENVIOS_SHEET_NAME && isSupabaseConfigured()) {
          return updateEnvioSupabase(rowData);
        }

        if (sheetName === TARIFAS_SHEET_NAME && isSupabaseConfigured()) {
          return updateTarifaSupabase(rowData);
        }

        return updateBaseSheetSupabase(sheetName, rowData);
      }

      const res = await fetch(`/api/sheet?name=${encodeURIComponent(sheetName)}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify(rowData),
        credentials: 'include',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'No se pudo actualizar el registro');
      }

      return res.json().catch(() => ({ success: true } as MutationRowResponse));
    },
    onSuccess: (result: MutationRowResponse, variables: UpdateMutationPayload) => {
      const updatedRow = result.row;
      const targetId = String(variables._id ?? '');

      queryClient.setQueryData<SheetData>(getSheetQueryKey(sheetName), (current) => {
        if (!current) return current;

        return {
          ...current,
          rows: current.rows.map((row) => {
            if (row._id !== targetId) return row;

            if (updatedRow) {
              return { ...row, ...updatedRow };
            }

            return {
              ...row,
              ...(variables as Record<string, string | number | boolean | null | undefined>),
            };
          }),
        };
      });

      queryClient.invalidateQueries({ queryKey: getSheetQueryKey(sheetName), refetchType: 'none' });
      invalidateEnvioRelatedQueries(queryClient, sheetName);

      if (shouldUseSupabaseForSheet(sheetName)) {
        triggerOutboxSyncBestEffort();
      }
    },
  });
}

export function useDeleteRow(sheetName: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (params: DeleteMutationPayload) => {
      if (sheetName === RECOJOS_SHEET_NAME && isSupabaseConfigured()) {
        return deleteRecojoSupabase(params);
      }

      if (sheetName === LEADS_GANADOS_SHEET_NAME && isSupabaseConfigured()) {
        return deleteLeadGanadoSupabase(params);
      }

      if (sheetName === ENVIOS_SHEET_NAME && isSupabaseConfigured()) {
        return deleteEnvioSupabase(params);
      }

      if (sheetName === TARIFAS_SHEET_NAME && isSupabaseConfigured()) {
        return deleteTarifaSupabase(params);
      }

      if (shouldUseSupabaseForSheet(sheetName)) {
        return deleteBaseSheetSupabase(sheetName, params);
      }

      const searchParams = new URLSearchParams({
        name: sheetName,
        _id: params.rowId,
      });

      if (typeof params.rowNumber === 'number' && Number.isInteger(params.rowNumber) && params.rowNumber >= 2) {
        searchParams.set('_rowNumber', String(params.rowNumber));
      }

      const res = await fetch(`/api/sheet?${searchParams.toString()}`, {
        method: 'DELETE',
        headers: getAuthHeaders(),
        credentials: 'include',
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || 'No se pudo eliminar el registro');
      }

      return res.json().catch(() => ({ success: true } as MutationRowResponse));
    },
    onSuccess: (_result: MutationRowResponse, variables: DeleteMutationPayload) => {
      queryClient.setQueryData<SheetData>(getSheetQueryKey(sheetName), (current) => {
        if (!current) return current;

        return {
          ...current,
          rows: current.rows.filter((row) => row._id !== variables.rowId),
        };
      });

      queryClient.invalidateQueries({ queryKey: getSheetQueryKey(sheetName), refetchType: 'none' });
      invalidateEnvioRelatedQueries(queryClient, sheetName);

      if (shouldUseSupabaseForSheet(sheetName)) {
        triggerOutboxSyncBestEffort();
      }
    },
  });
}
