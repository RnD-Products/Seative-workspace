'use client';
import { toast } from '@/components/ui/toast';
import Link from 'next/link';
import { useEffect, useRef, useState, useTransition } from 'react';
import { ListChecks } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { NativeSelect } from '@/components/ui/input';
import { Alert, EmptyState } from '@/components/ui/misc';
import { Avatar, PriorityIcon, StatusIcon } from '@/components/badges';
import { cn } from '@/lib/utils';
import { PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, daysUntil, dueLabel, isOverdue } from '@/lib/domain';
import { projectColor } from '@/lib/colors';
import type { Profile, Task, TaskStatus } from '@/lib/types';
import { updateTaskStatus } from '@/app/actions/tasks';
import { canManageRef, type Me, type ProjectRef } from './types';
import { QuickAdd, type QuickAddConfig } from './quick-add';

function useTaskState(initial: Task[]) {
  const [tasks, setTasks] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [, start] = useTransition();
  const latest = useRef(tasks);
  latest.current = tasks;
  useEffect(() => setTasks(initial), [initial]);
  const move = (id: string, status: TaskStatus, undoable = true) => {
    const before = latest.current;
    const prev = before.find((t) => t.id === id)?.status;
    if (!prev || prev === status) return;
    setTasks((ts) => ts.map((t) => (t.id === id ? { ...t, status } : t))); // optimistic
    setError(null);
    start(async () => {
      const res = await updateTaskStatus(id, status);
      if (!res.ok) { setTasks(before); toast.error(res.error); return; }
      const title = before.find((t) => t.id === id)?.title ?? 'Task';
      toast(status === 'done' ? `“${title}” marked done` : `“${title}” moved to ${TASK_STATUS_LABEL[status]}`,
        undoable ? { action: { label: 'Undo', run: () => move(id, prev, false) } } : {});
    });
  };
  return { tasks, move, error };
}

export function TaskViews({ view, tasks: initial, projects, people, me, showProject = true, emptyTitle, emptyDescription, emptyAction, quickAdd }: {
  view: 'list' | 'board';
  tasks: Task[];
  projects: ProjectRef[];
  people: Profile[];
  me: Me;
  showProject?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  /** When set, an inline "add a task" row appears (project pages). */
  quickAdd?: QuickAddConfig;
}) {
  const { tasks, move, error } = useTaskState(initial);
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const peopleMap = new Map(people.map((p) => [p.id, p]));
  const canEdit = (t: Task) => t.assignee_id === me.id || canManageRef(projectMap.get(t.project_id), me);

  if (!tasks.length) {
    return (
      <Card>
        <EmptyState icon={ListChecks} title={emptyTitle ?? 'No tasks match'} description={emptyDescription ?? 'Try changing the filters.'} action={emptyAction} />
        {quickAdd && <div className="border-t"><QuickAdd config={quickAdd} /></div>}
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      {view === 'board' ? (
        <Board tasks={tasks} move={move} canEdit={canEdit} projectMap={projectMap} peopleMap={peopleMap} showProject={showProject} quickAdd={quickAdd} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-[13px]">
              <thead className="border-b bg-muted/40 text-left text-[12px] text-muted-foreground">
                <tr>
                  <th className="py-2 pl-4 pr-2 font-medium">Task</th>
                  {showProject && <th className="py-2 font-medium">Project</th>}
                  <th className="py-2 font-medium">Assignee</th>
                  <th className="py-2 font-medium">Priority</th>
                  <th className="py-2 font-medium">Due</th>
                  <th className="py-2 pl-2 pr-4 font-medium">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tasks.map((t) => {
                  const assignee = t.assignee_id ? peopleMap.get(t.assignee_id) : null;
                  return (
                    <tr key={t.id} className="group transition-colors hover:bg-foreground/[0.025]">
                      <td className="py-2 pl-4 pr-2"><span className="flex items-center gap-2.5"><DoneToggle task={t} editable={canEdit(t)} move={move} /><Link href={`/tasks/${t.id}`} className="truncate font-medium group-hover:text-foreground">{t.title}</Link></span></td>
                      {showProject && <td className="py-2 text-muted-foreground"><span className="flex items-center gap-2"><span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: projectColor(t.project_id) }} /><span className="truncate">{projectMap.get(t.project_id)?.name ?? '—'}</span></span></td>}
                      <td className="py-2"><span className="flex items-center gap-2"><Avatar person={assignee} /><span className="truncate text-foreground/85">{assignee?.full_name ?? 'Unassigned'}</span></span></td>
                      <td className="py-2"><span className="flex items-center gap-1.5 text-foreground/85"><PriorityIcon priority={t.priority} />{PRIORITY_LABEL[t.priority]}</span></td>
                      <td className={cn('py-2 whitespace-nowrap text-muted-foreground tabular', isOverdue(t) && 'font-medium text-destructive')}>{dueLabel(t)}</td>
                      <td className="py-1.5 pl-2 pr-4">
                        <NativeSelect aria-label={`Status of ${t.title}`} value={t.status} disabled={!canEdit(t)} onChange={(e) => move(t.id, e.target.value as TaskStatus)} className="h-7 w-32 border-transparent bg-transparent text-[12.5px] hover:border-border-strong hover:bg-card disabled:opacity-70">
                          {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
                        </NativeSelect>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {quickAdd && <div className="border-t"><QuickAdd config={quickAdd} /></div>}
        </Card>
      )}
    </div>
  );
}

function Board({ tasks, move, canEdit, projectMap, peopleMap, showProject, quickAdd }: {
  tasks: Task[]; move: (id: string, s: TaskStatus) => void; canEdit: (t: Task) => boolean;
  projectMap: Map<string, ProjectRef>; peopleMap: Map<string, Profile>; showProject: boolean; quickAdd?: QuickAddConfig;
}) {
  const [dragId, setDragId] = useState<string | null>(null);
  const [over, setOver] = useState<TaskStatus | null>(null);
  return (
    <div className="grid gap-3 overflow-x-auto pb-2 md:grid-cols-2 xl:grid-cols-4">
      {TASK_STATUSES.map((col) => {
        const list = tasks.filter((t) => t.status === col);
        return (
          <section
            key={col}
            aria-label={TASK_STATUS_LABEL[col]}
            onDragOver={(e) => { if (dragId) { e.preventDefault(); setOver(col); } }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setOver(null); }}
            onDrop={() => { if (dragId) move(dragId, col); setDragId(null); setOver(null); }}
            className={cn('min-h-48 rounded-lg border border-transparent bg-foreground/[0.02] p-1.5 transition-colors', over === col && 'border-primary/40 bg-primary-soft')}
          >
            <h3 className="flex items-center gap-2 px-2 pb-2 pt-1.5 text-[13px] font-medium">
              <StatusIcon status={col} />{TASK_STATUS_LABEL[col]}
              <span className="text-[12px] font-normal text-muted-foreground tabular">{list.length}</span>
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
                    className={cn('lift sheen glow-ring rounded-md border border-border-strong/70 bg-card p-2.5 hover:border-primary/40', editable && 'cursor-grab active:cursor-grabbing', dragId === t.id && 'opacity-40')}
                  >
                    {showProject && <p className="mb-1 flex items-center gap-1.5 truncate text-[12px] text-muted-foreground"><span aria-hidden className="size-2 rounded-[2px]" style={{ background: projectColor(t.project_id) }} />{projectMap.get(t.project_id)?.name}</p>}
                    <Link href={`/tasks/${t.id}`} className="block text-[13px] font-medium leading-snug">{t.title}</Link>
                    <div className="mt-2 flex items-center gap-2 text-[12px]">
                      <PriorityIcon priority={t.priority} />
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
            {list.length === 0 && !quickAdd && <p className="px-1.5 py-6 text-center text-xs text-muted-foreground">No tasks</p>}
            {quickAdd && <QuickAdd config={quickAdd} status={col} compact className="mt-1.5" />}
          </section>
        );
      })}
    </div>
  );
}

/** The status mark doubles as a checkbox: click to mark done (or reopen). */
function DoneToggle({ task, editable, move }: { task: Task; editable: boolean; move: (id: string, s: TaskStatus) => void }) {
  if (!editable) return <StatusIcon status={task.status} />;
  const done = task.status === 'done';
  return (
    <button type="button" onClick={() => move(task.id, done ? 'todo' : 'done')}
      title={done ? 'Reopen task' : 'Mark as done'} aria-label={done ? `Reopen ${task.title}` : `Mark ${task.title} as done`}
      className="group/done relative grid size-5 shrink-0 place-items-center rounded-full transition-transform hover:scale-110 active:scale-95">
      <StatusIcon status={task.status} className={cn(!done && 'group-hover/done:opacity-0')} />
      {!done && <StatusIcon status="done" className="absolute opacity-0 transition-opacity group-hover/done:opacity-60" />}
    </button>
  );
}
