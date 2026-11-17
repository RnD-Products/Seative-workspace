'use client';
import { useEffect, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Square } from 'lucide-react';
import { toast } from '@/components/ui/toast';
import { fmtMinutes } from '@/lib/domain';
import { cn } from '@/lib/utils';
import type { RunningTimer } from '@/lib/types';
import { stopTimer } from '@/app/actions/time';

/** "1:05:09" — hours appear once the timer passes an hour. */
export function fmtElapsed(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  const mm = String(m).padStart(h ? 2 : 1, '0'), ss = String(sec).padStart(2, '0');
  return h ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function useElapsed(startedAt: string | null) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    setNow(Date.now());
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, [startedAt]);
  return startedAt ? now - new Date(startedAt).getTime() : 0;
}

export function StopTimerButton({ className, label = 'Stop' }: { className?: string; label?: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <button type="button" disabled={pending}
      onClick={() => start(async () => {
        const r = await stopTimer();
        if (!r.ok) { toast.error(r.error); return; }
        toast(`Logged ${fmtMinutes(r.data!.minutes)}`); router.refresh();
      })}
      className={cn('inline-flex items-center justify-center gap-1.5 rounded-md bg-destructive/90 px-2 text-[12px] font-medium text-white transition-colors hover:bg-destructive disabled:opacity-60', className)}
      title="Stop timer and log the time" aria-label="Stop timer">
      <Square className="size-3 fill-current" aria-hidden />{label}
    </button>
  );
}

/** Shown in the sidebar (and phone header) while a timer runs, on every page. */
export function RunningTimerPill({ timer, compact }: { timer: RunningTimer; compact?: boolean }) {
  const elapsed = useElapsed(timer.started_at);
  const dot = (
    <span className="relative flex size-2 shrink-0" aria-hidden>
      <span className="absolute inline-flex size-full animate-ping rounded-full bg-success opacity-60" />
      <span className="relative inline-flex size-2 rounded-full bg-success" />
    </span>
  );
  if (compact) {
    return (
      <div className="flex items-center gap-1.5 rounded-md border border-success/30 bg-success-soft py-0.5 pl-2 pr-0.5">
        {dot}
        <span className="font-mono text-[12px] font-semibold tabular text-success" suppressHydrationWarning>{fmtElapsed(elapsed)}</span>
        <StopTimerButton className="size-6 px-0" label="" />
      </div>
    );
  }
  return (
    <div className="sheen rounded-lg border border-success/30 bg-success-soft p-2.5">
      <div className="flex items-center gap-2">
        {dot}
        <span className="font-mono text-[13px] font-semibold tabular text-success" aria-label="Elapsed time" suppressHydrationWarning>{fmtElapsed(elapsed)}</span>
        <StopTimerButton className="ml-auto h-6" />
      </div>
      <Link href={timer.task_id ? `/tasks/${timer.task_id}` : `/projects/${timer.project_id}`} className="mt-1 block truncate text-[12px] text-foreground/80 hover:underline" title={timer.task_title ?? timer.project_name}>
        {timer.task_title ? <>{timer.task_title}<span className="text-muted-foreground"> · {timer.project_name}</span></> : timer.project_name}
      </Link>
    </div>
  );
}
