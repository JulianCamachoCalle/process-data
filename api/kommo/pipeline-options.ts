import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient, verifySession } from './_shared.js';

const EXCLUDED_PIPELINE_NAMES = new Set([
  'data de leads',
  'leads entrantes principal',
]);

function normalizeText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

export default async function kommoPipelineOptionsHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  const auth = verifySession(req);
  if (!auth.ok) {
    return res.status(401).json({ success: false, error: auth.error ?? 'No autorizado' });
  }

  try {
    const supabase = getSupabaseAdminClient();
    const options: Array<{ value: string; pipelineId: number; label: string }> = [];
    let from = 0;
    const pageSize = 500;

    while (true) {
      const to = from + pageSize - 1;
      const { data, error } = await supabase
        .from('kommo_pipelines' as never)
        .select('business_id,name,is_archive' as never)
        .range(from, to);

      if (error) {
        throw new Error(error.message || 'No se pudieron cargar pipelines.');
      }

      const rows = ((data ?? []) as Array<{ business_id: number | null; name: string | null; is_archive: boolean | null }>);
      for (const row of rows) {
        const pipelineId = Number(row.business_id ?? 0);
        if (!Number.isFinite(pipelineId) || pipelineId <= 0) continue;
        if (row.is_archive === true) continue;

        const name = String(row.name ?? '').trim();
        if (!name) continue;
        if (EXCLUDED_PIPELINE_NAMES.has(normalizeText(name))) continue;

        options.push({
          value: String(pipelineId),
          pipelineId,
          label: name,
        });
      }

      if (rows.length < pageSize) break;
      from += pageSize;
    }

    options.sort((a, b) => a.label.localeCompare(b.label, 'es'));

    return res.status(200).json({ success: true, options });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return res.status(500).json({ success: false, error: message });
  }
}
