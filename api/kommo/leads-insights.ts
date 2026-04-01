import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  getSupabaseAdminClient,
  isSecretAuthorized,
  isVercelCronAuthorized,
  verifyAdminSession,
} from './_shared.js';

const INSIGHTS_SECRET_HEADER = 'x-kommo-insights-secret';
const INSIGHTS_SECRET_ENV = 'KOMMO_INSIGHTS_SECRET';

type LeadRow = {
  pipeline_id: number | null;
  status_id: number | null;
  price: number | null;
  is_deleted: boolean | null;
  closed_at: string | null;
  created_at: string | null;
  responsible_user_id: number | null;
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

type LeadsInsightsResponse = {
  pipelines: PipelineInsight[];
  statuses: StatusInsight[];
  statusesByName: StatusByNameInsight[];
  hourlyIncoming: HourlyIncomingInsight[];
  owners: OwnerInsight[];
  filters: {
    start_date: string | null;
    end_date: string | null;
  };
  pipelinePerformance: Array<{
    pipeline_id: number | null;
    pipeline_name: string;
    total_leads: number;
    open_leads: number;
    closed_leads: number;
    won_leads: number;
    lost_leads: number;
    avg_price: number | null;
  }>;
  summary: {
    total_leads: number;
    total_open: number;
    total_closed: number;
    total_won: number;
    total_lost: number;
    total_deleted: number;
    avg_price: number | null;
    top_pipeline: PipelineInsight | null;
  };
  insights: {
    busiest_hour: HourlyIncomingInsight | null;
    top_status: StatusInsight | null;
    won_rate_over_closed: number | null;
    orphan_pipeline_leads: number;
    top_owner: OwnerInsight | null;
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
  batchSize = 1000,
): Promise<T[]> {
  try {
    const supabase = getSupabaseAdminClient();
    const rows: T[] = [];
    let from = 0;

    while (true) {
      const to = from + batchSize - 1;
      const { data, error } = await supabase
        .from(table as never)
        .select(columns as never)
        .range(from, to);

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

export default async function kommoLeadsInsightsHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const secretAuthorized = isSecretAuthorized(req, INSIGHTS_SECRET_ENV, INSIGHTS_SECRET_HEADER);
    const cronAuthorized = isVercelCronAuthorized(req);
    if (!secretAuthorized && !cronAuthorized) {
      const auth = verifyAdminSession(req);
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

    const [
      leads,
      pipelines,
      statuses,
      unsortedLeads,
      users,
    ] = await Promise.all([
      safeSelectPaginated<LeadRow>('kommo_leads', 'pipeline_id,status_id,price,is_deleted,closed_at,created_at,responsible_user_id'),
      safeSelectPaginated<PipelineRow>('kommo_pipelines', 'business_id,name'),
      safeSelectPaginated<PipelineStatusRow>('kommo_pipeline_statuses', 'business_id,pipeline_id,name,type'),
      safeSelectPaginated<UnsortedLeadRow>('kommo_unsorted_leads', 'created_at'),
      safeSelectPaginated<UserRow>('kommo_users', 'business_id,name'),
    ]);

    const filteredLeads = leads.filter((lead) => isDateWithinRange(lead.created_at, startDate, endDate));
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
    let totalWon = 0;
    let totalLost = 0;
    let orphanPipelineLeads = 0;
    const validPrices: number[] = [];

    const pipelinePerformanceMap = new Map<string, {
      pipeline_id: number | null;
      pipeline_name: string;
      total_leads: number;
      open_leads: number;
      closed_leads: number;
      won_leads: number;
      lost_leads: number;
      prices: number[];
    }>();

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
      const isOpen = !isClosed && !Boolean(lead.is_deleted);

      if (isClosed) totalClosed += 1;
      if (isWon) totalWon += 1;
      if (isLost) totalLost += 1;

      const performanceKey = String(pipelineId ?? 'null');
      const pipelinePerformance = pipelinePerformanceMap.get(performanceKey) ?? {
        pipeline_id: pipelineId,
        pipeline_name: pipelineName,
        total_leads: 0,
        open_leads: 0,
        closed_leads: 0,
        won_leads: 0,
        lost_leads: 0,
        prices: [],
      };

      pipelinePerformance.total_leads += 1;
      if (isOpen) pipelinePerformance.open_leads += 1;
      if (isClosed) pipelinePerformance.closed_leads += 1;
      if (isWon) pipelinePerformance.won_leads += 1;
      if (isLost) pipelinePerformance.lost_leads += 1;

      if (typeof lead.price === 'number' && Number.isFinite(lead.price) && lead.price > 0) {
        validPrices.push(lead.price);
        pipelinePerformance.prices.push(lead.price);
      }

      pipelinePerformanceMap.set(performanceKey, pipelinePerformance);
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
    const pipelinePerformanceResult = Array.from(pipelinePerformanceMap.values())
      .map((entry) => ({
        pipeline_id: entry.pipeline_id,
        pipeline_name: entry.pipeline_name,
        total_leads: entry.total_leads,
        open_leads: entry.open_leads,
        closed_leads: entry.closed_leads,
        won_leads: entry.won_leads,
        lost_leads: entry.lost_leads,
        avg_price: toNumericAverage(entry.prices),
      }))
      .sort((a, b) => b.total_leads - a.total_leads);
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
    const wonRateOverClosed = totalClosed > 0 ? Number(((totalWon / totalClosed) * 100).toFixed(2)) : null;

    const response: LeadsInsightsResponse = {
      pipelines: pipelinesResult,
      statuses: statusesResult,
      statusesByName: statusesByNameResult,
      hourlyIncoming: hourlyIncomingResult,
      owners: ownersResult,
      filters: {
        start_date: startDate,
        end_date: endDate,
      },
      pipelinePerformance: pipelinePerformanceResult,
      summary: {
        total_leads: totalLeads,
        total_open: totalOpen,
        total_closed: totalClosed,
        total_won: totalWon,
        total_lost: totalLost,
        total_deleted: totalDeleted,
        avg_price: avgPrice,
        top_pipeline: topPipeline,
      },
      insights: {
        busiest_hour: busiestHour,
        top_status: topStatus,
        won_rate_over_closed: wonRateOverClosed,
        orphan_pipeline_leads: orphanPipelineLeads,
        top_owner: topOwner,
      },
    };

    return res.status(200).json({
      success: true,
      timezone: 'America/Lima',
      ...response,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return res.status(500).json({
      success: false,
      error: message,
      pipelines: [],
      statuses: [],
      statusesByName: [],
      hourlyIncoming: [],
      owners: [],
      filters: {
        start_date: null,
        end_date: null,
      },
      pipelinePerformance: [],
      summary: {
        total_leads: 0,
        total_open: 0,
        total_closed: 0,
        total_won: 0,
        total_lost: 0,
        total_deleted: 0,
        avg_price: null,
        top_pipeline: null,
      },
      insights: {
        busiest_hour: null,
        top_status: null,
        won_rate_over_closed: null,
        orphan_pipeline_leads: 0,
        top_owner: null,
      },
    });
  }
}
