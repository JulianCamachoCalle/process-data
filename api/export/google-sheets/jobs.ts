import type { VercelRequest, VercelResponse } from '@vercel/node';
import { verifyAdminSession } from '../../../src/server/auth.js';
import {
  createExportJob,
  listExportJobs,
  runExportJob,
  validateExportRequest,
  type ExportJobRequest,
} from '../../../src/server/export/googleSheetsJobs.js';

export default async function googleSheetsExportJobsHandler(req: VercelRequest, res: VercelResponse) {
  const auth = verifyAdminSession(req);
  if (!auth.ok) {
    return res.status(auth.status).json({ success: false, error: auth.error ?? 'No autorizado' });
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      jobs: listExportJobs(),
      note: 'MVP: jobs en memoria (se pierden en reinicio/despliegue).',
    });
  }

  if (req.method === 'POST') {
    const payload = (req.body ?? {}) as Partial<ExportJobRequest> & { run_now?: boolean };
    const validationError = validateExportRequest(payload);

    if (validationError) {
      return res.status(400).json({ success: false, error: validationError });
    }

    const job = createExportJob({
      resource: payload.resource!,
      date_from: payload.date_from!,
      date_to: payload.date_to!,
      destination: {
        spreadsheet_id: payload.destination!.spreadsheet_id,
        sheet_name: payload.destination!.sheet_name,
      },
    });

    if (payload.run_now !== false) {
      const result = await runExportJob(job.id);
      return res.status(201).json({
        success: true,
        job: result,
      });
    }

    return res.status(201).json({ success: true, job });
  }

  return res.status(405).json({ success: false, error: 'Método no permitido' });
}
