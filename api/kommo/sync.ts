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

// Resource endpoints for Kommo API v4
// TODO: Implement multi-resource sync (contacts, companies, users, pipelines)

function asSingleQueryParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function getResourceFromQuery(req: VercelRequest): string {
  const resource = asSingleQueryParam(req.query.resource);
  // Default to leads for backwards compatibility
  if (!resource || !['leads', 'contacts', 'companies', 'users', 'pipelines'].includes(resource)) {
    return 'leads';
  }
  return resource;
}

function getEndpointForResource(resource: string): string {
  const endpoints: Record<string, string> = {
    leads: '/api/v4/leads',
    contacts: '/api/v4/contacts',
    companies: '/api/v4/companies',
    users: '/api/v4/users',
    pipelines: '/api/v4/pipelines',
  };
  return endpoints[resource] ?? '/api/v4/leads';
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

    // Get resource from query param (default: leads)
    const resource = getResourceFromQuery(req);

    const { data: cursorRows, error: cursorError } = await supabase
      .from('kommo_sync_cursor' as never)
      .select('*')
      .eq('account_subdomain', freshConnection.account_subdomain)
      .eq('resource', resource)
      .order('updated_at', { ascending: false })
      .limit(1);

    if (cursorError) {
      throw new Error(cursorError.message || 'No se pudo leer cursor de sync Kommo');
    }

    const cursor = ((cursorRows ?? []) as Array<{ cursor_updated_at: string | null }>)[0] ?? null;
    const fromDateIso = cursor?.cursor_updated_at ?? null;

    // Use dynamic endpoint based on resource
    const endpoint = getEndpointForResource(resource);
    const url = new URL(`${freshConnection.account_base_url}${endpoint}`);
    url.searchParams.set('limit', '250');
    if (fromDateIso) {
      url.searchParams.set('filter[updated_at][from]', String(toUnixSeconds(fromDateIso)));
    }

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${freshConnection.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Kommo ${resource} sync error (${response.status}): ${raw || 'sin detalle'}`);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const embeddedKey = `${resource}`; // leads, contacts, companies, users, pipelines
    const items = ((payload._embedded as Record<string, unknown> | undefined)?.[embeddedKey] as Array<Record<string, unknown>>) ?? [];

    // Dynamic event type based on resource
    const eventType = `${resource.slice(0, -1)}.pull`; // leads->lead.pull, contacts->contact.pull
    
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
        staged += 1;
      }
    }

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
        throw new Error(upsertCursorError.message || `No se pudo actualizar cursor de ${resource}`);
      }
    }

    return res.status(200).json({
      success: true,
      resource,
      account: freshConnection.account_subdomain,
      pulled: items.length,
      staged,
      cursorFrom: fromDateIso,
      cursorTo: nextCursor,
    });
  } catch (error: unknown) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
