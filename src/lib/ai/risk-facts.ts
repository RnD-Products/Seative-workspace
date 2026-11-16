import { differenceInCalendarDays, parseISO } from 'date-fns';
import { daysUntil, fmtDate, projectStats, TASK_STATUS_LABEL } from '@/lib/domain';
import type { Project, Task } from '@/lib/types';

/**
 * Observed facts, computed from database records only. These are shown as-is (they are
 * not AI output) and are the only evidence the AI may cite when interpreting risk.
 */
export interface RiskFact {
  id: string;
  kind: 'overdue' | 'due_soon_not_started' | 'stalled' | 'project_overdue' | 'deadline_pressure' | 'unassigned_due_soon' | 'blocked_mention';
  label: string;
  detail: string;
  taskIds: string[];
}

const BLOCK_WORDS = /\b(blocked|blocker|waiting on|stuck|can't proceed|cannot proceed)\b/i;

export function observeRisks(
  project: Pick<Project, 'status' | 'due_date' | 'start_date' | 'name'>,
  tasks: Task[],
  comments: { task_id: string; body: string; created_at: string }[] = [],
): RiskFact[] {
  if (project.status === 'completed') return [];
  const facts: RiskFact[] = [];
  const open = tasks.filter((t) => t.status !== 'done');

  for (const t of open) {
    if (t.due_date && daysUntil(t.due_date) < 0) {
      facts.push({ id: `overdue:${t.id}`, kind: 'overdue', label: `Overdue: ${t.title}`, detail: `Was due ${fmtDate(t.due_date)} (${-daysUntil(t.due_date)} days ago); status is ${TASK_STATUS_LABEL[t.status]}.`, taskIds: [t.id] });
    } else if (t.due_date && daysUntil(t.due_date) <= 3 && t.status === 'todo') {
      facts.push({ id: `soon:${t.id}`, kind: 'due_soon_not_started', label: `Due soon, not started: ${t.title}`, detail: `Due ${fmtDate(t.due_date)} and still in To do.`, taskIds: [t.id] });
    }
    if (!t.assignee_id && t.due_date && daysUntil(t.due_date) <= 7) {
      facts.push({ id: `unassigned:${t.id}`, kind: 'unassigned_due_soon', label: `Unassigned: ${t.title}`, detail: `No assignee and due ${fmtDate(t.due_date)}.`, taskIds: [t.id] });
    }
    const idle = differenceInCalendarDays(new Date(), parseISO(t.updated_at));
    if ((t.status === 'in_progress' || t.status === 'in_review') && idle >= 7) {
      facts.push({ id: `stalled:${t.id}`, kind: 'stalled', label: `No updates: ${t.title}`, detail: `${TASK_STATUS_LABEL[t.status]} with no changes for ${idle} days.`, taskIds: [t.id] });
    }
  }

  // Comments that explicitly mention being blocked (last 14 days, open tasks only).
  const openIds = new Set(open.map((t) => t.id));
  const blocked = new Map<string, string>();
  for (const c of comments) {
    if (openIds.has(c.task_id) && BLOCK_WORDS.test(c.body) && differenceInCalendarDays(new Date(), parseISO(c.created_at)) <= 14) {
      blocked.set(c.task_id, c.created_at);
    }
  }
  for (const [taskId, at] of blocked) {
    const t = tasks.find((x) => x.id === taskId)!;
    facts.push({ id: `blocked:${taskId}`, kind: 'blocked_mention', label: `Reported blocked: ${t.title}`, detail: `A comment on ${fmtDate(at.slice(0, 10))} mentions being blocked or waiting.`, taskIds: [taskId] });
  }

  const s = projectStats(tasks);
  if (project.due_date) {
    const left = daysUntil(project.due_date);
    if (left < 0 && s.done < s.total) {
      facts.push({ id: 'project:overdue', kind: 'project_overdue', label: 'Project is past its due date', detail: `Due ${fmtDate(project.due_date)}; ${s.total - s.done} of ${s.total} tasks still open.`, taskIds: [] });
    } else if (left >= 0 && left <= 14 && s.total > 0 && s.percent < 60) {
      facts.push({ id: 'project:pressure', kind: 'deadline_pressure', label: 'Deadline approaching', detail: `${left} days left with ${s.percent}% of tasks done (${s.total - s.done} open).`, taskIds: [] });
    }
  }
  return facts;
}
