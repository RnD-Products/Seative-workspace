'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useTransition } from 'react';
import { Kanban, List } from 'lucide-react';
import { NativeSelect, Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/misc';
import { cn } from '@/lib/utils';
import { PRIORITIES, PRIORITY_LABEL, TASK_STATUSES, TASK_STATUS_LABEL } from '@/lib/domain';
import type { Profile } from '@/lib/types';
import type { ProjectRef } from './types';

/** Filters live in the URL so views are shareable and survive refresh. */
export function TaskFilters({ projects, people, hide = [] }: { projects?: ProjectRef[]; people?: Profile[]; hide?: ('project' | 'assignee')[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const set = (key: string, value: string) => {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value); else next.delete(key);
    start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
  };
  const view = sp.get('view') === 'board' ? 'board' : 'list';
  const active = ['project', 'assignee', 'status', 'priority', 'due', 'q'].some((k) => sp.get(k));

  return (
    <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
      <div className="grid flex-1 grid-cols-2 gap-2 sm:grid-cols-3 lg:flex lg:flex-wrap" role="group" aria-label="Filter tasks">
        <Input aria-label="Search tasks" placeholder="Search tasks" defaultValue={sp.get('q') ?? ''} className="col-span-2 sm:col-span-1 lg:w-48"
          onKeyDown={(e) => { if (e.key === 'Enter') set('q', (e.target as HTMLInputElement).value.trim()); }}
          onBlur={(e) => { if ((sp.get('q') ?? '') !== e.target.value.trim()) set('q', e.target.value.trim()); }} />
        {!hide.includes('project') && projects && (
          <NativeSelect aria-label="Project" value={sp.get('project') ?? ''} onChange={(e) => set('project', e.target.value)} className="lg:w-44">
            <option value="">All projects</option>
            {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </NativeSelect>
        )}
        {!hide.includes('assignee') && people && (
          <NativeSelect aria-label="Assignee" value={sp.get('assignee') ?? ''} onChange={(e) => set('assignee', e.target.value)} className="lg:w-40">
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
            <option value="none">Unassigned</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </NativeSelect>
        )}
        <NativeSelect aria-label="Status" value={sp.get('status') ?? ''} onChange={(e) => set('status', e.target.value)} className="lg:w-36">
          <option value="">Any status</option>
          <option value="open">Not done</option>
          {TASK_STATUSES.map((s) => <option key={s} value={s}>{TASK_STATUS_LABEL[s]}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Priority" value={sp.get('priority') ?? ''} onChange={(e) => set('priority', e.target.value)} className="lg:w-36">
          <option value="">Any priority</option>
          {PRIORITIES.map((p) => <option key={p} value={p}>{PRIORITY_LABEL[p]}</option>)}
        </NativeSelect>
        <NativeSelect aria-label="Due date" value={sp.get('due') ?? ''} onChange={(e) => set('due', e.target.value)} className="lg:w-40">
          <option value="">Any due date</option>
          <option value="overdue">Overdue</option>
          <option value="today">Due today</option>
          <option value="week">Due in 7 days</option>
          <option value="none">No due date</option>
        </NativeSelect>
        {active && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => {
            const next = new URLSearchParams();
            if (view === 'board') next.set('view', 'board');
            start(() => router.replace(`${pathname}?${next.toString()}`, { scroll: false }));
          }}>Clear</Button>
        )}
        {pending && <Spinner className="self-center text-muted-foreground" />}
      </div>
      <div className="inline-flex self-start rounded-[10px] bg-muted p-1" role="group" aria-label="View">
        {(['list', 'board'] as const).map((v) => (
          <button key={v} onClick={() => set('view', v === 'list' ? '' : v)} aria-pressed={view === v}
            className={cn('inline-flex h-7 items-center gap-1.5 rounded-[8px] px-3 text-[13px] font-medium text-muted-foreground transition-colors', view === v && 'bg-card text-foreground shadow-lift')}>
            {v === 'list' ? <List className="size-3.5" /> : <Kanban className="size-3.5" />}{v === 'list' ? 'List' : 'Board'}
          </button>
        ))}
      </div>
    </div>
  );
}
