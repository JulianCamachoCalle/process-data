import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureFreshConnection, getActiveKommoConnection, isSecretAuthorized } from './_shared.js';

const SYNC_SECRET_HEADER = 'x-kommo-sync-secret';
const SYNC_SECRET_ENV = 'KOMMO_SYNC_SECRET';

export default async function kommoDebugContactsHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const secretAuthorized = isSecretAuthorized(req, SYNC_SECRET_ENV, SYNC_SECRET_HEADER, 'secret');
    if (!secretAuthorized) {
      return res.status(401).json({ error: 'No autorizado' });
    }

    const connection = await getActiveKommoConnection();
    if (!connection) {
      return res.status(404).json({ error: 'No hay conexión Kommo activa' });
    }

    const freshConnection = await ensureFreshConnection(connection);

    // Fetch first contact to see structure
    const url = new URL(`${freshConnection.account_base_url}/api/v4/contacts`);
    url.searchParams.set('limit', '1');

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${freshConnection.access_token}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const raw = await response.text();
      throw new Error(`Kommo API error (${response.status}): ${raw}`);
    }

    const payload = (await response.json()) as {
      _embedded?: { contacts: Array<Record<string, unknown>> };
    };
    const contacts = payload._embedded?.contacts ?? [];

    if (contacts.length === 0) {
      return res.status(200).json({ message: 'No hay contacts en Kommo' });
    }

    // Return first contact with all fields
    const firstContact = contacts[0];
    const allKeys = Object.keys(firstContact);
    
    // Get custom fields structure
    const customFieldsRaw = (firstContact._embedded as Record<string, unknown> | undefined)?.custom_fields_values;
    const customFields = Array.isArray(customFieldsRaw) ? customFieldsRaw : [];

    return res.status(200).json({
      total_keys: allKeys.length,
      keys: allKeys.sort(),
      sample: firstContact,
      custom_fields_count: customFields.length,
      custom_fields: customFields.map((cf: Record<string, unknown>) => ({
        field_id: cf.field_id,
        field_code: cf.field_code,
        field_name: cf.field_name,
        values: cf.values,
      })),
    });
  } catch (error: unknown) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error interno',
    });
  }
}