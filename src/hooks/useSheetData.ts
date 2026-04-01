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
  mes: string | null;
  id_tienda: number;
  id_destino: number;
  id_resultado: number;
  cobro_entrega: number;
  pago_moto: number;
  excedente_pagado_moto: number | null;
  ingreso_total_fila: number;
  costo_total_fila: number;
  observaciones: string | null;
  id_vendedor: number | null;
  id_tipo_punto: number;
  id_fullfilment: number;
  extra_punto_moto: number;
  extra_punto_empresa: number;
}

interface RecojoRecord {
  stable_id: string;
  business_id: number;
  mes: string | null;
  id_tienda: number;
  id_tipo_recojo: number;
  veces: number;
  cobro_a_tienda_por_recojo: number;
  pago_moto_por_recojo: number;
  ingreso_recojo_total: number;
  costo_recojo_total: number;
  observaciones: string | null;
  id_vendedor: number | null;
}

interface LeadGanadoRecord {
  stable_id: string;
  business_id: number;
  id_tienda: number;
  id_vendedor: number;
  fecha_ingreso_lead: string;
  fecha_registro_lead: string;
  fecha_lead_ganado: string;
  dias_lead_a_registro: number;
  dias_registro_a_ganado: number;
  dias_lead_a_ganado: number;
  id_fullfilment: number;
  notas: string | null;
  distrito: string | null;
  cantidad_envios: number;
  id_origen: number;
  anulados_fullfilment: number;
  ingreso_anulados_fullfilment: number;
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
  VENDEDORES: {
    table: 'vendedores',
    columns: ['idVendedores', 'Nombre'],
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
  'Mes',
  'Tienda',
  'Destino',
  'Resultado',
  'Cobro Entrega',
  'Pago moto',
  'Excedente pagado moto',
  'ingreso total fila',
  'costo total fila',
  'observaciones',
  'Vendedor',
  'Tipo Punto',
  'FullFilment',
  'Extra punto moto',
  'Extra punto empresa',
] as const;
const RECOJOS_SHEET_NAME = 'RECOJOS';
const RECOJOS_COLUMNS = [
  'idRecojo',
  'Mes',
  'Tienda',
  'Tipo de Recojo',
  'Veces',
  'Cobro a tienda por recojo',
  'Pago moto por recojo',
  'Ingreso recojo total',
  'Costo recojo total',
  'Observaciones',
  'Vendedor',
] as const;
const LEADS_GANADOS_SHEET_NAME = 'LEADS GANADOS';
const LEADS_GANADOS_COLUMNS = [
  'idLeadGanado',
  'Tienda',
  'Vendedor',
  'Fecha ingreso lead',
  'Fecha registro lead',
  'Fecha Lead Ganado',
  'Dias Lead a Registro',
  'Dias Registro a Ganado',
  'Dias lead a ganado',
  'FullFilment',
  'Lead ganado en periodo?',
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
    throw new Error('Distrito es obligatorio');
  }

  const normalized = DISTRITO_LOOKUP.get(normalizeText(value));
  if (!normalized) {
    throw new Error(`Distrito inválido: "${value}"`);
  }

  return normalized;
}

let lastSupabaseSessionCheckAt = 0;
let cachedSupabaseSessionAvailable = false;
let lastOutboxSyncTriggerAt = 0;

export const SHEET_QUERY_STALE_TIME_MS = 60 * 1000;
export const SHEET_QUERY_REFETCH_INTERVAL_MS = 5 * 60 * 1000;

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

function parseMonthInput(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!value) {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  }

  const monthMatch = value.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!monthMatch) {
    throw new Error('Mes debe tener formato YYYY-MM');
  }

  return `${monthMatch[1]}-${monthMatch[2]}`;
}

function formatMonthForDisplay(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const monthMatch = value.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (!monthMatch) return value;
  return `${monthMatch[1]}-${monthMatch[2]}`;
}

function formatMonthForStorage(raw: unknown): string {
  return parseMonthInput(raw);
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
  tiendaLabelById: Map<number, string>;
  resultadoLabelById: Map<number, string>;
  tipoPuntoLabelById: Map<number, string>;
  fullfilmentLabelById: Map<number, string>;
  vendedorLabelById: Map<number, string>;
  normalTipoPuntoId: number | null;
  deliveredResultadoId: number | null;
  tarifaByDestinoId: Map<number, { cobroEntrega: number; pagoMoto: number }>;
  vendedorIdByTiendaId: Map<number, number>;
}

interface RecojoReferenceData {
  tiendaLabelById: Map<number, string>;
  tipoRecojoLabelById: Map<number, string>;
  vendedorLabelById: Map<number, string>;
  vendedorIdByTiendaId: Map<number, number>;
  recojoGratisId: number | null;
}

function toEnvioSheetRow(record: EnvioRecord, refs: EnvioReferenceData): SheetRow {
  const tienda = refs.tiendaLabelById.get(record.id_tienda) ?? `#${record.id_tienda}`;
  const destino = refs.destinoLabelById.get(record.id_destino) ?? `#${record.id_destino}`;
  const resultado = refs.resultadoLabelById.get(record.id_resultado) ?? `#${record.id_resultado}`;
  const vendedor = record.id_vendedor ? refs.vendedorLabelById.get(record.id_vendedor) ?? `#${record.id_vendedor}` : '';
  const tipoPunto = refs.tipoPuntoLabelById.get(record.id_tipo_punto) ?? `#${record.id_tipo_punto}`;
  const fullfilment = refs.fullfilmentLabelById.get(record.id_fullfilment) ?? `#${record.id_fullfilment}`;

  return {
    _id: record.stable_id,
    idEnvios: record.business_id,
    Mes: formatMonthForDisplay(record.mes),
    Tienda: tienda,
    Destino: destino,
    Resultado: resultado,
    'Cobro Entrega': formatCostForDisplay(record.cobro_entrega),
    'Pago moto': formatCostForDisplay(record.pago_moto),
    'Excedente pagado moto': formatCostForDisplay(record.excedente_pagado_moto ?? 0),
    'ingreso total fila': formatCostForDisplay(record.ingreso_total_fila),
    'costo total fila': formatCostForDisplay(record.costo_total_fila),
    observaciones: record.observaciones ?? '',
    Vendedor: vendedor,
    'Tipo Punto': tipoPunto,
    FullFilment: fullfilment,
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
  fechaRegistroLead: unknown;
  fechaLeadGanado: unknown;
  anuladosFullfilmentRaw: unknown;
  cantidadEnviosRaw: unknown;
}) {
  const fechaIngreso = parseIsoDate(input.fechaIngresoLead);
  const fechaRegistro = parseIsoDate(input.fechaRegistroLead);
  const fechaGanado = parseIsoDate(input.fechaLeadGanado);

  const diasLeadARegistro = diffDays(fechaIngreso, fechaRegistro);
  const diasRegistroAGanado = diffDays(fechaRegistro, fechaGanado);
  const diasLeadAGanado = diffDays(fechaIngreso, fechaGanado);

  const anuladosFullfilment = Math.round(parseNumericValue(input.anuladosFullfilmentRaw) ?? 0);
  const cantidadEnvios = Math.max(0, Math.round(parseNumericValue(input.cantidadEnviosRaw) ?? 0));
  const ingresoAnuladosFullfilment = anuladosFullfilment * 2;

  return {
    fecha_ingreso_lead: toIsoDateInput(input.fechaIngresoLead),
    fecha_registro_lead: toIsoDateInput(input.fechaRegistroLead),
    fecha_lead_ganado: toIsoDateInput(input.fechaLeadGanado),
    dias_lead_a_registro: diasLeadARegistro,
    dias_registro_a_ganado: diasRegistroAGanado,
    dias_lead_a_ganado: diasLeadAGanado,
    cantidad_envios: cantidadEnvios,
    anulados_fullfilment: formatCostForStorage(anuladosFullfilment),
    ingreso_anulados_fullfilment: formatCostForStorage(ingresoAnuladosFullfilment),
  };
}

function toRecojoSheetRow(record: RecojoRecord, refs: RecojoReferenceData): SheetRow {
  return {
    _id: record.stable_id,
    idRecojo: record.business_id,
    Mes: formatMonthForDisplay(record.mes),
    Tienda: refs.tiendaLabelById.get(record.id_tienda) ?? `#${record.id_tienda}`,
    'Tipo de Recojo': refs.tipoRecojoLabelById.get(record.id_tipo_recojo) ?? `#${record.id_tipo_recojo}`,
    Veces: String(record.veces ?? 0),
    'Cobro a tienda por recojo': formatCostForDisplay(record.cobro_a_tienda_por_recojo),
    'Pago moto por recojo': formatCostForDisplay(record.pago_moto_por_recojo),
    'Ingreso recojo total': formatCostForDisplay(record.ingreso_recojo_total),
    'Costo recojo total': formatCostForDisplay(record.costo_recojo_total),
    Observaciones: record.observaciones ?? '',
    Vendedor: record.id_vendedor ? refs.vendedorLabelById.get(record.id_vendedor) ?? `#${record.id_vendedor}` : '',
  };
}

interface LeadReferenceData {
  tiendaLabelById: Map<number, string>;
  vendedorLabelById: Map<number, string>;
  fullfilmentLabelById: Map<number, string>;
  origenLabelById: Map<number, string>;
}

function toLeadGanadoSheetRow(record: LeadGanadoRecord, refs: LeadReferenceData): SheetRow {
  return {
    _id: record.stable_id,
    idLeadGanado: record.business_id,
    Tienda: refs.tiendaLabelById.get(record.id_tienda) ?? `#${record.id_tienda}`,
    Vendedor: refs.vendedorLabelById.get(record.id_vendedor) ?? `#${record.id_vendedor}`,
    'Fecha ingreso lead': toDmyDisplayDate(record.fecha_ingreso_lead),
    'Fecha registro lead': toDmyDisplayDate(record.fecha_registro_lead),
    'Fecha Lead Ganado': toDmyDisplayDate(record.fecha_lead_ganado),
    'Dias Lead a Registro': String(record.dias_lead_a_registro ?? 0),
    'Dias Registro a Ganado': String(record.dias_registro_a_ganado ?? 0),
    'Dias lead a ganado': String(record.dias_lead_a_ganado ?? 0),
    FullFilment: refs.fullfilmentLabelById.get(record.id_fullfilment) ?? `#${record.id_fullfilment}`,
    'Lead ganado en periodo?': '',
    Notas: record.notas ?? '',
    Distrito: record.distrito ?? '',
    'Cantidad de envios': String(record.cantidad_envios ?? 0),
    Origen: refs.origenLabelById.get(record.id_origen) ?? `#${record.id_origen}`,
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
  if (import.meta.env.DEV && import.meta.env.VITE_ENABLE_OUTBOX_SYNC_IN_DEV !== 'true') {
    return;
  }

  const now = Date.now();

  // Evita disparar demasiados POST seguidos en operaciones encadenadas.
  if (now - lastOutboxSyncTriggerAt < 1_500) {
    return;
  }

  lastOutboxSyncTriggerAt = now;

  void fetch('/api/sync-outbox', {
    method: 'POST',
    credentials: 'include',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limit: 50 }),
  }).catch(() => {
    // Silencioso por diseño: el cron sigue como red de seguridad.
  });
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

async function fetchSheetFromApi(name: string): Promise<SheetData> {
  const response = await fetch(`/api/sheet?name=${encodeURIComponent(name)}`, {
    credentials: 'include',
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || `No se pudieron cargar los datos de: ${name}`);
  }

  return response.json();
}

async function fetchBaseSheetFromSupabase(sheetName: string): Promise<SheetData> {
  if (!supabase) {
    throw new Error('Supabase no está configurado');
  }

  const config = getBaseSheetConfig(sheetName);
  if (!config) {
    throw new Error(`La hoja ${sheetName} no está configurada para Supabase`);
  }

  await requireSupabaseSession();

  const { data, error } = await supabase
    .from(config.table)
    .select(`stable_id,business_id,${config.dbTextField}`)
    .order('business_id', { ascending: true });

  if (error) {
    throw new Error(error.message || `No se pudieron cargar datos de ${sheetName} desde Supabase`);
  }

  return mapBaseRowsToSheetData(asBaseSupabaseRecordRawArray(data ?? []), config);
}

async function getDestinoMapById() {
  if (!supabase) {
    throw new Error('Supabase no está configurado');
  }

  const { data, error } = await supabase
    .from('destinos')
    .select('business_id,destino')
    .order('business_id', { ascending: true });

  if (error) {
    throw new Error(error.message || 'No se pudieron cargar destinos para la tabla TARIFAS');
  }

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

  await requireSupabaseSession();

  const [destinoMapById, tarifasResponse] = await Promise.all([
    getDestinoMapById(),
    supabase
      .from('tarifas')
      .select('stable_id,business_id,id_destino,cobro_entrega,pago_moto,notas')
      .order('business_id', { ascending: true }),
  ]);

  const { data, error } = tarifasResponse;
  if (error) {
    throw new Error(error.message || 'No se pudieron cargar TARIFAS desde Supabase');
  }

  return {
    columns: [...TARIFAS_COLUMNS],
    rows: ((data ?? []) as TarifaRecord[]).map((record) => toTarifaSheetRow(record, destinoMapById)),
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

  const [destinoLabelById, tiendaLabelById, resultadoLabelById, tipoPuntoLabelById, fullfilmentLabelById, vendedorLabelById] =
    await Promise.all([
      fetchReferenceMap('destinos', ['business_id', 'id'], ['destino']),
      fetchReferenceMap('tiendas', ['business_id', 'id'], ['nombre']),
      fetchReferenceMap('resultados', ['business_id', 'id'], ['resultado']),
      fetchReferenceMap('tipo_punto', ['business_id', 'id'], ['tipo_punto']),
      fetchReferenceMap('fullfilment', ['business_id', 'id'], ['es_fullfilment']),
      fetchReferenceMap('vendedores', ['business_id', 'id'], ['nombre']),
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

  const vendedorIdByTiendaId = new Map<number, number>();
  const { data: leadsData, error: leadsError } = await supabase
    .from('leads_ganados')
    .select('id_tienda,id_vendedor,business_id,updated_at')
    .order('business_id', { ascending: false })
    .limit(20000);

  if (!leadsError) {
    for (const row of (leadsData ?? []) as Array<{ id_tienda: number; id_vendedor: number; business_id: number; updated_at: string }>) {
      const tiendaId = Number(row.id_tienda);
      const vendedorId = Number(row.id_vendedor);
      if (Number.isFinite(tiendaId) && Number.isFinite(vendedorId) && !vendedorIdByTiendaId.has(tiendaId)) {
        vendedorIdByTiendaId.set(tiendaId, vendedorId);
      }
    }
  }

  return {
    destinoLabelById,
    tiendaLabelById,
    resultadoLabelById,
    tipoPuntoLabelById,
    fullfilmentLabelById,
    vendedorLabelById,
    normalTipoPuntoId,
    deliveredResultadoId,
    tarifaByDestinoId,
    vendedorIdByTiendaId,
  };
}

async function fetchRecojoReferenceData(): Promise<RecojoReferenceData> {
  if (!supabase) throw new Error('Supabase no está configurado');

  const [tiendaLabelById, tipoRecojoLabelById, vendedorLabelById] = await Promise.all([
    fetchReferenceMap('tiendas', ['business_id', 'id'], ['nombre']),
    fetchReferenceMap('tipo_recojo', ['business_id', 'id'], ['tipo_recojo']),
    fetchReferenceMap('vendedores', ['business_id', 'id'], ['nombre']),
  ]);

  const recojoGratisId =
    Array.from(tipoRecojoLabelById.entries()).find(([, label]) => normalizeLookupKey(label).includes(normalizeLookupKey('gratis')))?.[0] ??
    null;

  const vendedorIdByTiendaId = new Map<number, number>();
  const { data: leadsData, error: leadsError } = await supabase
    .from('leads_ganados')
    .select('id_tienda,id_vendedor,business_id')
    .order('business_id', { ascending: false })
    .limit(20000);

  if (!leadsError) {
    for (const row of (leadsData ?? []) as Array<{ id_tienda: number; id_vendedor: number; business_id: number }>) {
      const tiendaId = Number(row.id_tienda);
      const vendedorId = Number(row.id_vendedor);
      if (Number.isFinite(tiendaId) && Number.isFinite(vendedorId) && !vendedorIdByTiendaId.has(tiendaId)) {
        vendedorIdByTiendaId.set(tiendaId, vendedorId);
      }
    }
  }

  return {
    tiendaLabelById,
    tipoRecojoLabelById,
    vendedorLabelById,
    vendedorIdByTiendaId,
    recojoGratisId,
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
        'stable_id,business_id,mes,id_tienda,id_destino,id_resultado,cobro_entrega,pago_moto,excedente_pagado_moto,ingreso_total_fila,costo_total_fila,observaciones,id_vendedor,id_tipo_punto,id_fullfilment,extra_punto_moto,extra_punto_empresa',
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
        'stable_id,business_id,mes,id_tienda,id_tipo_recojo,veces,cobro_a_tienda_por_recojo,pago_moto_por_recojo,ingreso_recojo_total,costo_recojo_total,observaciones,id_vendedor',
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

async function fetchLeadReferenceData(): Promise<LeadReferenceData> {
  const [tiendaLabelById, vendedorLabelById, fullfilmentLabelById, origenLabelById] = await Promise.all([
    fetchReferenceMap('tiendas', ['business_id', 'id'], ['nombre']),
    fetchReferenceMap('vendedores', ['business_id', 'id'], ['nombre']),
    fetchReferenceMap('fullfilment', ['business_id', 'id'], ['es_fullfilment']),
    fetchReferenceMap('origen', ['business_id', 'id'], ['opcion']),
  ]);

  return {
    tiendaLabelById,
    vendedorLabelById,
    fullfilmentLabelById,
    origenLabelById,
  };
}

async function fetchLeadsGanadosFromSupabase(): Promise<SheetData> {
  if (!supabase) throw new Error('Supabase no está configurado');

  await requireSupabaseSession();

  const [refs, leadsResponse] = await Promise.all([
    fetchLeadReferenceData(),
    supabase
      .from('leads_ganados')
      .select(
        'stable_id,business_id,id_tienda,id_vendedor,fecha_ingreso_lead,fecha_registro_lead,fecha_lead_ganado,dias_lead_a_registro,dias_registro_a_ganado,dias_lead_a_ganado,id_fullfilment,notas,distrito,cantidad_envios,id_origen,anulados_fullfilment,ingreso_anulados_fullfilment',
      )
      .order('business_id', { ascending: true }),
  ]);

  const { data, error } = leadsResponse;
  if (error) {
    throw new Error(error.message || 'No se pudieron cargar LEADS GANADOS desde Supabase');
  }

  return {
    columns: [...LEADS_GANADOS_COLUMNS],
    rows: ((data ?? []) as LeadGanadoRecord[]).map((record) => toLeadGanadoSheetRow(record, refs)),
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

  return fetchSheetFromApi(name);
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
      if (shouldUseSupabaseForSheet('DESTINOS')) {
        return fetchBaseSheetFromSupabase('DESTINOS');
      }

      return fetchSheetFromApi('DESTINOS');
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
        tiendas: Array.from(refs.tiendaLabelById.values()).sort((a, b) => a.localeCompare(b, 'es')),
        destinos: Array.from(refs.destinoLabelById.values()).sort((a, b) => a.localeCompare(b, 'es')),
        resultados: Array.from(refs.resultadoLabelById.values()).sort((a, b) => a.localeCompare(b, 'es')),
        tipoPunto: Array.from(refs.tipoPuntoLabelById.values()).sort((a, b) => a.localeCompare(b, 'es')),
        fullfilment: Array.from(refs.fullfilmentLabelById.values()).sort((a, b) => a.localeCompare(b, 'es')),
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
        tiendas: Array.from(refs.tiendaLabelById.values()).sort((a, b) => a.localeCompare(b, 'es')),
        tipoRecojo: Array.from(refs.tipoRecojoLabelById.values()).sort((a, b) => a.localeCompare(b, 'es')),
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
  destino: string;
  resultado: string;
  tipoPunto: string;
  tienda: string;
  excedentePagadoMoto: string;
}) {
  return useQuery({
    queryKey: ['sheet-preview', 'ENVIOS', input.destino, input.resultado, input.tipoPunto, input.tienda, input.excedentePagadoMoto],
    enabled: input.enabled,
    queryFn: async () => {
      const refs = await fetchEnvioReferenceData();

      const idDestino = input.destino ? findIdByLabelOrThrow(refs.destinoLabelById, input.destino, 'Destino') : null;
      const idResultado = input.resultado ? findIdByLabelOrThrow(refs.resultadoLabelById, input.resultado, 'Resultado') : null;
      const idTipoPunto = input.tipoPunto ? findIdByLabelOrThrow(refs.tipoPuntoLabelById, input.tipoPunto, 'Tipo Punto') : null;
      const idTienda = input.tienda ? findIdByLabelOrThrow(refs.tiendaLabelById, input.tienda, 'Tienda') : null;

      if (idDestino === null || idResultado === null || idTipoPunto === null) {
        return {
          'Cobro Entrega': '0.00',
          'Pago moto': '0.00',
          'Extra punto moto': '0.00',
          'Extra punto empresa': '0.00',
          'ingreso total fila': '0.00',
          'costo total fila': '0.00',
          idVendedor: 'Se asigna por Tienda (Leads Ganados)',
        };
      }

      const derived = calculateEnvioDerivedValues({
        idDestino,
        idResultado,
        idTipoPunto,
        excedentePagadoMotoRaw: input.excedentePagadoMoto,
        refs,
      });

      const vendedorId = idTienda !== null ? refs.vendedorIdByTiendaId.get(idTienda) ?? null : null;
      const vendedorLabel = vendedorId ? refs.vendedorLabelById.get(vendedorId) ?? `#${vendedorId}` : 'Se asigna por Tienda (Leads Ganados)';

      return {
        'Cobro Entrega': formatCostForDisplay(derived.cobro_entrega),
        'Pago moto': formatCostForDisplay(derived.pago_moto),
        'Extra punto moto': formatCostForDisplay(derived.extra_punto_moto),
        'Extra punto empresa': formatCostForDisplay(derived.extra_punto_empresa),
        'ingreso total fila': formatCostForDisplay(derived.ingreso_total_fila),
        'costo total fila': formatCostForDisplay(derived.costo_total_fila),
        idVendedor: vendedorLabel,
      };
    },
    staleTime: 5_000,
  });
}

export function useLeadGanadoAutoPreview(input: {
  enabled: boolean;
  fechaIngresoLead: string;
  fechaRegistroLead: string;
  fechaLeadGanado: string;
  anuladosFullfilment: string;
  tienda: string;
}) {
  return useQuery({
    queryKey: [
      'sheet-preview',
      'LEADS_GANADOS',
      input.fechaIngresoLead,
      input.fechaRegistroLead,
      input.fechaLeadGanado,
      input.anuladosFullfilment,
      input.tienda,
    ],
    enabled: input.enabled,
    queryFn: async () => {
      const refs = await fetchLeadReferenceData();

      let cantidadEnvios = 0;
      if (input.tienda && supabase) {
        const idTienda = findIdByLabelOrThrow(refs.tiendaLabelById, input.tienda, 'Tienda');
        const { data: enviosRows, error } = await supabase
          .from('envios')
          .select('id_tienda')
          .eq('id_tienda', idTienda);

        if (!error) {
          cantidadEnvios = (enviosRows ?? []).length;
        }
      }

      const derived = calculateLeadDerivedValues({
        fechaIngresoLead: input.fechaIngresoLead,
        fechaRegistroLead: input.fechaRegistroLead,
        fechaLeadGanado: input.fechaLeadGanado,
        anuladosFullfilmentRaw: input.anuladosFullfilment,
        cantidadEnviosRaw: cantidadEnvios,
      });

      return {
        'Dias Lead a Registro': String(derived.dias_lead_a_registro),
        'Dias Registro a Ganado': String(derived.dias_registro_a_ganado),
        'Dias lead a ganado': String(derived.dias_lead_a_ganado),
        'Lead ganado en periodo?': '',
        'Cantidad de envios': String(derived.cantidad_envios),
        'Ingreso anulados fullfilment': formatCostForDisplay(derived.ingreso_anulados_fullfilment),
      };
    },
    staleTime: 5_000,
  });
}

function calculateRecojoDerivedValues(input: {
  idTipoRecojo: number;
  vecesRaw: unknown;
  refs: RecojoReferenceData;
}) {
  const veces = Math.max(0, Math.round(parseNumericValue(input.vecesRaw) ?? 0));
  const pagoMotoPorRecojo = 4;
  const isGratis = input.refs.recojoGratisId !== null && input.idTipoRecojo === input.refs.recojoGratisId;
  const cobroATiendaPorRecojo = isGratis ? 0 : 8;

  const ingresoRecojoTotal = veces * cobroATiendaPorRecojo;
  const costoRecojoTotal = veces * pagoMotoPorRecojo;

  return {
    veces,
    cobro_a_tienda_por_recojo: formatCostForStorage(cobroATiendaPorRecojo),
    pago_moto_por_recojo: formatCostForStorage(pagoMotoPorRecojo),
    ingreso_recojo_total: formatCostForStorage(ingresoRecojoTotal),
    costo_recojo_total: formatCostForStorage(costoRecojoTotal),
  };
}

export function useRecojoAutoPreview(input: {
  enabled: boolean;
  tipoRecojo: string;
  tienda: string;
  veces: string;
}) {
  return useQuery({
    queryKey: ['sheet-preview', 'RECOJOS', input.tipoRecojo, input.tienda, input.veces],
    enabled: input.enabled,
    queryFn: async () => {
      const refs = await fetchRecojoReferenceData();

      const idTipoRecojo = input.tipoRecojo ? findIdByLabelOrThrow(refs.tipoRecojoLabelById, input.tipoRecojo, 'Tipo de Recojo') : null;
      const idTienda = input.tienda ? findIdByLabelOrThrow(refs.tiendaLabelById, input.tienda, 'Tienda') : null;

      if (idTipoRecojo === null) {
        return {
          'Cobro a tienda por recojo': '0.00',
          'Pago moto por recojo': '4.00',
          'Ingreso recojo total': '0.00',
          'Costo recojo total': '0.00',
          Vendedor: 'Se asigna por Tienda (Leads Ganados)',
        };
      }

      const derived = calculateRecojoDerivedValues({
        idTipoRecojo,
        vecesRaw: input.veces,
        refs,
      });

      const vendedorId = idTienda !== null ? refs.vendedorIdByTiendaId.get(idTienda) ?? null : null;
      const vendedorLabel = vendedorId ? refs.vendedorLabelById.get(vendedorId) ?? `#${vendedorId}` : 'Se asigna por Tienda (Leads Ganados)';

      return {
        'Cobro a tienda por recojo': formatCostForDisplay(derived.cobro_a_tienda_por_recojo),
        'Pago moto por recojo': formatCostForDisplay(derived.pago_moto_por_recojo),
        'Ingreso recojo total': formatCostForDisplay(derived.ingreso_recojo_total),
        'Costo recojo total': formatCostForDisplay(derived.costo_recojo_total),
        Vendedor: vendedorLabel,
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

  const idTienda = findIdByLabelOrThrow(refs.tiendaLabelById, rowData.Tienda, 'Tienda');
  const idDestino = findIdByLabelOrThrow(refs.destinoLabelById, rowData.Destino, 'Destino');
  const idResultado = findIdByLabelOrThrow(refs.resultadoLabelById, rowData.Resultado, 'Resultado');
  const idTipoPunto = findIdByLabelOrThrow(refs.tipoPuntoLabelById, rowData['Tipo Punto'], 'Tipo Punto');
  const idFullfilment = findIdByLabelOrThrow(refs.fullfilmentLabelById, rowData.FullFilment, 'FullFilment');

  const idVendedor = refs.vendedorIdByTiendaId.get(idTienda) ?? null;

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
      mes: formatMonthForStorage(rowData.Mes),
      id_tienda: idTienda,
      id_destino: idDestino,
      id_resultado: idResultado,
      id_vendedor: idVendedor,
      id_tipo_punto: idTipoPunto,
      id_fullfilment: idFullfilment,
      observaciones: String(rowData.observaciones ?? rowData.Observaciones ?? '').trim() || null,
      ...derived,
    })
    .select(
      'stable_id,business_id,mes,id_tienda,id_destino,id_resultado,cobro_entrega,pago_moto,excedente_pagado_moto,ingreso_total_fila,costo_total_fila,observaciones,id_vendedor,id_tipo_punto,id_fullfilment,extra_punto_moto,extra_punto_empresa',
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

  const idTienda = findIdByLabelOrThrow(refs.tiendaLabelById, rowData.Tienda, 'Tienda');
  const idDestino = findIdByLabelOrThrow(refs.destinoLabelById, rowData.Destino, 'Destino');
  const idResultado = findIdByLabelOrThrow(refs.resultadoLabelById, rowData.Resultado, 'Resultado');
  const idTipoPunto = findIdByLabelOrThrow(refs.tipoPuntoLabelById, rowData['Tipo Punto'], 'Tipo Punto');
  const idFullfilment = findIdByLabelOrThrow(refs.fullfilmentLabelById, rowData.FullFilment, 'FullFilment');

  const idVendedor = refs.vendedorIdByTiendaId.get(idTienda) ?? null;

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
      mes: formatMonthForStorage(rowData.Mes),
      id_tienda: idTienda,
      id_destino: idDestino,
      id_resultado: idResultado,
      id_vendedor: idVendedor,
      id_tipo_punto: idTipoPunto,
      id_fullfilment: idFullfilment,
      observaciones: String(rowData.observaciones ?? rowData.Observaciones ?? '').trim() || null,
      ...derived,
    })
    .eq('stable_id', rowData._id)
    .select(
      'stable_id,business_id,mes,id_tienda,id_destino,id_resultado,cobro_entrega,pago_moto,excedente_pagado_moto,ingreso_total_fila,costo_total_fila,observaciones,id_vendedor,id_tipo_punto,id_fullfilment,extra_punto_moto,extra_punto_empresa',
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

  const idTienda = findIdByLabelOrThrow(refs.tiendaLabelById, rowData.Tienda, 'Tienda');
  const idTipoRecojo = findIdByLabelOrThrow(refs.tipoRecojoLabelById, rowData['Tipo de Recojo'], 'Tipo de Recojo');
  const idVendedor = refs.vendedorIdByTiendaId.get(idTienda) ?? null;

  const derived = calculateRecojoDerivedValues({
    idTipoRecojo,
    vecesRaw: rowData.Veces,
    refs,
  });

  const { data, error } = await supabase
    .from('recojos')
    .insert({
      mes: formatMonthForStorage(rowData.Mes),
      id_tienda: idTienda,
      id_tipo_recojo: idTipoRecojo,
      id_vendedor: idVendedor,
      observaciones: String(rowData.Observaciones ?? rowData.observaciones ?? '').trim() || null,
      ...derived,
    })
    .select(
      'stable_id,business_id,mes,id_tienda,id_tipo_recojo,veces,cobro_a_tienda_por_recojo,pago_moto_por_recojo,ingreso_recojo_total,costo_recojo_total,observaciones,id_vendedor',
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

  const idTienda = findIdByLabelOrThrow(refs.tiendaLabelById, rowData.Tienda, 'Tienda');
  const idTipoRecojo = findIdByLabelOrThrow(refs.tipoRecojoLabelById, rowData['Tipo de Recojo'], 'Tipo de Recojo');
  const idVendedor = refs.vendedorIdByTiendaId.get(idTienda) ?? null;

  const derived = calculateRecojoDerivedValues({
    idTipoRecojo,
    vecesRaw: rowData.Veces,
    refs,
  });

  const { data, error } = await supabase
    .from('recojos')
    .update({
      mes: formatMonthForStorage(rowData.Mes),
      id_tienda: idTienda,
      id_tipo_recojo: idTipoRecojo,
      id_vendedor: idVendedor,
      observaciones: String(rowData.Observaciones ?? rowData.observaciones ?? '').trim() || null,
      ...derived,
    })
    .eq('stable_id', rowData._id)
    .select(
      'stable_id,business_id,mes,id_tienda,id_tipo_recojo,veces,cobro_a_tienda_por_recojo,pago_moto_por_recojo,ingreso_recojo_total,costo_recojo_total,observaciones,id_vendedor',
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

  const refs = await fetchLeadReferenceData();

  const { data: enviosRows, error: enviosCountError } = await supabase
    .from('envios')
    .select('id_tienda')
    .eq('id_tienda', findIdByLabelOrThrow(refs.tiendaLabelById, rowData.Tienda, 'Tienda'));

  if (enviosCountError) {
    throw new Error(enviosCountError.message || 'No se pudo calcular cantidad de envíos para lead ganado');
  }

  const idTienda = findIdByLabelOrThrow(refs.tiendaLabelById, rowData.Tienda, 'Tienda');
  const idVendedor = findIdByLabelOrThrow(refs.vendedorLabelById, rowData.Vendedor, 'Vendedor');
  const idFullfilment = findIdByLabelOrThrow(refs.fullfilmentLabelById, rowData.FullFilment, 'FullFilment');
  const idOrigen = findIdByLabelOrThrow(refs.origenLabelById, rowData.Origen, 'Origen');
  const distrito = normalizeDistritoValue(rowData.Distrito);

  const derived = calculateLeadDerivedValues({
    fechaIngresoLead: rowData['Fecha ingreso lead'],
    fechaRegistroLead: rowData['Fecha registro lead'],
    fechaLeadGanado: rowData['Fecha Lead Ganado'],
    anuladosFullfilmentRaw: rowData['Anulados Fullfilment'],
    cantidadEnviosRaw: (enviosRows ?? []).length,
  });

  const { data, error } = await supabase
    .from('leads_ganados')
    .insert({
      id_tienda: idTienda,
      id_vendedor: idVendedor,
      id_fullfilment: idFullfilment,
      id_origen: idOrigen,
      notas: String(rowData.Notas ?? '').trim() || null,
      distrito,
      ...derived,
    })
    .select(
      'stable_id,business_id,id_tienda,id_vendedor,fecha_ingreso_lead,fecha_registro_lead,fecha_lead_ganado,dias_lead_a_registro,dias_registro_a_ganado,dias_lead_a_ganado,id_fullfilment,notas,distrito,cantidad_envios,id_origen,anulados_fullfilment,ingreso_anulados_fullfilment',
    )
    .single();

  if (error) {
    throw new Error(error.message || 'No se pudo crear lead ganado en Supabase');
  }

  return {
    success: true,
    row: toLeadGanadoSheetRow(data as LeadGanadoRecord, refs),
  };
}

async function updateLeadGanadoSupabase(rowData: UpdateMutationPayload): Promise<MutationRowResponse> {
  if (!supabase) throw new Error('Supabase no está configurado');
  await requireSupabaseSession();

  const refs = await fetchLeadReferenceData();

  const idTienda = findIdByLabelOrThrow(refs.tiendaLabelById, rowData.Tienda, 'Tienda');

  const { data: enviosRows, error: enviosCountError } = await supabase
    .from('envios')
    .select('id_tienda')
    .eq('id_tienda', idTienda);

  if (enviosCountError) {
    throw new Error(enviosCountError.message || 'No se pudo calcular cantidad de envíos para lead ganado');
  }

  const idVendedor = findIdByLabelOrThrow(refs.vendedorLabelById, rowData.Vendedor, 'Vendedor');
  const idFullfilment = findIdByLabelOrThrow(refs.fullfilmentLabelById, rowData.FullFilment, 'FullFilment');
  const idOrigen = findIdByLabelOrThrow(refs.origenLabelById, rowData.Origen, 'Origen');
  const distrito = normalizeDistritoValue(rowData.Distrito);

  const derived = calculateLeadDerivedValues({
    fechaIngresoLead: rowData['Fecha ingreso lead'],
    fechaRegistroLead: rowData['Fecha registro lead'],
    fechaLeadGanado: rowData['Fecha Lead Ganado'],
    anuladosFullfilmentRaw: rowData['Anulados Fullfilment'],
    cantidadEnviosRaw: (enviosRows ?? []).length,
  });

  const { data, error } = await supabase
    .from('leads_ganados')
    .update({
      id_tienda: idTienda,
      id_vendedor: idVendedor,
      id_fullfilment: idFullfilment,
      id_origen: idOrigen,
      notas: String(rowData.Notas ?? '').trim() || null,
      distrito,
      ...derived,
    })
    .eq('stable_id', rowData._id)
    .select(
      'stable_id,business_id,id_tienda,id_vendedor,fecha_ingreso_lead,fecha_registro_lead,fecha_lead_ganado,dias_lead_a_registro,dias_registro_a_ganado,dias_lead_a_ganado,id_fullfilment,notas,distrito,cantidad_envios,id_origen,anulados_fullfilment,ingreso_anulados_fullfilment',
    )
    .single();

  if (error) {
    throw new Error(error.message || 'No se pudo actualizar lead ganado en Supabase');
  }

  return {
    success: true,
    row: toLeadGanadoSheetRow(data as LeadGanadoRecord, refs),
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

      if (shouldUseSupabaseForSheet(sheetName)) {
        triggerOutboxSyncBestEffort();
      }
    },
  });
}
