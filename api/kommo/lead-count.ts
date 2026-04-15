import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getSupabaseAdminClient, verifySession } from './_shared.js';

function asSingle(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function shiftIsoDate(isoDate: string, deltaDays: number) {
  const [yearRaw, monthRaw, dayRaw] = isoDate.split('-');
  const date = new Date(Date.UTC(Number(yearRaw), Number(monthRaw) - 1, Number(dayRaw)));
  if (Number.isNaN(date.getTime())) return isoDate;
  date.setUTCDate(date.getUTCDate() + deltaDays);
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
}

function isIsoDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

export default async function kommoLeadCountHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET');
    return res.status(405).json({ success: false, error: 'Método no permitido' });
  }

  const auth = verifySession(req);
  if (!auth.ok) {
    return res.status(401).json({ success: false, error: auth.error ?? 'No autorizado' });
  }

  const pipelineIdRaw = asSingle(req.query.pipeline_id as string | string[] | undefined);
  const startDateRaw = asSingle(req.query.start_date as string | string[] | undefined) ?? '';
  const endDateRaw = asSingle(req.query.end_date as string | string[] | undefined) ?? '';

  const pipelineId = Number.parseInt(String(pipelineIdRaw ?? '').trim(), 10);
  if (!Number.isFinite(pipelineId) || pipelineId <= 0) {
    return res.status(400).json({ success: false, error: 'pipeline_id inválido.' });
  }

  if (startDateRaw && !isIsoDate(startDateRaw)) {
    return res.status(400).json({ success: false, error: 'start_date debe ser YYYY-MM-DD.' });
  }

  if (endDateRaw && !isIsoDate(endDateRaw)) {
    return res.status(400).json({ success: false, error: 'end_date debe ser YYYY-MM-DD.' });
  }

  try {
    const supabase = getSupabaseAdminClient();

    const countBy = async (field: 'updated_at' | 'updated_at_db') => {
      let query = supabase
        .from('kommo_leads' as never)
        .select('business_id' as never, { head: true, count: 'exact' })
        .eq('pipeline_id' as never, pipelineId as never);

      if (startDateRaw) {
        query = query.gte(field as never, startDateRaw as never);
      }

      if (endDateRaw) {
        query = query.lt(field as never, shiftIsoDate(endDateRaw, 1) as never);
      }

      const { count, error } = await query;
      if (error) {
        throw new Error(error.message || `No se pudo contar leads por ${field}.`);
      }

      return Number(count ?? 0);
    };

    const [updatedAtCount, updatedAtDbCount] = await Promise.all([
      countBy('updated_at'),
      countBy('updated_at_db'),
    ]);

    const total = updatedAtCount > 0 ? updatedAtCount : updatedAtDbCount;

    return res.status(200).json({
      success: true,
      pipeline_id: pipelineId,
      counts: {
        updated_at: updatedAtCount,
        updated_at_db: updatedAtDbCount,
      },
      total,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return res.status(500).json({ success: false, error: message });
  }
}
