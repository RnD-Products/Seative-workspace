'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, Check, Hand, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { Spinner } from '@/components/ui/misc';
import { toast } from '@/components/ui/toast';
import { Avatar } from '@/components/badges';
import { assignManager, startProject, takeProject } from '@/app/actions/sales';
import { cn } from '@/lib/utils';

export function TakeProjectButton({ projectId, name }: { projectId: string; name: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button disabled={pending} onClick={() => start(async () => {
      const r = await takeProject(projectId);
      if (!r.ok) { toast.error(r.error); router.refresh(); return; }
      toast(`You're managing “${name}”. Pick the team next.`);
      router.push(`/projects/${projectId}/start`);
    })}>{pending ? <Spinner /> : <Hand />} Take this project</Button>
  );
}

export function AssignManagerControl({ projectId, managers, current }: { projectId: string; managers: { id: string; full_name: string }[]; current: string | null }) {
  const router = useRouter();
  const [value, setValue] = useState(current ?? '');
  const [pending, start] = useTransition();
  return (
    <div className="flex gap-2">
      <NativeSelect aria-label="Project manager" value={value} onChange={(e) => setValue(e.target.value)} className="min-w-44">
        <option value="">Choose a PM…</option>
        {managers.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
      </NativeSelect>
      <Button variant="outline" disabled={!value || value === current || pending} onClick={() => start(async () => {
        const r = await assignManager(projectId, value);
        if (!r.ok) { toast.error(r.error); return; }
        toast(`Assigned to ${managers.find((m) => m.id === value)?.full_name}`); router.refresh();
      })}>{pending ? <Spinner /> : <Check />} Assign</Button>
    </div>
  );
}

export type Candidate = {
  id: string; full_name: string; job_title: string | null; role: string; skills: string[];
  open: number; dueWeek: number; overdue: number; weekMinutes: number; current: boolean;
};

/** Choose the team using the deal's required skills and everyone's current workload. */
export function TeamPicker({ projectId, candidates, required, defaultStart }: { projectId: string; candidates: Candidate[]; required: string[]; defaultStart: string }) {
  const router = useRouter();
  const [picked, setPicked] = useState<Set<string>>(() => new Set(candidates.filter((c) => c.current).map((c) => c.id)));
  const [q, setQ] = useState('');
  const [startDate, setStartDate] = useState(defaultStart);
  const [pending, start] = useTransition();
  const req = required.map((r) => r.toLowerCase());
  const score = (c: Candidate) => c.skills.filter((s) => req.includes(s.toLowerCase())).length;
  const list = candidates
    .filter((c) => !q || `${c.full_name} ${c.job_title ?? ''} ${c.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => score(b) - score(a) || a.open - b.open || a.full_name.localeCompare(b.full_name));
  const toggle = (id: string) => setPicked((s) => { const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const load = (c: Candidate) => (c.overdue > 0 || c.open >= 12 ? 'Busy' : c.open >= 6 ? 'Moderate' : 'Light');

  return (
    <div className="space-y-4">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, title or skill" className="pl-8" />
      </div>
      <ul className="divide-y rounded-lg border">
        {list.map((c) => {
          const on = picked.has(c.id);
          const match = score(c);
          const l = load(c);
          return (
            <li key={c.id}>
              <label className={cn('flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-foreground/[0.03]', on && 'bg-primary-soft hover:bg-primary-soft')}>
                <input type="checkbox" checked={on} onChange={() => toggle(c.id)} className="size-4 accent-[var(--primary)]" />
                <Avatar person={c} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13px] font-medium">{c.full_name}{match > 0 && <span className="rounded-full bg-success-soft px-1.5 text-[11px] font-medium text-success">{match} skill match</span>}</p>
                  <p className="truncate text-[12px] text-muted-foreground">{c.job_title ?? c.role}</p>
                  {c.skills.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {c.skills.map((s) => <span key={s} className={cn('rounded-[4px] border px-1.5 text-[11px]', req.includes(s.toLowerCase()) ? 'border-success/40 bg-success-soft text-success' : 'border-border-strong text-muted-foreground')}>{s}</span>)}
                    </div>
                  )}
                </div>
                <div className="hidden shrink-0 text-right text-[12px] sm:block">
                  <p className={cn('font-medium', l === 'Busy' ? 'text-destructive' : l === 'Moderate' ? 'text-deadline' : 'text-success')}>{l}</p>
                  <p className="text-muted-foreground tabular">{c.open} open · {c.dueWeek} due this week{c.overdue ? ` · ${c.overdue} overdue` : ''}</p>
                  <p className="text-muted-foreground tabular">{(c.weekMinutes / 60).toFixed(1)}h logged this week</p>
                </div>
              </label>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-end sm:justify-between">
        <label className="text-[12.5px] text-muted-foreground">Start date
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-44" />
        </label>
        <Button disabled={pending || picked.size === 0} onClick={() => start(async () => {
          const r = await startProject(projectId, [...picked], startDate);
          if (!r.ok) { toast.error(r.error); return; }
          toast(`Project started with ${picked.size} ${picked.size === 1 ? 'person' : 'people'}. They've been notified.`);
          router.push(`/projects/${projectId}`);
        })}>{pending ? <Spinner /> : <ArrowRight />} Start project with {picked.size} {picked.size === 1 ? 'person' : 'people'}</Button>
      </div>
    </div>
  );
}
