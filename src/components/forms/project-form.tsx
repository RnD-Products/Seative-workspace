'use client';
import { toast } from '@/components/ui/toast';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { FormField, Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, Spinner } from '@/components/ui/misc';
import { Avatar } from '@/components/badges';
import { projectSchema, type ProjectInput } from '@/lib/validation';
import { PRIORITIES, PRIORITY_LABEL, PROJECT_STATUSES, PROJECT_STATUS_LABEL, ROLE_LABEL } from '@/lib/domain';
import type { Profile } from '@/lib/types';
import { createProject, updateProject } from '@/app/actions/projects';

export function ProjectForm({ projectId, defaults, people, me }: {
  projectId?: string;
  defaults?: Partial<ProjectInput>;
  people: Profile[];
  me: Pick<Profile, 'id' | 'role'>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const form = useForm<ProjectInput>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      name: '', description: '', status: 'planning', priority: 'medium', start_date: '', due_date: '',
      manager_id: me.role === 'pm' ? me.id : '', member_ids: [], ...defaults,
    },
  });
  const { errors } = form.formState;
  const memberIds = form.watch('member_ids') ?? [];
  const managers = people.filter((p) => p.role === 'pm' || p.role === 'ceo');
  const isCeo = me.role === 'ceo';

  const toggleMember = (id: string, on: boolean) =>
    form.setValue('member_ids', on ? [...memberIds, id] : memberIds.filter((m) => m !== id), { shouldDirty: true });

  return (
    <form
      noValidate
      className="space-y-5"
      onSubmit={form.handleSubmit((values) => start(async () => {
        setError(null);
        const res = projectId ? await updateProject(projectId, values) : await createProject(values);
        if (!res.ok) {
          setError(res.error);
          Object.entries(res.fieldErrors ?? {}).forEach(([k, v]) => form.setError(k as keyof ProjectInput, { message: v[0] }));
          return;
        }
        const id = projectId ?? (res.data as { id: string }).id;
        toast(projectId ? 'Project saved' : `Project “${values.name}” created`);
        router.push(`/projects/${id}`);
        router.refresh();
      }))}
    >
      {error && <Alert tone="error">{error}</Alert>}
      <FormField id="name" label="Project name" error={errors.name?.message}>
        <Input placeholder="e.g. Website redesign" {...form.register('name')} />
      </FormField>
      <FormField id="description" label="Description" hint="What is this project for, and what does done look like?" error={errors.description?.message}>
        <Textarea rows={4} {...form.register('description')} />
      </FormField>
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="status" label="Status"><NativeSelect {...form.register('status')}>{PROJECT_STATUSES.map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}</NativeSelect></FormField>
        <FormField id="priority" label="Priority"><NativeSelect {...form.register('priority')}>{PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}</NativeSelect></FormField>
        <FormField id="start_date" label="Start date" error={errors.start_date?.message}><Input type="date" {...form.register('start_date')} /></FormField>
        <FormField id="due_date" label="Due date" error={errors.due_date?.message}><Input type="date" {...form.register('due_date')} /></FormField>
      </div>
      <FormField id="manager_id" label="Project manager" hint={isCeo ? 'Only PMs and the CEO can manage projects.' : 'Only the CEO can change the project manager.'} error={errors.manager_id?.message}>
        <NativeSelect disabled={!isCeo} {...form.register('manager_id')}>
          {isCeo && <option value="">Choose a manager…</option>}
          {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name} ({ROLE_LABEL[m.role]})</option>)}
        </NativeSelect>
      </FormField>
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Members</legend>
        <p className="text-[13px] text-muted-foreground">Members can see this project and be assigned tasks.</p>
        <div className="grid max-h-64 gap-1 overflow-y-auto rounded-md border p-2 sm:grid-cols-2">
          {people.map((p) => (
            <Label key={p.id} htmlFor={`m-${p.id}`} className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 font-normal hover:bg-muted">
              <Checkbox id={`m-${p.id}`} checked={memberIds.includes(p.id)} onCheckedChange={(c) => toggleMember(p.id, c === true)} />
              <Avatar person={p} />
              <span className="min-w-0 truncate">{p.full_name}<span className="ml-1 text-xs text-muted-foreground">{p.job_title ?? ROLE_LABEL[p.role]}</span></span>
            </Label>
          ))}
        </div>
      </fieldset>
      <div className="flex justify-end gap-2 border-t pt-5">
        <Button type="button" variant="outline" onClick={() => router.back()}>Cancel</Button>
        <Button type="submit" disabled={pending}>{pending && <Spinner />}{projectId ? 'Save changes' : 'Create project'}</Button>
      </div>
    </form>
  );
}
