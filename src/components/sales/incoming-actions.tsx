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
  dueDate: string | null; brief: string;
};

type Plan = { due_date: string; brief: string; create_task: boolean };

/** Choose the team using the deal's required skills and everyone's current workload,
 *  set the project timeline, and give each person a due date. */
export function TeamPicker({ projectId, candidates, required, defaultStart, defaultDue, clientDeadline, isIncoming }: {
  projectId: string; candidates: Candidate[]; required: string[]; defaultStart: string; defaultDue: string; clientDeadline: string | null; isIncoming: boolean;
}) {
  const router = useRouter();
  const req = required.map((r) => r.toLowerCase());
  const matched = (c: Candidate) => c.skills.filter((s) => req.includes(s.toLowerCase()));
  const suggestBrief = (c: Candidate) => `${matched(c)[0] ?? c.job_title ?? 'Project'} work`;
  const [plans, setPlans] = useState<Record<string, Plan>>(() => Object.fromEntries(candidates.filter((c) => c.current).map((c) => [c.id, { due_date: c.dueDate ?? '', brief: c.brief, create_task: false }])));
  const [q, setQ] = useState('');
  const [startDate, setStartDate] = useState(defaultStart);
  const [dueDate, setDueDate] = useState(defaultDue);
  const [pending, start] = useTransition();
  const score = (c: Candidate) => matched(c).length;
  const list = candidates
    .filter((c) => !q || `${c.full_name} ${c.job_title ?? ''} ${c.skills.join(' ')}`.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => score(b) - score(a) || a.open - b.open || a.full_name.localeCompare(b.full_name));
  const toggle = (c: Candidate) => setPlans((cur) => {
    const n = { ...cur };
    if (n[c.id]) delete n[c.id];
    else n[c.id] = { due_date: c.dueDate ?? dueDate, brief: c.brief || suggestBrief(c), create_task: !c.current };
    return n;
  });
  const setPlan = (id: string, patch: Partial<Plan>) => setPlans((cur) => ({ ...cur, [id]: { ...cur[id], ...patch } }));
  const load = (c: Candidate) => (c.overdue > 0 || c.open >= 12 ? 'Busy' : c.open >= 6 ? 'Moderate' : 'Light');
  const count = Object.keys(plans).length;
  const lateIds = Object.entries(plans).filter(([, p]) => p.due_date && dueDate && p.due_date > dueDate).map(([id]) => id);

  return (
    <div className="space-y-4">
      <fieldset className="rounded-lg border bg-foreground/[0.015] p-3">
        <legend className="px-1 text-[12.5px] font-medium">Timeline</legend>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col text-[12.5px] text-muted-foreground">Start date
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="mt-1 w-44" />
          </label>
          <label className="flex flex-col text-[12.5px] text-muted-foreground">Project due date
            <Input type="date" value={dueDate} min={startDate || undefined} onChange={(e) => setDueDate(e.target.value)} className="mt-1 w-44" />
          </label>
          {clientDeadline && <p className="pb-2 text-[12px] text-muted-foreground">Client deadline from Sales: <span className="font-medium text-foreground">{clientDeadline}</span>{dueDate && dueDate > clientDeadline && <span className="ml-1 text-deadline">· the project ends after it</span>}</p>}
        </div>
      </fieldset>
      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input aria-label="Search people" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by name, title or skill" className="pl-8" />
      </div>
      <ul className="divide-y rounded-lg border">
        {list.map((c) => {
          const plan = plans[c.id];
          const on = Boolean(plan);
          const match = score(c);
          const l = load(c);
          return (
            <li key={c.id} className={cn(on && 'bg-primary-soft')}>
              <label className="flex cursor-pointer items-center gap-3 px-3 py-2.5 transition-colors hover:bg-foreground/[0.03]">
                <input type="checkbox" checked={on} onChange={() => toggle(c)} className="size-4 accent-[var(--primary)]" />
                <Avatar person={c} size="md" />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-[13px] font-medium">{c.full_name}{match > 0 && <span className="rounded-full bg-success-soft px-1.5 text-[11px] font-medium text-success">{match} skill match</span>}{c.current && <span className="rounded-full border border-border-strong px-1.5 text-[11px] text-muted-foreground">On the team</span>}</p>
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
              {plan && (
                <div className="flex flex-wrap items-end gap-3 px-3 pb-3 pl-[52px]">
                  <label className="flex min-w-48 flex-1 flex-col text-[12px] text-muted-foreground">What they deliver
                    <Input value={plan.brief} maxLength={120} onChange={(e) => setPlan(c.id, { brief: e.target.value })} placeholder="e.g. UI/UX design for all screens" className="mt-1" />
                  </label>
                  <label className="flex flex-col text-[12px] text-muted-foreground">Their due date
                    <Input type="date" value={plan.due_date} min={startDate || undefined} max={dueDate || undefined} onChange={(e) => setPlan(c.id, { due_date: e.target.value })}
                      aria-invalid={lateIds.includes(c.id) || undefined} className={cn('mt-1 w-44', lateIds.includes(c.id) && 'border-destructive')} />
                  </label>
                  <label className="flex items-center gap-2 pb-2 text-[12px] text-muted-foreground">
                    <input type="checkbox" checked={plan.create_task} onChange={(e) => setPlan(c.id, { create_task: e.target.checked })} className="size-3.5 accent-[var(--primary)]" />
                    Also add it as a task in their My Work
                  </label>
                  {lateIds.includes(c.id) && <p className="basis-full text-[12px] text-destructive">This is after the project due date.</p>}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      <div className="flex flex-col gap-3 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-[12.5px] text-muted-foreground">{count ? `${count} picked · everyone new is notified` : 'Pick at least one person.'}</p>
        <Button disabled={pending || count === 0 || lateIds.length > 0} onClick={() => start(async () => {
          const r = await startProject(projectId, {
            start_date: startDate, due_date: dueDate,
            members: Object.entries(plans).map(([id, p]) => ({ id, ...p })),
          });
          if (!r.ok) { toast.error(r.error); return; }
          toast(isIncoming ? `Project started with ${count} ${count === 1 ? 'person' : 'people'}. They've been notified.` : 'Team and timeline saved.');
          router.push(`/projects/${projectId}`);
          router.refresh();
        })}>{pending ? <Spinner /> : <ArrowRight />} {isIncoming ? `Start project with ${count} ${count === 1 ? 'person' : 'people'}` : 'Save team and timeline'}</Button>
      </div>
    </div>
  );
}
