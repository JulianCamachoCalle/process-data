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

async function selectAllRowsPaginated(
  table: string,
  columns: string,
  orderByColumn: string,
) {
  const supabase = getSupabaseAdminClient();
  const rows: Array<Record<string, unknown>> = [];
  const batchSize = 1000;
  let from = 0;

  while (true) {
    const to = from + batchSize - 1;
    const { data, error } = await supabase
      .from(table as never)
      .select(columns as never)
      .order(orderByColumn as never, { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(error.message || `No se pudo consultar ${table}.`);
    }

    const chunk = (data ?? []) as Array<Record<string, unknown>>;
    rows.push(...chunk);

    if (chunk.length < batchSize) break;
    from += batchSize;
  }

  return rows;
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

function getAlignmentByHeader(header: string) {
  const normalized = header.trim().toLowerCase();

  if (
    normalized.includes('cobro')
    || normalized.includes('pago')
    || normalized.includes('ingreso')
    || normalized.includes('costo')
    || normalized.includes('extra')
    || normalized.includes('cantidad')
    || normalized.includes('dias')
    || normalized.includes('anulados')
  ) {
    return 'RIGHT' as const;
  }

  if (normalized.includes('fecha')) {
    return 'CENTER' as const;
  }

  return 'LEFT' as const;
}

function isCurrencyHeader(header: string) {
  const normalized = header.trim().toLowerCase();
  return (
    normalized.includes('cobro')
    || normalized.includes('pago')
    || normalized.includes('ingreso')
    || normalized.includes('costo')
    || normalized.includes('extra')
  );
}

function isNumberHeader(header: string) {
  const normalized = header.trim().toLowerCase();
  return normalized.includes('cantidad') || normalized.includes('dias') || normalized.includes('anulados');
}

async function applyBasicSheetStyles(
  spreadsheetId: string,
  sheet: GoogleSpreadsheet['sheetsByIndex'][number],
  columns: string[],
  rowsCount: number,
) {
  const columnsCount = columns.length;
  if (columnsCount <= 0) return;

  const requests: Array<Record<string, unknown>> = [
    {
      updateSheetProperties: {
        properties: {
          sheetId: sheet.sheetId,
          gridProperties: {
            frozenRowCount: 1,
          },
        },
        fields: 'gridProperties.frozenRowCount',
      },
    },
    {
      repeatCell: {
        range: {
          sheetId: sheet.sheetId,
          startRowIndex: 0,
          endRowIndex: 1,
          startColumnIndex: 0,
          endColumnIndex: columnsCount,
        },
        cell: {
          userEnteredFormat: {
            backgroundColor: { red: 0.86, green: 0.15, blue: 0.15 },
            horizontalAlignment: 'CENTER',
            textFormat: {
              bold: true,
              fontSize: 10,
              foregroundColor: { red: 1, green: 1, blue: 1 },
            },
          },
        },
        fields: 'userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)',
      },
    },
  ];

  if (rowsCount > 0) {
    requests.push({
      repeatCell: {
        range: {
          sheetId: sheet.sheetId,
          startRowIndex: 1,
          endRowIndex: rowsCount + 1,
          startColumnIndex: 0,
          endColumnIndex: columnsCount,
        },
        cell: {
          userEnteredFormat: {
            textFormat: {
              fontSize: 10,
              foregroundColor: { red: 0.17, green: 0.17, blue: 0.17 },
            },
          },
        },
        fields: 'userEnteredFormat.textFormat',
      },
    });

    for (let colIndex = 0; colIndex < columnsCount; colIndex += 1) {
      const header = columns[colIndex] ?? '';
      const alignment = getAlignmentByHeader(header);

      requests.push({
        repeatCell: {
          range: {
            sheetId: sheet.sheetId,
            startRowIndex: 1,
            endRowIndex: rowsCount + 1,
            startColumnIndex: colIndex,
            endColumnIndex: colIndex + 1,
          },
          cell: {
            userEnteredFormat: {
              horizontalAlignment: alignment,
            },
          },
          fields: 'userEnteredFormat.horizontalAlignment',
        },
      });

      if (isCurrencyHeader(header)) {
        requests.push({
          repeatCell: {
            range: {
              sheetId: sheet.sheetId,
              startRowIndex: 1,
              endRowIndex: rowsCount + 1,
              startColumnIndex: colIndex,
              endColumnIndex: colIndex + 1,
            },
            cell: {
              userEnteredFormat: {
                numberFormat: {
                  type: 'CURRENCY',
                  pattern: '[$S/ ] #,##0.00',
                },
              },
            },
            fields: 'userEnteredFormat.numberFormat',
          },
        });
      } else if (isNumberHeader(header)) {
        requests.push({
          repeatCell: {
            range: {
              sheetId: sheet.sheetId,
              startRowIndex: 1,
              endRowIndex: rowsCount + 1,
              startColumnIndex: colIndex,
              endColumnIndex: colIndex + 1,
            },
            cell: {
              userEnteredFormat: {
                numberFormat: {
                  type: 'NUMBER',
                  pattern: '#,##0',
                },
              },
            },
            fields: 'userEnteredFormat.numberFormat',
          },
        });
      }
    }
  }

  await applySheetBatchUpdate(spreadsheetId, requests);
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

async function applySheetBatchUpdate(
  spreadsheetId: string,
  requests: Array<Record<string, unknown>>,
) {
  if (requests.length === 0) return;

  const auth = getGoogleJwt();
  await auth.authorize();

  const tokenResult = await auth.getAccessToken();
  const accessToken = typeof tokenResult === 'string'
    ? tokenResult
    : (tokenResult?.token ?? auth.credentials.access_token ?? null);
  if (!accessToken) {
    throw new Error('No se pudo obtener token de Google para aplicar estilos.');
  }

  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${spreadsheetId}:batchUpdate`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!response.ok) {
    const bodyText = await response.text();
    throw new Error(`No se pudieron aplicar estilos (${response.status}): ${bodyText}`);
  }
}

async function fetchEnviosRows(dateFrom: string, dateTo: string) {
  const supabase = getSupabaseAdminClient();

  const [enviosRowsRaw, leadsRowsRaw, destinosResult, resultadosResult, tipoPuntoResult] = await Promise.all([
    selectAllRowsPaginated(
      'envios',
      'fecha_envio,id_lead_ganado,id_destino,id_resultado,cobro_entrega,pago_moto,excedente_pagado_moto,ingreso_total_fila,costo_total_fila,observaciones,id_tipo_punto,extra_punto_moto,extra_punto_empresa',
      'fecha_envio',
    ),
    selectAllRowsPaginated(
      'leads_ganados',
      'business_id,tienda_nombre_snapshot,vendedor_nombre_snapshot,fullfilment_snapshot',
      'business_id',
    ),
    supabase.from('destinos' as never).select('business_id,destino' as never),
    supabase.from('resultados' as never).select('business_id,resultado' as never),
    supabase.from('tipo_punto' as never).select('business_id,tipo_punto' as never),
  ]);

  const leadsById = new Map<number, { tienda: string; vendedor: string; fullfilment: string }>();
  for (const row of leadsRowsRaw) {
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

  const mapped = enviosRowsRaw
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
  const rowsRaw = await selectAllRowsPaginated(
    'leads_ganados',
    'fecha_ingreso_lead,fecha_lead_ganado,dias_lead_a_ganado,notas,distrito,cantidad_envios,anulados_fullfilment,ingreso_anulados_fullfilment,tienda_nombre_snapshot,vendedor_nombre_snapshot,origen_snapshot,fullfilment_snapshot',
    'fecha_lead_ganado',
  );

  const mapped = rowsRaw
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

  const chunkSize = 1000;
  for (let offset = 0; offset < rows.length; offset += chunkSize) {
    const chunk = rows.slice(offset, offset + chunkSize);
    await sheet.addRows(chunk as never);
  }

  try {
    await applyBasicSheetStyles(spreadsheetId, sheet, columns, rows.length);
  } catch {
    // Si falla el estilo no bloqueamos la exportación de datos.
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
