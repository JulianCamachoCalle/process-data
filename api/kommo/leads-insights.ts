import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getSupabaseAdminClient,
  isSecretAuthorized,
  isVercelCronAuthorized,
  verifySession,
} from './_shared.js';

const INSIGHTS_SECRET_HEADER = 'x-kommo-insights-secret';
const INSIGHTS_SECRET_ENV = 'KOMMO_INSIGHTS_SECRET';
const INSIGHTS_CACHE_TTL_MS = 60 * 1000;

type InsightsCacheEntry = {
  expiresAt: number;
  payload: Record<string, unknown>;
};

const insightsCache = new Map<string, InsightsCacheEntry>();

type LeadRow = {
  pipeline_id: number | null;
  status_id: number | null;
  price: number | null;
  is_deleted: boolean | null;
  closed_at: string | null;
  created_at: string | null;
  responsible_user_id: number | null;
};

type LeadGanadoRow = {
  fecha_lead_ganado: string | null;
  vendedor_nombre_snapshot: string | null;
  pipeline_id_snapshot: number | null;
  kommo_lead_id: number | null;
};

type PipelineRow = {
  business_id: number;
  name: string | null;
};

type PipelineStatusRow = {
  business_id: number;
  pipeline_id: number;
  name: string | null;
  type: number | null;
};

type UserRow = {
  business_id: number;
  name: string | null;
};

type UnsortedLeadRow = {
  created_at: string | null;
};

type PipelineInsight = {
  pipeline_id: number | null;
  pipeline_name: string;
  total_leads: number;
};

type StatusInsight = {
  pipeline_id: number | null;
  pipeline_name: string;
  status_id: number | null;
  status_name: string;
  total_leads: number;
};

type StatusByNameInsight = {
  status_name: string;
  total_leads: number;
};

type HourlyIncomingInsight = {
  hour: number;
  total_incoming: number;
};

type OwnerInsight = {
  responsible_user_id: number | null;
  responsible_user_name: string;
  total_leads: number;
};

type CreatedPipelineSnapshotInsight = {
  group_key: string;
  pipeline_id: number | null;
  pipeline_name: string;
  total_leads: number;
  open_leads: number;
  closed_leads: number;
  lost_leads: number;
  avg_price: number | null;
};

type WonPipelineInsight = {
  pipeline_id: number | null;
  pipeline_name: string;
  total_won: number;
};

type WonSellerInsight = {
  seller_name: string;
  total_won: number;
};

type SellerOption = {
  value: string;
  pipelineId: number;
  label: string;
};

type SellerStatsPayload = {
  seller: string;
  pipeline_id: number;
  enviosTotales: number;
  totalLeads: number;
  leadsGanados: number;
  efectividad: number;
  ingresoTotal: number;
  costoMotoTotal: number;
  margenVsMoto: number;
  ingresoPorLeadGanado: number;
  ticketPromedio: number;
  topTiendas: Array<{ tienda: string; enviosEntregados: number }>;
};

type SellerLeadSummaryOption = {
  value: string;
  label: string;
};

type SellerLeadSummaryRow = {
  lead_id: number;
  fecha_ingreso_lead: string | null;
  fecha_lead_ganado: string | null;
  dias_lead_a_ganado: number;
  envios_entregados: number;
  envios_rechazados: number;
  ingreso_envios: number;
  costo_envios: number;
  margen_envios: number;
  recojos_cobrados_veces: number;
  recojos_gratis_veces: number;
  ingreso_recojos: number;
  costo_recojos: number;
  ingreso_total: number;
  costo_total: number;
  margen_total: number;
};

type LeadsInsightsResponse = {
  filters: {
    start_date: string | null;
    end_date: string | null;
  };
  created: {
    summary: {
      total_leads: number;
      total_open: number;
      total_closed: number;
      total_lost: number;
      total_deleted: number;
      total_incoming: number;
      avg_price: number | null;
      top_pipeline: PipelineInsight | null;
      top_owner: OwnerInsight | null;
    };
    pipeline_volume: PipelineInsight[];
    owner_volume: OwnerInsight[];
    status_volume: StatusInsight[];
    status_volume_by_name: StatusByNameInsight[];
    pipeline_current_state: CreatedPipelineSnapshotInsight[];
    hourly_incoming: HourlyIncomingInsight[];
    insights: {
      busiest_hour: HourlyIncomingInsight | null;
      top_status: StatusInsight | null;
      orphan_pipeline_leads: number;
    };
  };
  won: {
    summary: {
      total_won: number;
      top_pipeline: WonPipelineInsight | null;
      top_seller: WonSellerInsight | null;
    };
    pipelines: WonPipelineInsight[];
    sellers: WonSellerInsight[];
  };
};

function asSingleQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function normalizeStatusGroupingKey(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function isMostlyUppercase(value: string) {
  const lettersOnly = value.replace(/[^\p{L}]+/gu, '');
  if (!lettersOnly) return false;
  return lettersOnly === lettersOnly.toUpperCase();
}

function isLikelyWonStatus(statusName: string) {
  const normalized = normalizeText(statusName);
  return (
    normalized.includes('ganad') ||
    normalized.includes('won') ||
    normalized.includes('success') ||
    normalized.includes('closed won')
  );
}

function isLikelyLostStatus(statusName: string) {
  const normalized = normalizeText(statusName);
  return (
    normalized.includes('perdid') ||
    normalized.includes('lost') ||
    normalized.includes('rechaz') ||
    normalized.includes('declin') ||
    normalized.includes('closed lost')
  );
}

async function safeSelectPaginated<T extends Record<string, unknown>>(
  table: string,
  columns: string,
  options?: {
    batchSize?: number;
    dateFilter?: {
      column: string;
      startDate: string | null;
      endDate: string | null;
      widenByOneDay?: boolean;
    };
  },
): Promise<T[]> {
  try {
    const supabase = getSupabaseAdminClient();
    const rows: T[] = [];
    let from = 0;
    const batchSize = options?.batchSize ?? 1000;

    while (true) {
      const to = from + batchSize - 1;
      let query = supabase
        .from(table as never)
        .select(columns as never)
        .range(from, to);

      if (options?.dateFilter) {
        query = applyDateRangeQuery(
          query,
          options.dateFilter.column,
          options.dateFilter.startDate,
          options.dateFilter.endDate,
          { widenByOneDay: options.dateFilter.widenByOneDay },
        );
      }

      const { data, error } = await query;

      if (error || !Array.isArray(data)) {
        return [];
      }

      const chunk = data as unknown as T[];
      rows.push(...chunk);

      if (chunk.length < batchSize) {
        break;
      }

      from += batchSize;
    }

    return rows;
  } catch {
    return [];
  }
}

function getLimaDateFormatter() {
  return new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

function toNumericAverage(items: number[]) {
  if (items.length === 0) return null;
  const total = items.reduce((acc, current) => acc + current, 0);
  return Number((total / items.length).toFixed(2));
}

function parseHour(dateLike: string) {
  const parsedDate = new Date(dateLike);
  if (Number.isNaN(parsedDate.getTime())) return null;

  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Lima',
    hour: '2-digit',
    hour12: false,
  });
  const hourPart = formatter.formatToParts(parsedDate).find((part) => part.type === 'hour')?.value;
  if (!hourPart) return null;
  const hour = Number(hourPart);
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : null;
}

function parseDateInput(value: string | undefined) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const [yearRaw, monthRaw, dayRaw] = value.split('-');
  const year = Number(yearRaw);
  const month = Number(monthRaw);
  const day = Number(dayRaw);
  const parsed = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(parsed.getTime())
    || parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) {
    return null;
  }

  return value;
}

function shiftIsoDate(isoDate: string, deltaDays: number) {
  const [yearRaw, monthRaw, dayRaw] = isoDate.split('-');
  const date = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw)));
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function buildInsightsCacheKey(startDate: string | null, endDate: string | null) {
  return `${startDate ?? 'null'}::${endDate ?? 'null'}`;
}

function toNumberOrZero(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function applyDateRangeQuery<T extends { gte: (column: string, value: string) => T; lte: (column: string, value: string) => T }>(
  query: T,
  column: string,
  startDate: string | null,
  endDate: string | null,
  options?: { widenByOneDay?: boolean },
): T {
  let next = query;

  const normalizedStart = startDate
    ? options?.widenByOneDay
      ? shiftIsoDate(startDate, -1)
      : startDate
    : null;

  const normalizedEnd = endDate
    ? options?.widenByOneDay
      ? shiftIsoDate(endDate, 1)
      : endDate
    : null;

  if (normalizedStart) {
    next = next.gte(column, normalizedStart);
  }

  if (normalizedEnd) {
    next = next.lte(column, normalizedEnd);
  }

  return next;
}

function toLimaDateString(dateLike: string) {
  const parsedDate = new Date(dateLike);
  if (Number.isNaN(parsedDate.getTime())) return null;

  const dateParts = getLimaDateFormatter().formatToParts(parsedDate);
  const year = dateParts.find((part) => part.type === 'year')?.value;
  const month = dateParts.find((part) => part.type === 'month')?.value;
  const day = dateParts.find((part) => part.type === 'day')?.value;

  if (!year || !month || !day) return null;
  return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
}

function isDateWithinRange(dateLike: string | null, startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) return true;
  if (!dateLike) return false;
  const dateInLima = toLimaDateString(dateLike);
  if (!dateInLima) return false;

  if (startDate && dateInLima < startDate) return false;
  if (endDate && dateInLima > endDate) return false;
  return true;
}

function toComparableDateString(dateLike: string | null) {
  if (!dateLike) return null;

  const trimmedValue = dateLike.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmedValue)) {
    return trimmedValue;
  }

  return toLimaDateString(trimmedValue);
}

function isComparableDateWithinRange(dateLike: string | null, startDate: string | null, endDate: string | null) {
  if (!startDate && !endDate) return true;

  const comparableDate = toComparableDateString(dateLike);
  if (!comparableDate) return false;

  if (startDate && comparableDate < startDate) return false;
  if (endDate && comparableDate > endDate) return false;
  return true;
}

function buildPerformanceGroupKey(pipelineId: number | null, pipelineName: string) {
  const trimmedName = pipelineName.trim();

  if (pipelineId !== null) {
    return trimmedName ? `pipeline:${pipelineId}:${normalizeText(trimmedName)}` : `pipeline:${pipelineId}`;
  }

  return trimmedName ? `name:${normalizeText(trimmedName)}` : 'name:sin-pipeline';
}

export default async function kommoLeadsInsightsHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const secretAuthorized = isSecretAuthorized(req, INSIGHTS_SECRET_ENV, INSIGHTS_SECRET_HEADER);
    const cronAuthorized = isVercelCronAuthorized(req);
    if (!secretAuthorized && !cronAuthorized) {
      const auth = verifySession(req, ['admin', 'user']);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error ?? 'No autorizado' });
      }
    }

    const startDateParam = asSingleQueryParam(req.query.start_date);
    const endDateParam = asSingleQueryParam(req.query.end_date);

    const startDateRaw = typeof startDateParam === 'string' ? startDateParam.trim() : '';
    const endDateRaw = typeof endDateParam === 'string' ? endDateParam.trim() : '';

    const startDate = startDateRaw ? parseDateInput(startDateRaw) : null;
    const endDate = endDateRaw ? parseDateInput(endDateRaw) : null;

    if (startDateRaw && !startDate) {
      return res.status(400).json({
        success: false,
        error: 'El parámetro start_date debe tener formato YYYY-MM-DD válido.',
      });
    }

    if (endDateRaw && !endDate) {
      return res.status(400).json({
        success: false,
        error: 'El parámetro end_date debe tener formato YYYY-MM-DD válido.',
      });
    }

    if (startDate && endDate && startDate > endDate) {
      return res.status(400).json({
        success: false,
        error: 'El parámetro start_date no puede ser mayor que end_date.',
      });
    }

    const modeParam = asSingleQueryParam(req.query.mode);
    const mode = typeof modeParam === 'string' ? modeParam.trim().toLowerCase() : '';

    if (mode === 'seller_options') {
      const pipelines = await safeSelectPaginated<{ business_id: number; name: string | null; is_archive: boolean | null }>(
        'kommo_pipelines',
        'business_id,name,is_archive',
      );

      const excluded = new Set(['data de leads', 'leads entrantes principal']);
      const options: SellerOption[] = [];

      for (const row of pipelines) {
        const pipelineId = Number(row.business_id);
        if (!Number.isFinite(pipelineId) || pipelineId <= 0) continue;
        if (row.is_archive === true) continue;

        const label = String(row.name ?? '').trim();
        if (!label) continue;
        if (excluded.has(normalizeText(label))) continue;

        options.push({
          value: String(pipelineId),
          pipelineId,
          label,
        });
      }

      options.sort((a, b) => a.label.localeCompare(b.label, 'es'));
      return res.status(200).json({ success: true, options });
    }

    if (mode === 'seller_lead_summary_options') {
      const supabase = getSupabaseAdminClient();
      const optionsMap = new Map<string, string>();
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const to = from + pageSize - 1;
        const { data, error } = await supabase
          .from('leads_ganados' as never)
          .select('vendedor_nombre_snapshot' as never)
          .not('vendedor_nombre_snapshot' as never, 'is' as never, null as never)
          .neq('vendedor_nombre_snapshot' as never, '' as never)
          .range(from, to);

        if (error) {
          throw new Error(error.message || 'No se pudo cargar la lista de vendedores de leads ganados.');
        }

        const chunk = (data ?? []) as Array<{ vendedor_nombre_snapshot: string | null }>;
        for (const row of chunk) {
          const label = String(row.vendedor_nombre_snapshot ?? '').trim();
          if (!label) continue;
          const normalized = normalizeText(label);
          if (!normalized) continue;
          if (!optionsMap.has(normalized)) {
            optionsMap.set(normalized, label);
          }
        }

        if (chunk.length < pageSize) break;
        from += pageSize;
      }

      const options: SellerLeadSummaryOption[] = Array.from(optionsMap.entries())
        .map(([value, label]) => ({ value, label }))
        .sort((a, b) => a.label.localeCompare(b.label, 'es'));

      return res.status(200).json({ success: true, options });
    }

    if (mode === 'seller_lead_summary') {
      const sellerNameParam = asSingleQueryParam(req.query.seller_name);
      const sellerName = typeof sellerNameParam === 'string' ? sellerNameParam.trim() : '';

      if (!sellerName) {
        return res.status(400).json({ success: false, error: 'Falta seller_name.' });
      }

      const supabase = getSupabaseAdminClient();

      const leadsGanados: Array<{
        business_id: number | null;
        fecha_ingreso_lead: string | null;
        fecha_lead_ganado: string | null;
        dias_lead_a_ganado: number | null;
      }> = [];

      let from = 0;
      const pageSize = 1000;

      while (true) {
        const to = from + pageSize - 1;
        let leadsQuery = supabase
          .from('leads_ganados' as never)
          .select('business_id,fecha_ingreso_lead,fecha_lead_ganado,dias_lead_a_ganado' as never)
          .eq('vendedor_nombre_snapshot' as never, sellerName as never)
          .range(from, to);

        if (startDate) leadsQuery = leadsQuery.gte('fecha_lead_ganado' as never, startDate as never);
        if (endDate) leadsQuery = leadsQuery.lte('fecha_lead_ganado' as never, endDate as never);

        const { data, error } = await leadsQuery;

        if (error) {
          throw new Error(error.message || 'No se pudieron cargar leads ganados para el vendedor.');
        }

        const chunk = (data ?? []) as Array<{
          business_id: number | null;
          fecha_ingreso_lead: string | null;
          fecha_lead_ganado: string | null;
          dias_lead_a_ganado: number | null;
        }>;

        leadsGanados.push(...chunk);
        if (chunk.length < pageSize) break;
        from += pageSize;
      }

      const leadRows = leadsGanados
        .map((row) => ({
          leadId: Number(row.business_id ?? 0),
          fechaIngresoLead: row.fecha_ingreso_lead,
          fechaLeadGanado: row.fecha_lead_ganado,
          diasLeadAGanado: Number(row.dias_lead_a_ganado ?? 0),
        }))
        .filter((row) => Number.isFinite(row.leadId) && row.leadId > 0);

      const leadIds = Array.from(new Set(leadRows.map((row) => row.leadId)));
      if (leadIds.length === 0) {
        return res.status(200).json({ success: true, seller: sellerName, rows: [] as SellerLeadSummaryRow[] });
      }

      const resultados = await safeSelectPaginated<{ business_id: number; resultado: string | null }>('resultados', 'business_id,resultado', { batchSize: 500 });
      const deliveredResultIds = new Set<number>();
      const rejectedResultIds = new Set<number>();
      for (const row of resultados) {
        const resultId = Number(row.business_id ?? 0);
        if (!Number.isFinite(resultId) || resultId <= 0) continue;
        const normalized = normalizeText(row.resultado ?? '');
        if (normalized.includes('entregado')) {
          deliveredResultIds.add(resultId);
        }
        if (normalized.includes('rechaz')) {
          rejectedResultIds.add(resultId);
        }
      }

      const enviosRows: Array<{
        id_lead_ganado: number | null;
        id_resultado: number | null;
        ingreso_total_fila: number | null;
        costo_total_fila: number | null;
      }> = [];
      const recojosRows: Array<{
        id_lead_ganado: number | null;
        tipo_cobro: string | null;
        veces: number | null;
        ingreso_recojo_total: number | null;
        costo_recojo_total: number | null;
      }> = [];

      for (let index = 0; index < leadIds.length; index += 200) {
        const chunk = leadIds.slice(index, index + 200);

        let envFrom = 0;
        while (true) {
          const envTo = envFrom + pageSize - 1;
          let enviosQuery = supabase
            .from('envios' as never)
            .select('id_lead_ganado,id_resultado,ingreso_total_fila,costo_total_fila' as never)
            .in('id_lead_ganado' as never, chunk as never)
            .range(envFrom, envTo);

          if (startDate) enviosQuery = enviosQuery.gte('fecha_envio' as never, startDate as never);
          if (endDate) enviosQuery = enviosQuery.lte('fecha_envio' as never, endDate as never);

          const { data, error } = await enviosQuery;

          if (error) {
            throw new Error(error.message || 'No se pudieron cargar envíos para el resumen de vendedor.');
          }

          const chunkRows = (data ?? []) as Array<{
            id_lead_ganado: number | null;
            id_resultado: number | null;
            ingreso_total_fila: number | null;
            costo_total_fila: number | null;
          }>;
          enviosRows.push(...chunkRows);
          if (chunkRows.length < pageSize) break;
          envFrom += pageSize;
        }

        let recFrom = 0;
        while (true) {
          const recTo = recFrom + pageSize - 1;
          let recojosQuery = supabase
            .from('recojos' as never)
            .select('id_lead_ganado,tipo_cobro,veces,ingreso_recojo_total,costo_recojo_total' as never)
            .in('id_lead_ganado' as never, chunk as never)
            .range(recFrom, recTo);

          if (startDate) recojosQuery = recojosQuery.gte('fecha' as never, startDate as never);
          if (endDate) recojosQuery = recojosQuery.lte('fecha' as never, endDate as never);

          const { data, error } = await recojosQuery;

          if (error) {
            throw new Error(error.message || 'No se pudieron cargar recojos para el resumen de vendedor.');
          }

          const chunkRows = (data ?? []) as Array<{
            id_lead_ganado: number | null;
            tipo_cobro: string | null;
            veces: number | null;
            ingreso_recojo_total: number | null;
            costo_recojo_total: number | null;
          }>;
          recojosRows.push(...chunkRows);
          if (chunkRows.length < pageSize) break;
          recFrom += pageSize;
        }
      }

      const enviosByLead = new Map<number, {
        entregados: number;
        rechazados: number;
        ingreso: number;
        costo: number;
      }>();

      for (const envio of enviosRows) {
        const leadId = Number(envio.id_lead_ganado ?? 0);
        if (!Number.isFinite(leadId) || leadId <= 0) continue;

        const current = enviosByLead.get(leadId) ?? {
          entregados: 0,
          rechazados: 0,
          ingreso: 0,
          costo: 0,
        };

        const resultId = Number(envio.id_resultado ?? 0);
        if (deliveredResultIds.has(resultId)) current.entregados += 1;
        if (rejectedResultIds.has(resultId)) current.rechazados += 1;

        current.ingreso += toNumberOrZero(envio.ingreso_total_fila);
        current.costo += toNumberOrZero(envio.costo_total_fila);

        enviosByLead.set(leadId, current);
      }

      const recojosByLead = new Map<number, {
        cobradosVeces: number;
        gratisVeces: number;
        ingreso: number;
        costo: number;
      }>();

      for (const recojo of recojosRows) {
        const leadId = Number(recojo.id_lead_ganado ?? 0);
        if (!Number.isFinite(leadId) || leadId <= 0) continue;

        const current = recojosByLead.get(leadId) ?? {
          cobradosVeces: 0,
          gratisVeces: 0,
          ingreso: 0,
          costo: 0,
        };

        const tipo = normalizeText(recojo.tipo_cobro ?? '');
        const veces = Math.max(0, toNumberOrZero(recojo.veces));
        if (tipo.includes('1 pedido')) {
          current.cobradosVeces += veces;
        }
        if (tipo.includes('2+ pedido')) {
          current.gratisVeces += veces;
        }

        current.ingreso += toNumberOrZero(recojo.ingreso_recojo_total);
        current.costo += toNumberOrZero(recojo.costo_recojo_total);

        recojosByLead.set(leadId, current);
      }

      const rows: SellerLeadSummaryRow[] = leadRows
        .map((lead) => {
          const envios = enviosByLead.get(lead.leadId) ?? {
            entregados: 0,
            rechazados: 0,
            ingreso: 0,
            costo: 0,
          };

          const recojos = recojosByLead.get(lead.leadId) ?? {
            cobradosVeces: 0,
            gratisVeces: 0,
            ingreso: 0,
            costo: 0,
          };

          const margenEnvios = envios.ingreso - envios.costo;
          const ingresoTotal = envios.ingreso + recojos.ingreso;
          const costoTotal = envios.costo + recojos.costo;
          const margenTotal = ingresoTotal - costoTotal;

          return {
            lead_id: lead.leadId,
            fecha_ingreso_lead: lead.fechaIngresoLead,
            fecha_lead_ganado: lead.fechaLeadGanado,
            dias_lead_a_ganado: lead.diasLeadAGanado,
            envios_entregados: envios.entregados,
            envios_rechazados: envios.rechazados,
            ingreso_envios: envios.ingreso,
            costo_envios: envios.costo,
            margen_envios: margenEnvios,
            recojos_cobrados_veces: recojos.cobradosVeces,
            recojos_gratis_veces: recojos.gratisVeces,
            ingreso_recojos: recojos.ingreso,
            costo_recojos: recojos.costo,
            ingreso_total: ingresoTotal,
            costo_total: costoTotal,
            margen_total: margenTotal,
          };
        })
        .sort((a, b) => {
          const dateA = a.fecha_lead_ganado ?? '';
          const dateB = b.fecha_lead_ganado ?? '';
          if (dateA !== dateB) return dateB.localeCompare(dateA);
          return b.lead_id - a.lead_id;
        });

      return res.status(200).json({ success: true, seller: sellerName, rows });
    }

    if (mode === 'seller_stats') {
      const sellerNameParam = asSingleQueryParam(req.query.seller_name);
      const pipelineIdParam = asSingleQueryParam(req.query.pipeline_id);

      const sellerName = typeof sellerNameParam === 'string' ? sellerNameParam.trim() : '';
      const pipelineId = Number.parseInt(typeof pipelineIdParam === 'string' ? pipelineIdParam.trim() : '', 10);

      if (!sellerName) {
        return res.status(400).json({ success: false, error: 'Falta seller_name.' });
      }

      if (!Number.isFinite(pipelineId) || pipelineId <= 0) {
        return res.status(400).json({ success: false, error: 'pipeline_id inválido.' });
      }

      const supabase = getSupabaseAdminClient();

      const leadsGanados: Array<{ business_id: number | null; tienda_nombre_snapshot: string | null }> = [];
      let from = 0;
      const pageSize = 1000;

      while (true) {
        const to = from + pageSize - 1;
        let query = supabase
          .from('leads_ganados' as never)
          .select('business_id,tienda_nombre_snapshot' as never)
          .eq('vendedor_nombre_snapshot' as never, sellerName as never)
          .range(from, to);

        if (startDate) query = query.gte('fecha_lead_ganado' as never, startDate as never);
        if (endDate) query = query.lte('fecha_lead_ganado' as never, endDate as never);

        const { data, error } = await query;
        if (error) throw new Error(error.message || 'No se pudieron cargar leads ganados.');

        const chunk = (data ?? []) as Array<{ business_id: number | null; tienda_nombre_snapshot: string | null }>;
        leadsGanados.push(...chunk);
        if (chunk.length < pageSize) break;
        from += pageSize;
      }

      const leadsGanadosTotal = leadsGanados.length;
      const leadIds = Array.from(new Set(
        leadsGanados
          .map((lead) => Number(lead.business_id ?? 0))
          .filter((id) => Number.isFinite(id) && id > 0),
      ));

      const resultados = await safeSelectPaginated<{ business_id: number; resultado: string | null }>('resultados', 'business_id,resultado', { batchSize: 500 });
      const deliveredResultIds = new Set(
        resultados
          .filter((row) => normalizeText(String(row.resultado ?? '')).includes('entregado'))
          .map((row) => Number(row.business_id))
          .filter((id) => Number.isFinite(id) && id > 0),
      );

      const enviosRows: Array<{ id_lead_ganado: number | null; id_resultado: number | null; ingreso_total_fila: number | null; costo_total_fila: number | null }> = [];
      const recojosRows: Array<{ id_lead_ganado: number | null; ingreso_recojo_total: number | null; costo_recojo_total: number | null }> = [];

      const leadIdChunks: number[][] = [];
      for (let index = 0; index < leadIds.length; index += 200) {
        leadIdChunks.push(leadIds.slice(index, index + 200));
      }

      for (const chunk of leadIdChunks) {
        let envFrom = 0;
        while (true) {
          const envTo = envFrom + pageSize - 1;
          let enviosQuery = supabase
            .from('envios' as never)
            .select('id_lead_ganado,id_resultado,ingreso_total_fila,costo_total_fila' as never)
            .in('id_lead_ganado' as never, chunk as never)
            .range(envFrom, envTo);

          if (startDate) enviosQuery = enviosQuery.gte('fecha_envio' as never, startDate as never);
          if (endDate) enviosQuery = enviosQuery.lte('fecha_envio' as never, endDate as never);

          const { data, error } = await enviosQuery;
          if (error) throw new Error(error.message || 'No se pudieron cargar envíos.');

          const chunkRows = (data ?? []) as Array<{ id_lead_ganado: number | null; id_resultado: number | null; ingreso_total_fila: number | null; costo_total_fila: number | null }>;
          enviosRows.push(...chunkRows);
          if (chunkRows.length < pageSize) break;
          envFrom += pageSize;
        }

        let recFrom = 0;
        while (true) {
          const recTo = recFrom + pageSize - 1;
          let recojosQuery = supabase
            .from('recojos' as never)
            .select('id_lead_ganado,ingreso_recojo_total,costo_recojo_total' as never)
            .in('id_lead_ganado' as never, chunk as never)
            .range(recFrom, recTo);

          if (startDate) recojosQuery = recojosQuery.gte('fecha' as never, startDate as never);
          if (endDate) recojosQuery = recojosQuery.lte('fecha' as never, endDate as never);

          const { data, error } = await recojosQuery;
          if (error) throw new Error(error.message || 'No se pudieron cargar recojos.');

          const chunkRows = (data ?? []) as Array<{ id_lead_ganado: number | null; ingreso_recojo_total: number | null; costo_recojo_total: number | null }>;
          recojosRows.push(...chunkRows);
          if (chunkRows.length < pageSize) break;
          recFrom += pageSize;
        }
      }

      const countBy = async (field: 'updated_at' | 'updated_at_db') => {
        let countQuery = supabase
          .from('kommo_leads' as never)
          .select('business_id' as never, { head: true, count: 'exact' })
          .eq('pipeline_id' as never, pipelineId as never);

        if (startDate) countQuery = countQuery.gte(field as never, `${startDate}T00:00:00.000Z` as never);
        if (endDate) countQuery = countQuery.lt(field as never, `${shiftIsoDate(endDate, 1)}T00:00:00.000Z` as never);

        const { count, error } = await countQuery;
        if (error) throw new Error(error.message || `No se pudo calcular leads totales por ${field}.`);
        return Number(count ?? 0);
      };

      const totalLeadsFromUpdatedAt = await countBy('updated_at');
      const totalLeads = totalLeadsFromUpdatedAt > 0 ? totalLeadsFromUpdatedAt : await countBy('updated_at_db');

      const enviosTotales = enviosRows.length;
      const enviosEntregados = enviosRows.filter((row) => deliveredResultIds.has(Number(row.id_resultado ?? 0)));

      const ingresoEnvios = enviosRows.reduce((acc, row) => acc + toNumberOrZero(row.ingreso_total_fila), 0);
      const costoEnvios = enviosRows.reduce((acc, row) => acc + toNumberOrZero(row.costo_total_fila), 0);
      const ingresoRecojos = recojosRows.reduce((acc, row) => acc + toNumberOrZero(row.ingreso_recojo_total), 0);
      const costoRecojos = recojosRows.reduce((acc, row) => acc + toNumberOrZero(row.costo_recojo_total), 0);

      const ingresoTotal = ingresoEnvios + ingresoRecojos;
      const costoMotoTotal = costoEnvios + costoRecojos;
      const margenVsMoto = ingresoTotal - costoMotoTotal;
      const efectividad = totalLeads > 0 ? (leadsGanadosTotal / totalLeads) * 100 : 0;
      const ingresoPorLeadGanado = leadsGanadosTotal > 0 ? ingresoTotal / leadsGanadosTotal : 0;
      const ticketPromedio = enviosTotales > 0 ? ingresoTotal / enviosTotales : 0;

      const tiendaByLeadId = new Map<number, string>();
      for (const lead of leadsGanados) {
        const leadId = Number(lead.business_id ?? 0);
        if (!Number.isFinite(leadId) || leadId <= 0) continue;
        const tienda = String(lead.tienda_nombre_snapshot ?? '').trim() || `Lead #${leadId}`;
        tiendaByLeadId.set(leadId, tienda);
      }

      const topTiendaCounter = new Map<string, number>();
      for (const envio of enviosEntregados) {
        const leadId = Number(envio.id_lead_ganado ?? 0);
        const tienda = tiendaByLeadId.get(leadId) ?? `Lead #${leadId}`;
        topTiendaCounter.set(tienda, (topTiendaCounter.get(tienda) ?? 0) + 1);
      }

      const topTiendas = Array.from(topTiendaCounter.entries())
        .map(([tienda, enviosEntregadosCount]) => ({ tienda, enviosEntregados: enviosEntregadosCount }))
        .sort((a, b) => b.enviosEntregados - a.enviosEntregados)
        .slice(0, 3);

      const payload: SellerStatsPayload = {
        seller: sellerName,
        pipeline_id: pipelineId,
        enviosTotales,
        totalLeads,
        leadsGanados: leadsGanadosTotal,
        efectividad,
        ingresoTotal,
        costoMotoTotal,
        margenVsMoto,
        ingresoPorLeadGanado,
        ticketPromedio,
        topTiendas,
      };

      return res.status(200).json({ success: true, data: payload });
    }

    const cacheKey = buildInsightsCacheKey(startDate, endDate);
    const cached = insightsCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return res.status(200).json(cached.payload);
    }

    const [
      leads,
      wonLeads,
      pipelines,
      statuses,
      unsortedLeads,
      users,
    ] = await Promise.all([
      safeSelectPaginated<LeadRow>('kommo_leads', 'pipeline_id,status_id,price,is_deleted,closed_at,created_at,responsible_user_id', {
        dateFilter: { column: 'created_at', startDate, endDate, widenByOneDay: true },
      }),
      safeSelectPaginated<LeadGanadoRow>('leads_ganados', 'fecha_lead_ganado,vendedor_nombre_snapshot,pipeline_id_snapshot,kommo_lead_id', {
        dateFilter: { column: 'fecha_lead_ganado', startDate, endDate },
      }),
      safeSelectPaginated<PipelineRow>('kommo_pipelines', 'business_id,name'),
      safeSelectPaginated<PipelineStatusRow>('kommo_pipeline_statuses', 'business_id,pipeline_id,name,type'),
      safeSelectPaginated<UnsortedLeadRow>('kommo_unsorted_leads', 'created_at', {
        dateFilter: { column: 'created_at', startDate, endDate, widenByOneDay: true },
      }),
      safeSelectPaginated<UserRow>('kommo_users', 'business_id,name'),
    ]);

    const filteredLeads = leads.filter((lead) => isDateWithinRange(lead.created_at, startDate, endDate));
    const filteredWonLeads = wonLeads.filter((lead) => isComparableDateWithinRange(lead.fecha_lead_ganado, startDate, endDate));
    const filteredUnsortedLeads = unsortedLeads.filter((lead) => isDateWithinRange(lead.created_at, startDate, endDate));

    const pipelineNameById = new Map<number, string>();
    for (const row of pipelines) {
      const pipelineName = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : `Pipeline ${row.business_id}`;
      pipelineNameById.set(row.business_id, pipelineName);
    }

    const statusByPipelineAndId = new Map<string, { name: string; type: number | null }>();
    for (const row of statuses) {
      const name = typeof row.name === 'string' && row.name.trim() ? row.name.trim() : `Estado ${row.business_id}`;
      statusByPipelineAndId.set(`${row.pipeline_id}:${row.business_id}`, { name, type: row.type });
    }

    const userNameById = new Map<number, string>();
    for (const user of users) {
      const userName = typeof user.name === 'string' && user.name.trim() ? user.name.trim() : `Usuario ${user.business_id}`;
      userNameById.set(user.business_id, userName);
    }

    const pipelineCounter = new Map<string, PipelineInsight>();
    const statusCounter = new Map<string, StatusInsight>();
    const ownerCounter = new Map<string, OwnerInsight>();

    let totalDeleted = 0;
    let totalClosed = 0;
    let totalLost = 0;
    let orphanPipelineLeads = 0;
    const validPrices: number[] = [];
    const totalIncoming = filteredUnsortedLeads.length;

    const createdPipelineStateMap = new Map<string, {
      group_key: string;
      pipeline_id: number | null;
      pipeline_name: string;
      total_leads: number;
      open_leads: number;
      closed_leads: number;
      lost_leads: number;
      prices: number[];
    }>();
    const wonPipelineMap = new Map<string, WonPipelineInsight>();
    const wonSellerMap = new Map<string, WonSellerInsight>();

    for (const lead of filteredLeads) {
      const pipelineId = typeof lead.pipeline_id === 'number' ? lead.pipeline_id : null;
      const statusId = typeof lead.status_id === 'number' ? lead.status_id : null;
      const pipelineName = pipelineId !== null ? (pipelineNameById.get(pipelineId) ?? `Pipeline ${pipelineId}`) : 'Sin pipeline';

      if (pipelineId === null) {
        orphanPipelineLeads += 1;
      }

      const pipelineKey = String(pipelineId ?? 'null');
      const currentPipeline = pipelineCounter.get(pipelineKey) ?? {
        pipeline_id: pipelineId,
        pipeline_name: pipelineName,
        total_leads: 0,
      };
      currentPipeline.total_leads += 1;
      pipelineCounter.set(pipelineKey, currentPipeline);

      const statusMeta = pipelineId !== null && statusId !== null
        ? statusByPipelineAndId.get(`${pipelineId}:${statusId}`)
        : undefined;
      const statusName = statusMeta?.name ?? (statusId !== null ? `Estado ${statusId}` : 'Sin estado');

      const statusKey = `${pipelineId ?? 'null'}:${statusId ?? 'null'}`;
      const currentStatus = statusCounter.get(statusKey) ?? {
        pipeline_id: pipelineId,
        pipeline_name: pipelineName,
        status_id: statusId,
        status_name: statusName,
        total_leads: 0,
      };
      currentStatus.total_leads += 1;
      statusCounter.set(statusKey, currentStatus);

      const ownerId = typeof lead.responsible_user_id === 'number' ? lead.responsible_user_id : null;
      const ownerName = ownerId !== null ? (userNameById.get(ownerId) ?? `Usuario ${ownerId}`) : 'Sin responsable';
      const ownerKey = String(ownerId ?? 'null');
      const ownerCount = ownerCounter.get(ownerKey) ?? {
        responsible_user_id: ownerId,
        responsible_user_name: ownerName,
        total_leads: 0,
      };
      ownerCount.total_leads += 1;
      ownerCounter.set(ownerKey, ownerCount);

      if (lead.is_deleted) {
        totalDeleted += 1;
      }

      const statusType = statusMeta?.type ?? null;
      const isWon = statusType === 1 || isLikelyWonStatus(statusName);
      const isLost = statusType === 2 || isLikelyLostStatus(statusName);
      const isClosed = Boolean(lead.closed_at) || isWon || isLost;
      const isOpen = !isClosed && !lead.is_deleted;

      if (isClosed) totalClosed += 1;
      if (isLost) totalLost += 1;

      const performanceKey = buildPerformanceGroupKey(pipelineId, pipelineName);
      const pipelinePerformance = createdPipelineStateMap.get(performanceKey) ?? {
        group_key: performanceKey,
        pipeline_id: pipelineId,
        pipeline_name: pipelineName,
        total_leads: 0,
        open_leads: 0,
        closed_leads: 0,
        lost_leads: 0,
        prices: [],
      };

      pipelinePerformance.total_leads += 1;
      if (isOpen) pipelinePerformance.open_leads += 1;
      if (isClosed) pipelinePerformance.closed_leads += 1;
      if (isLost) pipelinePerformance.lost_leads += 1;

      if (typeof lead.price === 'number' && Number.isFinite(lead.price) && lead.price > 0) {
        validPrices.push(lead.price);
        pipelinePerformance.prices.push(lead.price);
      }

      createdPipelineStateMap.set(performanceKey, pipelinePerformance);
    }

    for (const wonLead of filteredWonLeads) {
      const pipelineId = typeof wonLead.pipeline_id_snapshot === 'number' ? wonLead.pipeline_id_snapshot : null;
      const pipelineName = pipelineId !== null
        ? (pipelineNameById.get(pipelineId) || `Pipeline ${pipelineId}`)
        : 'Sin pipeline';
      const sellerName = typeof wonLead.vendedor_nombre_snapshot === 'string' && wonLead.vendedor_nombre_snapshot.trim()
        ? wonLead.vendedor_nombre_snapshot.trim()
        : 'Sin vendedor snapshot';

      const pipelineKey = buildPerformanceGroupKey(pipelineId, pipelineName);
      const pipelinePerformance = wonPipelineMap.get(pipelineKey) ?? {
        pipeline_id: pipelineId,
        pipeline_name: pipelineName,
        total_won: 0,
      };

      pipelinePerformance.total_won += 1;
      wonPipelineMap.set(pipelineKey, pipelinePerformance);

      const sellerPerformance = wonSellerMap.get(sellerName) ?? {
        seller_name: sellerName,
        total_won: 0,
      };

      sellerPerformance.total_won += 1;
      wonSellerMap.set(sellerName, sellerPerformance);
    }

    const hourlyCounter = new Map<number, number>();
    for (let hour = 0; hour <= 23; hour += 1) {
      hourlyCounter.set(hour, 0);
    }

    for (const unsorted of filteredUnsortedLeads) {
      if (!unsorted.created_at) continue;
      const hour = parseHour(unsorted.created_at);
      if (hour === null) continue;
      hourlyCounter.set(hour, (hourlyCounter.get(hour) ?? 0) + 1);
    }

    const pipelinesResult = Array.from(pipelineCounter.values()).sort((a, b) => b.total_leads - a.total_leads);
    const statusesResult = Array.from(statusCounter.values()).sort((a, b) => b.total_leads - a.total_leads);
    const statusesByNameMap = new Map<string, StatusByNameInsight>();
    for (const status of statusesResult) {
      const statusName = status.status_name.trim();
      const statusDisplayName = statusName || 'Sin estado';
      const groupingKey = normalizeStatusGroupingKey(statusDisplayName);
      const existing = statusesByNameMap.get(groupingKey) ?? { status_name: statusDisplayName, total_leads: 0 };
      existing.total_leads += status.total_leads;

      if (isMostlyUppercase(existing.status_name) && !isMostlyUppercase(statusDisplayName)) {
        existing.status_name = statusDisplayName;
      }

      statusesByNameMap.set(groupingKey, existing);
    }
    const statusesByNameResult = Array.from(statusesByNameMap.values()).sort((a, b) => b.total_leads - a.total_leads);
    const ownersResult = Array.from(ownerCounter.values()).sort((a, b) => b.total_leads - a.total_leads);
    const createdPipelineStateResult = Array.from(createdPipelineStateMap.values())
      .map((entry) => ({
        group_key: entry.group_key,
        pipeline_id: entry.pipeline_id,
        pipeline_name: entry.pipeline_name,
        total_leads: entry.total_leads,
        open_leads: entry.open_leads,
        closed_leads: entry.closed_leads,
        lost_leads: entry.lost_leads,
        avg_price: toNumericAverage(entry.prices),
      }))
      .sort((a, b) => (b.total_leads - a.total_leads) || (b.closed_leads - a.closed_leads));
    const wonPipelineResult = Array.from(wonPipelineMap.values()).sort((a, b) => b.total_won - a.total_won);
    const wonSellerResult = Array.from(wonSellerMap.values()).sort((a, b) => b.total_won - a.total_won);
    const hourlyIncomingResult: HourlyIncomingInsight[] = Array.from(hourlyCounter.entries())
      .map(([hour, totalIncoming]) => ({ hour, total_incoming: totalIncoming }))
      .sort((a, b) => a.hour - b.hour);

    const totalLeads = filteredLeads.length;
    const totalOpen = Math.max(0, totalLeads - totalClosed - totalDeleted);
    const avgPrice = toNumericAverage(validPrices);
    const topPipeline = pipelinesResult[0] ?? null;
    const busiestHour = [...hourlyIncomingResult].sort((a, b) => b.total_incoming - a.total_incoming)[0] ?? null;
    const rawTopStatus = statusesResult[0] ?? null;
    const topStatus = rawTopStatus
      ? {
        ...rawTopStatus,
        status_name: statusesByNameMap.get(normalizeStatusGroupingKey(rawTopStatus.status_name.trim() || 'Sin estado'))?.status_name
          ?? rawTopStatus.status_name,
      }
      : null;
    const topOwner = ownersResult[0] ?? null;
    const totalWon = filteredWonLeads.length;
    const topWonPipeline = wonPipelineResult[0] ?? null;
    const topWonSeller = wonSellerResult[0] ?? null;

    const response: LeadsInsightsResponse = {
      filters: {
        start_date: startDate,
        end_date: endDate,
      },
      created: {
        summary: {
          total_leads: totalLeads,
          total_open: totalOpen,
          total_closed: totalClosed,
          total_lost: totalLost,
          total_deleted: totalDeleted,
          total_incoming: totalIncoming,
          avg_price: avgPrice,
          top_pipeline: topPipeline,
          top_owner: topOwner,
        },
        pipeline_volume: pipelinesResult,
        owner_volume: ownersResult,
        status_volume: statusesResult,
        status_volume_by_name: statusesByNameResult,
        pipeline_current_state: createdPipelineStateResult,
        hourly_incoming: hourlyIncomingResult,
        insights: {
          busiest_hour: busiestHour,
          top_status: topStatus,
          orphan_pipeline_leads: orphanPipelineLeads,
        },
      },
      won: {
        summary: {
          total_won: totalWon,
          top_pipeline: topWonPipeline,
          top_seller: topWonSeller,
        },
        pipelines: wonPipelineResult,
        sellers: wonSellerResult,
      },
    };

    const successPayload = {
      success: true,
      timezone: 'America/Lima',
      ...response,
    };

    insightsCache.set(cacheKey, {
      expiresAt: Date.now() + INSIGHTS_CACHE_TTL_MS,
      payload: successPayload,
    });

    return res.status(200).json(successPayload);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return res.status(500).json({
      success: false,
      error: message,
      filters: {
        start_date: null,
        end_date: null,
      },
      created: {
        summary: {
          total_leads: 0,
          total_open: 0,
          total_closed: 0,
          total_lost: 0,
          total_deleted: 0,
          total_incoming: 0,
          avg_price: null,
          top_pipeline: null,
          top_owner: null,
        },
        pipeline_volume: [],
        owner_volume: [],
        status_volume: [],
        status_volume_by_name: [],
        pipeline_current_state: [],
        hourly_incoming: [],
        insights: {
          busiest_hour: null,
          top_status: null,
          orphan_pipeline_leads: 0,
        },
      },
      won: {
        summary: {
          total_won: 0,
          top_pipeline: null,
          top_seller: null,
        },
        pipelines: [],
        sellers: [],
      },
    });
  }
}
