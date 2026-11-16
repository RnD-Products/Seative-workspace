'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { NativeSelect, Textarea } from '@/components/ui/input';
import { Alert, Spinner } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { TASK_STATUSES, TASK_STATUS_LABEL } from '@/lib/domain';
import type { Profile, TaskStatus } from '@/lib/types';
import type { TaskInput } from '@/lib/validation';
import { updateTaskDescription, updateTaskStatus } from '@/app/actions/tasks';
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
          start(async () => { const r = await updateTaskStatus(taskId, next); if (!r.ok) { setValue(prev); setError(r.error); } else router.refresh(); });
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
          if (!r.ok) setError(r.error); else { setEditing(false); router.refresh(); }
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
