import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, createHmac } from 'node:crypto';
import {
  getSupabaseAdminClient,
  isSecretAuthorized,
  isVercelCronAuthorized,
  verifyAdminSession,
} from './_shared.js';

const PROCESS_SECRET_ENV = 'KOMMO_CHAT_SYNC_SECRET';
const PROCESS_SECRET_HEADER = 'x-kommo-chat-sync-secret';

const CHAT_SCOPE_ENV = 'KOMMO_CHAT_SCOPE_ID';
const CHAT_CHANNEL_SECRET_ENV = 'KOMMO_CHAT_CHANNEL_SECRET';

const DEFAULT_CONVERSATIONS_LIMIT = 20;
const DEFAULT_PAGE_SIZE = 50;
const DEFAULT_MAX_PAGES_PER_CONVERSATION = 10;

type ChatSenderPayload = {
  id?: string | null;
  name?: string | null;
};

type ChatReceiverPayload = {
  id?: string | null;
  name?: string | null;
};

type ChatMessagePayload = {
  id?: string | null;
  type?: string | null;
  text?: string | null;
  media?: string | null;
  thumbnail?: string | null;
  file_name?: string | null;
  file_size?: string | null;
};

type ChatHistoryItem = {
  timestamp?: number | null;
  msec_timestamp?: number | null;
  sender?: ChatSenderPayload | null;
  receiver?: ChatReceiverPayload | null;
  message?: ChatMessagePayload | null;
};

function asSingleQueryParam(value: string | string[] | undefined) {
  if (Array.isArray(value)) return value[0];
  return value;
}

function parsePositiveInteger(raw: string | undefined, fallback: number, min: number, max: number) {
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function getRfc2822UtcDate() {
  return new Date().toUTCString().replace('GMT', '+0000');
}

function buildContentMd5(body: string) {
  return createHash('md5').update(body, 'utf8').digest('hex').toLowerCase();
}

function buildSignature(args: {
  method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';
  date: string;
  contentType: string;
  contentMd5: string;
  path: string;
  channelSecret: string;
}) {
  const payload = [
    args.method.toUpperCase(),
    args.date,
    args.contentType,
    args.contentMd5,
    args.path,
  ].join('\n');

  return createHmac('sha1', args.channelSecret).update(payload, 'utf8').digest('hex').toLowerCase();
}

function extractHistoryItems(payload: unknown): ChatHistoryItem[] {
  if (Array.isArray(payload)) {
    return payload as ChatHistoryItem[];
  }

  if (!payload || typeof payload !== 'object') {
    return [];
  }

  const candidate = payload as Record<string, unknown>;
  const directMessages = candidate.messages;
  if (Array.isArray(directMessages)) {
    return directMessages as ChatHistoryItem[];
  }

  const embedded = candidate._embedded;
  if (embedded && typeof embedded === 'object') {
    const embeddedMessages = (embedded as Record<string, unknown>).messages;
    if (Array.isArray(embeddedMessages)) {
      return embeddedMessages as ChatHistoryItem[];
    }
  }

  return [];
}

function resolveMessageId(item: ChatHistoryItem) {
  const messageId = String(item.message?.id ?? '').trim();
  if (messageId) return messageId;

  const msecTimestamp = Number(item.msec_timestamp ?? 0);
  const timestamp = Number(item.timestamp ?? 0);
  const senderId = String(item.sender?.id ?? '').trim();
  const fallback = `${msecTimestamp || timestamp || Date.now()}-${senderId || 'unknown'}`;
  return fallback;
}

function resolveMessageTimestampIso(item: ChatHistoryItem) {
  const msecTimestamp = Number(item.msec_timestamp ?? 0);
  if (Number.isFinite(msecTimestamp) && msecTimestamp > 0) {
    return new Date(msecTimestamp).toISOString();
  }

  const secTimestamp = Number(item.timestamp ?? 0);
  if (Number.isFinite(secTimestamp) && secTimestamp > 0) {
    return new Date(secTimestamp * 1000).toISOString();
  }

  return null;
}

async function fetchConversationHistoryPage(args: {
  scopeId: string;
  conversationId: string;
  offset: number;
  limit: number;
  channelSecret: string;
}) {
  const path = `/v2/origin/custom/${encodeURIComponent(args.scopeId)}/chats/${encodeURIComponent(args.conversationId)}/history`;
  const query = new URLSearchParams({
    offset: String(args.offset),
    limit: String(args.limit),
  });

  const url = `https://amojo.kommo.com${path}?${query.toString()}`;
  const contentType = 'application/json';
  const body = '';
  const contentMd5 = buildContentMd5(body);
  const date = getRfc2822UtcDate();

  const signature = buildSignature({
    method: 'GET',
    date,
    contentType,
    contentMd5,
    path,
    channelSecret: args.channelSecret,
  });

  const response = await fetch(url, {
    method: 'GET',
    headers: {
      Date: date,
      'Content-Type': contentType,
      'Content-MD5': contentMd5,
      'X-Signature': signature,
      Accept: 'application/json',
    },
  });

  const raw = await response.text();
  let parsed: unknown = {};
  if (raw) {
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      parsed = { raw };
    }
  }

  if (!response.ok) {
    throw new Error(`Kommo chat history error (${response.status}) for conversation ${args.conversationId}: ${raw || 'sin detalle'}`);
  }

  return extractHistoryItems(parsed);
}

async function upsertConversationMessages(args: {
  conversationId: string;
  items: ChatHistoryItem[];
}) {
  if (args.items.length === 0) {
    return 0;
  }

  const supabase = getSupabaseAdminClient();
  const rows = args.items.map((item) => ({
    conversation_id: args.conversationId,
    message_id: resolveMessageId(item),
    message_timestamp: resolveMessageTimestampIso(item),
    sender_id: item.sender?.id ?? null,
    sender_name: item.sender?.name ?? null,
    receiver_id: item.receiver?.id ?? null,
    receiver_name: item.receiver?.name ?? null,
    message_type: item.message?.type ?? null,
    message_text: item.message?.text ?? null,
    media_url: item.message?.media ?? null,
    thumbnail_url: item.message?.thumbnail ?? null,
    file_name: item.message?.file_name ?? null,
    file_size: item.message?.file_size ?? null,
    raw_payload: item,
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from('kommo_chat_messages' as never)
    .upsert(rows as never, { onConflict: 'conversation_id,message_id' });

  if (error) {
    throw new Error(error.message || `No se pudo upsert chat messages para conversación ${args.conversationId}`);
  }

  return rows.length;
}

async function updateSyncState(args: {
  conversationId: string;
  offset: number;
  status: 'pending' | 'synced' | 'failed';
  lastError: string | null;
}) {
  const supabase = getSupabaseAdminClient();
  const { error } = await supabase
    .from('kommo_chat_sync_state' as never)
    .upsert({
      conversation_id: args.conversationId,
      last_offset: args.offset,
      last_synced_at: args.status === 'failed' ? null : new Date().toISOString(),
      sync_status: args.status,
      last_error: args.lastError,
      updated_at: new Date().toISOString(),
    } as never, { onConflict: 'conversation_id' });

  if (error) {
    throw new Error(error.message || `No se pudo actualizar sync state para conversación ${args.conversationId}`);
  }
}

async function getConversationTargets(limit: number, conversationId?: string) {
  if (conversationId) {
    return [conversationId];
  }

  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('kommo_lead_conversations' as never)
    .select('conversation_id')
    .not('conversation_id', 'is', null)
    .limit(limit);

  if (error) {
    throw new Error(error.message || 'No se pudieron leer conversaciones para chat sync');
  }

  const ids = new Set<string>();
  for (const row of (data ?? []) as Array<{ conversation_id: string | null }>) {
    const value = String(row.conversation_id ?? '').trim();
    if (value) ids.add(value);
  }

  return Array.from(ids);
}

async function getOffsetForConversation(conversationId: string) {
  const supabase = getSupabaseAdminClient();
  const { data, error } = await supabase
    .from('kommo_chat_sync_state' as never)
    .select('last_offset')
    .eq('conversation_id', conversationId)
    .limit(1);

  if (error) {
    throw new Error(error.message || `No se pudo leer sync state de ${conversationId}`);
  }

  const row = ((data ?? []) as Array<{ last_offset: number | null }>)[0];
  return Math.max(0, Number(row?.last_offset ?? 0) || 0);
}

export default async function kommoChatHistorySyncHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST' && req.method !== 'GET') {
    return res.status(405).json({ error: 'Método no permitido' });
  }

  try {
    const secretAuthorized = isSecretAuthorized(req, PROCESS_SECRET_ENV, PROCESS_SECRET_HEADER);
    const cronAuthorized = isVercelCronAuthorized(req);
    if (!secretAuthorized && !cronAuthorized) {
      const auth = verifyAdminSession(req);
      if (!auth.ok) {
        return res.status(auth.status).json({ error: auth.error ?? 'No autorizado' });
      }
    }

    const scopeId = process.env[CHAT_SCOPE_ENV];
    const channelSecret = process.env[CHAT_CHANNEL_SECRET_ENV];
    if (!scopeId || !channelSecret) {
      return res.status(500).json({
        error: `Faltan variables ${CHAT_SCOPE_ENV} y/o ${CHAT_CHANNEL_SECRET_ENV}`,
      });
    }

    const limitConversations = parsePositiveInteger(
      asSingleQueryParam(req.query.limit_conversations),
      DEFAULT_CONVERSATIONS_LIMIT,
      1,
      200,
    );
    const pageSize = parsePositiveInteger(
      asSingleQueryParam(req.query.page_size),
      DEFAULT_PAGE_SIZE,
      1,
      50,
    );
    const maxPagesPerConversation = parsePositiveInteger(
      asSingleQueryParam(req.query.max_pages),
      DEFAULT_MAX_PAGES_PER_CONVERSATION,
      1,
      200,
    );
    const singleConversationId = asSingleQueryParam(req.query.conversation_id)?.trim() || undefined;

    const targets = await getConversationTargets(limitConversations, singleConversationId);

    if (targets.length === 0) {
      return res.status(200).json({
        success: true,
        processedConversations: 0,
        insertedMessages: 0,
        skipped: true,
        reason: 'No hay conversation_id en kommo_lead_conversations',
      });
    }

    let insertedMessages = 0;
    let processedConversations = 0;
    const failures: Array<{ conversationId: string; error: string }> = [];

    for (const conversationId of targets) {
      try {
        let offset = await getOffsetForConversation(conversationId);
        let pagesProcessed = 0;

        while (pagesProcessed < maxPagesPerConversation) {
          const items = await fetchConversationHistoryPage({
            scopeId,
            conversationId,
            offset,
            limit: pageSize,
            channelSecret,
          });

          if (items.length === 0) {
            break;
          }

          insertedMessages += await upsertConversationMessages({
            conversationId,
            items,
          });

          offset += items.length;
          pagesProcessed += 1;

          if (items.length < pageSize) {
            break;
          }
        }

        await updateSyncState({
          conversationId,
          offset,
          status: 'synced',
          lastError: null,
        });

        processedConversations += 1;
      } catch (conversationError: unknown) {
        const errorMessage = conversationError instanceof Error ? conversationError.message : 'Error desconocido';
        failures.push({ conversationId, error: errorMessage });

        await updateSyncState({
          conversationId,
          offset: 0,
          status: 'failed',
          lastError: errorMessage,
        }).catch(() => {
          // no-op
        });
      }
    }

    return res.status(200).json({
      success: failures.length === 0,
      processedConversations,
      insertedMessages,
      failures,
      totalTargets: targets.length,
    });
  } catch (error: unknown) {
    return res.status(500).json({
      error: error instanceof Error ? error.message : 'Error interno del servidor',
    });
  }
}
