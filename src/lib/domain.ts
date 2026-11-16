import { differenceInCalendarDays, format, formatDistanceToNow, parseISO } from 'date-fns';
import type { Priority, Project, ProjectStatus, Role, Task, TaskStatus } from './types';

export const ROLE_LABEL: Record<Role, string> = { employee: 'Employee', pm: 'Project Manager', ceo: 'CEO' };
export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  todo: 'To do', in_progress: 'In progress', in_review: 'In review', done: 'Done',
};
export const TASK_STATUSES: TaskStatus[] = ['todo', 'in_progress', 'in_review', 'done'];
export const PROJECT_STATUS_LABEL: Record<ProjectStatus, string> = {
  planning: 'Planning', active: 'Active', on_hold: 'On hold', completed: 'Completed',
};
export const PROJECT_STATUSES: ProjectStatus[] = ['planning', 'active', 'on_hold', 'completed'];
export const PRIORITY_LABEL: Record<Priority, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
export const PRIORITIES: Priority[] = ['low', 'medium', 'high', 'urgent'];

export const todayISO = () => format(new Date(), 'yyyy-MM-dd');
export const daysUntil = (iso: string) => differenceInCalendarDays(parseISO(iso), new Date());
export const fmtDate = (iso: string | null | undefined, f = 'd MMM yyyy') => (iso ? format(parseISO(iso), f) : '—');
export const fmtRelative = (iso: string) => formatDistanceToNow(parseISO(iso), { addSuffix: true });

export const isOverdue = (t: Pick<Task, 'status' | 'due_date'>) =>
  t.status !== 'done' && !!t.due_date && daysUntil(t.due_date) < 0;

export function dueLabel(t: Pick<Task, 'status' | 'due_date'>) {
  if (!t.due_date) return 'No due date';
  if (t.status === 'done') return `Due ${fmtDate(t.due_date, 'd MMM')}`;
  const d = daysUntil(t.due_date);
  if (d < 0) return `${-d} day${d === -1 ? '' : 's'} overdue`;
  if (d === 0) return 'Due today';
  if (d === 1) return 'Due tomorrow';
  return `Due ${fmtDate(t.due_date, 'd MMM')}`;
}

export interface ProjectStats {
  total: number;
  done: number;
  overdue: number;
  percent: number;
}

export function projectStats(tasks: Pick<Task, 'status' | 'due_date'>[]): ProjectStats {
  const total = tasks.length;
  const done = tasks.filter((t) => t.status === 'done').length;
  return { total, done, overdue: tasks.filter(isOverdue).length, percent: total ? Math.round((done / total) * 100) : 0 };
}

export type Health = 'on_track' | 'at_risk' | 'off_track' | 'completed' | 'not_started';
export const HEALTH_LABEL: Record<Health, string> = {
  on_track: 'On track', at_risk: 'At risk', off_track: 'Off track', completed: 'Completed', not_started: 'No tasks yet',
};

/**
 * Project health from database facts only:
 *   completed  — project marked completed
 *   off_track  — past due with work remaining, or more than 20% of tasks overdue
 *   at_risk    — any overdue task, or completion trails elapsed time by more than 25 points
 */
export function projectHealth(p: Pick<Project, 'status' | 'start_date' | 'due_date'>, s: ProjectStats): Health {
  if (p.status === 'completed') return 'completed';
  if (s.total === 0) return 'not_started';
  if (p.due_date && daysUntil(p.due_date) < 0 && s.done < s.total) return 'off_track';
  if (s.overdue / s.total > 0.2) return 'off_track';
  if (s.overdue > 0) return 'at_risk';
  if (p.start_date && p.due_date) {
    const span = Math.max(1, differenceInCalendarDays(parseISO(p.due_date), parseISO(p.start_date)));
    const elapsed = Math.min(1, Math.max(0, differenceInCalendarDays(new Date(), parseISO(p.start_date)) / span));
    if (elapsed * 100 - s.percent > 25) return 'at_risk';
  }
  return 'on_track';
}

type Details = Record<string, string | number | null | undefined>;
const ACTIVITY_TEXT: Record<string, (d: Details) => string> = {
  project_created: (d) => `created the project${d.name ? ` “${d.name}”` : ''}`,
  project_status_changed: (d) => `changed project status from ${PROJECT_STATUS_LABEL[d.from as ProjectStatus] ?? d.from} to ${PROJECT_STATUS_LABEL[d.to as ProjectStatus] ?? d.to}`,
  project_manager_changed: (d) => `made ${d.to ?? 'nobody'} the project manager`,
  project_due_changed: (d) => `moved the project deadline to ${fmtDate(d.to as string)}`,
  member_added: (d) => `added ${d.member} to the project`,
  member_removed: (d) => `removed ${d.member} from the project`,
  task_created: (d) => `created “${d.title}”${d.assignee ? ` for ${d.assignee}` : ''}`,
  task_assigned: (d) => (d.to ? `assigned “${d.title}” to ${d.to}` : `unassigned “${d.title}”`),
  task_status_changed: (d) => `moved “${d.title}” from ${TASK_STATUS_LABEL[d.from as TaskStatus] ?? d.from} to ${TASK_STATUS_LABEL[d.to as TaskStatus] ?? d.to}`,
  task_due_changed: (d) => `changed the due date of “${d.title}” to ${fmtDate(d.to as string)}`,
  task_deleted: (d) => `deleted “${d.title}”`,
  comment_added: (d) => `commented on “${d.title}”`,
  progress_update_posted: (d) => `posted a progress update on “${d.title}”`,
  ai_plan_applied: (d) => `added ${d.count} task${d.count === 1 ? '' : 's'} from an AI-drafted plan`,
  ai_summary_generated: () => 'generated an AI progress summary',
  ai_risk_scan: (d) => `ran an AI risk check (${d.signals ?? 0} signal${d.signals === 1 ? '' : 's'})`,
  ai_signal_reviewed: (d) => `${d.status === 'dismissed' ? 'dismissed' : 'reviewed'} the risk signal “${d.title}”`,
  ai_task_draft_applied: (d) => `applied an AI draft (${d.mode}) to “${d.title}”`,
  ai_org_summary: () => 'generated an AI company summary',
};

export function describeActivity(action: string, details: Record<string, unknown>) {
  return ACTIVITY_TEXT[action]?.(details as Details) ?? action.replace(/_/g, ' ');
}
