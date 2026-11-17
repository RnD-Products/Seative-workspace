'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

const friendly = (msg: string) =>
  /row-level security|42501/i.test(msg) ? "You don't have permission to do that." : msg;
const uuid = z.string().uuid();
const optionalTask = z.union([uuid, z.literal(''), z.null()]).optional().transform((v) => (v ? v : null));

function revalidateTime(projectId?: string, taskId?: string | null) {
  revalidatePath('/', 'layout'); // the running-timer pill lives in the shell
  if (projectId) revalidatePath(`/projects/${projectId}`);
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

const startSchema = z.object({ project_id: uuid, task_id: optionalTask, note: z.string().trim().max(500).default('') });

/** Starts a timer. A timer already running elsewhere is stopped first, so switching work is one click. */
export async function startTimer(input: unknown): Promise<ActionResult<{ stoppedMinutes?: number }>> {
  const session = await requireSession();
  const parsed = startSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Pick a project to track time on.' };
  const supabase = await createClient();
  const { data: stopped } = await supabase
    .from('time_entries')
    .update({ ended_at: new Date().toISOString() })
    .eq('profile_id', session.userId).is('ended_at', null).is('minutes', null)
    .select('project_id, minutes');
  const { error } = await supabase.from('time_entries').insert({
    project_id: parsed.data.project_id, task_id: parsed.data.task_id, note: parsed.data.note,
    started_at: new Date().toISOString(), profile_id: session.userId,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateTime(parsed.data.project_id, parsed.data.task_id);
  if (stopped?.[0]) revalidatePath(`/projects/${stopped[0].project_id}`);
  return { ok: true, data: { stoppedMinutes: stopped?.[0]?.minutes ?? undefined } };
}

export async function stopTimer(): Promise<ActionResult<{ minutes: number }>> {
  const session = await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('time_entries')
    .update({ ended_at: new Date().toISOString() })
    .eq('profile_id', session.userId).is('ended_at', null).is('minutes', null)
    .select('project_id, task_id, minutes');
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data?.length) return { ok: false, error: 'No timer is running.' };
  revalidateTime(data[0].project_id, data[0].task_id);
  return { ok: true, data: { minutes: data[0].minutes ?? 0 } };
}

const logSchema = z.object({
  project_id: uuid,
  task_id: optionalTask,
  entry_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a date'),
  hours: z.coerce.number().int().min(0).max(24).default(0),
  minutes: z.coerce.number().int().min(0).max(59).default(0),
  note: z.string().trim().max(500).default(''),
}).refine((v) => v.hours * 60 + v.minutes >= 1, { message: 'Enter at least 1 minute', path: ['minutes'] });

export async function logTime(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = logSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the time entry' };
  const v = parsed.data;
  const supabase = await createClient();
  const { error } = await supabase.from('time_entries').insert({
    project_id: v.project_id, task_id: v.task_id, entry_date: v.entry_date,
    minutes: v.hours * 60 + v.minutes, note: v.note, profile_id: session.userId,
  });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateTime(v.project_id, v.task_id);
  return { ok: true };
}

export async function deleteTimeEntry(id: string): Promise<ActionResult> {
  await requireSession();
  if (!uuid.safeParse(id).success) return { ok: false, error: 'Invalid entry' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('time_entries').delete().eq('id', id).select('project_id, task_id');
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data?.length) return { ok: false, error: "You can only delete your own time, unless you manage the project." };
  revalidateTime(data[0].project_id, data[0].task_id);
  return { ok: true };
}
