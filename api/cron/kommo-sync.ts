import type { VercelRequest, VercelResponse } from '@vercel/node';
import kommoSyncHandler from '../kommo/sync';

export default async function cronKommoSyncHandler(req: VercelRequest, res: VercelResponse) {
  return kommoSyncHandler(req, res);
}
