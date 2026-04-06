import type { VercelRequest, VercelResponse } from '@vercel/node';
import { ensureRowsHaveStableIdsWithSummary, getAllRawSheets } from '../src/lib/google-sheets.js';
import { verifyAdminSession } from './_auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Método no permitido' });
    }

    const auth = verifyAdminSession(req);
    if (!auth.ok) {
      return res.status(auth.status).json({ error: auth.error });
    }

    const startedAt = Date.now();
    const sheets = await getAllRawSheets();
    const perSheet = [] as Array<{
      title: string;
      rowCount: number;
      hadBackfill: boolean;
      durationMs: number;
    }>;

    for (const sheet of sheets) {
      const sheetStartedAt = Date.now();
      const { rows, hadBackfill } = await ensureRowsHaveStableIdsWithSummary(sheet);

      perSheet.push({
        title: sheet.title,
        rowCount: rows.length,
        hadBackfill,
        durationMs: Date.now() - sheetStartedAt,
      });
    }

    return res.status(200).json({
      success: true,
      sheetCount: perSheet.length,
      hadAnyBackfill: perSheet.some((item) => item.hadBackfill),
      durationMs: Date.now() - startedAt,
      sheets: perSheet,
    });
  } catch (error: unknown) {
    console.error('Backfill IDs Error:', error);
    const message = error instanceof Error ? error.message : 'Error interno del servidor';
    return res.status(500).json({ error: message });
  }
}
