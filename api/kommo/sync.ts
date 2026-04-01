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

// Todos los recursos disponibles en Kommo API v4
// Algunos necesitan manejo especial (tags, custom_fields, links, notes) porque no siguen el patrón estándar de endpoints o necesitan parámetros adicionales.
const ALL_RESOURCES = [
  'leads',
  'contacts', 
  'companies',
  'users',
  'pipelines',
  'tasks',
  // pueden existir subtipos
  'events',
  'catalogs',
  'unsorted',
  'sources',
  // Estos recursos requieren manejo especial
  'tags',
  'custom_fields',
  'links',
  'notes',
] as const;

type KommoResource = typeof ALL_RESOURCES[number];

// Mapeo de recursos a sus endpoints correspondientes
const RESOURCE_ENDPOINTS: Record<KommoResource, string> = {
  leads: '/api/v4/leads',
  contacts: '/api/v4/contacts',
  companies: '/api/v4/companies',
  users: '/api/v4/users',
  pipelines: '/api/v4/leads/pipelines',
  tasks: '/api/v4/tasks',
  // notes, tags, custom_fields y links se manejan por separado debido a sus particularidades en la API
  events: '/api/v4/events',
  catalogs: '/api/v4/catalogs',
  unsorted: '/api/v4/leads/unsorted',
  sources: '/api/v4/sources',
  // Recursos especiales sin endpoint directo
  tags: '',
  custom_fields: '',
  links: '',
  notes: '',
};

// Tipos de eventos para cada recurso
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
  sources: 'source.pull',
  tags: 'tag.pull',
  custom_fields: 'custom_field.pull',
  links: 'link.pull',
};

// Algunos recursos tienen la lista de items embebida bajo una clave diferente a su nombre pluralizado, por ejemplo 'events' tiene 'items'.
const EMBEDDED_KEY_MAP: Record<string, string> = {
  events: 'items',  // Usa items en lugar de events
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

// Helper para manejar query params que pueden ser string o string[]
function asSingleQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

// Convierte una fecha ISO a segundos Unix, que es el formato que Kommo espera para los filtros de fecha.
function toUnixSeconds(value: string) {
  return Math.floor(new Date(value).getTime() / 1000);
}

// Dado un array de items con campo updated_at, encuentra el máximo updated_at y lo devuelve como ISO string.
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

// Divide un array en chunks de tamaño específico. Útil para staging progresivo y evitar sobrecargar memoria o límites de API.
function chunkArray<T>(items: T[], chunkSize: number) {
  const size = Math.max(1, Math.floor(chunkSize));
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

// Dado un array de eventos a insertar, los inserta en la tabla kommo_webhook_events y evita los errores por duplicados. Si hay un error, divide el batch y reintenta para aislar filas problemáticas.
type WebhookEventInsert = {
  account_base_url: string;
  event_type: string;
  payload: Record<string, unknown>;
  dedupe_key: string;
  status: 'pending';
};

// Retorna el número de filas que fueron efectivamente insertadas (no duplicados).
async function stageWebhookEvents(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  rows: WebhookEventInsert[],
  opts?: { chunkSize?: number },
) {
  const chunkSize = Math.max(1, Math.min(1000, opts?.chunkSize ?? 500));
  let staged = 0;

  async function stageChunk(chunk: WebhookEventInsert[]) {
    if (chunk.length === 0) return;

    const { data, error } = await supabase
      .from('kommo_webhook_events' as never)
      .upsert(chunk as never, {
        onConflict: 'dedupe_key',
        ignoreDuplicates: true,
      })
      // Retornamos solo el id para minimizar payload y acelerar la consulta.
      .select('id');

    if (!error) {
      staged += (data as unknown[] | null)?.length ?? 0;
      return;
    }

    // Si hay un error, intentamos dividir el chunk para aislar la fila problemática.
    if (chunk.length === 1) {
      console.error('Failed staging kommo_webhook_events row:', error.message);
      return;
    }

    const mid = Math.ceil(chunk.length / 2);
    await stageChunk(chunk.slice(0, mid));
    await stageChunk(chunk.slice(mid));
  }

  for (const chunk of chunkArray(rows, chunkSize)) {
    await stageChunk(chunk);
  }

  return staged;
}

// Función para paginar a través de todos los items de un recurso específico
async function fetchAllPages(
  baseUrl: string,
  endpoint: string,
  accessToken: string,
  resource: KommoResource,
  fromDateIso: string | null,
  maxPages: number = 5, // Limit pages per run to avoid timeout
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number; hasMore: boolean }> {
  const allItems: Array<Record<string, unknown>> = [];
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

    allItems.push(...items);
    
    // Verificar si hay una página siguiente. Kommo API v4 usa enlaces HATEOAS para paginación, así que buscamos un enlace "next" en _links.
    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length, hasMore };
}

// Funciones específicas para recursos que requieren iteración por entity_type (tags, custom_fields, notes) o por entidad (links).
async function fetchEntityTypeTags(
  baseUrl: string,
  accessToken: string,
  entityType: string,
  maxPages: number,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number }> {
  const allItems: Array<Record<string, unknown>> = [];
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
    allItems.push(...items);

    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length };
}

// Recurso de custom_fields también requiere iteración por entity_type
async function fetchEntityTypeCustomFields(
  baseUrl: string,
  accessToken: string,
  entityType: string,
  maxPages: number,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number }> {
  const allItems: Array<Record<string, unknown>> = [];
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
    allItems.push(...items);

    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length };
}

// Recurso de notes también requiere iteración por entity_type
async function fetchEntityNotes(
  baseUrl: string,
  accessToken: string,
  entityType: string,
  maxPages: number,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number }> {
  const allItems: Array<Record<string, unknown>> = [];
  let page = 1;
  let hasMore = true;

  while (hasMore && page <= maxPages) {
    const url = new URL(`${baseUrl}/api/v4/${entityType}/notes`);
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
      throw new Error(`Kommo notes (${entityType}) page ${page} error (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const items = (payload._embedded as Record<string, unknown> | undefined)?.notes as Array<Record<string, unknown>> ?? [];
    allItems.push(...items);

    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length };
}

// Recurso de links requiere iteración por entidad, es decir, primero obtenemos las entidades actualizadas (leads, contacts, companies). Luego para cada entidad obtenemos sus links.
async function fetchEntityLinks(
  baseUrl: string,
  accessToken: string,
  entity: string,
  entityId: number,
  maxPages: number,
): Promise<{ items: Array<Record<string, unknown>>; totalPulled: number }> {
  const allItems: Array<Record<string, unknown>> = [];
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
    allItems.push(...items);

    const nextLink = (payload._links as Record<string, unknown> | undefined)?.next;
    hasMore = !!nextLink;
    page++;
  }

  return { items: allItems, totalPulled: allItems.length };
}

// Handler principal para sincronización. Soporta sincronización incremental basada en un cursor de updated_at almacenado en la base de datos.
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

    // Si se especifica un recurso en query params, solo sincronizamos ese recurso. Si no, sincronizamos todos los recursos.
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

    // Manejo especial para recursos que requieren iteración por entity_type (tags, custom_fields, notes) o por entidad (links).
    if (selectedResource === 'tags' || selectedResource === 'custom_fields' || selectedResource === 'notes') {
      const entityTypes = ['leads', 'contacts', 'companies'];
      const maxPagesParam = asSingleQueryParam(req.query.max_pages);
      const maxPages = maxPagesParam ? Math.min(50, parseInt(maxPagesParam, 10) || 5) : 5;

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
        } else if (selectedResource === 'notes') {
          const result = await fetchEntityNotes(
            freshConnection.account_base_url,
            freshConnection.access_token,
            entityType,
            maxPages,
          );
          items = result.items;
        }

        // Adaptamos el event_type para incluir el entity_type, por ejemplo: tag.pull.leads, tag.pull.contacts, etc.
        const eventType = RESOURCE_EVENT_TYPES[selectedResource];
        const rows: WebhookEventInsert[] = [];
        for (const item of items) {
          const itemWithEntityType = { ...item, entity_type: entityType };
          const dedupeKey = `${selectedResource}:${entityType}:${String(item.id ?? '')}`;
          rows.push({
            account_base_url: freshConnection.account_base_url,
            event_type: eventType,
            payload: itemWithEntityType,
            dedupe_key: dedupeKey,
            status: 'pending',
          });
        }

        const staged = await stageWebhookEvents(supabase, rows);

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

    // Manejo especial para links, que requiere iteración por entidad. Para cada entidad actualizada (leads, contacts, companies).
    if (selectedResource === 'links') {
      const entities = ['leads', 'contacts', 'companies'];
      const maxPagesParam = asSingleQueryParam(req.query.max_pages);
      const maxPages = maxPagesParam ? Math.min(50, parseInt(maxPagesParam, 10) || 5) : 5;

      // Iteramos por cada tipo de entidad para obtener sus links asociados.
      for (const entity of entities) {
        // Obtenemos el cursor específico para los links de esta entidad, por ejemplo: links_leads, links_contacts, etc. 
        const cursorResource = `links_${entity}`;
        const { data: cursorRows, error: cursorError } = await supabase
          .from('kommo_sync_cursor' as never)
          .select('*')
          .eq('account_subdomain', freshConnection.account_subdomain)
          .eq('resource', cursorResource)
          .order('updated_at', { ascending: false })
          .limit(1);

        if (cursorError) {
          throw new Error(cursorError.message || `No se pudo leer cursor de sync para ${cursorResource}`);
        }

        const cursor = ((cursorRows ?? []) as Array<{ cursor_updated_at: string | null }>)[0] ?? null;
        const fromDateIso = cursor?.cursor_updated_at ?? null;

        const { items: updatedEntities, totalPulled, hasMore } = await fetchAllPages(
          freshConnection.account_base_url,
          `/api/v4/${entity}`,
          freshConnection.access_token,
          entity as KommoResource,
          fromDateIso,
          maxPages,
        );

        const nextCursor = getMaxUpdatedAtIso(updatedEntities);

        let pulledLinks = 0;
        let stagedLinks = 0;
        const rows: WebhookEventInsert[] = [];

        for (const item of updatedEntities) {
          const entityId = Number(item.id);
          if (!entityId) continue;

          try {
            const linksResult = await fetchEntityLinks(
              freshConnection.account_base_url,
              freshConnection.access_token,
              entity,
              entityId,
              1,
            );

            pulledLinks += linksResult.items.length;

            for (const link of linksResult.items) {
              const dedupeKey = `links:${entity}:${entityId}:${String(link.to ?? '')}:${String(link.to_id ?? '')}`;
              const linkPayload = { ...link, from: entity, from_id: entityId };
              rows.push({
                account_base_url: freshConnection.account_base_url,
                event_type: 'link.pull',
                payload: linkPayload,
                dedupe_key: dedupeKey,
                status: 'pending',
              });
            }

            // Stagiamos progresivamente cada 500 links para evitar sobrecargar memoria o límites de API
            if (rows.length >= 500) {
              stagedLinks += await stageWebhookEvents(supabase, rows.splice(0, rows.length));
            }
          } catch (e) {
            console.error(`Error fetching links for ${entity}/${entityId}:`, e);
          }
        }

        if (rows.length > 0) {
          stagedLinks += await stageWebhookEvents(supabase, rows);
        }

        // Actualizamos el cursor específico para los links de esta entidad. 
        if (nextCursor) {
          const { error: upsertCursorError } = await supabase.from('kommo_sync_cursor' as never).upsert(
            {
              account_subdomain: freshConnection.account_subdomain,
              resource: cursorResource,
              cursor_updated_at: nextCursor,
              updated_at: new Date().toISOString(),
            } as never,
            {
              onConflict: 'account_subdomain,resource',
            },
          );

          if (upsertCursorError) {
            console.error(`Error updating cursor for ${cursorResource}:`, upsertCursorError.message);
          }
        }

        results.push({
          resource: cursorResource,
          pulled: totalPulled,
          staged: stagedLinks,
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
    }

    // Recursos Estandar (leads, contacts, companies, users, pipelines, tasks, notes, events, catalogs, unsorted)

    for (const resource of resourcesToSync) {
      const endpoint = RESOURCE_ENDPOINTS[resource];
      const eventType = RESOURCE_EVENT_TYPES[resource];

      // Leemos el cursor de sync para este recurso desde la base de datos. Si no existe, sincronizamos todo.
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

      // Obtener max_pages desde query params, con un valor por defecto de 5 páginas y un máximo de 50 para evitar tiempos de ejecución demasiado largos. 
      const maxPagesParam = asSingleQueryParam(req.query.max_pages);
      const maxPages = maxPagesParam ? Math.min(50, parseInt(maxPagesParam, 10) || 5) : 5;

      // Obtenemos todos los items actualizados desde la última sincronización usando paginación. 
      const { items, totalPulled, hasMore } = await fetchAllPages(
        freshConnection.account_base_url,
        endpoint,
        freshConnection.access_token,
        resource,
        fromDateIso,
        maxPages,
      );

      const stageRows: WebhookEventInsert[] = [];
      for (const item of items) {
        const dedupeKey = `${resource}:${String(item.id ?? '')}:${String(item.updated_at ?? '')}`;
        stageRows.push({
          account_base_url: freshConnection.account_base_url,
          event_type: eventType,
          payload: item,
          dedupe_key: dedupeKey,
          status: 'pending',
        });
      }

      const staged = await stageWebhookEvents(supabase, stageRows);

      // Actualizamos el cursor con el máximo updated_at de los items que acabamos de sincronizar.
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
