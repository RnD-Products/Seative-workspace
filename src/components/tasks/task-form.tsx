'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { Alert, Spinner } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { taskSchema, type TaskInput } from '@/lib/validation';
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL } from '@/lib/domain';
import type { Profile } from '@/lib/types';
import { createTask, updateTask } from '@/app/actions/tasks';
import type { ProjectRef } from './types';

export function TaskForm({ taskId, defaults, projects, people, onDone }: {
  taskId?: string;
  defaults?: Partial<TaskInput>;
  projects: ProjectRef[]; // projects the user can manage
  people: Profile[];
  onDone?: (id: string) => void;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<TaskInput>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      project_id: projects[0]?.id ?? '', title: '', description: '', status: 'todo', priority: 'medium',
      assignee_id: '', start_date: '', due_date: '', ...defaults,
    },
  });
  const { errors } = form.formState;
  const projectId = form.watch('project_id');
  const project = projects.find((p) => p.id === projectId);
  const assignable = people.filter((p) => project && (project.memberIds.includes(p.id) || project.manager_id === p.id));

  return (
    <form
      noValidate
      className="space-y-4"
      onSubmit={form.handleSubmit((values) => start(async () => {
        setError(null);
        const res = taskId ? await updateTask(taskId, values) : await createTask(values);
        if (!res.ok) {
          setError(res.error);
          Object.entries(res.fieldErrors ?? {}).forEach(([k, v]) => form.setError(k as keyof TaskInput, { message: v[0] }));
          return;
        }
        router.refresh();
        onDone?.(taskId ?? (res.data as { id: string }).id);
      }))}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <FormField id="title" label="Title" error={errors.title?.message}>
        <Input placeholder="What needs to be done?" {...form.register('title')} />
      </FormField>
      <FormField id="description" label="Description" error={errors.description?.message}>
        <Textarea rows={4} placeholder="Details, links, acceptance criteria…" {...form.register('description')} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="project_id" label="Project" error={errors.project_id?.message}>
          <NativeSelect {...form.register('project_id', { onChange: () => form.setValue('assignee_id', '') })}>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        </FormField>
        <FormField id="assignee_id" label="Assignee" hint={assignable.length ? undefined : 'Add members to the project to assign tasks.'} error={errors.assignee_id?.message}>
          <NativeSelect {...form.register('assignee_id')}>
            <option value="">Unassigned</option>
            {assignable.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </NativeSelect>
        </FormField>
        <FormField id="status" label="Status"><NativeSelect {...form.register('status')}>{TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}</NativeSelect></FormField>
        <FormField id="priority" label="Priority"><NativeSelect {...form.register('priority')}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</NativeSelect></FormField>
        <FormField id="start_date" label="Start date" error={errors.start_date?.message}><Input type="date" {...form.register('start_date')} /></FormField>
        <FormField id="due_date" label="Due date" error={errors.due_date?.message}><Input type="date" {...form.register('due_date')} /></FormField>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="submit" disabled={pending}>{pending && <Spinner />}{taskId ? 'Save task' : 'Create task'}</Button>
      </div>
    </form>
  );
}

export function NewTaskDialog({ projects, people, defaults, label = 'New task', variant = 'default' }: {
  projects: ProjectRef[]; people: Profile[]; defaults?: Partial<TaskInput>; label?: string; variant?: 'default' | 'outline';
}) {
  const [open, setOpen] = useState(false);
  if (!projects.length) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant={variant}><Plus /> {label}</Button></DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>New task</DialogTitle><DialogDescription>Assignees must be members of the project.</DialogDescription></DialogHeader>
        <TaskForm projects={projects} people={people} defaults={defaults} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  );
}
