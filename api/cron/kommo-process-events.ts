import type { VercelRequest, VercelResponse } from '@vercel/node';
import kommoProcessEventsHandler from '../kommo/process-events.js';

export default async function cronKommoProcessEventsHandler(req: VercelRequest, res: VercelResponse) {
  return kommoProcessEventsHandler(req, res);
}
