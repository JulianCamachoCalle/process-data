import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { verifyAdminSession } from '../src/server/auth.js';
import { getRawSheet, STABLE_ROW_ID_COLUMN } from '../src/lib/google-sheets.js';
import { normalizeText } from '../src/lib/tableHelpers.js';
import {
  extractLeadGanadoBusinessIdsFromEnvioPayload,
  recalculateLeadGanadoCountersByBusinessId,
} from './kommo/leads-ganados-auto.js';

const bodySchema = z
  .object({
    limit: z.number().int().min(1).max(100).optional(),
  })
  .optional();

const DEFAULT_BATCH_LIMIT = 20;

interface OutboxEvent {
  id: string;
  entity: string;
  entity_id: string;
  operation: 'create' | 'update' | 'delete';
  payload: unknown;
  attempts: number;
}

interface BaseEntityConfig {
  sheetName: string;
  dbTextField: string;
  sheetTextField: string;
  sheetBusinessIdField: string;
}

interface TarifaEntityConfig {
  sheetName: string;
  sheetBusinessIdField: string;
  sheetDestinoIdField: string;
  sheetDestinoLabelField?: string;
  sheetCobroEntregaField: string;
  sheetPagoMotoField: string;
  sheetNotasField: string;
}

interface EnvioEntityConfig {
  sheetName: string;
  sheetBusinessIdField: string;
  mesField: string;
  idTiendaField: string;
  tiendaLabelField?: string;
  idDestinoField: string;
  destinoLabelField?: string;
  idResultadoField: string;
  resultadoLabelField?: string;
  cobroEntregaField: string;
  pagoMotoField: string;
  excedentePagoMotoField: string;
  ingresoTotalFilaField: string;
  costoTotalFilaField: string;
  observacionesField: string;
  idVendedorField: string;
  vendedorLabelField?: string;
  idTipoPuntoField: string;
  tipoPuntoLabelField?: string;
  idFullfilmentField: string;
  fullfilmentLabelField?: string;
  extraPuntoMotoField: string;
  extraPuntoEmpresaField: string;
}

interface RecojoEntityConfig {
  sheetName: string;
  sheetBusinessIdField: string;
  mesField: string;
  idTiendaField: string;
  tiendaLabelField?: string;
  idTipoRecojoField: string;
  tipoRecojoLabelField?: string;
  vecesField: string;
  cobroATiendaField: string;
  pagoMotoField: string;
  ingresoRecojoTotalField: string;
  costoRecojoTotalField: string;
  observacionesField: string;
  idVendedorField: string;
  vendedorLabelField?: string;
}

interface LeadGanadoEntityConfig {
  sheetName: string;
  businessIdField: string;
  idTiendaField: string;
  tiendaLabelField?: string;
  idVendedorField: string;
  vendedorLabelField?: string;
  fechaIngresoField: string;
  fechaRegistroField: string;
  fechaGanadoField: string;
  diasLeadRegistroField: string;
  diasRegistroGanadoField: string;
  diasLeadGanadoField: string;
  idFullfilmentField: string;
  fullfilmentLabelField?: string;
  leadGanadoPeriodoField?: string;
  notasField: string;
  distritoField?: string;
  cantidadEnviosField: string;
  idOrigenField: string;
  origenLabelField?: string;
  anuladosFullfilmentField: string;
  ingresoAnuladosField: string;
}

const BASE_ENTITY_CONFIG: Record<string, BaseEntityConfig> = {
  destinos: {
    sheetName: 'DESTINOS',
    dbTextField: 'destino',
    sheetTextField: 'Destinos',
    sheetBusinessIdField: 'idDestino',
  },
  tiendas: {
    sheetName: 'TIENDAS',
    dbTextField: 'nombre',
    sheetTextField: 'Nombre',
    sheetBusinessIdField: 'idTiendas',
  },
  courier: {
    sheetName: 'COURIER',
    dbTextField: 'nombre',
    sheetTextField: 'Nombre',
    sheetBusinessIdField: 'idCourier',
  },
  vendedores: {
    sheetName: 'VENDEDORES',
    dbTextField: 'nombre',
    sheetTextField: 'Nombre',
    sheetBusinessIdField: 'idVendedor',
  },
  fullfilment: {
    sheetName: 'FULLFILMENT',
    dbTextField: 'es_fullfilment',
    sheetTextField: '¿Es FullFilment?',
    sheetBusinessIdField: 'idFullFilment',
  },
  origen: {
    sheetName: 'ORIGEN',
    dbTextField: 'opcion',
    sheetTextField: 'Opcion',
    sheetBusinessIdField: 'idOrigen',
  },
  resultados: {
    sheetName: 'RESULTADOS',
    dbTextField: 'resultado',
    sheetTextField: 'Resultado',
    sheetBusinessIdField: 'idResultado',
  },
  tipo_punto: {
    sheetName: 'TIPO DE PUNTO',
    dbTextField: 'tipo_punto',
    sheetTextField: 'tipo punto',
    sheetBusinessIdField: 'idTipoPunto',
  },
  tipo_recojo: {
    sheetName: 'TIPO DE RECOJO',
    dbTextField: 'tipo_recojo',
    sheetTextField: 'tipo de recojo',
    sheetBusinessIdField: 'idTipoRecojo',
  },
};

const TARIFA_ENTITY_CONFIG: TarifaEntityConfig = {
  sheetName: 'TARIFAS',
  sheetBusinessIdField: 'idTarifa',
  sheetDestinoIdField: 'idDestino',
  sheetDestinoLabelField: 'Destino',
  sheetCobroEntregaField: 'Cobro Entrega',
  sheetPagoMotoField: 'Pago Moto',
  sheetNotasField: 'Notas',
};

const ENVIO_ENTITY_CONFIG: EnvioEntityConfig = {
  sheetName: 'ENVIOS',
  sheetBusinessIdField: 'idEnvios',
  mesField: 'Mes',
  idTiendaField: 'idTienda',
  tiendaLabelField: 'Tienda',
  idDestinoField: 'idDestino',
  destinoLabelField: 'Destino',
  idResultadoField: 'idResultado',
  resultadoLabelField: 'Resultado',
  cobroEntregaField: 'Cobro Entrega',
  pagoMotoField: 'Pago moto',
  excedentePagoMotoField: 'Excedente pagado moto',
  ingresoTotalFilaField: 'ingreso total fila',
  costoTotalFilaField: 'costo total fila',
  observacionesField: 'observaciones',
  idVendedorField: 'idVendedor',
  vendedorLabelField: 'Vendedor',
  idTipoPuntoField: 'idTipoPunto',
  tipoPuntoLabelField: 'Tipo Punto',
  idFullfilmentField: 'idFullFilment',
  fullfilmentLabelField: 'FullFilment',
  extraPuntoMotoField: 'Extra punto moto',
  extraPuntoEmpresaField: 'Extra punto empresa',
};

const RECOJO_ENTITY_CONFIG: RecojoEntityConfig = {
  sheetName: 'RECOJOS',
  sheetBusinessIdField: 'idRecojo',
  mesField: 'Mes',
  idTiendaField: 'idTienda',
  tiendaLabelField: 'Tienda',
  idTipoRecojoField: 'idTipoRecojo',
  tipoRecojoLabelField: 'Tipo de Recojo',
  vecesField: 'Veces',
  cobroATiendaField: 'Cobro a tienda por recojo',
  pagoMotoField: 'Pago moto por recojo',
  ingresoRecojoTotalField: 'Ingreso recojo total',
  costoRecojoTotalField: 'Costo recojo total',
  observacionesField: 'Observaciones',
  idVendedorField: 'idVendedor',
  vendedorLabelField: 'Vendedor',
};

const LEAD_GANADO_ENTITY_CONFIG: LeadGanadoEntityConfig = {
  sheetName: 'LEADS GANADOS',
  businessIdField: 'idLeadGanado',
  idTiendaField: 'idTienda',
  tiendaLabelField: 'Tienda',
  idVendedorField: 'idVendedor',
  vendedorLabelField: 'Vendedor',
  fechaIngresoField: 'Fecha ingreso lead',
  fechaRegistroField: 'Fecha registro lead',
  fechaGanadoField: 'Fecha Lead Ganado',
  diasLeadRegistroField: 'Dias Lead a Registro',
  diasRegistroGanadoField: 'Dias Registro a Ganado',
  diasLeadGanadoField: 'Dias lead a ganado',
  idFullfilmentField: 'idFullFilment',
  fullfilmentLabelField: 'FullFilment',
  leadGanadoPeriodoField: 'Lead ganado en periodo?',
  notasField: 'Notas',
  distritoField: 'Distrito',
  cantidadEnviosField: 'Cantidad de envios',
  idOrigenField: 'idOrigen',
  origenLabelField: 'Origen',
  anuladosFullfilmentField: 'Anulados Fullfilment',
  ingresoAnuladosField: 'Ingreso anulados fullfilment',
};

let cachedSupabaseAdminClient: ReturnType<typeof createClient> | null = null;

function getSyncOutboxTable(client: ReturnType<typeof createClient>) {
  return client.from('sync_outbox' as never);
}

function isMissingSyncOutboxTableError(error: unknown) {
  if (!error || typeof error !== 'object') return false;
  const maybeMessage = (error as { message?: unknown }).message;
  if (typeof maybeMessage !== 'string') return false;
  return maybeMessage.includes("Could not find the table 'public.sync_outbox'");
}

function isCronAuthorized(req: VercelRequest) {
  const expectedSecret = process.env.SYNC_OUTBOX_SECRET;
  if (!expectedSecret) return false;

  const incomingSecret = req.headers['x-sync-secret'];
  if (typeof incomingSecret !== 'string') return false;

  return incomingSecret === expectedSecret;
}

function getSupabaseAdminClient() {
  if (cachedSupabaseAdminClient) {
    return cachedSupabaseAdminClient;
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !supabaseServiceRoleKey) {
    throw new Error('Faltan SUPABASE_URL (o VITE_SUPABASE_URL) y/o SUPABASE_SERVICE_ROLE_KEY');
  }

  cachedSupabaseAdminClient = createClient(supabaseUrl, supabaseServiceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return cachedSupabaseAdminClient;
}

async function ensureStableIdHeader(sheet: Awaited<ReturnType<typeof getRawSheet>>) {
  await sheet.loadHeaderRow();

  if (sheet.headerValues.includes(STABLE_ROW_ID_COLUMN)) {
    return;
  }

  await sheet.setHeaderRow([...sheet.headerValues, STABLE_ROW_ID_COLUMN]);
  await sheet.loadHeaderRow();
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

async function copyPreviousRowFormat(sheet: Awaited<ReturnType<typeof getRawSheet>>, newRowNumber: number) {
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

async function applyTarifaCurrencyFormat(
  sheet: Awaited<ReturnType<typeof getRawSheet>>,
  rowNumber: number,
  cobroHeader: string,
  pagoHeader: string,
) {
  const cobroIndex = sheet.headerValues.findIndex((header) => header === cobroHeader);
  const pagoIndex = sheet.headerValues.findIndex((header) => header === pagoHeader);

  if (cobroIndex === -1 || pagoIndex === -1) return;

  const startColumn = Math.min(cobroIndex, pagoIndex) + 1;
  const endColumn = Math.max(cobroIndex, pagoIndex) + 1;
  const startLetter = columnIndexToLetter(startColumn);
  const endLetter = columnIndexToLetter(endColumn);

  await sheet.loadCells(`${startLetter}${rowNumber}:${endLetter}${rowNumber}`);

  const currencyFormat = {
    type: 'CURRENCY' as const,
    pattern: '[$S/ ] #,##0.00',
  };

  sheet.getCell(rowNumber - 1, cobroIndex).numberFormat = currencyFormat;
  sheet.getCell(rowNumber - 1, pagoIndex).numberFormat = currencyFormat;

  await sheet.saveUpdatedCells();
}

function findHeaderByNormalizedName(headers: string[], target: string) {
  const normalizedTarget = normalizeText(target);
  return headers.find((header) => normalizeText(header) === normalizedTarget) ?? null;
}

function findHeaderByCandidates(headers: string[], candidates: string[]) {
  for (const candidate of candidates) {
    const found = findHeaderByNormalizedName(headers, candidate);
    if (found) return found;
  }

  return null;
}

async function findRowByStableId(sheet: Awaited<ReturnType<typeof getRawSheet>>, stableId: string) {
  const rows = await sheet.getRows();

  return (
    rows.find((row) => {
      const data = row.toObject() as Record<string, unknown>;
      return data[STABLE_ROW_ID_COLUMN] === stableId;
    }) ?? null
  );
}

function parseBusinessId(raw: unknown) {
  if (typeof raw === 'number' && Number.isFinite(raw)) return Math.trunc(raw);
  const asNumber = Number(String(raw ?? '').trim());
  if (Number.isFinite(asNumber) && asNumber > 0) return Math.trunc(asNumber);
  return null;
}

function parseSheetSerialDate(raw: unknown): string | null {
  const numeric = Number(String(raw ?? '').trim());
  if (!Number.isFinite(numeric) || numeric <= 0) return null;

  const utcDate = new Date(Math.round((numeric - 25569) * 86400 * 1000));
  if (Number.isNaN(utcDate.getTime())) return null;

  return `${utcDate.getUTCFullYear()}-${String(utcDate.getUTCMonth() + 1).padStart(2, '0')}`;
}

function normalizeMonthValue(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';

  const monthMatch = value.match(/^(\d{4})-(\d{2})(?:-\d{2})?$/);
  if (monthMatch) {
    return `${monthMatch[1]}-${monthMatch[2]}`;
  }

  return parseSheetSerialDate(value) ?? value;
}

function extractBasePayload(event: OutboxEvent, config: BaseEntityConfig) {
  const payload = event.payload as { new?: Record<string, unknown>; old?: Record<string, unknown> } | null;
  const newRow = payload?.new ?? null;
  const oldRow = payload?.old ?? null;

  const stableId = String(newRow?.stable_id ?? oldRow?.stable_id ?? event.entity_id ?? '').trim();
  const textValue = String(newRow?.[config.dbTextField] ?? '').trim();
  const businessId = parseBusinessId(newRow?.business_id);

  return {
    stableId,
    textValue,
    businessId,
  };
}

function extractTarifaPayload(event: OutboxEvent) {
  const payload = event.payload as { new?: Record<string, unknown>; old?: Record<string, unknown> } | null;
  const newRow = payload?.new ?? null;
  const oldRow = payload?.old ?? null;

  const stableId = String(newRow?.stable_id ?? oldRow?.stable_id ?? event.entity_id ?? '').trim();
  const businessId = parseBusinessId(newRow?.business_id);
  const idDestino = parseBusinessId(newRow?.id_destino);
  const cobroEntrega = Number(newRow?.cobro_entrega ?? 0);
  const pagoMoto = Number(newRow?.pago_moto ?? 0);
  const notas = String(newRow?.notas ?? '').trim();

  return {
    stableId,
    businessId,
    idDestino,
    cobroEntrega: Number.isFinite(cobroEntrega) ? cobroEntrega : 0,
    pagoMoto: Number.isFinite(pagoMoto) ? pagoMoto : 0,
    notas,
  };
}

async function getDestinoLabelByBusinessIdMap() {
  const destinosSheet = await getRawSheet('DESTINOS');
  await ensureStableIdHeader(destinosSheet);
  const rows = await destinosSheet.getRows();

  const businessIdHeader = findHeaderByCandidates(destinosSheet.headerValues, ['idDestino', 'idDestinos']);
  const destinoHeader = findHeaderByCandidates(destinosSheet.headerValues, ['Destino', 'Destinos']);

  if (!businessIdHeader || !destinoHeader) {
    throw new Error('No se pudo resolver columnas idDestino(s)/Destino(s) en hoja DESTINOS para sincronizar TARIFAS');
  }

  const map = new Map<number, string>();

  for (const row of rows) {
    const rowData = row.toObject() as Record<string, unknown>;
    const businessId = parseBusinessId(rowData[businessIdHeader]);
    const destinoLabel = String(rowData[destinoHeader] ?? '').trim();

    if (businessId !== null && destinoLabel) {
      map.set(businessId, destinoLabel);
    }
  }

  return map;
}

async function syncTarifaEvent(event: OutboxEvent) {
  const sheet = await getRawSheet(TARIFA_ENTITY_CONFIG.sheetName);
  await ensureStableIdHeader(sheet);

  const businessIdHeader = findHeaderByNormalizedName(sheet.headerValues, TARIFA_ENTITY_CONFIG.sheetBusinessIdField);
  const destinoIdHeader = findHeaderByNormalizedName(sheet.headerValues, TARIFA_ENTITY_CONFIG.sheetDestinoIdField);
  const destinoLabelHeader = TARIFA_ENTITY_CONFIG.sheetDestinoLabelField
    ? findHeaderByNormalizedName(sheet.headerValues, TARIFA_ENTITY_CONFIG.sheetDestinoLabelField)
    : null;
  const cobroHeader = findHeaderByNormalizedName(sheet.headerValues, TARIFA_ENTITY_CONFIG.sheetCobroEntregaField);
  const pagoHeader = findHeaderByNormalizedName(sheet.headerValues, TARIFA_ENTITY_CONFIG.sheetPagoMotoField);
  const notasHeader = findHeaderByNormalizedName(sheet.headerValues, TARIFA_ENTITY_CONFIG.sheetNotasField);

  if (!businessIdHeader || !destinoIdHeader || !cobroHeader || !pagoHeader || !notasHeader) {
    throw new Error('No se pudieron resolver columnas requeridas de hoja TARIFAS');
  }

  const { stableId, businessId, idDestino, cobroEntrega, pagoMoto, notas } = extractTarifaPayload(event);
  if (!stableId) {
    throw new Error('Evento tarifas sin stable_id válido');
  }

  const existingRow = await findRowByStableId(sheet, stableId);

  if (event.operation === 'delete') {
    if (existingRow) {
      await existingRow.delete();
    }
    return;
  }

  if (businessId === null) {
    throw new Error('Evento tarifas sin business_id válido');
  }

  if (idDestino === null) {
    throw new Error('Evento tarifas sin id_destino válido');
  }

  const destinoLabelById = await getDestinoLabelByBusinessIdMap();
  const destinoLabel = destinoLabelById.get(idDestino);

  if (!destinoLabel) {
    throw new Error(`No se encontró destino para id_destino=${idDestino} al sincronizar TARIFAS`);
  }

  const rowPayload: Record<string, string | number> = {
    [businessIdHeader]: businessId,
    [destinoIdHeader]: idDestino,
    [cobroHeader]: cobroEntrega,
    [pagoHeader]: pagoMoto,
    [notasHeader]: notas,
    [STABLE_ROW_ID_COLUMN]: stableId,
  };

  if (destinoLabelHeader) {
    rowPayload[destinoLabelHeader] = destinoLabel;
  }

  if (existingRow) {
    existingRow.assign(rowPayload);
    await existingRow.save();

    await applyTarifaCurrencyFormat(sheet, existingRow.rowNumber, cobroHeader, pagoHeader).catch((error: unknown) => {
      console.info('[sync-outbox] currency-format skipped', {
        entity: event.entity,
        sheet: TARIFA_ENTITY_CONFIG.sheetName,
        message: error instanceof Error ? error.message : 'unknown',
      });
    });

    return;
  }

  const createdRow = await sheet.addRow(rowPayload);
  await copyPreviousRowFormat(sheet, createdRow.rowNumber).catch((error: unknown) => {
    console.info('[sync-outbox] format-copy skipped', {
      entity: event.entity,
      sheet: TARIFA_ENTITY_CONFIG.sheetName,
      message: error instanceof Error ? error.message : 'unknown',
    });
  });

  await applyTarifaCurrencyFormat(sheet, createdRow.rowNumber, cobroHeader, pagoHeader).catch((error: unknown) => {
    console.info('[sync-outbox] currency-format skipped', {
      entity: event.entity,
      sheet: TARIFA_ENTITY_CONFIG.sheetName,
      message: error instanceof Error ? error.message : 'unknown',
    });
  });
}

function extractEnvioPayload(event: OutboxEvent) {
  const payload = event.payload as { new?: Record<string, unknown>; old?: Record<string, unknown> } | null;
  const newRow = payload?.new ?? null;
  const oldRow = payload?.old ?? null;

  const stableId = String(newRow?.stable_id ?? oldRow?.stable_id ?? event.entity_id ?? '').trim();
  const businessId = parseBusinessId(newRow?.business_id);

  return {
    stableId,
    businessId,
    mes: String(newRow?.mes ?? '').trim(),
    idTienda: parseBusinessId(newRow?.id_tienda),
    idDestino: parseBusinessId(newRow?.id_destino),
    idResultado: parseBusinessId(newRow?.id_resultado),
    cobroEntrega: Number(newRow?.cobro_entrega ?? 0),
    pagoMoto: Number(newRow?.pago_moto ?? 0),
    excedentePagadoMoto: Number(newRow?.excedente_pagado_moto ?? 0),
    ingresoTotalFila: Number(newRow?.ingreso_total_fila ?? 0),
    costoTotalFila: Number(newRow?.costo_total_fila ?? 0),
    observaciones: String(newRow?.observaciones ?? '').trim(),
    idVendedor: parseBusinessId(newRow?.id_vendedor),
    idTipoPunto: parseBusinessId(newRow?.id_tipo_punto),
    idFullfilment: parseBusinessId(newRow?.id_fullfilment),
    extraPuntoMoto: Number(newRow?.extra_punto_moto ?? 0),
    extraPuntoEmpresa: Number(newRow?.extra_punto_empresa ?? 0),
  };
}

function extractLeadGanadoPayload(event: OutboxEvent) {
  const payload = event.payload as { new?: Record<string, unknown>; old?: Record<string, unknown> } | null;
  const newRow = payload?.new ?? null;
  const oldRow = payload?.old ?? null;

  return {
    stableId: String(newRow?.stable_id ?? oldRow?.stable_id ?? event.entity_id ?? '').trim(),
    businessId: parseBusinessId(newRow?.business_id),
    idTienda: parseBusinessId(newRow?.id_tienda),
    idVendedor: parseBusinessId(newRow?.id_vendedor),
    kommoLeadId: parseBusinessId(newRow?.kommo_lead_id),
    tiendaNombreSnapshot: String(newRow?.tienda_nombre_snapshot ?? '').trim(),
    vendedorNombreSnapshot: String(newRow?.vendedor_nombre_snapshot ?? '').trim(),
    pipelineIdSnapshot: parseBusinessId(newRow?.pipeline_id_snapshot),
    origenSnapshot: String(newRow?.origen_snapshot ?? '').trim(),
    fullfilmentSnapshot: newRow?.fullfilment_snapshot,
    fechaIngresoLead: String(newRow?.fecha_ingreso_lead ?? '').trim(),
    fechaRegistroLead: String(newRow?.fecha_registro_lead ?? '').trim(),
    fechaLeadGanado: String(newRow?.fecha_lead_ganado ?? '').trim(),
    diasLeadARegistro: Number(newRow?.dias_lead_a_registro ?? 0),
    diasRegistroAGanado: Number(newRow?.dias_registro_a_ganado ?? 0),
    diasLeadAGanado: Number(newRow?.dias_lead_a_ganado ?? 0),
    idFullfilment: parseBusinessId(newRow?.id_fullfilment),
    leadGanadoEnPeriodo: String(newRow?.lead_ganado_en_periodo ?? 'No').trim(),
    notas: String(newRow?.notas ?? '').trim(),
    distrito: String(newRow?.distrito ?? '').trim(),
    cantidadEnvios: Number(newRow?.cantidad_envios ?? 0),
    idOrigen: parseBusinessId(newRow?.id_origen),
    anuladosFullfilment: Number(newRow?.anulados_fullfilment ?? 0),
    ingresoAnulados: Number(newRow?.ingreso_anulados_fullfilment ?? 0),
  };
}

function asFullfilmentLabelFromSnapshot(value: unknown): string {
  if (typeof value === 'boolean') {
    return value ? 'Sí' : 'No';
  }

  if (typeof value === 'number') {
    return value !== 0 ? 'Sí' : 'No';
  }

  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return '';
  if (['true', '1', 'si', 'sí', 'yes'].includes(normalized)) return 'Sí';
  if (['false', '0', 'no'].includes(normalized)) return 'No';
  return String(value ?? '').trim();
}

function extractRecojoPayload(event: OutboxEvent) {
  const payload = event.payload as { new?: Record<string, unknown>; old?: Record<string, unknown> } | null;
  const newRow = payload?.new ?? null;
  const oldRow = payload?.old ?? null;

  const stableId = String(newRow?.stable_id ?? oldRow?.stable_id ?? event.entity_id ?? '').trim();
  const businessId = parseBusinessId(newRow?.business_id);

  return {
    stableId,
    businessId,
    mes: String(newRow?.mes ?? '').trim(),
    idTienda: parseBusinessId(newRow?.id_tienda),
    idTipoRecojo: parseBusinessId(newRow?.id_tipo_recojo),
    veces: Number(newRow?.veces ?? 0),
    cobroATienda: Number(newRow?.cobro_a_tienda_por_recojo ?? 0),
    pagoMoto: Number(newRow?.pago_moto_por_recojo ?? 0),
    ingresoRecojoTotal: Number(newRow?.ingreso_recojo_total ?? 0),
    costoRecojoTotal: Number(newRow?.costo_recojo_total ?? 0),
    observaciones: String(newRow?.observaciones ?? '').trim(),
    idVendedor: parseBusinessId(newRow?.id_vendedor),
  };
}

async function syncRecojoEvent(event: OutboxEvent) {
  const sheet = await getRawSheet(RECOJO_ENTITY_CONFIG.sheetName);
  await ensureStableIdHeader(sheet);

  const headers = sheet.headerValues;
  const findRequired = (candidate: string) => {
    const found = findHeaderByNormalizedName(headers, candidate);
    if (!found) throw new Error(`No se encontró columna ${candidate} en hoja ${RECOJO_ENTITY_CONFIG.sheetName}`);
    return found;
  };

  const businessIdHeader = findRequired(RECOJO_ENTITY_CONFIG.sheetBusinessIdField);
  const mesHeader = findRequired(RECOJO_ENTITY_CONFIG.mesField);
  const idTiendaHeader = findRequired(RECOJO_ENTITY_CONFIG.idTiendaField);
  const idTipoRecojoHeader = findRequired(RECOJO_ENTITY_CONFIG.idTipoRecojoField);
  const vecesHeader = findRequired(RECOJO_ENTITY_CONFIG.vecesField);
  const cobroHeader = findRequired(RECOJO_ENTITY_CONFIG.cobroATiendaField);
  const pagoHeader = findRequired(RECOJO_ENTITY_CONFIG.pagoMotoField);
  const ingresoHeader = findRequired(RECOJO_ENTITY_CONFIG.ingresoRecojoTotalField);
  const costoHeader = findRequired(RECOJO_ENTITY_CONFIG.costoRecojoTotalField);
  const observacionesHeader = findRequired(RECOJO_ENTITY_CONFIG.observacionesField);
  const idVendedorHeader = findRequired(RECOJO_ENTITY_CONFIG.idVendedorField);

  const tiendaLabelHeader = RECOJO_ENTITY_CONFIG.tiendaLabelField
    ? findHeaderByNormalizedName(headers, RECOJO_ENTITY_CONFIG.tiendaLabelField)
    : null;
  const tipoRecojoLabelHeader = RECOJO_ENTITY_CONFIG.tipoRecojoLabelField
    ? findHeaderByNormalizedName(headers, RECOJO_ENTITY_CONFIG.tipoRecojoLabelField)
    : null;
  const vendedorLabelHeader = RECOJO_ENTITY_CONFIG.vendedorLabelField
    ? findHeaderByNormalizedName(headers, RECOJO_ENTITY_CONFIG.vendedorLabelField)
    : null;

  const recojo = extractRecojoPayload(event);
  if (!recojo.stableId) throw new Error('Evento recojos sin stable_id');

  const existingRow = await findRowByStableId(sheet, recojo.stableId);

  if (event.operation === 'delete') {
    if (existingRow) await existingRow.delete();
    return;
  }

  if (recojo.businessId === null || recojo.idTienda === null || recojo.idTipoRecojo === null) {
    throw new Error('Evento recojos incompleto para sincronizar');
  }

  const [tiendaMap, tipoRecojoMap, vendedorMap] = await Promise.all([
    getLabelMapForSheet('TIENDAS', ['idTienda', 'idTiendas'], ['Nombre']),
    getLabelMapForSheet('TIPO DE RECOJO', ['idTipoRecojo'], ['tipo de recojo', 'Tipo de Recojo']),
    getLabelMapForSheet('VENDEDORES', ['idVendedor', 'idVendedores'], ['Nombre']),
  ]);

  const rowPayload: Record<string, string | number> = {
    [businessIdHeader]: recojo.businessId,
    [mesHeader]: normalizeMonthValue(recojo.mes),
    [idTiendaHeader]: recojo.idTienda,
    [idTipoRecojoHeader]: recojo.idTipoRecojo,
    [vecesHeader]: Number.isFinite(recojo.veces) ? Math.round(recojo.veces) : 0,
    [cobroHeader]: Number.isFinite(recojo.cobroATienda) ? recojo.cobroATienda : 0,
    [pagoHeader]: Number.isFinite(recojo.pagoMoto) ? recojo.pagoMoto : 0,
    [ingresoHeader]: Number.isFinite(recojo.ingresoRecojoTotal) ? recojo.ingresoRecojoTotal : 0,
    [costoHeader]: Number.isFinite(recojo.costoRecojoTotal) ? recojo.costoRecojoTotal : 0,
    [observacionesHeader]: recojo.observaciones,
    [idVendedorHeader]: recojo.idVendedor ?? '',
    [STABLE_ROW_ID_COLUMN]: recojo.stableId,
  };

  if (tiendaLabelHeader) rowPayload[tiendaLabelHeader] = tiendaMap.get(recojo.idTienda) ?? `#${recojo.idTienda}`;
  if (tipoRecojoLabelHeader) {
    rowPayload[tipoRecojoLabelHeader] = tipoRecojoMap.get(recojo.idTipoRecojo) ?? `#${recojo.idTipoRecojo}`;
  }
  if (vendedorLabelHeader && recojo.idVendedor) {
    rowPayload[vendedorLabelHeader] = vendedorMap.get(recojo.idVendedor) ?? `#${recojo.idVendedor}`;
  }

  if (existingRow) {
    existingRow.assign(rowPayload);
    await existingRow.save();
    return;
  }

  const createdRow = await sheet.addRow(rowPayload);
  await copyPreviousRowFormat(sheet, createdRow.rowNumber).catch((error: unknown) => {
    console.info('[sync-outbox] format-copy skipped', {
      entity: event.entity,
      sheet: RECOJO_ENTITY_CONFIG.sheetName,
      message: error instanceof Error ? error.message : 'unknown',
    });
  });
}

async function syncLeadGanadoEvent(event: OutboxEvent) {
  const sheet = await getRawSheet(LEAD_GANADO_ENTITY_CONFIG.sheetName);
  await ensureStableIdHeader(sheet);

  const findRequired = (candidate: string) => {
    const found = findHeaderByNormalizedName(sheet.headerValues, candidate);
    if (!found) throw new Error(`No se encontró columna ${candidate} en hoja ${LEAD_GANADO_ENTITY_CONFIG.sheetName}`);
    return found;
  };

  const businessIdHeader = findRequired(LEAD_GANADO_ENTITY_CONFIG.businessIdField);
  const idTiendaHeader = findRequired(LEAD_GANADO_ENTITY_CONFIG.idTiendaField);
  const idVendedorHeader = findRequired(LEAD_GANADO_ENTITY_CONFIG.idVendedorField);
  const fechaIngresoHeader = findRequired(LEAD_GANADO_ENTITY_CONFIG.fechaIngresoField);
  const fechaRegistroHeader = findRequired(LEAD_GANADO_ENTITY_CONFIG.fechaRegistroField);
  const fechaGanadoHeader = findRequired(LEAD_GANADO_ENTITY_CONFIG.fechaGanadoField);
  const diasLeadRegistroHeader = findRequired(LEAD_GANADO_ENTITY_CONFIG.diasLeadRegistroField);
  const diasRegistroGanadoHeader = findRequired(LEAD_GANADO_ENTITY_CONFIG.diasRegistroGanadoField);
  const diasLeadGanadoHeader = findRequired(LEAD_GANADO_ENTITY_CONFIG.diasLeadGanadoField);
  const idFullfilmentHeader = findRequired(LEAD_GANADO_ENTITY_CONFIG.idFullfilmentField);
  const leadGanadoPeriodoHeader = LEAD_GANADO_ENTITY_CONFIG.leadGanadoPeriodoField
    ? findHeaderByNormalizedName(sheet.headerValues, LEAD_GANADO_ENTITY_CONFIG.leadGanadoPeriodoField)
    : null;
  const notasHeader = findRequired(LEAD_GANADO_ENTITY_CONFIG.notasField);
  const distritoHeader = LEAD_GANADO_ENTITY_CONFIG.distritoField
    ? findHeaderByNormalizedName(sheet.headerValues, LEAD_GANADO_ENTITY_CONFIG.distritoField)
    : null;
  const cantidadEnviosHeader = findRequired(LEAD_GANADO_ENTITY_CONFIG.cantidadEnviosField);
  const idOrigenHeader = findRequired(LEAD_GANADO_ENTITY_CONFIG.idOrigenField);
  const anuladosHeader = findRequired(LEAD_GANADO_ENTITY_CONFIG.anuladosFullfilmentField);
  const ingresoAnuladosHeader = findRequired(LEAD_GANADO_ENTITY_CONFIG.ingresoAnuladosField);

  const tiendaLabelHeader = LEAD_GANADO_ENTITY_CONFIG.tiendaLabelField
    ? findHeaderByNormalizedName(sheet.headerValues, LEAD_GANADO_ENTITY_CONFIG.tiendaLabelField)
    : null;
  const vendedorLabelHeader = LEAD_GANADO_ENTITY_CONFIG.vendedorLabelField
    ? findHeaderByNormalizedName(sheet.headerValues, LEAD_GANADO_ENTITY_CONFIG.vendedorLabelField)
    : null;
  const fullfilmentLabelHeader = LEAD_GANADO_ENTITY_CONFIG.fullfilmentLabelField
    ? findHeaderByNormalizedName(sheet.headerValues, LEAD_GANADO_ENTITY_CONFIG.fullfilmentLabelField)
    : null;
  const origenLabelHeader = LEAD_GANADO_ENTITY_CONFIG.origenLabelField
    ? findHeaderByNormalizedName(sheet.headerValues, LEAD_GANADO_ENTITY_CONFIG.origenLabelField)
    : null;

  const lead = extractLeadGanadoPayload(event);
  if (!lead.stableId) throw new Error('Evento leads_ganados sin stable_id');

  const existingRow = await findRowByStableId(sheet, lead.stableId);

  if (event.operation === 'delete') {
    if (existingRow) await existingRow.delete();
    return;
  }

  if (
    lead.businessId === null
  ) {
    throw new Error('Evento leads_ganados sin business_id para sincronizar');
  }

  const [tiendaMap, vendedorMap, fullfilmentMap, origenMap] = await Promise.all([
    getLabelMapForSheet('TIENDAS', ['idTienda', 'idTiendas'], ['Nombre']).catch(() => new Map<number, string>()),
    getLabelMapForSheet('VENDEDORES', ['idVendedor', 'idVendedores'], ['Nombre']).catch(() => new Map<number, string>()),
    getLabelMapForSheet('FULLFILMENT', ['idFullFilment', 'idFullfilment'], ['¿Es FullFilment?']).catch(() => new Map<number, string>()),
    getLabelMapForSheet('ORIGEN', ['idOrigen'], ['Opcion']).catch(() => new Map<number, string>()),
  ]);

  const rowPayload: Record<string, string | number> = {
    [businessIdHeader]: lead.businessId,
    [idTiendaHeader]: lead.idTienda ?? '',
    [idVendedorHeader]: lead.idVendedor ?? '',
    [fechaIngresoHeader]: lead.fechaIngresoLead,
    [fechaRegistroHeader]: lead.fechaRegistroLead,
    [fechaGanadoHeader]: lead.fechaLeadGanado,
    [diasLeadRegistroHeader]: Number.isFinite(lead.diasLeadARegistro) ? lead.diasLeadARegistro : 0,
    [diasRegistroGanadoHeader]: Number.isFinite(lead.diasRegistroAGanado) ? lead.diasRegistroAGanado : 0,
    [diasLeadGanadoHeader]: Number.isFinite(lead.diasLeadAGanado) ? lead.diasLeadAGanado : 0,
    [idFullfilmentHeader]: lead.idFullfilment ?? '',
    [notasHeader]: lead.notas,
    [cantidadEnviosHeader]: Number.isFinite(lead.cantidadEnvios) ? Math.round(lead.cantidadEnvios) : 0,
    [idOrigenHeader]: lead.idOrigen ?? '',
    [anuladosHeader]: Number.isFinite(lead.anuladosFullfilment) ? lead.anuladosFullfilment : 0,
    [ingresoAnuladosHeader]: Number.isFinite(lead.ingresoAnulados) ? lead.ingresoAnulados : 0,
    [STABLE_ROW_ID_COLUMN]: lead.stableId,
  };

  if (tiendaLabelHeader) {
    rowPayload[tiendaLabelHeader] = lead.tiendaNombreSnapshot
      || (lead.idTienda ? (tiendaMap.get(lead.idTienda) ?? `#${lead.idTienda}`) : '');
  }

  if (vendedorLabelHeader) {
    rowPayload[vendedorLabelHeader] = lead.vendedorNombreSnapshot
      || (lead.idVendedor ? (vendedorMap.get(lead.idVendedor) ?? `#${lead.idVendedor}`) : '');
  }

  if (fullfilmentLabelHeader) {
    const fromSnapshot = asFullfilmentLabelFromSnapshot(lead.fullfilmentSnapshot);
    rowPayload[fullfilmentLabelHeader] = fromSnapshot
      || (lead.idFullfilment ? (fullfilmentMap.get(lead.idFullfilment) ?? `#${lead.idFullfilment}`) : '');
  }

  if (origenLabelHeader) {
    rowPayload[origenLabelHeader] = lead.origenSnapshot
      || (lead.idOrigen ? (origenMap.get(lead.idOrigen) ?? `#${lead.idOrigen}`) : '');
  }
  if (leadGanadoPeriodoHeader) rowPayload[leadGanadoPeriodoHeader] = lead.leadGanadoEnPeriodo || '';
  if (distritoHeader) rowPayload[distritoHeader] = lead.distrito;

  if (existingRow) {
    existingRow.assign(rowPayload);
    await existingRow.save();
    return;
  }

  const createdRow = await sheet.addRow(rowPayload);
  await copyPreviousRowFormat(sheet, createdRow.rowNumber).catch((error: unknown) => {
    console.info('[sync-outbox] format-copy skipped', {
      entity: event.entity,
      sheet: LEAD_GANADO_ENTITY_CONFIG.sheetName,
      message: error instanceof Error ? error.message : 'unknown',
    });
  });
}

async function getLabelMapForSheet(sheetName: string, idCandidates: string[], labelCandidates: string[]) {
  const sheet = await getRawSheet(sheetName);
  await ensureStableIdHeader(sheet);
  const idHeader = findHeaderByCandidates(sheet.headerValues, idCandidates);
  const labelHeader = findHeaderByCandidates(sheet.headerValues, labelCandidates);

  if (!idHeader || !labelHeader) {
    throw new Error(`No se pudo resolver columnas ${idCandidates.join('/')} y ${labelCandidates.join('/')} en hoja ${sheetName}`);
  }

  const rows = await sheet.getRows();
  const map = new Map<number, string>();

  for (const row of rows) {
    const rowData = row.toObject() as Record<string, unknown>;
    const id = parseBusinessId(rowData[idHeader]);
    const label = String(rowData[labelHeader] ?? '').trim();
    if (id !== null && label) {
      map.set(id, label);
    }
  }

  return map;
}

async function syncEnvioEvent(event: OutboxEvent) {
  const sheet = await getRawSheet(ENVIO_ENTITY_CONFIG.sheetName);
  await ensureStableIdHeader(sheet);

  const headers = sheet.headerValues;
  const findRequired = (candidate: string) => {
    const found = findHeaderByNormalizedName(headers, candidate);
    if (!found) throw new Error(`No se encontró columna ${candidate} en hoja ENVIOS`);
    return found;
  };

  const businessIdHeader = findRequired(ENVIO_ENTITY_CONFIG.sheetBusinessIdField);
  const mesHeader = findRequired(ENVIO_ENTITY_CONFIG.mesField);
  const idTiendaHeader = findRequired(ENVIO_ENTITY_CONFIG.idTiendaField);
  const idDestinoHeader = findRequired(ENVIO_ENTITY_CONFIG.idDestinoField);
  const idResultadoHeader = findRequired(ENVIO_ENTITY_CONFIG.idResultadoField);
  const cobroHeader = findRequired(ENVIO_ENTITY_CONFIG.cobroEntregaField);
  const pagoHeader = findRequired(ENVIO_ENTITY_CONFIG.pagoMotoField);
  const excedenteHeader = findRequired(ENVIO_ENTITY_CONFIG.excedentePagoMotoField);
  const ingresoHeader = findRequired(ENVIO_ENTITY_CONFIG.ingresoTotalFilaField);
  const costoHeader = findRequired(ENVIO_ENTITY_CONFIG.costoTotalFilaField);
  const observacionesHeader = findRequired(ENVIO_ENTITY_CONFIG.observacionesField);
  const idVendedorHeader = findRequired(ENVIO_ENTITY_CONFIG.idVendedorField);
  const idTipoPuntoHeader = findRequired(ENVIO_ENTITY_CONFIG.idTipoPuntoField);
  const idFullfilmentHeader = findRequired(ENVIO_ENTITY_CONFIG.idFullfilmentField);
  const extraMotoHeader = findRequired(ENVIO_ENTITY_CONFIG.extraPuntoMotoField);
  const extraEmpresaHeader = findRequired(ENVIO_ENTITY_CONFIG.extraPuntoEmpresaField);

  const tiendaLabelHeader = ENVIO_ENTITY_CONFIG.tiendaLabelField
    ? findHeaderByNormalizedName(headers, ENVIO_ENTITY_CONFIG.tiendaLabelField)
    : null;
  const destinoLabelHeader = ENVIO_ENTITY_CONFIG.destinoLabelField
    ? findHeaderByNormalizedName(headers, ENVIO_ENTITY_CONFIG.destinoLabelField)
    : null;
  const resultadoLabelHeader = ENVIO_ENTITY_CONFIG.resultadoLabelField
    ? findHeaderByNormalizedName(headers, ENVIO_ENTITY_CONFIG.resultadoLabelField)
    : null;
  const vendedorLabelHeader = ENVIO_ENTITY_CONFIG.vendedorLabelField
    ? findHeaderByNormalizedName(headers, ENVIO_ENTITY_CONFIG.vendedorLabelField)
    : null;
  const tipoPuntoLabelHeader = ENVIO_ENTITY_CONFIG.tipoPuntoLabelField
    ? findHeaderByNormalizedName(headers, ENVIO_ENTITY_CONFIG.tipoPuntoLabelField)
    : null;
  const fullfilmentLabelHeader = ENVIO_ENTITY_CONFIG.fullfilmentLabelField
    ? findHeaderByNormalizedName(headers, ENVIO_ENTITY_CONFIG.fullfilmentLabelField)
    : null;

  const envio = extractEnvioPayload(event);
  if (!envio.stableId) throw new Error('Evento envios sin stable_id');

  const existingRow = await findRowByStableId(sheet, envio.stableId);

  if (event.operation === 'delete') {
    if (existingRow) await existingRow.delete();
    return;
  }

  if (
    envio.businessId === null ||
    envio.idTienda === null ||
    envio.idDestino === null ||
    envio.idResultado === null ||
    envio.idTipoPunto === null ||
    envio.idFullfilment === null
  ) {
    throw new Error('Evento envios incompleto para sincronizar');
  }

  const [tiendaMap, destinoMap, resultadoMap, vendedorMap, tipoPuntoMap, fullfilmentMap] = await Promise.all([
    getLabelMapForSheet('TIENDAS', ['idTienda', 'idTiendas'], ['Nombre']),
    getLabelMapForSheet('DESTINOS', ['idDestino', 'idDestinos'], ['Destino', 'Destinos']),
    getLabelMapForSheet('RESULTADOS', ['idResultado', 'idResultados'], ['Resultado']),
    getLabelMapForSheet('VENDEDORES', ['idVendedor', 'idVendedores'], ['Nombre']),
    getLabelMapForSheet('TIPO DE PUNTO', ['idTipoPunto'], ['tipo punto', 'Tipo de Punto']),
    getLabelMapForSheet('FULLFILMENT', ['idFullFilment', 'idFullfilment'], ['¿Es FullFilment?']),
  ]);

  const rowPayload: Record<string, string | number> = {
    [businessIdHeader]: envio.businessId,
    [mesHeader]: normalizeMonthValue(envio.mes),
    [idTiendaHeader]: envio.idTienda,
    [idDestinoHeader]: envio.idDestino,
    [idResultadoHeader]: envio.idResultado,
    [cobroHeader]: envio.cobroEntrega,
    [pagoHeader]: envio.pagoMoto,
    [excedenteHeader]: envio.excedentePagadoMoto,
    [ingresoHeader]: envio.ingresoTotalFila,
    [costoHeader]: envio.costoTotalFila,
    [observacionesHeader]: envio.observaciones,
    [idVendedorHeader]: envio.idVendedor ?? '',
    [idTipoPuntoHeader]: envio.idTipoPunto,
    [idFullfilmentHeader]: envio.idFullfilment,
    [extraMotoHeader]: envio.extraPuntoMoto,
    [extraEmpresaHeader]: envio.extraPuntoEmpresa,
    [STABLE_ROW_ID_COLUMN]: envio.stableId,
  };

  if (tiendaLabelHeader) rowPayload[tiendaLabelHeader] = tiendaMap.get(envio.idTienda) ?? `#${envio.idTienda}`;
  if (destinoLabelHeader) rowPayload[destinoLabelHeader] = destinoMap.get(envio.idDestino) ?? `#${envio.idDestino}`;
  if (resultadoLabelHeader) rowPayload[resultadoLabelHeader] = resultadoMap.get(envio.idResultado) ?? `#${envio.idResultado}`;
  if (vendedorLabelHeader && envio.idVendedor) rowPayload[vendedorLabelHeader] = vendedorMap.get(envio.idVendedor) ?? `#${envio.idVendedor}`;
  if (tipoPuntoLabelHeader) rowPayload[tipoPuntoLabelHeader] = tipoPuntoMap.get(envio.idTipoPunto) ?? `#${envio.idTipoPunto}`;
  if (fullfilmentLabelHeader) {
    rowPayload[fullfilmentLabelHeader] = fullfilmentMap.get(envio.idFullfilment) ?? `#${envio.idFullfilment}`;
  }

  if (existingRow) {
    existingRow.assign(rowPayload);
    await existingRow.save();

    try {
      const mesColumnIndex = sheet.headerValues.findIndex((header) => header === mesHeader);
      if (mesColumnIndex >= 0) {
        await sheet.loadCells(`${columnIndexToLetter(mesColumnIndex + 1)}${existingRow.rowNumber}:${columnIndexToLetter(mesColumnIndex + 1)}${existingRow.rowNumber}`);
        sheet.getCell(existingRow.rowNumber - 1, mesColumnIndex).numberFormat = {
          type: 'DATE',
          pattern: 'yyyy-mm',
        };
        await sheet.saveUpdatedCells();
      }
    } catch {
      // noop
    }

    return;
  }

  const createdRow = await sheet.addRow(rowPayload);
  await copyPreviousRowFormat(sheet, createdRow.rowNumber).catch((error: unknown) => {
    console.info('[sync-outbox] format-copy skipped', {
      entity: event.entity,
      sheet: ENVIO_ENTITY_CONFIG.sheetName,
      message: error instanceof Error ? error.message : 'unknown',
    });
  });

  try {
    const mesColumnIndex = sheet.headerValues.findIndex((header) => header === mesHeader);
    if (mesColumnIndex >= 0) {
      await sheet.loadCells(`${columnIndexToLetter(mesColumnIndex + 1)}${createdRow.rowNumber}:${columnIndexToLetter(mesColumnIndex + 1)}${createdRow.rowNumber}`);
      sheet.getCell(createdRow.rowNumber - 1, mesColumnIndex).numberFormat = {
        type: 'DATE',
        pattern: 'yyyy-mm',
      };
      await sheet.saveUpdatedCells();
    }
  } catch {
    // noop
  }
}

async function syncBaseEntityEvent(event: OutboxEvent, config: BaseEntityConfig) {
  const sheet = await getRawSheet(config.sheetName);
  await ensureStableIdHeader(sheet);

  const textHeader = findHeaderByNormalizedName(sheet.headerValues, config.sheetTextField);
  if (!textHeader) {
    throw new Error(`No existe columna de texto "${config.sheetTextField}" en hoja ${config.sheetName}`);
  }

  const businessIdHeader = findHeaderByNormalizedName(sheet.headerValues, config.sheetBusinessIdField);

  const { stableId, textValue, businessId } = extractBasePayload(event, config);
  if (!stableId) {
    throw new Error(`Evento ${event.entity} sin stable_id válido`);
  }

  const existingRow = await findRowByStableId(sheet, stableId);

  if (event.operation === 'delete') {
    if (existingRow) {
      await existingRow.delete();
    }
    return;
  }

  if (!textValue) {
    throw new Error(`Evento ${event.entity} sin valor de texto válido`);
  }

  const rowPayload: Record<string, string | number> = {
    [textHeader]: textValue,
    [STABLE_ROW_ID_COLUMN]: stableId,
  };

  if (businessId !== null && businessIdHeader) {
    rowPayload[businessIdHeader] = businessId;
  }

  if (existingRow) {
    existingRow.assign(rowPayload);
    await existingRow.save();
    return;
  }

  const createdRow = await sheet.addRow(rowPayload);
  await copyPreviousRowFormat(sheet, createdRow.rowNumber).catch((error: unknown) => {
    console.info('[sync-outbox] format-copy skipped', {
      entity: event.entity,
      sheet: config.sheetName,
      message: error instanceof Error ? error.message : 'unknown',
    });
  });
}

async function processOutboxEvent(event: OutboxEvent) {
  if (event.entity === 'leads_ganados') {
    await syncLeadGanadoEvent(event);
    return;
  }

  if (event.entity === 'envios') {
    await syncEnvioEvent(event);

    const supabaseAdmin = getSupabaseAdminClient();
    const leadGanadoIds = extractLeadGanadoBusinessIdsFromEnvioPayload(event.payload);
    for (const leadGanadoId of leadGanadoIds) {
      try {
        await recalculateLeadGanadoCountersByBusinessId(supabaseAdmin, leadGanadoId);
      } catch (counterError: unknown) {
        console.error('[sync-outbox] recálculo lead_ganado falló', {
          leadGanadoId,
          message: counterError instanceof Error ? counterError.message : 'Error desconocido',
        });
      }
    }

    return;
  }

  if (event.entity === 'recojos') {
    await syncRecojoEvent(event);
    return;
  }

  if (event.entity === 'tarifas') {
    await syncTarifaEvent(event);
    return;
  }

  const config = BASE_ENTITY_CONFIG[event.entity];

  if (!config) {
    throw new Error(`Entidad no soportada aún para sync: ${event.entity}`);
  }

  await syncBaseEntityEvent(event, config);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const cronAuthorized = isCronAuthorized(req);

    if (!cronAuthorized) {
      const auth = verifyAdminSession(req);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error ?? 'No autorizado' });
      }
    }

    const rawBody = typeof req.body === 'string' ? req.body.trim() : req.body;
    const parsedBody = bodySchema.parse(
      rawBody === '' || rawBody === null || rawBody === undefined
        ? undefined
        : typeof rawBody === 'string'
          ? JSON.parse(rawBody)
          : rawBody,
    );
    const limit = parsedBody?.limit ?? DEFAULT_BATCH_LIMIT;

    const supabaseAdmin = getSupabaseAdminClient();

    const { data: pendingEvents, error: fetchError } = await getSyncOutboxTable(supabaseAdmin)
      .select('id,entity,entity_id,operation,payload,attempts')
      .eq('status', 'pending')
      .in('entity', [...Object.keys(BASE_ENTITY_CONFIG), 'tarifas', 'envios', 'recojos', 'leads_ganados'])
      .order('created_at', { ascending: true })
      .limit(limit);

    if (fetchError) {
      if (isMissingSyncOutboxTableError(fetchError)) {
        return res.status(200).json({
          success: true,
          skipped: true,
          reason: 'sync_outbox table not found',
          processed: 0,
          failed: 0,
          fetched: 0,
        });
      }
      throw new Error(fetchError.message || 'No se pudo leer sync_outbox');
    }

    let processed = 0;
    let failed = 0;

    for (const rawEvent of (pendingEvents ?? []) as OutboxEvent[]) {
      const { data: processingRows, error: markProcessingError } = await getSyncOutboxTable(supabaseAdmin)
        .update({ status: 'processing', last_error: null } as never)
        .eq('id', rawEvent.id)
        .eq('status', 'pending')
        .select('id')
        .limit(1);

      if (markProcessingError) {
        failed += 1;
        continue;
      }

      if (!processingRows || processingRows.length === 0) {
        continue;
      }

      try {
        await processOutboxEvent(rawEvent);

        const { error: markDoneError } = await getSyncOutboxTable(supabaseAdmin)
          .update({ status: 'done', last_error: null, next_retry_at: null } as never)
          .eq('id', rawEvent.id);

        if (markDoneError) {
          throw new Error(markDoneError.message || 'No se pudo marcar evento como done');
        }

        processed += 1;
      } catch (eventError: unknown) {
        const message = eventError instanceof Error ? eventError.message : 'Error desconocido procesando evento';

        console.error('[sync-outbox] event failed', {
          eventId: rawEvent.id,
          entity: rawEvent.entity,
          operation: rawEvent.operation,
          message,
        });

        await getSyncOutboxTable(supabaseAdmin)
          .update({
            status: 'failed',
            attempts: (rawEvent.attempts ?? 0) + 1,
            last_error: message,
            next_retry_at: new Date(Date.now() + 60_000).toISOString(),
          } as never)
          .eq('id', rawEvent.id);

        failed += 1;
      }
    }

    return res.status(200).json({
      success: true,
      processed,
      failed,
      fetched: (pendingEvents ?? []).length,
    });
  } catch (error: unknown) {
    console.error('[sync-outbox] error', error);
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
