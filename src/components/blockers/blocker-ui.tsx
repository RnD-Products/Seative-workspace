'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Check, OctagonAlert, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { Alert, Spinner } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { Avatar } from '@/components/badges';
import { RelTime } from '@/components/rel-time';
import { cn } from '@/lib/utils';
import { BLOCKER_SIDES, SIDE_HINT, SIDE_LABEL, SIDE_STYLE, ageTone, blockerAge, type Blocker, type BlockerSide } from '@/lib/blockers';
import { raiseBlocker, setBlockerStatus } from '@/app/actions/blockers';

type Person = { id: string; full_name: string };

export function SideChip({ side, person }: { side: BlockerSide; person?: Person | null }) {
  return (
    <span className={cn('inline-flex h-[22px] items-center gap-1.5 rounded-full border px-2 text-[12px] font-medium', SIDE_STYLE[side].chip)}>
      <span className={cn('size-1.5 rounded-full', SIDE_STYLE[side].dot)} aria-hidden />
      {SIDE_LABEL[side]}{side === 'internal' && person ? ` · ${person.full_name}` : ''}
    </span>
  );
}

export function RaiseBlockerDialog({ projectId, tasks, people, defaultTaskId, salesOnly, variant = 'outline', label = 'Raise blocker' }: {
  projectId: string; tasks: { id: string; title: string }[]; people: Person[]; defaultTaskId?: string;
  /** Salespeople outside the team can only flag client-side blockers. */
  salesOnly?: boolean; variant?: 'outline' | 'default'; label?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<BlockerSide>('client');
  const [title, setTitle] = useState('');
  const [details, setDetails] = useState('');
  const [taskId, setTaskId] = useState(defaultTaskId ?? '');
  const [responsible, setResponsible] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const sides = salesOnly ? (['client'] as BlockerSide[]) : BLOCKER_SIDES;
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setError(null); setTitle(''); setDetails(''); setSide('client'); setResponsible(''); setTaskId(defaultTaskId ?? ''); } }}>
      <DialogTrigger asChild><Button size="sm" variant={variant}><OctagonAlert /> {label}</Button></DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle>Raise a blocker</DialogTitle><DialogDescription>Something stopping work? Say what it is and whose side it is on. The project manager is notified.</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await raiseBlocker({ project_id: projectId, task_id: taskId, title, details, side, responsible_id: responsible });
            if (!r.ok) { setError(r.error); return; }
            toast('Blocker raised. The project manager has been notified.'); setOpen(false); router.refresh();
          });
        }}>
          {error && <Alert tone="error">{error}</Alert>}
          <FormField id="b-title" label="What is blocking the work?"><Input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={2} maxLength={200} placeholder="e.g. Waiting for the client's product photos" /></FormField>
          <fieldset>
            <legend className="mb-2 text-[12.5px] font-medium">Whose side is it on?</legend>
            <div className="grid gap-2 sm:grid-cols-3">
              {sides.map((s) => (
                <label key={s} className={cn('cursor-pointer rounded-lg border p-2.5 text-[12.5px] transition-colors', side === s ? cn('ring-2 ring-primary/40', SIDE_STYLE[s].chip) : 'hover:bg-foreground/[0.03]')}>
                  <input type="radio" name="side" value={s} checked={side === s} onChange={() => setSide(s)} className="sr-only" />
                  <span className="flex items-center gap-1.5 font-semibold"><span className={cn('size-2 rounded-full', SIDE_STYLE[s].dot)} />{SIDE_LABEL[s]}</span>
                  <span className="mt-0.5 block text-[11.5px] text-muted-foreground">{SIDE_HINT[s]}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {side === 'internal' && (
            <FormField id="b-person" label="Waiting on">
              <NativeSelect value={responsible} onChange={(e) => setResponsible(e.target.value)} required>
                <option value="">Choose a person…</option>
                {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
              </NativeSelect>
            </FormField>
          )}
          {tasks.length > 0 && (
            <FormField id="b-task" label="Related task (optional)">
              <NativeSelect value={taskId} onChange={(e) => setTaskId(e.target.value)}>
                <option value="">Whole project</option>
                {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
              </NativeSelect>
            </FormField>
          )}
          <FormField id="b-details" label="Details (optional)"><Textarea rows={3} value={details} onChange={(e) => setDetails(e.target.value)} maxLength={2000} /></FormField>
          <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending && <Spinner />} Raise blocker</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResolveButton({ blocker }: { blocker: Blocker }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [pending, start] = useTransition();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Check /> Resolve</Button></DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Resolve blocker</DialogTitle><DialogDescription>{blocker.title}</DialogDescription></DialogHeader>
        <FormField id="r-note" label="How was it resolved? (optional)"><Textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></FormField>
        <div className="flex justify-end">
          <Button disabled={pending} onClick={() => start(async () => {
            const r = await setBlockerStatus(blocker.id, 'resolved', note);
            if (!r.ok) { toast.error(r.error); return; }
            toast('Blocker resolved', { action: { label: 'Undo', run: () => { void setBlockerStatus(blocker.id, 'open').then(() => router.refresh()); } } });
            setOpen(false); router.refresh();
          })}>{pending && <Spinner />} Mark resolved</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ReopenButton({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" disabled={pending} onClick={() => start(async () => {
      const r = await setBlockerStatus(id, 'open');
      if (!r.ok) { toast.error(r.error); return; }
      toast('Blocker reopened'); router.refresh();
    })}>{pending ? <Spinner /> : <RotateCcw />} Reopen</Button>
  );
}

/** One row per blocker. `project` adds a project column (for the company-wide board). */
export function BlockerRows({ blockers, people, tasks, meId, managerIds, projects }: {
  blockers: Blocker[]; people: Person[]; tasks?: { id: string; title: string }[]; meId: string;
  /** Project ids the viewer manages (or 'all' for the CEO). */
  managerIds: string[] | 'all';
  projects?: Record<string, { name: string; color: string }>;
}) {
  const pm = new Map(people.map((p) => [p.id, p]));
  const tm = new Map((tasks ?? []).map((t) => [t.id, t]));
  const canResolve = (b: Blocker) => managerIds === 'all' || managerIds.includes(b.project_id) || b.responsible_id === meId;
  return (
    <ul className="divide-y">
      {blockers.map((b) => {
        const days = blockerAge(b);
        const responsible = b.responsible_id ? pm.get(b.responsible_id) ?? null : null;
        const raiser = b.raised_by ? pm.get(b.raised_by) ?? null : null;
        const task = b.task_id ? tm.get(b.task_id) : null;
        const project = projects?.[b.project_id];
        return (
          <li key={b.id} className={cn('flex flex-col gap-2 py-3 sm:flex-row sm:items-start', b.status === 'resolved' && 'opacity-70')}>
            <div className="min-w-0 flex-1 space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <SideChip side={b.side} person={responsible} />
                {project && <Link href={`/projects/${b.project_id}#blockers`} className="inline-flex items-center gap-1.5 text-[12.5px] font-medium hover:underline"><span className="size-2 rounded-[2px]" style={{ background: project.color }} />{project.name}</Link>}
                {b.status === 'open'
                  ? <span className={cn('text-[12px] font-medium tabular', ageTone(days))}>{days === 0 ? 'Raised today' : `Blocked ${days} ${days === 1 ? 'day' : 'days'}`}</span>
                  : <span className="text-[12px] text-success">Resolved after {days} {days === 1 ? 'day' : 'days'}</span>}
              </div>
              <p className={cn('text-[13.5px] font-medium', b.status === 'resolved' && 'line-through decoration-foreground/30')}>{b.title}</p>
              {b.details && <p className="whitespace-pre-line text-[12.5px] text-muted-foreground">{b.details}</p>}
              <p className="flex flex-wrap items-center gap-x-2 text-[12px] text-muted-foreground">
                <span className="inline-flex items-center gap-1"><Avatar person={raiser} className="size-4 text-[8px]" />Raised by {raiser?.full_name ?? 'someone'} <RelTime iso={b.created_at} /></span>
                {task && <>· <Link href={`/tasks/${task.id}`} className="hover:underline">on “{task.title}”</Link></>}
                {b.status === 'resolved' && b.resolved_note && <>· “{b.resolved_note}”</>}
              </p>
            </div>
            {canResolve(b) && (b.status === 'open' ? <ResolveButton blocker={b} /> : <ReopenButton id={b.id} />)}
          </li>
        );
      })}
    </ul>
  );
}
