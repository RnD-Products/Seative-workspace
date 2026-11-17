'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/session';
import type { ActionResult } from '@/lib/types';

const friendly = (m: string) => (/row-level security|42501/i.test(m) ? "You don't have permission to do that." : m.replace(/^.*?: /, ''));
const uuid = z.string().uuid();
const optUuid = z.union([uuid, z.literal(''), z.null()]).optional().transform((v) => v || null);

const raiseSchema = z.object({
  project_id: uuid,
  task_id: optUuid,
  title: z.string().trim().min(2, 'Describe the blocker in a few words').max(200),
  details: z.string().trim().max(2000).default(''),
  side: z.enum(['client', 'internal', 'third_party']),
  responsible_id: optUuid,
}).refine((v) => v.side !== 'internal' || v.responsible_id, { message: 'Pick who on our side it is waiting on', path: ['responsible_id'] });

function revalidate(projectId: string, taskId?: string | null) {
  revalidatePath('/', 'layout');
  revalidatePath(`/projects/${projectId}`);
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

export async function raiseBlocker(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = raiseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form' };
  const supabase = await createClient();
  const { error } = await supabase.from('blockers').insert({ ...parsed.data, raised_by: session.userId });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidate(parsed.data.project_id, parsed.data.task_id);
  return { ok: true };
}

export async function setBlockerStatus(id: string, status: 'open' | 'resolved', note = ''): Promise<ActionResult> {
  await requireSession();
  if (!uuid.safeParse(id).success) return { ok: false, error: 'Invalid blocker' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('blockers')
    .update({ status, resolved_note: status === 'resolved' ? note.trim().slice(0, 1000) : '' })
    .eq('id', id).select('project_id, task_id');
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data?.length) return { ok: false, error: 'Only the person responsible, the project manager or the CEO can do that.' };
  revalidate(data[0].project_id, data[0].task_id);
  return { ok: true };
}

export async function reassignBlocker(id: string, side: string, responsibleId: string | null): Promise<ActionResult> {
  await requireSession();
  const s = z.enum(['client', 'internal', 'third_party']).safeParse(side);
  if (!uuid.safeParse(id).success || !s.success) return { ok: false, error: 'Invalid change' };
  if (s.data === 'internal' && !responsibleId) return { ok: false, error: 'Pick who on our side it is waiting on' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('blockers').update({ side: s.data, responsible_id: s.data === 'internal' ? responsibleId : null }).eq('id', id).select('project_id, task_id');
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data?.length) return { ok: false, error: "You don't have permission to change this blocker." };
  revalidate(data[0].project_id, data[0].task_id);
  return { ok: true };
}
