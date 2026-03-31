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
// NOTE: Some resources need special handling (entity_type parameter)
const ALL_RESOURCES = [
  'leads',
  'contacts', 
  'companies',
  'users',
  'pipelines',
  'tasks',
  'notes',
  // NEW: Resources with standard endpoints
  'events',
  'catalogs',
  'unsorted',
  // NEW: Resources needing special handling
  'tags',
  'custom_fields',
  'links',
] as const;

type KommoResource = typeof ALL_RESOURCES[number];

// Standard endpoints (no special params needed)
const RESOURCE_ENDPOINTS: Record<KommoResource, string> = {
  leads: '/api/v4/leads',
  contacts: '/api/v4/contacts',
  companies: '/api/v4/companies',
  users: '/api/v4/users',
  pipelines: '/api/v4/pipelines',
  tasks: '/api/v4/tasks',
  notes: '/api/v4/notes',
  events: '/api/v4/events',
  catalogs: '/api/v4/catalogs',
  unsorted: '/api/v4/leads/unsorted',
  // These are handled via separate functions
  tags: '',
  custom_fields: '',
  links: '',
};

// Event types for each resource
const RESOURCE_EVENT_TYPES: Record<string, string> = {
  leads: 'lead.pull',
  contacts: 'contact.pull',
  companies: 'companie.pull',
  users: 'user.pull',
  pipelines: 'pipeline.pull',
  tasks: 'task.pull',
  notes: 'note.pull',
  events: 'event.pull',
  catalogs: 'catalog.pull',
  unsorted: 'unsorted.pull',
  tags: 'tag.pull',
  custom_fields: 'custom_field.pull',
  links: 'link.pull',
};

// Map resource to embedded key in response (some differ from resource name)
const EMBEDDED_KEY_MAP: Record<string, string> = {
  events: 'items',  // Events use 'items' not 'events'
  catalogs: 'catalogs',
  leads: 'leads',
  contacts: 'contacts',
  companies: 'companies',
  users: 'users',
  pipelines: 'pipelines',
  tasks: 'tasks',
  notes: 'notes',
  tags: 'tags',
  custom_fields: 'custom_fields',
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
  maxPages: number = 5, // Limit pages per run to avoid timeout
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number; hasMore: boolean }> {
  let allItems: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;
  const embeddedKey = EMBEDDED_KEY_MAP[resource] ?? resource;

  while (hasMore && page <= maxPages) {
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

  return { items: allItems, totalPulled: allItems.length, hasMore };
}

// Fetch tags for a specific entity type
async function fetchEntityTypeTags(
  baseUrl: string,
  accessToken: string,
  entityType: string,
  maxPages: number,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number }> {
  let allItems: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const url = new URL(`${baseUrl}/api/v4/${entityType}/tags`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Kommo tags (${entityType}) page ${page} error (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const items = (payload._embedded as Record<string, unknown> | undefined)?.tags as Array<Record<string, unknown>> ?? [];
    allItems = [...allItems, ...items];

    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length };
}

// Fetch custom fields for a specific entity type
async function fetchEntityTypeCustomFields(
  baseUrl: string,
  accessToken: string,
  entityType: string,
  maxPages: number,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number }> {
  let allItems: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const url = new URL(`${baseUrl}/api/v4/${entityType}/custom_fields`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Kommo custom_fields (${entityType}) page ${page} error (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const items = (payload._embedded as Record<string, unknown> | undefined)?.custom_fields as Array<Record<string, unknown>> ?? [];
    allItems = [...allItems, ...items];

    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length };
}

// Fetch links for a specific entity (leads, contacts, companies)
async function fetchEntityLinks(
  baseUrl: string,
  accessToken: string,
  entity: string,
  entityId: number,
  maxPages: number,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number }> {
  let allItems: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const url = new URL(`${baseUrl}/api/v4/${entity}/${entityId}/links`);
    url.searchParams.set('limit', '250');
    url.searchParams.set('page', String(page));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Kommo links (${entity}/${entityId}) page ${page} error (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const items = (payload._embedded as Record<string, unknown> | undefined)?.links as Array<Record<string, unknown>> ?? [];
    allItems = [...allItems, ...items];

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
    const selectedResource = (resourceParam && ALL_RESOURCES.includes(resourceParam as KommoResource)) 
      ? resourceParam as KommoResource 
      : 'leads';
    const resourcesToSync: KommoResource[] = [selectedResource];

    const results: Array<{
      resource: string;
      pulled: number;
      staged: number;
      cursorFrom: string | null;
      cursorTo: string | null;
      hasMore?: boolean;
    }> = [];

    // Handle special resources (tags, custom_fields need entity_type iteration)
    if (selectedResource === 'tags' || selectedResource === 'custom_fields') {
      const entityTypes = ['leads', 'contacts', 'companies'];
      const maxPagesParam = asSingleQueryParam(req.query.max_pages);
      const maxPages = maxPagesParam ? Math.min(20, parseInt(maxPagesParam, 10) || 5) : 5;

      for (const entityType of entityTypes) {
        let items: Array<Record<string, unknown>> = [];
        
        if (selectedResource === 'tags') {
          const result = await fetchEntityTypeTags(
            freshConnection.account_base_url,
            freshConnection.access_token,
            entityType,
            maxPages,
          );
          items = result.items;
        } else if (selectedResource === 'custom_fields') {
          const result = await fetchEntityTypeCustomFields(
            freshConnection.account_base_url,
            freshConnection.access_token,
            entityType,
            maxPages,
          );
          items = result.items;
        }

        // Add entity_type to each item for processing
        const eventType = RESOURCE_EVENT_TYPES[selectedResource];
        let staged = 0;

        for (const item of items) {
          const itemWithEntityType = { ...item, entity_type: entityType };
          const dedupeKey = `${selectedResource}:${entityType}:${String(item.id ?? '')}`;

          const { error: insertError } = await supabase.from('kommo_webhook_events' as never).insert({
            account_base_url: freshConnection.account_base_url,
            event_type: eventType,
            payload: itemWithEntityType,
            dedupe_key: dedupeKey,
            status: 'pending',
          } as never);

          if (!insertError) {
            staged++;
          }
        }

        results.push({
          resource: `${selectedResource}_${entityType}`,
          pulled: items.length,
          staged,
          cursorFrom: null,
          cursorTo: null,
        });
      }

      return res.status(200).json({
        success: true,
        account: freshConnection.account_subdomain,
        resources: results,
        totalPulled: results.reduce((sum, r) => sum + r.pulled, 0),
        totalStaged: results.reduce((sum, r) => sum + r.staged, 0),
      });
    }

    // Handle links (needs to iterate over entities to get their links)
    if (selectedResource === 'links') {
      const entities = ['leads', 'contacts', 'companies'];
      const maxPagesParam = asSingleQueryParam(req.query.max_pages);
      const maxPages = maxPagesParam ? Math.min(20, parseInt(maxPagesParam, 10) || 5) : 5;

      // First get all entity IDs from each type
      for (const entity of entities) {
        let page = 1;
        let hasMore = true;

        while (hasMore && page <= maxPages) {
          const url = new URL(`${freshConnection.account_base_url}/api/v4/${entity}`);
          url.searchParams.set('limit', '250');
          url.searchParams.set('page', String(page));

          const response = await fetch(url.toString(), {
            method: 'GET',
            headers: {
              Authorization: `Bearer ${freshConnection.access_token}`,
              'Content-Type': 'application/json',
            },
          });

          if (!response.ok) {
            throw new Error(`Kommo ${entity} list error (${response.status})`);
          }

          const payload = (await response.json()) as Record<string, unknown>;
          const items = (payload._embedded as Record<string, unknown> | undefined)?.[entity] as Array<Record<string, unknown>> ?? [];

          // For each entity, fetch its links
          for (const item of items) {
            const entityId = Number(item.id);
            if (!entityId) continue;

            try {
              const linksResult = await fetchEntityLinks(
                freshConnection.account_base_url,
                freshConnection.access_token,
                entity,
                entityId,
                1, // Just need first page per entity
              );

              for (const link of linksResult.items) {
                const dedupeKey = `links:${entity}:${entityId}:${String(link.to ?? '')}:${String(link.to_id ?? '')}`;
                const linkPayload = { ...link, from: entity, from_id: entityId };

                const { error: insertError } = await supabase.from('kommo_webhook_events' as never).insert({
                  account_base_url: freshConnection.account_base_url,
                  event_type: 'link.pull',
                  payload: linkPayload,
                  dedupe_key: dedupeKey,
                  status: 'pending',
                } as never);

                if (!insertError) {
                  results.push({
                    resource: `links_${entity}_${entityId}`,
                    pulled: 1,
                    staged: 1,
                    cursorFrom: null,
                    cursorTo: null,
                  });
                }
              }
            } catch (e) {
              console.error(`Error fetching links for ${entity}/${entityId}:`, e);
            }
          }

          const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
          hasMore = !!nextLink;
          page++;
        }
      }

      return res.status(200).json({
        success: true,
        account: freshConnection.account_subdomain,
        resources: results,
        totalPulled: results.reduce((sum, r) => sum + r.pulled, 0),
        totalStaged: results.reduce((sum, r) => sum + r.staged, 0),
      });
    }

    // Standard resources (leads, contacts, companies, users, pipelines, tasks, notes, events, catalogs, unsorted)

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

      // Get maxPages from query param or default to 5
      const maxPagesParam = asSingleQueryParam(req.query.max_pages);
      const maxPages = maxPagesParam ? Math.min(20, parseInt(maxPagesParam, 10) || 5) : 5;

      // Fetch all pages
      const { items, totalPulled, hasMore } = await fetchAllPages(
        freshConnection.account_base_url,
        endpoint,
        freshConnection.access_token,
        resource,
        fromDateIso,
        maxPages,
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
        hasMore,
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