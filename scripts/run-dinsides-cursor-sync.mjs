#!/usr/bin/env node

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STATE_PATH = path.resolve(process.cwd(), '.tmp', 'dinsides-cursor-sync-state.json');

const DEFAULTS = {
  sleepMs: parsePositiveInt(process.env.SYNC_SLEEP_MS, 1500),
  maxRetries: parsePositiveInt(process.env.SYNC_MAX_RETRIES, 3),
  enviosBatchLeads: parsePositiveInt(process.env.ENVIOS_BATCH_LEADS, 25),
  enviosLimitRows: parsePositiveInt(process.env.ENVIOS_LIMIT_ROWS, 2000),
  recojosBatchLeads: parsePositiveInt(process.env.RECOJOS_BATCH_LEADS, 1),
  recojosLimitRows: parsePositiveInt(process.env.RECOJOS_LIMIT_ROWS, 1000),
  recojosMaxQueries: parsePositiveInt(process.env.RECOJOS_MAX_QUERIES, 450),
  recojosMaxQueriesCap: parsePositiveInt(process.env.RECOJOS_MAX_QUERIES_CAP, 800),
  recojosQueriesSafetyBuffer: parsePositiveInt(process.env.RECOJOS_QUERIES_SAFETY_BUFFER, 25),
  recojosNegociosPerQuery: parsePositiveInt(process.env.RECOJOS_NEGOCIOS_PER_QUERY, 20),
  recojosMaxRuntimeMs: parsePositiveInt(process.env.RECOJOS_MAX_RUNTIME_MS, 50000),
  recojosMaxClientIdsPerLead: parsePositiveInt(process.env.RECOJOS_MAX_CLIENT_IDS_PER_LEAD, 8),
  recojosMaxDaysPerLead: parsePositiveInt(process.env.RECOJOS_MAX_DAYS_PER_LEAD, 12),
  recojosMaxQueriesPerLead: parsePositiveInt(process.env.RECOJOS_MAX_RECOJO_QUERIES_PER_LEAD, 18),
};

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value ?? '').trim(), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return parsed;
}

function parseArgs(argv) {
  const args = {
    reset: false,
    target: 'all',
    statePath: DEFAULT_STATE_PATH,
  };

  for (const token of argv) {
    if (token === '--reset') {
      args.reset = true;
      continue;
    }

    if (token.startsWith('--target=')) {
      const value = token.slice('--target='.length).trim().toLowerCase();
      if (value === 'all' || value === 'envios' || value === 'recojos') {
        args.target = value;
      }
      continue;
    }

    if (token.startsWith('--state=')) {
      const value = token.slice('--state='.length).trim();
      if (value) {
        args.statePath = path.resolve(process.cwd(), value);
      }
    }
  }

  return args;
}

function getBaseUrl() {
  const raw = (process.env.APP_BASE_URL ?? process.env.BASE_URL ?? '').trim();
  if (!raw) {
    throw new Error('Falta APP_BASE_URL o BASE_URL en el entorno.');
  }

  return raw.endsWith('/') ? raw.slice(0, -1) : raw;
}

function buildHeaders() {
  const headers = {
    Accept: 'application/json',
  };

  const cronSecret = (process.env.CRON_SECRET ?? process.env.SYNC_BEARER_TOKEN ?? '').trim();
  if (cronSecret) {
    headers.Authorization = `Bearer ${cronSecret}`;
  }

  const syncSecret = (process.env.KOMMO_SYNC_SECRET ?? '').trim();
  if (syncSecret) {
    headers['x-kommo-sync-secret'] = syncSecret;
  }

  if (!headers.Authorization && !headers['x-kommo-sync-secret']) {
    throw new Error('Falta autenticación. Definí CRON_SECRET/SYNC_BEARER_TOKEN o KOMMO_SYNC_SECRET.');
  }

  return headers;
}

async function loadState(statePath, { reset }) {
  if (reset) {
    return createInitialState();
  }

  try {
    const raw = await readFile(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    return {
      ...createInitialState(),
      ...parsed,
      updatedAt: new Date().toISOString(),
    };
  } catch {
    return createInitialState();
  }
}

function createInitialState() {
  const now = new Date().toISOString();
  return {
    createdAt: now,
    updatedAt: now,
    envios: { cursor: 0, done: false, iterations: 0, lastResponse: null },
    recojos: { cursor: 0, done: false, iterations: 0, lastResponse: null },
  };
}

async function saveState(statePath, state) {
  await mkdir(path.dirname(statePath), { recursive: true });
  state.updatedAt = new Date().toISOString();
  await writeFile(statePath, JSON.stringify(state, null, 2));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callSyncEndpoint({ baseUrl, headers, params }) {
  const url = new URL(`${baseUrl}/api/kommo/sync`);
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    url.searchParams.set(key, String(value));
  }

  const response = await fetch(url.toString(), {
    method: 'GET',
    headers,
  });

  const text = await response.text();
  let payload;
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    payload = { raw: text };
  }

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${JSON.stringify(payload)}`);
  }

  return payload;
}

async function runWithRetry(taskName, fn, maxRetries) {
  let attempt = 0;
  while (attempt <= maxRetries) {
    try {
      return await fn();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (attempt >= maxRetries) {
        throw new Error(`[${taskName}] falló tras ${maxRetries + 1} intentos: ${message}`);
      }

      const backoffMs = Math.min(20_000, 1_500 * (attempt + 1));
      console.warn(`[${taskName}] intento ${attempt + 1} falló: ${message}`);
      console.warn(`[${taskName}] reintentando en ${backoffMs}ms...`);
      await sleep(backoffMs);
      attempt += 1;
    }
  }

  throw new Error(`[${taskName}] estado inesperado de reintentos.`);
}

function compactSummary(mode, payload) {
  const nextCursor = Number(payload.next_cursor ?? 0);
  const hasMore = Boolean(payload.has_more);
  return {
    mode,
    cursor: Number(payload.cursor ?? 0),
    next_cursor: nextCursor,
    has_more: hasMore,
    scanned_leads: Number(payload.scanned_leads ?? 0),
    processed_leads: Number(payload.processed_leads ?? 0),
    pulled: Number(payload.pulled ?? payload.pulled_raw ?? 0),
    grouped_rows: Number(payload.grouped_rows ?? 0),
    upserted: Number(payload.upserted ?? 0),
    queries_used: Number(payload.queries_used ?? 0),
  };
}

function parseRecojosSizingError(message) {
  const match = String(message).match(/dias=(\d+),\s*client_ids=(\d+),\s*max_queries=(\d+)/i);
  if (!match) return null;

  const days = Number.parseInt(match[1], 10);
  const clientIds = Number.parseInt(match[2], 10);
  const currentMaxQueries = Number.parseInt(match[3], 10);

  if (!Number.isFinite(days) || !Number.isFinite(clientIds) || !Number.isFinite(currentMaxQueries)) {
    return null;
  }

  const baseQueries = Math.max(1, days * clientIds);
  const requiredQueries = baseQueries + Math.max(1, DEFAULTS.recojosQueriesSafetyBuffer);
  return {
    days,
    clientIds,
    currentMaxQueries,
    baseQueries,
    requiredQueries,
  };
}

async function processEnvios({ baseUrl, headers, state, sleepMs, maxRetries, dateFrom, dateTo, onProgress }) {
  while (!state.envios.done) {
    const params = {
      mode: 'dinsides_envios_sync_cursor',
      persist: 'true',
      only_remaining: 'true',
      cursor: state.envios.cursor,
      batch_leads: DEFAULTS.enviosBatchLeads,
      limit_rows: DEFAULTS.enviosLimitRows,
      date_from: dateFrom,
      date_to: dateTo,
    };

    const payload = await runWithRetry(
      'envios',
      () => callSyncEndpoint({ baseUrl, headers, params }),
      maxRetries,
    );

    const summary = compactSummary('envios', payload);
    state.envios.iterations += 1;
    state.envios.cursor = summary.next_cursor;
    state.envios.done = !summary.has_more;
    state.envios.lastResponse = summary;
    await onProgress();

    console.log(`[envios] iter=${state.envios.iterations} cursor=${summary.cursor} -> next=${summary.next_cursor} has_more=${summary.has_more} pulled=${summary.pulled} upserted=${summary.upserted}`);

    if (!state.envios.done) {
      await sleep(sleepMs);
    }
  }
}

async function processRecojos({ baseUrl, headers, state, sleepMs, maxRetries, dateFrom, dateTo, onProgress }) {
  let dynamicMaxQueries = DEFAULTS.recojosMaxQueries;

  while (!state.recojos.done) {
    const params = {
      mode: 'dinsides_recojos_sync_cursor',
      persist: 'true',
      cursor: state.recojos.cursor,
      batch_leads: DEFAULTS.recojosBatchLeads,
      limit_rows: DEFAULTS.recojosLimitRows,
      max_queries: dynamicMaxQueries,
      negocios_per_query: DEFAULTS.recojosNegociosPerQuery,
      max_runtime_ms: DEFAULTS.recojosMaxRuntimeMs,
      max_client_ids_per_lead: DEFAULTS.recojosMaxClientIdsPerLead,
      max_days_per_lead: DEFAULTS.recojosMaxDaysPerLead,
      max_recojo_queries_per_lead: DEFAULTS.recojosMaxQueriesPerLead,
      date_from: dateFrom,
      date_to: dateTo,
    };

    let payload;
    let attempt = 0;
    while (attempt <= maxRetries) {
      try {
        payload = await callSyncEndpoint({ baseUrl, headers, params });
        break;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        const sizing = parseRecojosSizingError(message);

        if (sizing) {
          const upperBound = DEFAULTS.recojosMaxQueriesCap;
          const nextMaxQueries = Math.min(
            upperBound,
            Math.max(dynamicMaxQueries, sizing.requiredQueries),
          );

          if (nextMaxQueries > dynamicMaxQueries) {
            dynamicMaxQueries = nextMaxQueries;
            params.max_queries = dynamicMaxQueries;
            console.warn(`[recojos] ajustando max_queries -> ${dynamicMaxQueries} (base=${sizing.baseQueries}, buffer=${DEFAULTS.recojosQueriesSafetyBuffer}, dias=${sizing.days}, client_ids=${sizing.clientIds})`);
          }
        }

        if (attempt >= maxRetries) {
          throw new Error(`[recojos] falló tras ${maxRetries + 1} intentos: ${message}`);
        }

        const backoffMs = Math.min(20_000, 1_500 * (attempt + 1));
        console.warn(`[recojos] intento ${attempt + 1} falló: ${message}`);
        console.warn(`[recojos] reintentando en ${backoffMs}ms...`);
        await sleep(backoffMs);
        attempt += 1;
      }
    }

    if (!payload) {
      throw new Error('[recojos] no se recibió payload del endpoint.');
    }

    const summary = compactSummary('recojos', payload);
    const truncationReason = typeof payload.truncation_reason === 'string' ? payload.truncation_reason : null;
    state.recojos.iterations += 1;
    state.recojos.cursor = summary.next_cursor;
    state.recojos.done = !summary.has_more;
    state.recojos.lastResponse = summary;
    await onProgress();

    console.log(`[recojos] iter=${state.recojos.iterations} cursor=${summary.cursor} -> next=${summary.next_cursor} has_more=${summary.has_more} pulled=${summary.pulled} grouped=${summary.grouped_rows} upserted=${summary.upserted} queries=${summary.queries_used}${truncationReason ? ` truncation=${truncationReason}` : ''}`);

    if (!state.recojos.done) {
      await sleep(sleepMs);
    }
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const baseUrl = getBaseUrl();
  const headers = buildHeaders();
  const state = await loadState(args.statePath, { reset: args.reset });

  const dateFrom = (process.env.SYNC_DATE_FROM ?? '').trim() || undefined;
  const dateTo = (process.env.SYNC_DATE_TO ?? '').trim() || undefined;

  console.log(`Base URL: ${baseUrl}`);
  console.log(`Target: ${args.target}`);
  console.log(`State file: ${args.statePath}`);
  console.log(`Sleep ms: ${DEFAULTS.sleepMs}`);
  console.log('---');

  if (args.target === 'all' || args.target === 'envios') {
    await processEnvios({
      baseUrl,
      headers,
      state,
      sleepMs: DEFAULTS.sleepMs,
      maxRetries: DEFAULTS.maxRetries,
      dateFrom,
      dateTo,
      onProgress: () => saveState(args.statePath, state),
    });
    console.log('[envios] completado.');
  }

  if (args.target === 'all' || args.target === 'recojos') {
    await processRecojos({
      baseUrl,
      headers,
      state,
      sleepMs: DEFAULTS.sleepMs,
      maxRetries: DEFAULTS.maxRetries,
      dateFrom,
      dateTo,
      onProgress: () => saveState(args.statePath, state),
    });
    console.log('[recojos] completado.');
  }

  await saveState(args.statePath, state);
  console.log('---');
  console.log('Sincronización finalizada ✅');
  console.log(JSON.stringify({
    envios: state.envios,
    recojos: state.recojos,
    finishedAt: new Date().toISOString(),
  }, null, 2));
}

main().catch(async (error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`[run-dinsides-cursor-sync] ${message}`);
  process.exit(1);
});
