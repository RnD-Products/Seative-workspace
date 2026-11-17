import 'server-only';
import { createClient } from '@/lib/supabase/server';
import type { Activity, Comment, Priority, Profile, Project, Task, TaskStatus } from '@/lib/types';
import { addDays, format } from 'date-fns';
import { projectHealth, projectStats, todayISO, type Health, type ProjectStats } from '@/lib/domain';

/**
 * Read helpers. All of them use the signed-in user's Supabase client, so results are
 * already limited by Row Level Security — callers never need to re-filter for permissions.
 */

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function db() {
  return createClient();
}

export async function listProfiles(supabase: Supabase) {
  const { data, error } = await supabase.from('profiles').select('*').order('full_name');
  if (error) throw new Error(error.message);
  return (data ?? []) as Profile[];
}

export const byId = <T extends { id: string }>(rows: T[]) => new Map(rows.map((r) => [r.id, r]));

export interface ProjectWithStats extends Project {
  stats: ProjectStats;
  health: Health;
  memberIds: string[];
}

export async function listProjects(supabase: Supabase): Promise<ProjectWithStats[]> {
  const [{ data: projects, error }, { data: tasks }, { data: members }, { data: dealRows }] = await Promise.all([
    supabase.from('projects').select('*').order('due_date', { ascending: true, nullsFirst: false }),
    supabase.from('tasks').select('project_id, status, due_date'),
    supabase.from('project_members').select('project_id, profile_id'),
    // Salespeople cannot read tasks; this gives them progress counts for their own deals.
    supabase.rpc('deal_task_rows'),
  ]);
  if (error) throw new Error(error.message);
  return ((projects ?? []) as Project[]).map((p) => {
    let ts = (tasks ?? []).filter((t) => t.project_id === p.id) as Pick<Task, 'status' | 'due_date'>[];
    if (!ts.length) ts = ((dealRows ?? []) as { project_id: string; status: Task['status']; due_date: string | null }[]).filter((t) => t.project_id === p.id);
    const stats = projectStats(ts);
    return {
      ...p,
      stats,
      health: projectHealth(p, stats),
      memberIds: (members ?? []).filter((m) => m.project_id === p.id).map((m) => m.profile_id as string),
    };
  });
}

export async function getProject(supabase: Supabase, id: string) {
  const { data } = await supabase.from('projects').select('*').eq('id', id).maybeSingle<Project>();
  return data;
}

export async function getProjectDetail(supabase: Supabase, id: string) {
  const project = await getProject(supabase, id);
  if (!project) return null;
  const [{ data: tasks }, { data: members }, { data: activity }] = await Promise.all([
    supabase.from('tasks').select('*').eq('project_id', id).order('position'),
    supabase.from('project_members').select('profile_id').eq('project_id', id),
    supabase.from('activity_log').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(40),
  ]);
  const t = (tasks ?? []) as Task[];
  const stats = projectStats(t);
  return {
    project,
    tasks: t,
    memberIds: (members ?? []).map((m) => m.profile_id as string),
    activity: (activity ?? []) as Activity[],
    stats,
    health: projectHealth(project, stats),
  };
}

export interface TaskFilters {
  project?: string;
  assignee?: string; // profile id, or 'me', or 'none'
  status?: TaskStatus | 'open';
  priority?: Priority;
  due?: 'overdue' | 'today' | 'week' | 'none';
  q?: string;
}

export async function listTasks(supabase: Supabase, userId: string, f: TaskFilters) {
  let q = supabase.from('tasks').select('*').order('due_date', { ascending: true, nullsFirst: false }).limit(500);
  if (f.project) q = q.eq('project_id', f.project);
  if (f.assignee === 'me') q = q.eq('assignee_id', userId);
  else if (f.assignee === 'none') q = q.is('assignee_id', null);
  else if (f.assignee) q = q.eq('assignee_id', f.assignee);
  if (f.status === 'open') q = q.neq('status', 'done');
  else if (f.status) q = q.eq('status', f.status);
  if (f.priority) q = q.eq('priority', f.priority);
  if (f.q) q = q.ilike('title', `%${f.q.replace(/[%_]/g, '')}%`);
  const today = todayISO();
  if (f.due === 'overdue') q = q.lt('due_date', today).neq('status', 'done');
  if (f.due === 'today') q = q.eq('due_date', today);
  if (f.due === 'week') q = q.gte('due_date', today).lte('due_date', format(addDays(new Date(), 7), 'yyyy-MM-dd'));
  if (f.due === 'none') q = q.is('due_date', null);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Task[];
}

export async function getTaskDetail(supabase: Supabase, id: string) {
  const { data: task } = await supabase.from('tasks').select('*').eq('id', id).maybeSingle<Task>();
  if (!task) return null;
  const [project, { data: comments }, { data: activity }] = await Promise.all([
    getProject(supabase, task.project_id),
    supabase.from('comments').select('*').eq('task_id', id).order('created_at', { ascending: true }),
    supabase.from('activity_log').select('*').eq('task_id', id).order('created_at', { ascending: false }).limit(20),
  ]);
  return { task, project: project!, comments: (comments ?? []) as Comment[], activity: (activity ?? []) as Activity[] };
}

/** Whether the current user manages a project — mirrors the database's can_manage_project(). */
export function canManage(project: Pick<Project, 'manager_id'>, me: Pick<Profile, 'id' | 'role'>) {
  return me.role === 'ceo' || (me.role === 'pm' && project.manager_id === me.id);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseFilters(sp: Record<string, string | string[] | undefined>): TaskFilters {
  const one = (k: string) => (typeof sp[k] === 'string' ? (sp[k] as string) : undefined);
  const id = (k: string) => (UUID.test(one(k) ?? '') ? one(k) : undefined);
  const status = one('status');
  const priority = one('priority');
  const due = one('due');
  return {
    project: id('project'),
    assignee: one('assignee') === 'me' || one('assignee') === 'none' ? one('assignee') : id('assignee'),
    status: ['todo', 'in_progress', 'in_review', 'done', 'open'].includes(status ?? '') ? (status as TaskFilters['status']) : undefined,
    priority: ['low', 'medium', 'high', 'urgent'].includes(priority ?? '') ? (priority as Priority) : undefined,
    due: ['overdue', 'today', 'week', 'none'].includes(due ?? '') ? (due as TaskFilters['due']) : undefined,
    q: one('q')?.slice(0, 100) || undefined,
  };
}
