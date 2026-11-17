'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Clock, Download, Play, Plus, Trash2 } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { FormField } from '@/components/ui/label';
import { Spinner } from '@/components/ui/misc';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { toast } from '@/components/ui/toast';
import { Avatar } from '@/components/badges';
import { fmtDate, fmtMinutes } from '@/lib/domain';
import { cn } from '@/lib/utils';
import type { RunningTimer } from '@/lib/types';
import { deleteTimeEntry, logTime, startTimer } from '@/app/actions/time';
import { StopTimerButton, fmtElapsed, useElapsed } from './running-timer';

type Person = { id: string; full_name: string };
type TaskRef = { id: string; title: string };
export type TimeRow = { id: string; task_id: string | null; profile_id: string; entry_date: string; minutes: number; note: string };

const today = () => new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD in local time

export function StartTimerButton({ projectId, taskId, label = 'Start timer', variant = 'default', size = 'sm', note = '' }: {
  projectId: string; taskId?: string | null; label?: string; variant?: 'default' | 'outline'; size?: 'sm' | 'default'; note?: string;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button type="button" size={size} variant={variant} disabled={pending}
      onClick={() => start(async () => {
        const r = await startTimer({ project_id: projectId, task_id: taskId ?? '', note });
        if (!r.ok) { toast.error(r.error); return; }
        toast(r.data?.stoppedMinutes ? `Timer started (previous timer stopped at ${fmtMinutes(r.data.stoppedMinutes)})` : 'Timer started');
        router.refresh();
      })}>
      {pending ? <Spinner /> : <Play className="fill-current" />} {label}
    </Button>
  );
}

function LogTimeDialog({ projectId, tasks, defaultTask = '' }: { projectId: string; tasks: TaskRef[]; defaultTask?: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [v, setV] = useState({ entry_date: today(), hours: '1', minutes: '0', task_id: defaultTask, note: '' });
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setV((s) => ({ ...s, [k]: e.target.value }));
  return (
    <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) { setError(null); setV((s) => ({ ...s, entry_date: today() })); } }}>
      <DialogTrigger asChild><Button size="sm" variant="outline"><Plus /> Log time</Button></DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>Log time</DialogTitle><DialogDescription>Add time you worked without the timer.</DialogDescription></DialogHeader>
        <form className="space-y-4" onSubmit={(e) => {
          e.preventDefault();
          start(async () => {
            const r = await logTime({ project_id: projectId, ...v });
            if (!r.ok) { setError(r.error); return; }
            const mins = Number(v.hours || 0) * 60 + Number(v.minutes || 0);
            toast(`Logged ${fmtMinutes(mins)}`); setOpen(false); setV((s) => ({ ...s, note: '' })); router.refresh();
          });
        }}>
          <div className="grid grid-cols-[1fr_80px_80px] gap-3">
            <FormField id="t-date" label="Date"><Input type="date" value={v.entry_date} max={today()} onChange={set('entry_date')} required /></FormField>
            <FormField id="t-h" label="Hours"><Input type="number" min={0} max={24} inputMode="numeric" value={v.hours} onChange={set('hours')} /></FormField>
            <FormField id="t-m" label="Minutes"><Input type="number" min={0} max={59} step={5} inputMode="numeric" value={v.minutes} onChange={set('minutes')} /></FormField>
          </div>
          <FormField id="t-task" label="Task (optional)">
            <NativeSelect value={v.task_id} onChange={set('task_id')}>
              <option value="">No specific task</option>
              {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
            </NativeSelect>
          </FormField>
          <FormField id="t-note" label="Note (optional)"><Input value={v.note} maxLength={500} placeholder="What did you work on?" onChange={set('note')} /></FormField>
          {error && <p className="text-[12.5px] text-destructive">{error}</p>}
          <div className="flex justify-end"><Button type="submit" disabled={pending}>{pending && <Spinner />} Log time</Button></div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function RunningHere({ timer }: { timer: RunningTimer }) {
  const elapsed = useElapsed(timer.started_at);
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-success/30 bg-success-soft px-3 py-2.5">
      <span className="relative flex size-2.5" aria-hidden>
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
        <span className="relative inline-flex size-2.5 rounded-full bg-success" />
      </span>
      <span className="font-mono text-[20px] font-semibold tabular text-success" suppressHydrationWarning>{fmtElapsed(elapsed)}</span>
      <span className="min-w-0 flex-1 truncate text-[13px] text-foreground/80">{timer.task_title ? <>On <span className="font-medium">{timer.task_title}</span></> : 'Tracking this project'}</span>
      <StopTimerButton className="h-8 px-3 text-[13px]" label="Stop & log" />
    </div>
  );
}

function StartBar({ projectId, tasks, switching }: { projectId: string; tasks: TaskRef[]; switching?: boolean }) {
  const [taskId, setTaskId] = useState('');
  const [note, setNote] = useState('');
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <NativeSelect aria-label="Task to track" value={taskId} onChange={(e) => setTaskId(e.target.value)} className="sm:w-56">
        <option value="">No specific task</option>
        {tasks.map((t) => <option key={t.id} value={t.id}>{t.title}</option>)}
      </NativeSelect>
      <Input aria-label="What are you working on?" placeholder="What are you working on? (optional)" value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} className="sm:flex-1" />
      <StartTimerButton projectId={projectId} taskId={taskId} note={note} size="default" variant={switching ? 'outline' : 'default'} label={switching ? 'Switch timer' : 'Start timer'} />
    </div>
  );
}

export function TimeTracker({ projectId, tasks, people, entries, totals, timer, canLog, canDeleteAll, meId }: {
  projectId: string;
  tasks: TaskRef[];
  people: Person[];
  entries: TimeRow[];
  totals: { total: number; week: number; byPerson: { id: string; minutes: number }[] };
  timer: RunningTimer | null;
  canLog: boolean;
  canDeleteAll: boolean;
  meId: string;
}) {
  const router = useRouter();
  const [showAll, setShowAll] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const peopleMap = new Map(people.map((p) => [p.id, p]));
  const taskMap = new Map(tasks.map((t) => [t.id, t]));
  const max = Math.max(1, ...totals.byPerson.map((p) => p.minutes));
  const shown = showAll ? entries : entries.slice(0, 8);
  const runningHere = timer && timer.project_id === projectId ? timer : null;

  return (
    <Card aria-labelledby="time-heading">
      <CardHeader className="flex-wrap">
        <div>
          <CardTitle id="time-heading" className="flex items-center gap-2"><Clock className="size-4 text-muted-foreground" aria-hidden /> Time tracking</CardTitle>
          <CardDescription>Track time with the timer or log it afterwards. Everyone on the project can see it.</CardDescription>
        </div>
        <div className="flex gap-2">
          {entries.length > 0 && <Button asChild size="sm" variant="ghost"><a href={`/projects/${projectId}/time-export`} download><Download /> Export CSV</a></Button>}
          {canLog && <LogTimeDialog projectId={projectId} tasks={tasks} />}
        </div>
      </CardHeader>
      <CardContent className="space-y-5">
        {canLog && runningHere && <RunningHere timer={runningHere} />}
        {canLog && <StartBar projectId={projectId} tasks={tasks} switching={!!runningHere} />}
        {canLog && timer && !runningHere && (
          <p className="text-[12.5px] text-muted-foreground">Your timer is running on <Link className="font-medium text-foreground hover:underline" href={`/projects/${timer.project_id}`}>{timer.project_name}</Link>. Starting one here stops that one first.</p>
        )}

        <div className="grid gap-4 md:grid-cols-[minmax(0,240px)_1fr]">
          <dl className="grid grid-cols-2 gap-3 md:grid-cols-1">
            <div className="rounded-lg border p-3"><dt className="text-[12px] text-muted-foreground">This week</dt><dd className="mt-1 text-[22px] font-semibold tabular text-gradient">{fmtMinutes(totals.week)}</dd></div>
            <div className="rounded-lg border p-3"><dt className="text-[12px] text-muted-foreground">Total on project</dt><dd className="mt-1 text-[22px] font-semibold tabular text-gradient">{fmtMinutes(totals.total)}</dd></div>
          </dl>
          <div>
            <h3 className="mb-2 text-[12px] font-medium text-muted-foreground">By person</h3>
            {totals.byPerson.length === 0 ? (
              <p className="py-4 text-[13px] text-muted-foreground">No time logged yet.</p>
            ) : (
              <ul className="space-y-2.5">
                {totals.byPerson.map((p) => (
                  <li key={p.id} className="grid grid-cols-[minmax(0,160px)_1fr_auto] items-center gap-3 text-[13px]">
                    <span className="flex min-w-0 items-center gap-2"><Avatar person={peopleMap.get(p.id) ?? { id: p.id, full_name: '?' }} /><span className="truncate">{peopleMap.get(p.id)?.full_name ?? 'Former member'}</span></span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-foreground/[0.08]"><span className="bar-glow block h-full rounded-full" style={{ width: `${(p.minutes / max) * 100}%` }} /></span>
                    <span className="tabular text-foreground/85">{fmtMinutes(p.minutes)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {entries.length > 0 && (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full min-w-[620px] text-[13px]">
              <thead className="border-b bg-muted/40 text-left text-[12px] text-muted-foreground">
                <tr><th className="py-2 pl-3 font-medium">Date</th><th className="py-2 font-medium">Person</th><th className="py-2 font-medium">Task / note</th><th className="py-2 pr-3 text-right font-medium">Time</th><th className="w-10" /></tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((e) => {
                  const person = peopleMap.get(e.profile_id);
                  const task = e.task_id ? taskMap.get(e.task_id) : null;
                  const canDelete = canDeleteAll || e.profile_id === meId;
                  return (
                    <tr key={e.id} className="group hover:bg-foreground/[0.025]">
                      <td className="whitespace-nowrap py-2 pl-3 text-muted-foreground tabular">{fmtDate(e.entry_date, 'EEE d MMM')}</td>
                      <td className="py-2"><span className="flex items-center gap-2"><Avatar person={person ?? null} /><span className="truncate">{person?.full_name ?? 'Former member'}</span></span></td>
                      <td className="max-w-[320px] py-2">
                        {task ? <Link href={`/tasks/${task.id}`} className="block truncate font-medium hover:underline">{task.title}</Link> : null}
                        {e.note ? <span className={cn('block truncate', task ? 'text-[12px] text-muted-foreground' : 'text-foreground/85')}>{e.note}</span> : !task && <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="py-2 pr-3 text-right font-medium tabular">{fmtMinutes(e.minutes)}</td>
                      <td className="py-1 pr-2 text-right">
                        {canDelete && (
                          <button type="button" aria-label="Delete time entry" title="Delete" disabled={deleting === e.id}
                            className="grid size-7 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity hover:bg-destructive-soft hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                            onClick={async () => {
                              setDeleting(e.id);
                              const r = await deleteTimeEntry(e.id);
                              setDeleting(null);
                              if (!r.ok) { toast.error(r.error); return; }
                              toast(`Removed ${fmtMinutes(e.minutes)} entry`); router.refresh();
                            }}>
                            {deleting === e.id ? <Spinner className="size-3.5" /> : <Trash2 className="size-3.5" />}
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {entries.length > 8 && (
              <button type="button" onClick={() => setShowAll((s) => !s)} className="w-full border-t py-2 text-[12.5px] text-muted-foreground hover:bg-foreground/[0.03] hover:text-foreground">
                {showAll ? 'Show less' : `Show all ${entries.length} entries`}
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Compact block for the task page: time spent on this task, and a one-click timer. */
export function TaskTimeBox({ projectId, taskId, minutes, timer, canLog }: { projectId: string; taskId: string; minutes: number; timer: RunningTimer | null; canLog: boolean }) {
  const here = timer && timer.task_id === taskId ? timer : null;
  const elapsed = useElapsed(here?.started_at ?? null);
  return (
    <div className="space-y-2">
      <div className="flex items-baseline justify-between">
        <span className="text-[12.5px] text-muted-foreground">Time on this task</span>
        <span className="font-medium tabular">{fmtMinutes(minutes)}</span>
      </div>
      {canLog && (here ? (
        <div className="flex items-center gap-2 rounded-md border border-success/30 bg-success-soft px-2 py-1.5">
          <span className="font-mono text-[13px] font-semibold tabular text-success" suppressHydrationWarning>{fmtElapsed(elapsed)}</span>
          <StopTimerButton className="ml-auto h-7 px-2.5" label="Stop & log" />
        </div>
      ) : (
        <StartTimerButton projectId={projectId} taskId={taskId} label="Start timer on this task" variant="outline" />
      ))}
    </div>
  );
}
