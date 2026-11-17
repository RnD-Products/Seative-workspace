'use client';
import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus } from 'lucide-react';
import { Spinner } from '@/components/ui/misc';
import { toast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import type { TaskStatus } from '@/lib/types';
import { createTask } from '@/app/actions/tasks';

export type QuickAddConfig = { projectId: string; selfId: string | null };

/** Type a title, press Enter: the task is created and the field stays ready for the next one. */
export function QuickAdd({ config, status = 'todo', className, compact }: { config: QuickAddConfig; status?: TaskStatus; className?: string; compact?: boolean }) {
  const router = useRouter();
  const [value, setValue] = useState('');
  const [pending, start] = useTransition();
  const ref = useRef<HTMLInputElement>(null);
  const submit = () => {
    const title = value.trim();
    if (title.length < 2) { if (title) toast.error('Give the task a title (at least 2 characters).'); return; }
    start(async () => {
      const r = await createTask({ project_id: config.projectId, title, status, priority: 'medium', assignee_id: config.selfId ?? '', description: '', start_date: '', due_date: '' });
      if (!r.ok) { toast.error(r.error); return; }
      setValue(''); toast(`Task “${title}” added`); router.refresh(); ref.current?.focus();
    });
  };
  return (
    <label className={cn('group flex items-center gap-2 rounded-md px-2 text-[13px] text-muted-foreground transition-colors focus-within:bg-card focus-within:text-foreground hover:bg-foreground/[0.03]', compact ? 'h-8' : 'h-10 px-4', className)}>
      {pending ? <Spinner className="size-3.5" /> : <Plus className="size-3.5 shrink-0" aria-hidden />}
      <span className="sr-only">Add a task</span>
      <input ref={ref} value={value} onChange={(e) => setValue(e.target.value)} disabled={pending} maxLength={200}
        placeholder={config.selfId ? 'Add a task for yourself…' : 'Add a task…'}
        onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); submit(); } if (e.key === 'Escape') { setValue(''); ref.current?.blur(); } }}
        className="min-w-0 flex-1 bg-transparent outline-none placeholder:text-muted-foreground" />
      {value.trim() && <kbd className="hidden rounded-[4px] border border-border-strong px-1.5 text-[11px] text-muted-foreground sm:inline">Enter</kbd>}
    </label>
  );
}
