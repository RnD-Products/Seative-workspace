'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/session';
import { CHAT_PAGE, type ChatSummary, type Message } from '@/lib/chat';
import type { ActionResult } from '@/lib/types';

const friendly = (m: string) => (/row-level security|42501/i.test(m) ? "You can't post in this chat." : m.replace(/^.*?: /, ''));
const uuid = z.string().uuid();
const sendSchema = z.object({
  conversation_id: uuid,
  body: z.string().trim().min(1, 'Write a message first').max(4000, 'Messages can be up to 4,000 characters'),
  mentions: z.array(uuid).max(20).default([]),
});

export async function sendMessage(input: unknown): Promise<ActionResult<Message>> {
  await requireSession();
  const parsed = sendSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the message' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('messages').insert(parsed.data).select('*').single();
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, data: data as Message };
}

export async function editMessage(id: string, body: string): Promise<ActionResult<Message>> {
  await requireSession();
  const parsed = z.object({ id: uuid, body: z.string().trim().min(1, 'A message cannot be empty').max(4000) }).safeParse({ id, body });
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the message' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('messages').update({ body: parsed.data.body }).eq('id', id).select('*').maybeSingle();
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data) return { ok: false, error: 'You can only edit your own messages.' };
  return { ok: true, data: data as Message };
}

export async function messageHistory(id: string): Promise<ActionResult<{ previous_body: string; edited_at: string }[]>> {
  await requireSession();
  if (!uuid.safeParse(id).success) return { ok: false, error: 'Not found' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('message_edits').select('previous_body, edited_at').eq('message_id', id).order('edited_at');
  if (error) return { ok: false, error: friendly(error.message) };
  return { ok: true, data: data ?? [] };
}

/** Messages after a timestamp (live fallback) or before one (load older). */
export async function fetchMessages(conversationId: string, opts: { after?: string; before?: string }): Promise<Message[]> {
  await requireSession();
  if (!uuid.safeParse(conversationId).success) return [];
  const supabase = await createClient();
  let q = supabase.from('messages').select('*').eq('conversation_id', conversationId);
  if (opts.after) q = q.gt('created_at', opts.after).order('created_at', { ascending: true }).limit(200);
  else { if (opts.before) q = q.lt('created_at', opts.before); q = q.order('created_at', { ascending: false }).limit(CHAT_PAGE); }
  const { data } = await q;
  const rows = (data ?? []) as Message[];
  return opts.after ? rows : rows.reverse();
}

/** Edited messages since a time, so live views pick up edits too. */
export async function fetchEdited(conversationId: string, since: string): Promise<Message[]> {
  await requireSession();
  if (!uuid.safeParse(conversationId).success) return [];
  const supabase = await createClient();
  const { data } = await supabase.from('messages').select('*').eq('conversation_id', conversationId).gt('edited_at', since).limit(100);
  return (data ?? []) as Message[];
}

export async function markChatRead(conversationId: string): Promise<void> {
  await requireSession();
  if (!uuid.safeParse(conversationId).success) return;
  const supabase = await createClient();
  await supabase.rpc('mark_chat_read', { cid: conversationId });
}

export async function listChats(): Promise<ChatSummary[]> {
  await requireSession();
  const supabase = await createClient();
  const { data } = await supabase.rpc('my_chats');
  return (data ?? []) as ChatSummary[];
}

export async function chatUnreadTotal(): Promise<number> {
  const chats = await listChats();
  return chats.reduce((n, c) => n + c.unread, 0);
}

export async function openDm(otherId: string): Promise<void> {
  await requireSession();
  if (!uuid.safeParse(otherId).success) redirect('/messages');
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('open_dm', { other: otherId });
  if (error || !data) redirect('/messages?error=1');
  redirect(`/messages/${data}`);
}
