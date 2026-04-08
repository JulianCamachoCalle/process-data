import { JWT } from 'google-auth-library';
import { GoogleSpreadsheet } from 'google-spreadsheet';
import { randomUUID } from 'node:crypto';
import { getSupabaseAdminClient } from '../../kommo/_shared.js';

export type ExportResource = 'ENVIOS' | 'LEADS GANADOS';

export type ExportJobRequest = {
  resource: ExportResource;
  date_from: string;
  date_to: string;
  destination: {
    spreadsheet_id: string;
    sheet_name: string;
  };
};

export type ExportJobStatus = 'pending' | 'running' | 'done' | 'failed' | 'cancelled';

export type ExportJob = {
  id: string;
  request: ExportJobRequest;
  status: ExportJobStatus;
  created_at: string;
  updated_at: string;
  processed_rows: number;
  exported_rows: number;
  error_message: string | null;
};

const jobs = new Map<string, ExportJob>();

const ENVIOS_EXPORT_COLUMNS = [
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

const LEADS_GANADOS_EXPORT_COLUMNS = [
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

function nowIso() {
  return new Date().toISOString();
}

function toDmyDisplayDate(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  const dd = String(parsed.getDate()).padStart(2, '0');
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const yyyy = parsed.getFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function formatCost(raw: unknown): string {
  const numeric = Number(raw ?? 0);
  if (!Number.isFinite(numeric)) return '0.00';
  return numeric.toFixed(2);
}

function formatBool(value: unknown): string {
  if (typeof value === 'boolean') return value ? 'Sí' : 'No';
  const normalized = String(value ?? '').trim().toLowerCase();
  if (!normalized) return '';
  if (normalized === 'true' || normalized === 'si' || normalized === 'sí' || normalized === '1') return 'Sí';
  if (normalized === 'false' || normalized === 'no' || normalized === '0') return 'No';
  return String(value);
}

function parseDateInput(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? null : value;
}

function normalizeDateForCompare(raw: unknown): string | null {
  const value = String(raw ?? '').trim();
  if (!value) return null;

  const isoMatch = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) {
    return `${isoMatch[1]}-${isoMatch[2]}-${isoMatch[3]}`;
  }

  const dmyMatch = value.match(/^(\d{2})-(\d{2})-(\d{4})$/);
  if (dmyMatch) {
    return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const yyyy = parsed.getFullYear();
  const mm = String(parsed.getMonth() + 1).padStart(2, '0');
  const dd = String(parsed.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function isDateInRange(raw: unknown, dateFrom: string, dateTo: string) {
  const comparable = normalizeDateForCompare(raw);
  if (!comparable) return false;
  return comparable >= dateFrom && comparable <= dateTo;
}

async function applyBasicSheetStyles(sheet: GoogleSpreadsheet['sheetsByIndex'][number], columnsCount: number) {
  try {
    await sheet.updateProperties({
      gridProperties: {
        rowCount: sheet.rowCount,
        columnCount: sheet.columnCount,
        frozenRowCount: 1,
      },
    });
  } catch {
    // no-op: estilo opcional
  }

  try {
    if (columnsCount <= 0) return;
    const endColumnLetter = columnIndexToLetter(columnsCount);
    await sheet.loadCells(`A1:${endColumnLetter}1`);

    for (let columnIndex = 0; columnIndex < columnsCount; columnIndex += 1) {
      const cell = sheet.getCell(0, columnIndex);
      cell.textFormat = {
        ...(cell.textFormat ?? {}),
        bold: true,
        foregroundColor: {
          red: 1,
          green: 1,
          blue: 1,
        },
      };
      cell.backgroundColor = {
        red: 0.86,
        green: 0.15,
        blue: 0.15,
      };
      cell.horizontalAlignment = 'CENTER';
    }

    await sheet.saveUpdatedCells();
  } catch {
    // no-op: estilo opcional
  }
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

function getGoogleJwt() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const keyRaw = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !keyRaw) {
    throw new Error('Faltan credenciales de Google Service Account para exportar.');
  }

  return new JWT({
    email,
    key: keyRaw.replace(/\\n/g, '\n'),
    scopes: [
      'https://www.googleapis.com/auth/spreadsheets',
      'https://www.googleapis.com/auth/drive.file',
    ],
  });
}

async function fetchEnviosRows(dateFrom: string, dateTo: string) {
  const supabase = getSupabaseAdminClient();

  const [enviosResult, leadsResult, destinosResult, resultadosResult, tipoPuntoResult] = await Promise.all([
    supabase
      .from('envios' as never)
      .select('fecha_envio,id_lead_ganado,id_destino,id_resultado,cobro_entrega,pago_moto,excedente_pagado_moto,ingreso_total_fila,costo_total_fila,observaciones,id_tipo_punto,extra_punto_moto,extra_punto_empresa' as never)
      .order('fecha_envio' as never, { ascending: true }),
    supabase
      .from('leads_ganados' as never)
      .select('business_id,tienda_nombre_snapshot,vendedor_nombre_snapshot,fullfilment_snapshot' as never),
    supabase.from('destinos' as never).select('business_id,destino' as never),
    supabase.from('resultados' as never).select('business_id,resultado' as never),
    supabase.from('tipo_punto' as never).select('business_id,tipo_punto' as never),
  ]);

  if (enviosResult.error) throw new Error(enviosResult.error.message || 'No se pudo consultar envíos.');
  if (leadsResult.error) throw new Error(leadsResult.error.message || 'No se pudo consultar leads ganados.');

  const leadsById = new Map<number, { tienda: string; vendedor: string; fullfilment: string }>();
  for (const row of (leadsResult.data ?? []) as Array<Record<string, unknown>>) {
    const id = Number(row.business_id);
    if (!Number.isFinite(id)) continue;
    leadsById.set(id, {
      tienda: String(row.tienda_nombre_snapshot ?? ''),
      vendedor: String(row.vendedor_nombre_snapshot ?? ''),
      fullfilment: formatBool(row.fullfilment_snapshot),
    });
  }

  const destinosById = new Map<number, string>();
  for (const row of (destinosResult.data ?? []) as Array<Record<string, unknown>>) {
    const id = Number(row.business_id);
    if (Number.isFinite(id)) destinosById.set(id, String(row.destino ?? ''));
  }

  const resultadosById = new Map<number, string>();
  for (const row of (resultadosResult.data ?? []) as Array<Record<string, unknown>>) {
    const id = Number(row.business_id);
    if (Number.isFinite(id)) resultadosById.set(id, String(row.resultado ?? ''));
  }

  const tipoPuntoById = new Map<number, string>();
  for (const row of (tipoPuntoResult.data ?? []) as Array<Record<string, unknown>>) {
    const id = Number(row.business_id);
    if (Number.isFinite(id)) tipoPuntoById.set(id, String(row.tipo_punto ?? ''));
  }

  const mapped = ((enviosResult.data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => isDateInRange(row.fecha_envio, dateFrom, dateTo))
    .map((row) => {
    const leadId = Number(row.id_lead_ganado);
    const lead = leadsById.get(leadId);

    return {
      'Fecha envio': toDmyDisplayDate(row.fecha_envio),
      'Lead Ganado': Number.isFinite(leadId) ? String(leadId) : '',
      Tienda: lead?.tienda ?? '',
      Vendedor: lead?.vendedor ?? '',
      FullFilment: lead?.fullfilment ?? '',
      Destino: destinosById.get(Number(row.id_destino)) ?? '',
      Resultado: resultadosById.get(Number(row.id_resultado)) ?? '',
      'Cobro Entrega': formatCost(row.cobro_entrega),
      'Pago moto': formatCost(row.pago_moto),
      'Excedente pagado moto': formatCost(row.excedente_pagado_moto),
      'ingreso total fila': formatCost(row.ingreso_total_fila),
      'costo total fila': formatCost(row.costo_total_fila),
      observaciones: String(row.observaciones ?? ''),
      'Tipo Punto': tipoPuntoById.get(Number(row.id_tipo_punto)) ?? '',
      'Extra punto moto': formatCost(row.extra_punto_moto),
      'Extra punto empresa': formatCost(row.extra_punto_empresa),
      };
    });

  return {
    columns: [...ENVIOS_EXPORT_COLUMNS],
    rows: mapped,
  };
}

async function fetchLeadsGanadosRows(dateFrom: string, dateTo: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('leads_ganados' as never)
    .select('fecha_ingreso_lead,fecha_lead_ganado,dias_lead_a_ganado,notas,distrito,cantidad_envios,anulados_fullfilment,ingreso_anulados_fullfilment,tienda_nombre_snapshot,vendedor_nombre_snapshot,origen_snapshot,fullfilment_snapshot' as never)
    .order('fecha_lead_ganado' as never, { ascending: true });

  if (error) throw new Error(error.message || 'No se pudo consultar leads ganados.');

  const mapped = ((data ?? []) as Array<Record<string, unknown>>)
    .filter((row) => isDateInRange(row.fecha_lead_ganado, dateFrom, dateTo))
    .map((row) => ({
      Tienda: String(row.tienda_nombre_snapshot ?? ''),
      Vendedor: String(row.vendedor_nombre_snapshot ?? ''),
      'Fecha ingreso lead': toDmyDisplayDate(row.fecha_ingreso_lead),
      'Fecha Lead Ganado': toDmyDisplayDate(row.fecha_lead_ganado),
      'Dias lead a ganado': String(row.dias_lead_a_ganado ?? 0),
      FullFilment: formatBool(row.fullfilment_snapshot),
      Notas: String(row.notas ?? ''),
      Distrito: String(row.distrito ?? ''),
      'Cantidad de envios': String(row.cantidad_envios ?? 0),
      Origen: String(row.origen_snapshot ?? ''),
      'Anulados Fullfilment': String(row.anulados_fullfilment ?? 0),
      'Ingreso anulados fullfilment': formatCost(row.ingreso_anulados_fullfilment),
    }));

  return {
    columns: [...LEADS_GANADOS_EXPORT_COLUMNS],
    rows: mapped,
  };
}

async function replaceSheetData(spreadsheetId: string, sheetName: string, columns: string[], rows: Array<Record<string, unknown>>) {
  const doc = new GoogleSpreadsheet(spreadsheetId, getGoogleJwt());
  await doc.loadInfo();

  const existing = doc.sheetsByTitle[sheetName];
  if (existing) {
    await existing.delete();
    await doc.loadInfo();
  }

  const sheet = await doc.addSheet({
    title: sheetName,
    headerValues: columns,
  });

  await applyBasicSheetStyles(sheet, columns.length);

  const chunkSize = 1000;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    await sheet.addRows(chunk as never);
  }
}

export function listExportJobs() {
  return Array.from(jobs.values()).sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getExportJob(id: string) {
  return jobs.get(id) ?? null;
}

export function createExportJob(input: ExportJobRequest) {
  const job: ExportJob = {
    id: randomUUID(),
    request: input,
    status: 'pending',
    created_at: nowIso(),
    updated_at: nowIso(),
    processed_rows: 0,
    exported_rows: 0,
    error_message: null,
  };

  jobs.set(job.id, job);
  return job;
}

export function cancelExportJob(id: string) {
  const job = jobs.get(id);
  if (!job) return null;
  if (job.status === 'running') return job;

  const updated: ExportJob = {
    ...job,
    status: 'cancelled',
    updated_at: nowIso(),
  };
  jobs.set(id, updated);
  return updated;
}

export function validateExportRequest(input: Partial<ExportJobRequest>) {
  if (!input.resource || (input.resource !== 'ENVIOS' && input.resource !== 'LEADS GANADOS')) {
    return 'resource inválido. Permitidos: ENVIOS | LEADS GANADOS';
  }

  if (!input.date_from || !parseDateInput(input.date_from)) {
    return 'date_from inválido (formato YYYY-MM-DD)';
  }

  if (!input.date_to || !parseDateInput(input.date_to)) {
    return 'date_to inválido (formato YYYY-MM-DD)';
  }

  if (input.date_from > input.date_to) {
    return 'date_from no puede ser mayor que date_to';
  }

  if (!input.destination?.spreadsheet_id?.trim()) {
    return 'destination.spreadsheet_id es obligatorio';
  }

  if (!input.destination?.sheet_name?.trim()) {
    return 'destination.sheet_name es obligatorio';
  }

  return null;
}

export async function runExportJob(id: string) {
  const current = jobs.get(id);
  if (!current) return null;
  if (current.status === 'running') return current;
  if (current.status === 'cancelled') return current;

  const running: ExportJob = {
    ...current,
    status: 'running',
    updated_at: nowIso(),
    error_message: null,
  };
  jobs.set(id, running);

  try {
    const dataset = running.request.resource === 'ENVIOS'
      ? await fetchEnviosRows(running.request.date_from, running.request.date_to)
      : await fetchLeadsGanadosRows(running.request.date_from, running.request.date_to);

    await replaceSheetData(
      running.request.destination.spreadsheet_id,
      running.request.destination.sheet_name,
      dataset.columns,
      dataset.rows,
    );

    const done: ExportJob = {
      ...running,
      status: 'done',
      updated_at: nowIso(),
      processed_rows: dataset.rows.length,
      exported_rows: dataset.rows.length,
      error_message: null,
    };
    jobs.set(id, done);
    return done;
  } catch (error: unknown) {
    const failed: ExportJob = {
      ...running,
      status: 'failed',
      updated_at: nowIso(),
      error_message: error instanceof Error ? error.message : 'No se pudo exportar a Google Sheets.',
    };
    jobs.set(id, failed);
    return failed;
  }
}
