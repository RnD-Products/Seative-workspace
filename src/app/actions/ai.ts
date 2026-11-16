'use server';

/**
 * AI server actions.
 *
 * Every action:
 *   1. checks the session and the user's permission for the specific project/task,
 *   2. loads only the records needed, through the user's RLS-scoped Supabase client,
 *   3. sends that minimal context to Claude (server-side; the API key never reaches the browser),
 *   4. validates the structured reply with Zod,
 *   5. returns a draft. Nothing is written to tasks or projects until the user confirms.
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { requireSession, type Session } from '@/lib/session';
import { canManage, listProjects } from '@/lib/queries';
import { daysUntil, fmtDate, todayISO } from '@/lib/domain';
import { asData, runStructured } from '@/lib/ai/client';
import { observeRisks } from '@/lib/ai/risk-facts';
import {
  applyPlanSchema, askFormat, askSchema, assistFormat, assistModeEnum, assistSchema, orgSummaryFormat, orgSummarySchema,
  planFormat, planRequestSchema, planSchema, riskFormat, riskSchema, summaryFormat, summarySchema, updateFormat, updateSchema,
  type AssistDraft, type OrgSummary, type Plan, type ProgressSummary, type RiskSignalContent,
} from '@/lib/ai/schemas';
import type { ActionResult, Comment, Profile, Project, Task } from '@/lib/types';

type Supabase = Awaited<ReturnType<typeof createClient>>;
const uuid = z.string().uuid();
const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);

async function logAi(supabase: Supabase, session: Session, action: string, projectId: string | null, details: Record<string, unknown>, taskId?: string) {
  await supabase.from('activity_log').insert({
    organization_id: session.org.id, project_id: projectId, task_id: taskId ?? null,
    actor_id: session.userId, action, details, ai_assisted: true,
  });
}

/** Loads a project through RLS and confirms the caller manages it. */
async function managedProject(supabase: Supabase, session: Session, projectId: string) {
  if (!uuid.safeParse(projectId).success) return null;
  const { data } = await supabase.from('projects').select('*').eq('id', projectId).maybeSingle<Project>();
  return data && canManage(data, session.profile) ? data : null;
}

const NO_ACCESS = "You don't have access to use AI on this project.";

// ---------------------------------------------------------------------------
// A. Project brief → draft plan
// ---------------------------------------------------------------------------
export async function draftPlan(input: unknown): Promise<ActionResult<Plan>> {
  const session = await requireSession();
  const parsed = planRequestSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check your input' };
  const supabase = await createClient();
  const project = await managedProject(supabase, session, parsed.data.projectId);
  if (!project) return { ok: false, error: NO_ACCESS };
  const { data: existing } = await supabase.from('tasks').select('title').eq('project_id', project.id).limit(100);

  const res = await runStructured({
    userId: session.userId,
    task: `Draft a project plan as milestones containing tasks.
- 2–6 milestones, each with 2–8 concrete, actionable tasks.
- Suggest realistic start/due dates between the project start (or today) and the target date. Use "" if there is no basis for a date.
- suggested_owner_role is a job role (e.g. "Designer", "Backend developer"), never a person.
- Do not repeat tasks that already exist.
- List any assumptions you made.`,
    input: `Today is ${todayISO()}.\n${asData({
      project: { name: project.name, start_date: project.start_date, due_date: project.due_date },
      brief: { goal: parsed.data.goal, description: parsed.data.description, target_date: parsed.data.targetDate || project.due_date || '' },
      existing_task_titles: (existing ?? []).map((t) => clip(t.title, 120)),
    })}`,
    format: planFormat,
    strict: planSchema,
    maxTokens: 4000,
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data };
}

/** Saves only the tasks the user selected and edited. Tasks are created unassigned. */
export async function applyPlan(input: unknown): Promise<ActionResult<{ count: number }>> {
  const session = await requireSession();
  const parsed = applyPlanSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? 'Check the selected tasks' };
  const supabase = await createClient();
  const project = await managedProject(supabase, session, parsed.data.projectId);
  if (!project) return { ok: false, error: NO_ACCESS };

  const base = Date.now() / 1000;
  const { error } = await supabase.from('tasks').insert(parsed.data.tasks.map((t, i) => ({
    project_id: project.id,
    title: t.title,
    description: t.description,
    priority: t.priority,
    status: 'todo',
    assignee_id: null,
    start_date: t.start_date || null,
    due_date: t.due_date || null,
    position: base + i,
  })));
  if (error) return { ok: false, error: error.message };
  await supabase.from('ai_generated_artifacts').insert({ project_id: project.id, kind: 'project_plan', content: { tasks: parsed.data.tasks }, model: process.env.ANTHROPIC_MODEL ?? null });
  await logAi(supabase, session, 'ai_plan_applied', project.id, { count: parsed.data.tasks.length });
  revalidatePath(`/projects/${project.id}`);
  return { ok: true, data: { count: parsed.data.tasks.length } };
}

// ---------------------------------------------------------------------------
// B. Progress summary
// ---------------------------------------------------------------------------
export async function summarizeProject(projectId: string): Promise<ActionResult<{ content: ProgressSummary; created_at: string; insufficient?: boolean }>> {
  const session = await requireSession();
  const supabase = await createClient();
  const project = await managedProject(supabase, session, projectId);
  if (!project) return { ok: false, error: NO_ACCESS };

  const [{ data: tasks }, { data: activity }] = await Promise.all([
    supabase.from('tasks').select('id, title, status, priority, due_date, assignee_id, completed_at, updated_at').eq('project_id', projectId).limit(300),
    supabase.from('activity_log').select('action, details, created_at').eq('project_id', projectId).order('created_at', { ascending: false }).limit(30),
  ]);
  const taskIds = (tasks ?? []).map((t) => t.id);
  const { data: comments } = taskIds.length
    ? await supabase.from('comments').select('task_id, body, is_progress_update, created_at').in('task_id', taskIds).order('created_at', { ascending: false }).limit(30)
    : { data: [] as Pick<Comment, 'task_id' | 'body' | 'is_progress_update' | 'created_at'>[] };

  // Too little to summarise honestly: say so without calling the model.
  if ((tasks ?? []).length < 2 && (comments ?? []).length === 0) {
    return {
      ok: true,
      data: {
        insufficient: true,
        created_at: new Date().toISOString(),
        content: { data_sufficiency: 'insufficient', overview: 'There isn’t enough project data to summarize yet. Add tasks or progress updates first.', completed: [], next_steps: [], blockers: [], risks: [] },
      },
    };
  }

  const titleOf = new Map((tasks ?? []).map((t) => [t.id, t.title]));
  const res = await runStructured({
    userId: session.userId,
    task: `Summarize this project's progress for its manager.
- overview: 2–3 sentences.
- completed: notable finished work. next_steps: open work that comes next, by due date.
- blockers: only items the data explicitly shows as blocked or stuck (e.g. comments saying so). Do not infer blockers.
- risks: factual concerns supported by the data (overdue items, approaching deadline with much work open). Phrase as observations, not predictions.
- Set data_sufficiency to "limited" or "insufficient" when the data is thin, and say what is missing in the overview.
- Do not mention or evaluate individual people.`,
    input: `Today is ${todayISO()}.\n${asData({
      project: { name: project.name, status: project.status, start_date: project.start_date, due_date: project.due_date },
      tasks: (tasks ?? []).map((t) => ({ title: clip(t.title, 150), status: t.status, priority: t.priority, due_date: t.due_date, assigned: Boolean(t.assignee_id), completed_at: t.completed_at?.slice(0, 10) ?? null })),
      recent_updates: (comments ?? []).map((c) => ({ task: clip(titleOf.get(c.task_id) ?? '', 100), progress_update: c.is_progress_update, date: c.created_at.slice(0, 10), text: clip(c.body, 500) })),
      recent_activity: (activity ?? []).map((a) => ({ action: a.action, title: (a.details as Record<string, unknown>)?.title ?? null, to: (a.details as Record<string, unknown>)?.to ?? null, date: a.created_at.slice(0, 10) })),
    })}`,
    format: summaryFormat,
    strict: summarySchema,
  });
  if (!res.ok) return res;
  const { data: saved, error } = await supabase.from('ai_generated_artifacts').insert({ project_id: projectId, kind: 'progress_summary', content: res.data, model: res.model }).select('created_at').single();
  if (error) return { ok: false, error: error.message };
  await logAi(supabase, session, 'ai_summary_generated', projectId, {});
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: { content: res.data, created_at: saved.created_at } };
}

// ---------------------------------------------------------------------------
// C. Risk & delay signals
// ---------------------------------------------------------------------------
export async function scanRisks(projectId: string): Promise<ActionResult<{ signals: number; facts: number }>> {
  const session = await requireSession();
  const supabase = await createClient();
  const project = await managedProject(supabase, session, projectId);
  if (!project) return { ok: false, error: NO_ACCESS };

  const { data: tasks } = await supabase.from('tasks').select('*').eq('project_id', projectId).limit(500);
  const ids = (tasks ?? []).map((t) => t.id);
  const { data: comments } = ids.length
    ? await supabase.from('comments').select('task_id, body, created_at').in('task_id', ids).order('created_at', { ascending: false }).limit(200)
    : { data: [] as { task_id: string; body: string; created_at: string }[] };
  const facts = observeRisks(project, (tasks ?? []) as Task[], comments ?? []);
  if (facts.length === 0) return { ok: true, data: { signals: 0, facts: 0 }, message: 'No risk facts found in the project data, so there is nothing to interpret.' };

  const res = await runStructured({
    userId: session.userId,
    task: `You are given observed facts about a project, each with an id. Group related facts into a small number of risk signals.
- Every signal must cite one or more fact_ids from the list. Never invent facts or cite ids that are not listed.
- interpretation: what the facts may mean for the project, using hedged language ("may", "could"). Do not claim certainty about the future.
- suggested_action: one practical next step for the project manager.
- Do not blame, rank or single out individual people.`,
    input: `Today is ${todayISO()}.\n${asData({
      project: { name: project.name, due_date: project.due_date, days_left: project.due_date ? daysUntil(project.due_date) : null },
      facts: facts.map((f) => ({ id: f.id, kind: f.kind, fact: `${f.label}. ${f.detail}` })),
    })}`,
    format: riskFormat,
    strict: riskSchema,
  });
  if (!res.ok) return res;

  const byId = new Map(facts.map((f) => [f.id, f]));
  const batch = new Date().toISOString();
  const rows = res.data.signals
    .map((s) => ({ ...s, fact_ids: s.fact_ids.filter((id) => byId.has(id)) }))
    .filter((s) => s.fact_ids.length > 0) // discard anything not grounded in observed facts
    .map((s) => ({
      project_id: projectId,
      kind: 'risk_signal' as const,
      model: res.model,
      content: {
        batch,
        title: s.title,
        interpretation: s.interpretation,
        severity: s.severity,
        suggested_action: s.suggested_action,
        evidence: s.fact_ids.map((id) => { const f = byId.get(id)!; return { id: f.id, label: f.label, detail: f.detail, taskIds: f.taskIds }; }),
      } satisfies RiskSignalContent & { batch: string },
    }));
  if (rows.length) {
    const { error } = await supabase.from('ai_generated_artifacts').insert(rows);
    if (error) return { ok: false, error: error.message };
  }
  await logAi(supabase, session, 'ai_risk_scan', projectId, { signals: rows.length });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true, data: { signals: rows.length, facts: facts.length } };
}

export async function reviewSignal(artifactId: string, status: 'reviewed' | 'dismissed'): Promise<ActionResult> {
  const session = await requireSession();
  if (!uuid.safeParse(artifactId).success || !['reviewed', 'dismissed'].includes(status)) return { ok: false, error: 'Invalid request' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('ai_generated_artifacts').update({ status }).eq('id', artifactId).eq('kind', 'risk_signal').select('project_id, content');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "You don't have permission to review this signal." };
  await logAi(supabase, session, 'ai_signal_reviewed', data[0].project_id, { status, title: (data[0].content as RiskSignalContent).title });
  revalidatePath(`/projects/${data[0].project_id}`);
  return { ok: true };
}

// ---------------------------------------------------------------------------
// D. Task assistant  /  E. Personal update
// ---------------------------------------------------------------------------
async function visibleTask(supabase: Supabase, taskId: string) {
  if (!uuid.safeParse(taskId).success) return null;
  const { data: task } = await supabase.from('tasks').select('*').eq('id', taskId).maybeSingle<Task>();
  if (!task) return null;
  const { data: project } = await supabase.from('projects').select('name, description').eq('id', task.project_id).maybeSingle();
  return { task, projectName: project?.name ?? '', projectDescription: project?.description ?? '' };
}

export async function assistTask(taskId: string, mode: unknown): Promise<ActionResult<AssistDraft>> {
  const session = await requireSession();
  const m = assistModeEnum.safeParse(mode);
  if (!m.success) return { ok: false, error: 'Choose what kind of help you want.' };
  const supabase = await createClient();
  const found = await visibleTask(supabase, taskId);
  if (!found) return { ok: false, error: "You don't have access to this task." };
  const instructions = {
    breakdown: 'Break the task into 3–8 concrete subtasks (title + one-line detail). Leave description "" and acceptance_criteria [].',
    clarify: 'Rewrite the description so it is clear and complete: goal, scope, and what is out of scope. Keep facts from the original; mark anything uncertain as a question instead of inventing it. Leave subtasks [] and acceptance_criteria [].',
    acceptance: 'Write 3–8 testable acceptance criteria ("Given/When/Then" or plain checklist items). Leave description "" and subtasks [].',
  }[m.data];
  const res = await runStructured({
    userId: session.userId,
    task: `Help improve a single task. ${instructions}\nPut anything you would need to know but cannot infer into questions.`,
    input: asData({
      project: { name: found.projectName, description: clip(found.projectDescription, 800) },
      task: { title: found.task.title, description: clip(found.task.description, 3000), status: found.task.status, priority: found.task.priority, due_date: found.task.due_date },
    }),
    format: assistFormat,
    strict: assistSchema,
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data };
}

/** Applies a reviewed draft to the task description (the user saw and edited it first). */
export async function applyTaskDraft(taskId: string, mode: unknown, description: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const m = assistModeEnum.safeParse(mode);
  const d = z.string().trim().max(10000).safeParse(description);
  if (!m.success || !d.success || !uuid.safeParse(taskId).success) return { ok: false, error: 'Invalid draft' };
  const supabase = await createClient();
  const { data, error } = await supabase.from('tasks').update({ description: d.data }).eq('id', taskId).select('project_id, title');
  if (error) return { ok: false, error: /42501|security/.test(error.message) ? "You can't edit this task." : error.message };
  if (!data?.length) return { ok: false, error: "You can't edit this task." };
  await logAi(supabase, session, 'ai_task_draft_applied', data[0].project_id, { mode: m.data, title: data[0].title }, taskId);
  revalidatePath(`/tasks/${taskId}`);
  return { ok: true };
}

export async function draftUpdate(taskId: string, notes: unknown): Promise<ActionResult<{ update: string }>> {
  const session = await requireSession();
  const n = z.string().trim().min(3, 'Write a few rough notes first').max(3000).safeParse(notes);
  if (!n.success) return { ok: false, error: n.error.issues[0].message };
  const supabase = await createClient();
  const found = await visibleTask(supabase, taskId);
  if (!found) return { ok: false, error: "You don't have access to this task." };
  const res = await runStructured({
    userId: session.userId,
    task: `Turn the author's rough notes into a concise progress update (2–5 short sentences or bullets) in the first person: what was done, what's next, and any blocker.
Use only information in the notes. Do not add achievements, numbers or dates that are not there.`,
    input: asData({ task: { title: found.task.title, status: found.task.status, due_date: found.task.due_date }, rough_notes: n.data }),
    format: updateFormat,
    strict: updateSchema,
    maxTokens: 800,
  });
  if (!res.ok) return res;
  return { ok: true, data: res.data };
}

// ---------------------------------------------------------------------------
// F. Ask about work
// ---------------------------------------------------------------------------
export interface AskAnswer {
  answer: string;
  outsideAccess: boolean;
  references: { type: 'project' | 'task'; id: string; label: string }[];
  scope: { projects: number; tasks: number };
}

export async function askAboutWork(question: unknown): Promise<ActionResult<AskAnswer>> {
  const session = await requireSession();
  const q = z.string().trim().min(3, 'Ask a question').max(500, 'Keep questions under 500 characters').safeParse(question);
  if (!q.success) return { ok: false, error: q.error.issues[0].message };
  const supabase = await createClient();

  // Everything below is fetched with the user's own permissions (RLS).
  const [projects, { data: people }, { data: taskRows }] = await Promise.all([
    listProjects(supabase),
    supabase.from('profiles').select('id, full_name'),
    supabase.from('tasks').select('id, title, project_id, status, priority, due_date, assignee_id, completed_at').order('due_date', { ascending: true, nullsFirst: false }).limit(1000),
  ]);
  const cutoff = Date.now() - 14 * 864e5;
  const tasks = (taskRows ?? [])
    .filter((t) => t.status !== 'done' || (t.completed_at && Date.parse(t.completed_at) > cutoff))
    .slice(0, 300);
  const nameOf = new Map((people ?? []).map((p: Pick<Profile, 'id' | 'full_name'>) => [p.id, p.full_name]));

  // Short reference ids keep prompts small and let us verify every citation.
  const pRef = new Map(projects.map((p, i) => [p.id, `P${i + 1}`]));
  const tRef = new Map(tasks.map((t, i) => [t.id, `T${i + 1}`]));
  const refToItem = new Map<string, { type: 'project' | 'task'; id: string; label: string }>();
  projects.forEach((p) => refToItem.set(pRef.get(p.id)!, { type: 'project', id: p.id, label: p.name }));
  tasks.forEach((t) => refToItem.set(tRef.get(t.id)!, { type: 'task', id: t.id, label: t.title }));

  const res = await runStructured({
    userId: session.userId,
    task: `Answer the user's question about their work using only the records provided. These are all the records this user is allowed to see.
- If the answer needs information that is not in the records (another team's projects, salaries, private data, etc.), set outside_access to true and say plainly that it is outside what they can access in this workspace. Do not speculate about it.
- If the records simply contain no matching items, say so.
- Cite the projects/tasks you used in references by their ref (e.g. "P2", "T14"). Use only refs that appear in the records.
- Be concise. Use short bullet lists for multiple items. Mention due dates.`,
    input: `Today is ${todayISO()}. The user is ${session.profile.full_name} (role: ${session.profile.role}).\n${asData({
      projects: projects.map((p) => ({ ref: pRef.get(p.id), name: p.name, status: p.status, due_date: p.due_date, health: p.health, tasks_total: p.stats.total, tasks_done: p.stats.done, tasks_overdue: p.stats.overdue, you_manage: p.manager_id === session.userId })),
      tasks: tasks.map((t) => ({ ref: tRef.get(t.id), project: pRef.get(t.project_id), title: clip(t.title, 140), status: t.status, priority: t.priority, due_date: t.due_date, assignee: t.assignee_id ? (t.assignee_id === session.userId ? 'you' : nameOf.get(t.assignee_id) ?? 'someone') : 'unassigned' })),
      truncated: (taskRows ?? []).length > tasks.length,
    })}\n\nQuestion:\n${asData(q.data)}`,
    format: askFormat,
    strict: askSchema,
    maxTokens: 1500,
  });
  if (!res.ok) return res;
  const seen = new Set<string>();
  const references = res.data.references
    .map((r) => refToItem.get(r.id))
    .filter((r): r is NonNullable<typeof r> => Boolean(r) && !seen.has(r!.id) && Boolean(seen.add(r!.id)));
  // Replace raw refs like "T12" in the text with readable names.
  const answer = res.data.answer.replace(/\b([PT]\d{1,4})\b/g, (m) => (refToItem.get(m) ? `“${refToItem.get(m)!.label}”` : m));
  return { ok: true, data: { answer, outsideAccess: res.data.outside_access, references, scope: { projects: projects.length, tasks: tasks.length } } };
}

// ---------------------------------------------------------------------------
// CEO: company-wide summary (aggregates only — no task-level or comment data)
// ---------------------------------------------------------------------------
export async function summarizeOrganization(): Promise<ActionResult<{ content: OrgSummary; created_at: string }>> {
  const session = await requireSession();
  if (session.profile.role !== 'ceo') return { ok: false, error: 'Only the CEO can generate a company-wide summary.' };
  const supabase = await createClient();
  const [projects, { data: people }] = await Promise.all([listProjects(supabase), supabase.from('profiles').select('id, full_name')]);
  if (!projects.length) return { ok: false, error: 'There are no projects to summarize yet.' };
  const nameOf = new Map((people ?? []).map((p: Pick<Profile, 'id' | 'full_name'>) => [p.id, p.full_name]));
  const refs: Record<string, { id: string; name: string }> = {};
  projects.forEach((p, i) => { refs[`P${i + 1}`] = { id: p.id, name: p.name }; });

  const res = await runStructured({
    userId: session.userId,
    task: `Write a short company-wide progress briefing for the CEO from per-project figures.
- overview: 3–4 sentences on overall progress.
- highlights: notable positive facts.
- attention: projects needing attention, citing project_ref and a factual reason from the figures.
- data_gaps: where the figures are too thin to judge (e.g. projects with no tasks or no due date).
Base everything on the figures. Do not speculate about causes or people.`,
    input: `Today is ${todayISO()}.\n${asData(projects.map((p, i) => ({
      ref: `P${i + 1}`, name: p.name, status: p.status, priority: p.priority, manager: p.manager_id ? nameOf.get(p.manager_id) ?? null : null,
      due_date: p.due_date ? fmtDate(p.due_date, 'yyyy-MM-dd') : null, tasks_total: p.stats.total, tasks_done: p.stats.done, tasks_overdue: p.stats.overdue, health: p.health,
    })))}`,
    format: orgSummaryFormat,
    strict: orgSummarySchema,
  });
  if (!res.ok) return res;
  const content: OrgSummary = { ...res.data, attention: res.data.attention.filter((a) => refs[a.project_ref]), projects: refs };
  const { data: saved, error } = await supabase.from('ai_generated_artifacts').insert({ kind: 'org_summary', content, model: res.model }).select('created_at').single();
  if (error) return { ok: false, error: error.message };
  await logAi(supabase, session, 'ai_org_summary', null, {});
  revalidatePath('/');
  return { ok: true, data: { content, created_at: saved.created_at } };
}
