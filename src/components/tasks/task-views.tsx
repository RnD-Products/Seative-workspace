'use client';
import Link from 'next/link';
import { useEffect, useState, useTransition } from 'react';
import { ListChecks } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/misc';
import { Avatar, PriorityBadge } from '@/components/badges';
import { cn } from '@/lib/utils';
import { TASK_STATUSES, TASK_STATUS_LABEL, daysUntil, dueLabel, isOverdue } from '@/lib/domain';
import { projectColor } from '@/lib/colors';
import type { Profile, Task, TaskStatus } from '@/lib/types';
import { updateTaskStatus } from '@/app/actions/tasks';
import { canManageRef, type Me, type ProjectRef } from './types';

const COLUMN_ACCENT: Record<TaskStatus, string> = {
  todo: 'bg-[#94a0b8]', in_progress: 'bg-info', in_review: 'bg-warning', done: 'bg-success',
};

function useTaskState(initial: Task[]) {
  const [tasks, setTasks] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  useEffect(() => setTasks(initial), [initial]);
  const move = (id: string, status: TaskStatus) => {
    const before = tasks;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t))); // optimistic
    setError(null);
    start(async () => {
      const res = await updateTaskStatus(id, status);
      if (!res.ok) { setTasks(before); setError(res.error); }
    });
  };
  return { tasks, move, error };
}

export function TaskViews({ view, tasks: initial, projects, people, me, showProject = true, emptyTitle, emptyDescription, emptyAction }: {
  view: 'list' | 'board';
  tasks: Task[];
  projects: ProjectRef[];
  people: Profile[];
  me: Me;
  showProject?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
}) {
  const { tasks, move, error } = useTaskState(initial);
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const peopleMap = new Map(people.map((p) => [p.id, p]));
  const canEdit = (t: Task) => t.assignee_id === me.id || canManageRef(projectMap.get(t.project_id), me);

  if (!tasks.length) {
    return <Card><EmptyState icon={ListChecks} title={emptyTitle ?? 'No tasks match'} description={emptyDescription ?? 'Try changing the filters.'} action={emptyAction} /></Card>;
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {view === 'board' ? (
        <Board tasks={tasks} move={move} canEdit={canEdit} projectMap={projectMap} peopleMap={peopleMap} showProject={showProject} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead className="border-b text-left text-[13px] text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">Task</th>
                  {showProject && <th className="py-2.5 font-medium">Project</th>}
                  <th className="py-2.5 font-medium">Assignee</th>
                  <th className="py-2.5 font-medium">Priority</th>
                  <th className="py-2.5 font-medium">Due</th>
                  <th className="px-4 py-2.5 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tasks.map((t) => {
                  const assignee = t.assignee_id ? peopleMap.get(t.assignee_id) : null;
                  return (
                    <tr key={t.id} className="hover:bg-muted/30">
                      <td className="px-4 py-2.5"><Link href={`/tasks/${t.id}`} className="flex items-center gap-2.5 font-medium hover:text-primary"><span aria-hidden className="size-2 shrink-0 rounded-[3px]" style={{ background: projectColor(t.project_id) }} />{t.title}</Link></td>
                      {showProject && <td className="py-2.5 text-muted-foreground">{projectMap.get(t.project_id)?.name ?? '—'}</td>}
                      <td className="py-2.5"><span className="flex items-center gap-2"><Avatar person={assignee} /><span className="truncate">{assignee?.full_name ?? 'Unassigned'}</span></span></td>
                      <td className="py-2.5"><PriorityBadge priority={t.priority} /></td>
                      <td className={cn('py-2.5 whitespace-nowrap text-muted-foreground', isOverdue(t) && 'font-medium text-destructive')}>{dueLabel(t)}</td>
                      <td className="px-4 py-2">
                        <NativeSelect aria-label={`Status of ${t.title}`} value={t.status} disabled={!canEdit(t)} onChange={(e) => move(t.id, e.target.value as TaskStatus)} className="h-8 w-36 text-[13px]">
                          {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
                        </NativeSelect>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function Board({ tasks, move, canEdit, projectMap, peopleMap, showProject }: {
  tasks: Task[]; move: (id: string, s: TaskStatus) => void; canEdit: (t: Task) => boolean;
  projectMap: Map<string, ProjectRef>; peopleMap: Map<string, Profile>; showProject: boolean;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  return (
    <div className="grid gap-4 overflow-x-auto pb-2 md:grid-cols-2 xl:grid-cols-4">
      {TASK_STATUSES.map((col) => {
        const list = tasks.filter((t) => t.status === col);
        return (
          <section
            key={col}
            aria-label={TASK_STATUS_LABEL[col]}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setOver(col); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
            onDrop={() => { if (dragId) move(dragId, col); setDragId(null); setOver(null); }}
            className={cn('min-h-48 rounded-[16px] bg-muted/60 p-2 transition-colors', over === col && 'bg-primary-soft outline-2 outline-dashed outline-primary/40')}
          >
            <h3 className="flex items-center gap-2 px-2 pb-2.5 pt-1 text-sm font-semibold">
              <span className={cn('size-2 rounded-full', COLUMN_ACCENT[col])} aria-hidden />{TASK_STATUS_LABEL[col]}
              <span className="ml-auto rounded-full bg-card px-2 py-0.5 text-xs font-medium text-muted-foreground tabular">{list.length}</span>
            </h3>
            <ul className="space-y-2">
              {list.map((t) => {
                const editable = canEdit(t);
                const assignee = t.assignee_id ? peopleMap.get(t.assignee_id) : null;
                return (
                  <li
                    key={t.id}
                    draggable={editable}
                    onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragId(t.id); }}
                    onDragEnd={() => { setDragId(null); setOver(null); }}
                    className={cn('rounded-[12px] border bg-card p-3 shadow-lift transition-transform', editable && 'cursor-grab active:cursor-grabbing active:rotate-1', dragId === t.id && 'opacity-40')}
                  >
                    {showProject && <p className="mb-1.5 flex items-center gap-1.5 truncate text-xs text-muted-foreground"><span aria-hidden className="size-2 rounded-[3px]" style={{ background: projectColor(t.project_id) }} />{projectMap.get(t.project_id)?.name}</p>}
                    <Link href={`/tasks/${t.id}`} className="block text-sm font-medium leading-snug hover:text-primary">{t.title}</Link>
                    <div className="mt-2.5 flex items-center gap-2 text-xs">
                      <PriorityBadge priority={t.priority} />
                      <span className={cn('text-muted-foreground', isOverdue(t) && 'font-medium text-destructive', !isOverdue(t) && t.status !== 'done' && t.due_date && daysUntil(t.due_date) <= 2 && 'font-medium text-deadline')}>{dueLabel(t)}</span>
                      <Avatar person={assignee} className="ml-auto" />
                    </div>
                    {editable && (
                      // Keyboard / touch alternative to drag-and-drop.
                      <label className="mt-2 block md:sr-only md:focus-within:not-sr-only">
                        <span className="sr-only">Move {t.title} to</span>
                        <NativeSelect value={t.status} onChange={(e) => move(t.id, e.target.value as TaskStatus)} className="h-7 text-xs">
                          {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
                        </NativeSelect>
                      </label>
                    )}
                  </li>
                );
              })}
            </ul>
            {list.length === 0 && <p className="px-1.5 py-6 text-center text-xs text-muted-foreground">No tasks</p>}
          </section>
        );
      })}
    </div>
  );
}
