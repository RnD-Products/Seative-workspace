'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/session';
import { fieldErrors, nullIfEmpty, projectSchema } from '@/lib/validation';
import type { ActionResult } from '@/lib/types';

const friendly = (msg: string) =>
  /row-level security|permission|42501/i.test(msg) ? "You don't have permission to do that." : msg;

async function syncMembers(supabase: Awaited<ReturnType<typeof createClient>>, projectId: string, wanted: string[]) {
  const { data: current } = await supabase.from('project_members').select('profile_id').eq('project_id', projectId);
  const have = new Set((current ?? []).map((m) => m.profile_id as string));
  const want = new Set(wanted);
  const toAdd = [...want].filter((id) => !have.has(id));
  const toRemove = [...have].filter((id) => !want.has(id));
  if (toAdd.length) {
    const { error } = await supabase.from('project_members').insert(toAdd.map((profile_id) => ({ project_id: projectId, profile_id })));
    if (error) throw new Error(friendly(error.message));
  }
  if (toRemove.length) {
    const { error } = await supabase.from('project_members').delete().eq('project_id', projectId).in('profile_id', toRemove);
    if (error) throw new Error(friendly(error.message));
  }
}

export async function createProject(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  if (session.profile.role === 'employee') return { ok: false, error: 'Only project managers and the CEO can create projects.' };
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields', fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  // organization_id, created_by and (for PMs) manager_id are enforced by the database.
  const { data, error } = await supabase
    .from('projects')
    .insert({
      organization_id: session.org.id,
      name: v.name,
      description: v.description,
      status: v.status,
      priority: v.priority,
      start_date: nullIfEmpty(v.start_date),
      due_date: nullIfEmpty(v.due_date),
      manager_id: nullIfEmpty(v.manager_id) ?? session.userId,
    })
    .select('id')
    .single();
  if (error) return { ok: false, error: friendly(error.message) };
  try {
    await syncMembers(supabase, data.id, v.member_ids);
  } catch (e) {
    return { ok: false, error: `Project created, but members could not be added: ${(e as Error).message}` };
  }
  revalidatePath('/projects');
  revalidatePath('/');
  return { ok: true, data: { id: data.id } };
}

export async function updateProject(id: string, input: unknown): Promise<ActionResult> {
  await requireSession();
  if (!z.string().uuid().safeParse(id).success) return { ok: false, error: 'Invalid project' };
  const parsed = projectSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields', fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;
  const supabase = await createClient();
  const { data: before } = await supabase.from('projects').select('manager_id').eq('id', id).maybeSingle();
  if (!before) return { ok: false, error: 'Project not found.' };
  const patch: Record<string, unknown> = {
    name: v.name,
    description: v.description,
    status: v.status,
    priority: v.priority,
    start_date: nullIfEmpty(v.start_date),
    due_date: nullIfEmpty(v.due_date),
  };
  const newManager = nullIfEmpty(v.manager_id);
  if (newManager && newManager !== before.manager_id) patch.manager_id = newManager;
  const { data, error } = await supabase.from('projects').update(patch).eq('id', id).select('id');
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data?.length) return { ok: false, error: "You don't have permission to edit this project." };
  try {
    await syncMembers(supabase, id, v.member_ids);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
  revalidatePath(`/projects/${id}`);
  revalidatePath('/projects');
  return { ok: true };
}

export async function deleteProject(id: string): Promise<ActionResult> {
  await requireSession();
  const supabase = await createClient();
  const { data, error } = await supabase.from('projects').delete().eq('id', id).select('id');
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data?.length) return { ok: false, error: "You don't have permission to delete this project." };
  revalidatePath('/projects');
  redirect('/projects');
}
