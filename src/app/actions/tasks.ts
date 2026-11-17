'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/session';
import { commentSchema, fieldErrors, nullIfEmpty, taskSchema, taskStatusEnum } from '@/lib/validation';
import type { ActionResult } from '@/lib/types';

const friendly = (msg: string) =>
  /row-level security|42501/i.test(msg) ? "You don't have permission to do that." : msg;

function revalidateTask(projectId: string, taskId?: string) {
  revalidatePath('/');
  revalidatePath('/my-work');
  revalidatePath('/tasks');
  revalidatePath(`/projects/${projectId}`);
  if (taskId) revalidatePath(`/tasks/${taskId}`);
}

export async function createTask(input: unknown): Promise<ActionResult<{ id: string }>> {
  await requireSession();
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields', fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .insert({
      project_id: v.project_id,
      title: v.title,
      description: v.description,
      status: v.status,
      priority: v.priority,
      assignee_id: nullIfEmpty(v.assignee_id),
      start_date: nullIfEmpty(v.start_date),
      due_date: nullIfEmpty(v.due_date),
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: friendly(error.message) };
  revalidateTask(v.project_id, data.id);
  return { ok: true, data: { id: data.id } };
}

export async function updateTask(id: string, input: unknown): Promise<ActionResult> {
  await requireSession();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Invalid task' };
  const parsed = taskSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields', fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('tasks')
    .update({
      project_id: v.project_id,
      title: v.title,
      description: v.description,
      status: v.status,
      priority: v.priority,
      assignee_id: nullIfEmpty(v.assignee_id),
      start_date: nullIfEmpty(v.start_date),
      due_date: nullIfEmpty(v.due_date),
    })
    .eq('id', id)
    .select('id');
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data?.length) return { ok: false, error: "You don't have permission to edit this task." };
  revalidateTask(v.project_id, id);
  return { ok: true };
}

/** Quick status change (board drag, list dropdown). Allowed for managers and the assignee. */
export async function updateTaskStatus(id: string, status: unknown): Promise<ActionResult> {
  await requireSession();
  const s = taskStatusEnum.safeParse(status);
  if (!s.success || !z.string().uuid().safeParse(id).success) return { ok: false, error: 'Invalid update' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('tasks').update({ status: s.data }).eq('id', id).select('project_id');
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data?.length) return { ok: false, error: 'You can only change the status of tasks you manage or are assigned to.' };
  revalidateTask(data[0].project_id, id);
  return { ok: true };
}

/** Description-only update, used by assignees applying their own edits or an AI draft. */
export async function updateTaskDescription(id: string, description: unknown): Promise<ActionResult> {
  await requireSession();
  const d = z.string().max(10000).safeParse(description);
  if (!d.success || !z.string().uuid().safeParse(id).success) return { ok: false, error: 'Invalid update' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('tasks').update({ description: d.data }).eq('id', id).select('project_id');
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data?.length) return { ok: false, error: "You don't have permission to edit this task." };
  revalidateTask(data[0].project_id, id);
  return { ok: true };
}

export async function deleteTask(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.from('tasks').delete().eq('id', id).select('project_id');
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data?.length) return { ok: false, error: "You don't have permission to delete this task." };
  revalidateTask(data[0].project_id);
  return { ok: true };
}

export async function addComment(input: unknown): Promise<ActionResult> {
  await requireSession();
  const parsed = commentSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Check the comment', fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.from('comments').insert({ ...parsed.data });
  if (error) return { ok: false, error: friendly(error.message) };
  revalidatePath(`/tasks/${parsed.data.task_id}`);
  revalidatePath('/');
  return { ok: true };
}

const fieldsSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(200).optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  assignee_id: z.string().uuid().nullable().optional(),
  due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
}).refine((v) => Object.keys(v).length > 0, 'Nothing to update');

/** Inline edit of one or more task fields. The database decides who may change what. */
export async function updateTaskFields(id: string, input: unknown): Promise<ActionResult> {
  await requireSession();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Invalid task' };
  const parsed = fieldsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid update' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('tasks').update(parsed.data).eq('id', id).select('project_id');
  if (error) {
    if (/task_dates/.test(error.message)) return { ok: false, error: 'The due date must be on or after the start date.' };
    return { ok: false, error: friendly(error.message) };
  }
  if (!data?.length) return { ok: false, error: "You don't have permission to edit this task." };
  revalidateTask(data[0].project_id, id);
  return { ok: true };
}
