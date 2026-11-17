'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireSession } from '@/lib/session';
import { normaliseTags } from '@/lib/sales';
import type { ActionResult } from '@/lib/types';

const friendly = (msg: string) => (/row-level security|42501/i.test(msg) ? "You don't have permission to do that." : msg);
const uuid = z.string().uuid();
const blank = (v: unknown) => (v === '' || v === undefined || v === null ? null : v);
const date = z.preprocess(blank, z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a valid date').nullable());
const money = z.preprocess(blank, z.coerce.number().min(0, 'Amounts cannot be negative').max(999999999999).nullable());

const salesFields = z.object({
  client_name: z.string().trim().min(1, 'Client name is required').max(200),
  client_contact_name: z.string().trim().max(200).default(''),
  client_email: z.union([z.string().trim().email('Enter a valid email'), z.literal('')]).default(''),
  client_phone: z.string().trim().max(50).default(''),
  deal_source: z.enum(['direct', 'referral', 'upwork', 'fiverr', 'linkedin', 'other']).default('direct'),
  deal_date: date,
  client_deadline: date,
  budget: money,
  contract_amount: money,
  currency: z.enum(['BDT', 'USD']).default('BDT'),
  advance_received: money.transform((v) => v ?? 0),
  payment_status: z.enum(['unpaid', 'advance_paid', 'partially_paid', 'fully_paid']).default('unpaid'),
  scope_summary: z.string().trim().max(4000).default(''),
  team_requirements: z.string().trim().max(2000).default(''),
  requirement_tags: z.union([z.array(z.string()), z.string()]).default([]).transform(normaliseTags),
});

const dealSchema = salesFields.extend({
  name: z.string().trim().min(2, 'Give the project a name').max(120),
  description: z.string().trim().max(4000).default(''),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
});

/** Sales (or the CEO) records a closed deal: an Incoming project plus its sales info. */
export async function createDeal(input: unknown): Promise<ActionResult<{ id: string }>> {
  const session = await requireSession();
  if (!['sales', 'ceo'].includes(session.profile.role)) return { ok: false, error: 'Only Sales and the CEO can add deals.' };
  const parsed = dealSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form' };
  const { name, description, priority, ...sales } = parsed.data;
  const supabase = await createClient();
  const { data: project, error } = await supabase.from('projects')
    .insert({ name, description, priority, status: 'incoming', manager_id: null, due_date: sales.client_deadline, start_date: null })
    .select('id').single();
  if (error || !project) return { ok: false, error: friendly(error?.message ?? 'Could not create the project') };
  const { error: sErr } = await supabase.from('project_sales').insert({ project_id: project.id, ...sales });
  if (sErr) {
    await supabase.from('projects').delete().eq('id', project.id); // CEO can clean up; for Sales RLS keeps nothing orphaned visible
    return { ok: false, error: friendly(sErr.message) };
  }
  revalidatePath('/', 'layout');
  return { ok: true, data: { id: project.id } };
}

export async function updateSales(projectId: string, input: unknown): Promise<ActionResult> {
  await requireSession();
  if (!uuid.safeParse(projectId).success) return { ok: false, error: 'Invalid project' };
  const parsed = salesFields.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the form' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('project_sales').update(parsed.data).eq('project_id', projectId).select('project_id');
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data?.length) return { ok: false, error: 'Only the salesperson on this deal and the CEO can edit sales info.' };
  revalidatePath(`/projects/${projectId}`);
  revalidatePath('/incoming');
  return { ok: true };
}

/** A PM takes an unassigned Incoming project. */
export async function takeProject(projectId: string): Promise<ActionResult> {
  const session = await requireSession();
  if (session.profile.role !== 'pm') return { ok: false, error: 'Only project managers can take a project.' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('projects').update({ manager_id: session.userId })
    .eq('id', projectId).is('manager_id', null).eq('status', 'incoming').select('id');
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data?.length) return { ok: false, error: 'Someone has already taken this project.' };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** The CEO assigns a PM (or themselves) to an Incoming project. */
export async function assignManager(projectId: string, managerId: string): Promise<ActionResult> {
  const session = await requireSession();
  if (session.profile.role !== 'ceo') return { ok: false, error: 'Only the CEO can assign a project manager.' };
  if (!uuid.safeParse(projectId).success || !uuid.safeParse(managerId).success) return { ok: false, error: 'Pick a project manager' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('projects').update({ manager_id: managerId }).eq('id', projectId).select('id');
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data?.length) return { ok: false, error: 'Project not found' };
  revalidatePath('/', 'layout');
  return { ok: true };
}

/** Add the chosen people and move the project from Incoming to Active. */
const memberPlan = z.object({
  id: uuid,
  due_date: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()).default(null),
  brief: z.string().trim().max(120).default(''),
  create_task: z.boolean().default(false),
});
const startSchema = z.object({
  members: z.array(memberPlan).max(50),
  start_date: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()).default(null),
  due_date: z.preprocess((v) => (v === '' ? null : v), z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable()).default(null),
});

/**
 * Pick the team and timeline. Each person can get their own due date and a short brief;
 * optionally a task is created for them with that due date so it shows in their My Work.
 */
export async function startProject(projectId: string, input: unknown): Promise<ActionResult> {
  await requireSession();
  const parsed = startSchema.safeParse(input);
  if (!uuid.safeParse(projectId).success || !parsed.success) return { ok: false, error: parsed.success ? 'Invalid project' : parsed.error.issues[0]?.message ?? 'Check the dates' };
  const { members, start_date, due_date } = parsed.data;
  if (!members.length) return { ok: false, error: 'Pick at least one person for the team.' };
  if (start_date && due_date && due_date < start_date) return { ok: false, error: 'The project due date is before the start date.' };
  const late = members.find((m) => m.due_date && due_date && m.due_date > due_date);
  if (late) return { ok: false, error: 'A person\'s due date is after the project due date. Move the project due date or their date.' };
  const supabase = await createClient();
  const { data: project } = await supabase.from('projects').select('id, name, status').eq('id', projectId).maybeSingle();
  if (!project) return { ok: false, error: 'Project not found' };

  // Timeline first, so the permission check happens before anyone is added.
  const patch: Record<string, string | null> = {};
  if (project.status === 'incoming') patch.status = 'active';
  if (start_date) patch.start_date = start_date;
  if (due_date) patch.due_date = due_date;
  const { data: upd, error: pErr } = await supabase.from('projects').update(Object.keys(patch).length ? patch : { status: project.status }).eq('id', projectId).select('id');
  if (pErr) return { ok: false, error: friendly(pErr.message) };
  if (!upd?.length) return { ok: false, error: 'Only the project manager or the CEO can start this project.' };

  const { data: existing } = await supabase.from('project_members').select('profile_id').eq('project_id', projectId);
  const have = new Set((existing ?? []).map((m) => m.profile_id));
  const toAdd = members.filter((m) => !have.has(m.id));
  if (toAdd.length) {
    const { error } = await supabase.from('project_members').insert(toAdd.map((m) => ({ project_id: projectId, profile_id: m.id, due_date: m.due_date, brief: m.brief })));
    if (error) return { ok: false, error: friendly(error.message) };
  }
  for (const m of members.filter((x) => have.has(x.id))) {
    const { error } = await supabase.from('project_members').update({ due_date: m.due_date, brief: m.brief }).eq('project_id', projectId).eq('profile_id', m.id);
    if (error) return { ok: false, error: friendly(error.message) };
  }
  const tasks = members.filter((m) => m.create_task).map((m) => ({
    project_id: projectId, assignee_id: m.id, due_date: m.due_date, title: m.brief || `Work on ${project.name}`,
    description: `Set when the team was picked${m.due_date ? `, due ${m.due_date}` : ''}.`, priority: 'medium',
  }));
  if (tasks.length) {
    const { error } = await supabase.from('tasks').insert(tasks);
    if (error) return { ok: false, error: friendly(error.message) };
  }
  revalidatePath('/', 'layout');
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

export async function updateSkills(profileId: string, skills: string[]): Promise<ActionResult> {
  const session = await requireSession();
  if (session.profile.role !== 'ceo') return { ok: false, error: 'Only the CEO can edit skill tags.' };
  if (!uuid.safeParse(profileId).success) return { ok: false, error: 'Invalid person' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('profiles').update({ skills: normaliseTags(skills) }).eq('id', profileId).select('id');
  if (error) return { ok: false, error: friendly(error.message) };
  if (!data?.length) return { ok: false, error: 'Person not found' };
  revalidatePath('/settings');
  return { ok: true };
}
