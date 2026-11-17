'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

export interface NotificationItem {
  id: string; kind: string; title: string; body: string; link: string; read_at: string | null; created_at: string; actor_id: string | null;
}

export async function listNotifications(): Promise<{ items: NotificationItem[]; unread: number }> {
  const session = await requireSession();
  const supabase = await createClient();
  const [{ data }, { count }] = await Promise.all([
    supabase.from('notifications').select('id, kind, title, body, link, read_at, created_at, actor_id')
      .eq('recipient_id', session.userId).order('created_at', { ascending: false }).limit(40),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', session.userId).is('read_at', null),
  ]);
  return { items: (data ?? []) as NotificationItem[], unread: count ?? 0 };
}

export async function unreadCount(): Promise<number> {
  const session = await requireSession();
  const supabase = await createClient();
  const { count } = await supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', session.userId).is('read_at', null);
  return count ?? 0;
}

export async function markRead(id: string): Promise<ActionResult> {
  const session = await requireSession();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Invalid notification' };
  const supabase = await createClient();
  await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('id', id).eq('recipient_id', session.userId).is('read_at', null);
  return { ok: true };
}

export async function markAllRead(): Promise<ActionResult> {
  const session = await requireSession();
  const supabase = await createClient();
  const { error } = await supabase.from('notifications').update({ read_at: new Date().toISOString() }).eq('recipient_id', session.userId).is('read_at', null);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true };
}

const KINDS = ['task_assigned', 'project_added', 'incoming_project', 'team_assigned', 'deadline_reminder', 'blocker', 'mention', 'message'] as const;

export async function updateNotificationPrefs(prefs: Record<string, boolean>): Promise<ActionResult> {
  const session = await requireSession();
  const clean = Object.fromEntries(KINDS.filter((k) => k in prefs).map((k) => [k, Boolean(prefs[k])]));
  const supabase = await createClient();
  const { error } = await supabase.from('profiles').update({ notification_prefs: clean }).eq('id', session.userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/settings');
  return { ok: true };
}
