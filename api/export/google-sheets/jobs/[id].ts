import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminSession } from '../../../_auth.js';
import { cancelExportJob, getExportJob, runExportJob } from '../_jobs.js';

function readId(req: VercelRequest) {
  const raw = req.query.id;
  return Array.isArray(raw) ? raw[0] : raw;
}

export default async function googleSheetsExportJobByIdHandler(req: VercelRequest, res: VercelResponse) {
  const auth = verifyAdminSession(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, error: auth.error ?? 'No autorizado' });
  }

  const id = readId(req);
  if (!id || !String(id).trim()) {
    return res.status(400).json({ success: false, error: 'id de job requerido' });
  }

  if (req.method === 'GET') {
    const job = getExportJob(String(id));
    if (!job) return res.status(404).json({ success: false, error: 'Job no encontrado' });
    return res.status(200).json({ success: true, job });
  }

  if (req.method === 'POST') {
    const action = String((req.body as { action?: string } | undefined)?.action ?? 'run').trim().toLowerCase();

    if (action === 'cancel') {
      const cancelled = cancelExportJob(String(id));
      if (!cancelled) return res.status(404).json({ success: false, error: 'Job no encontrado' });
      return res.status(200).json({ success: true, job: cancelled });
    }

    const result = await runExportJob(String(id));
    if (!result) return res.status(404).json({ success: false, error: 'Job no encontrado' });
    return res.status(200).json({ success: true, job: result });
  }

  return res.status(405).json({ success: false, error: 'Método no permitido' });
}
