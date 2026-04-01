import type { VercelRequest, VercelResponse } from '@vercel/node';
import syncOutboxHandler from '../sync-outbox.js';

export default async function cronSyncOutboxHandler(req: VercelRequest, res: VercelResponse) {
  return syncOutboxHandler(req, res);
}
