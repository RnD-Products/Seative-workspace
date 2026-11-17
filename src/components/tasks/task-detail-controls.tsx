'use client';
import { toast } from '@/components/ui/toast';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { Avatar, PriorityIcon } from '@/components/badges';
import { cn } from '@/lib/utils';
import { Alert, Spinner } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL, fmtDate } from '@/lib/domain';
import type { Priority, Profile, TaskStatus } from '@/lib/types';
import type { TaskInput } from '@/lib/validation';
import { updateTaskDescription, updateTaskFields, updateTaskStatus } from '@/app/actions/tasks';
import { TaskForm } from './task-form';
import type { Me, ProjectRef } from './types';

export function StatusControl({ taskId, status }: { taskId: string; status: TaskStatus }) {
  const router = useRouter();
  const [value, setValue] = useState(status);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-1">
      <label htmlFor="task-status" className="text-xs text-muted-foreground">Status</label>
      <div className="flex items-center gap-2">
        <NativeSelect id="task-status" value={value} disabled={pending} className="w-44" onChange={(e) => {
          const next = e.target.value as TaskStatus; const prev = value; setValue(next); setError(null);
          start(async () => {
            const r = await updateTaskStatus(taskId, next);
            if (!r.ok) { setValue(prev); setError(r.error); return; }
            toast(`Status: ${TASK_STATUS_LABEL[next]}`, { action: { label: 'Undo', run: () => { setValue(prev); updateTaskStatus(taskId, prev).then(() => router.refresh()); } } });
            router.refresh();
          });
        }}>
          {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
        </NativeSelect>
        {pending && <Spinner className="text-muted-foreground" />}
      </div>
      {error && <p className="text-[13px] text-destructive">{error}</p>}
    </div>
  );
}

export function DescriptionEditor({ taskId, description, canEdit }: { taskId: string; description: string; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(description);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  if (!editing) {
    return (
      <div className="group relative">
        {description ? <p className="whitespace-pre-line text-sm leading-relaxed">{description}</p> : <p className="text-sm text-muted-foreground">No description.</p>}
        {canEdit && <Button variant="ghost" size="sm" className="mt-2" onClick={() => { setValue(description); setEditing(true); }}><Pencil /> Edit description</Button>}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <label htmlFor="desc-edit" className="sr-only">Description</label>
      <Textarea id="desc-edit" rows={8} value={value} onChange={(e) => setValue(e.target.value)} maxLength={10000} autoFocus />
      {error && <Alert tone="error">{error}</Alert>}
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={() => start(async () => {
          const r = await updateTaskDescription(taskId, value);
          if (!r.ok) setError(r.error); else { setEditing(false); toast('Description saved'); router.refresh(); }
        })}>{pending && <Spinner />} Save</Button>
        <Button size="sm" variant="ghost" onClick={() => setEditing(false)}>Cancel</Button>
      </div>
    </div>
  );
}

export function EditTaskDialog({ taskId, defaults, projects, people, me }: { taskId: string; defaults: TaskInput; projects: ProjectRef[]; people: Profile[]; me: Me }) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline"><Pencil /> Edit task</Button></DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Edit task</DialogTitle></DialogHeader>
        <TaskForm taskId={taskId} defaults={defaults} projects={projects} people={people} me={me} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}

type Field = 'priority' | 'assignee_id' | 'due_date' | 'start_date';

/** Task properties, each edited in place. Changes save on pick and confirm with a toast + Undo. */
export function TaskProperties({ task, people, canEditFields, canAssign }: {
  task: { id: string; priority: Priority; assignee_id: string | null; due_date: string | null; start_date: string | null };
  people: Pick<Profile, 'id' | 'full_name'>[];
  canEditFields: boolean;
  canAssign: boolean;
}) {
  const router = useRouter();
  const [vals, setVals] = useState({ priority: task.priority, assignee_id: task.assignee_id ?? '', due_date: task.due_date ?? '', start_date: task.start_date ?? '' });
  const [busy, setBusy] = useState<Field | null>(null);
  const save = async (field: Field, value: string, label: string, undo = true) => {
    const prev = vals[field];
    if (prev === value) return;
    setVals((v) => ({ ...v, [field]: value }));
    setBusy(field);
    const r = await updateTaskFields(task.id, { [field]: value === '' ? null : value });
    setBusy(null);
    if (!r.ok) { setVals((v) => ({ ...v, [field]: prev })); toast.error(r.error); return; }
    toast(label, undo ? { action: { label: 'Undo', run: () => save(field, prev, 'Change undone', false) } } : {});
    router.refresh();
  };
  const row = 'grid grid-cols-[88px_1fr] items-center gap-2 min-h-8';
  const ghost = 'h-8 border-transparent bg-transparent hover:border-border-strong hover:bg-card';
  const assignee = people.find((p) => p.id === vals.assignee_id);
  return (
    <dl className="space-y-1">
      <div className={row}>
        <dt className="text-[12.5px] text-muted-foreground">Priority</dt>
        <dd className="flex items-center gap-1.5">
          {canEditFields ? (
            <span className="relative flex w-full items-center">
              <PriorityIcon priority={vals.priority as Priority} className="pointer-events-none absolute left-2.5" />
              <NativeSelect aria-label="Priority" value={vals.priority} className={cn(ghost, 'pl-8')}
                onChange={(e) => save('priority', e.target.value, `Priority: ${PRIORITY_LABEL[e.target.value as Priority]}`)}>
                {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
              </NativeSelect>
            </span>
          ) : <span className="flex items-center gap-1.5 px-2.5"><PriorityIcon priority={vals.priority as Priority} />{PRIORITY_LABEL[vals.priority as Priority]}</span>}
          {busy === 'priority' && <Spinner className="text-muted-foreground" />}
        </dd>
      </div>
      <div className={row}>
        <dt className="text-[12.5px] text-muted-foreground">Assignee</dt>
        <dd className="flex items-center gap-1.5">
          {canAssign ? (
            <span className="relative flex w-full items-center">
              <Avatar person={assignee ?? null} className="pointer-events-none absolute left-2" />
              <NativeSelect aria-label="Assignee" value={vals.assignee_id} className={cn(ghost, 'pl-9')}
                onChange={(e) => save('assignee_id', e.target.value, e.target.value ? `Assigned to ${people.find((p) => p.id === e.target.value)?.full_name}` : 'Unassigned')}>
                <option value="">Unassigned</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </NativeSelect>
            </span>
          ) : <span className="flex items-center gap-2 px-2.5"><Avatar person={assignee ?? null} />{assignee?.full_name ?? 'Unassigned'}</span>}
          {busy === 'assignee_id' && <Spinner className="text-muted-foreground" />}
        </dd>
      </div>
      {(['due_date', 'start_date'] as const).map((f) => (
        <div key={f} className={row}>
          <dt className="text-[12.5px] text-muted-foreground">{f === 'due_date' ? 'Due' : 'Start'}</dt>
          <dd className="flex items-center gap-1.5">
            {canEditFields ? (
              <>
                <Input type="date" aria-label={f === 'due_date' ? 'Due date' : 'Start date'} value={vals[f]} className={cn(ghost, 'tabular', f === 'due_date' && vals.due_date && vals.due_date < new Date().toISOString().slice(0, 10) && 'text-destructive')}
                  onChange={(e) => save(f, e.target.value, e.target.value ? `${f === 'due_date' ? 'Due' : 'Start'} date: ${fmtDate(e.target.value)}` : `${f === 'due_date' ? 'Due' : 'Start'} date cleared`)} />
                {vals[f] && <button type="button" onClick={() => save(f, '', `${f === 'due_date' ? 'Due' : 'Start'} date cleared`)} className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Clear date"><X className="size-3.5" /></button>}
              </>
            ) : <span className="px-2.5 tabular">{vals[f] ? fmtDate(vals[f]) : '—'}</span>}
            {busy === f && <Spinner className="text-muted-foreground" />}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/** Click the title to rename; Enter saves, Esc cancels. */
export function TitleEditor({ taskId, title, canEdit }: { taskId: string; title: string; canEdit: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(title);
  const [pending, start] = useTransition();
  const committing = useRef(false);
  if (!canEdit) return <>{title}</>;
  if (!editing) {
    return (
      <button type="button" onClick={() => { setValue(title); setEditing(true); }} title="Click to rename"
        className="-mx-1.5 rounded-md px-1.5 text-left transition-colors hover:bg-foreground/[0.05]">{title}</button>
    );
  }
  const commit = () => {
    if (committing.current) return;
    const next = value.trim();
    if (!next || next === title) { setEditing(false); return; }
    committing.current = true;
    start(async () => {
      const r = await updateTaskFields(taskId, { title: next });
      committing.current = false;
      if (!r.ok) { toast.error(r.error); return; }
      setEditing(false); toast('Task renamed'); router.refresh();
    });
  };
  return (
    <input autoFocus value={value} maxLength={200} disabled={pending} aria-label="Task title"
      onChange={(e) => setValue(e.target.value)} onBlur={commit}
      onKeyDown={(e) => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') setEditing(false); }}
      className="-mx-1.5 w-full rounded-md border border-primary/50 bg-card px-1.5 text-foreground outline-none ring-[3px] ring-primary/20" />
  );
}
