import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  ensureFreshConnection,
  getActiveKommoConnection,
  getSupabaseAdminClient,
  isSecretAuthorized,
  isVercelCronAuthorized,
  normalizeKommoBaseUrl,
  verifyAdminSession,
} from './_shared.js';

const SYNC_SECRET_HEADER = 'x-kommo-sync-secret';
const SYNC_SECRET_ENV = 'KOMMO_SYNC_SECRET';

// All available resources in Kommo API v4
const ALL_RESOURCES = [
  'leads',
  'contacts', 
  'companies',
  'users',
  'pipelines',
  'tags',
  'tasks',
  'notes',
  'calls',
] as const;

type KommoResource = typeof ALL_RESOURCES[number];

const RESOURCE_ENDPOINTS: Record<KommoResource, string> = {
  leads: '/api/v4/leads',
  contacts: '/api/v4/contacts',
  companies: '/api/v4/companies',
  users: '/api/v4/users',
  pipelines: '/api/v4/pipelines',
  tags: '/api/v4/tags',
  tasks: '/api/v4/tasks',
  notes: '/api/v4/notes',
  calls: '/api/v4/calls',
};

const RESOURCE_EVENT_TYPES: Record<KommoResource, string> = {
  leads: 'lead.pull',
  contacts: 'contact.pull',
  companies: 'companie.pull',
  users: 'user.pull',
  pipelines: 'pipeline.pull',
  tags: 'tag.pull',
  tasks: 'task.pull',
  notes: 'note.pull',
  calls: 'call.pull',
};

function asSingleQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function toUnixSeconds(value: string) {
  return Math.floor(new Date(value).getTime() / 1000);
}

function getMaxUpdatedAtIso(rows: Array<Record<string, unknown>>) {
  let maxTs = 0;
  for (const row of rows) {
    const updatedAt = row.updated_at;
    const seconds = typeof updatedAt === 'number' ? updatedAt : Number(updatedAt ?? 0);
    if (Number.isFinite(seconds) && seconds > maxTs) {
      maxTs = seconds;
    }
  }

  if (!maxTs) {
    return null;
  }

  return new Date(maxTs * 1000).toISOString();
}

async function fetchAllPages(
  baseUrl: string,
  endpoint: string,
  accessToken: string,
  resource: KommoResource,
  fromDateIso: string | null,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number }> {
  let allItems: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;
  const embeddedKey = resource;

  while (hasMore) {
    const url = new URL(`${baseUrl}${endpoint}`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', String(page));
    
    if (fromDateIso) {
      url.searchParams.set('filter[updated_at][from]', String(toUnixSeconds(fromDateIso)));
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Kommo ${resource} page ${page} error (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const items = ((payload._embedded as Record<string, unknown> | undefined)?.[embeddedKey] as Array<Record<string, unknown>>) ?? [];
    
    allItems = [...allItems, ...items];
    
    // Check if there's a next page
    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length };
}

export default async function kommoSyncHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const secretAuthorized = isSecretAuthorized(req, SYNC_SECRET_ENV, SYNC_SECRET_HEADER);
    const cronAuthorized = isVercelCronAuthorized(req);
    if (!secretAuthorized && !cronAuthorized) {
      const auth = verifyAdminSession(req);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error ?? 'No autorizado' });
      }
    }

    const baseUrlRaw = asSingleQueryParam(req.query.base_url) ?? asSingleQueryParam(req.query.baseUrl);
    const baseUrl = baseUrlRaw ? normalizeKommoBaseUrl(baseUrlRaw) : null;
    const subdomain = baseUrl ? new URL(baseUrl).hostname.split('.')[0] : undefined;

    const connection = await getActiveKommoConnection(subdomain);
    if (!connection) {
      return res.status(404).json({ error: 'No hay conexión Kommo activa. Ejecutá OAuth primero.' });
    }

    const freshConnection = await ensureFreshConnection(connection);
    const supabase = getSupabaseAdminClient();

    // Check if syncing all resources or specific one
    const resourceParam = asSingleQueryParam(req.query.resource);
    const resourcesToSync = resourceParam && ALL_RESOURCES.includes(resourceParam as KommoResource)
      ? [resourceParam as KommoResource]
      : [...ALL_RESOURCES]; // Sync all by default

    const results: Array<{
      resource: string;
      pulled: number;
      staged: number;
      cursorFrom: string | null;
      cursorTo: string | null;
    }> = [];

    for (const resource of resourcesToSync) {
      const endpoint = RESOURCE_ENDPOINTS[resource];
      const eventType = RESOURCE_EVENT_TYPES[resource];

      // Get cursor for this resource
      const { data: cursorRows, error: cursorError } = await supabase
        .from('kommo_sync_cursor' as never)
        .select('*')
        .eq('account_subdomain', freshConnection.account_subdomain)
        .eq('resource', resource)
        .order('updated_at', { ascending: false })
        .limit(1);

      if (cursorError) {
        throw new Error(cursorError.message || `No se pudo leer cursor de sync para ${resource}`);
      }

      const cursor = ((cursorRows ?? []) as Array<{ cursor_updated_at: string | null }>)[0] ?? null;
      const fromDateIso = cursor?.cursor_updated_at ?? null;

      // Fetch all pages
      const { items, totalPulled } = await fetchAllPages(
        freshConnection.account_base_url,
        endpoint,
        freshConnection.access_token,
        resource,
        fromDateIso,
      );

      // Stage all items
      let staged = 0;
      for (const item of items) {
        const dedupeKey = `${resource}:${String(item.id ?? '')}:${String(item.updated_at ?? '')}`;

        const { error: insertError } = await supabase.from('kommo_webhook_events' as never).insert({
          account_base_url: freshConnection.account_base_url,
          event_type: eventType,
          payload: item,
          dedupe_key: dedupeKey,
          status: 'pending',
        } as never);

        if (!insertError) {
          staged++;
        }
      }

      // Update cursor
      const nextCursor = getMaxUpdatedAtIso(items);
      if (nextCursor) {
        const { error: upsertCursorError } = await supabase.from('kommo_sync_cursor' as never).upsert(
          {
            account_subdomain: freshConnection.account_subdomain,
            resource: resource,
            cursor_updated_at: nextCursor,
            updated_at: new Date().toISOString(),
          } as never,
          {
            onConflict: 'account_subdomain,resource',
          },
        );

        if (upsertCursorError) {
          console.error(`Error updating cursor for ${resource}:`, upsertCursorError.message);
        }
      }

      results.push({
        resource,
        pulled: totalPulled,
        staged,
        cursorFrom: fromDateIso,
        cursorTo: nextCursor,
      });
    }

    return res.status(200).json({
      success: true,
      account: freshConnection.account_subdomain,
      resources: results,
      totalPulled: results.reduce((sum, r) => sum + r.pulled, 0),
      totalStaged: results.reduce((sum, r) => sum + r.staged, 0),
    });
  } catch (error: unknown) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}