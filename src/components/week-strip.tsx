import Link from 'next/link';
import { addDays, format, isSameDay, startOfWeek } from 'date-fns';
import { cn } from '@/lib/utils';
import { isOverdue } from '@/lib/domain';
import { projectColor } from '@/lib/colors';
import type { Task } from '@/lib/types';

const isOffDay = (d: Date) => d.getDay() === 5 || d.getDay() === 6; // Friday & Saturday

/**
 * The work week at a glance: what is due each day (Sunday–Thursday working days,
 * Friday–Saturday shaded as off days), with overdue work pinned on the left.
 */
export function WeekStrip({ tasks, projectNames, title }: {
  tasks: Task[]; projectNames: Map<string, string>; title: string;
}) {
  const today = new Date();
  const start = startOfWeek(today, { weekStartsOn: 0 });
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i));
  const open = tasks.filter((t) => t.status !== 'done');
  const overdue = open.filter(isOverdue).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
  const dueOn = (d: Date) => tasks.filter((t) => t.due_date === format(d, 'yyyy-MM-dd'));
  const weekTotal = days.reduce((n, d) => n + dueOn(d).filter((t) => t.status !== 'done').length, 0);

  return (
    <section aria-labelledby="week-h" className="overflow-hidden rounded-[18px] border bg-card">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-4">
        <h2 id="week-h" className="font-display text-lg font-semibold tracking-[-0.015em]">{title}</h2>
        <p className="text-[13px] text-muted-foreground">
          {weekTotal} due this week{overdue.length ? <>, <span className="font-medium text-destructive">{overdue.length} overdue</span></> : null}
        </p>
      </div>
      <div className="mt-3 grid grid-cols-1 border-t md:grid-cols-[minmax(180px,1.1fr)_repeat(7,minmax(0,1fr))]">
        {/* Overdue column */}
        <div className="border-b bg-destructive-soft/50 p-3 md:border-b-0 md:border-r">
          <p className="text-xs font-medium text-destructive">Overdue</p>
          <p className="font-display text-[34px] font-semibold leading-none tracking-[-0.03em] text-destructive tabular">{overdue.length}</p>
          <ul className="mt-2 space-y-1">
            {overdue.slice(0, 3).map((t) => (
              <li key={t.id}><Link href={`/tasks/${t.id}`} className="block truncate text-[13px] text-foreground/85 hover:underline">{t.title}</Link></li>
            ))}
            {overdue.length > 3 && <li className="text-xs text-muted-foreground">+{overdue.length - 3} more</li>}
            {overdue.length === 0 && <li className="text-[13px] text-muted-foreground">Nothing late</li>}
          </ul>
        </div>
        {days.map((d) => {
          const due = dueOn(d);
          const isToday = isSameDay(d, today);
          const off = isOffDay(d);
          return (
            <div key={d.toISOString()}
              className={cn('min-h-36 border-b p-3 md:border-b-0 md:border-r last:border-r-0', off && 'bg-[repeating-linear-gradient(135deg,transparent_0_7px,var(--muted)_7px_8px)]', isToday && 'bg-primary-soft/60')}>
              <div className="flex items-baseline justify-between">
                <span className={cn('text-xs font-medium', isToday ? 'text-primary' : 'text-muted-foreground')}>{isToday ? 'Today' : format(d, 'EEE')}</span>
                {off && <span className="text-[11px] text-muted-foreground">Off</span>}
              </div>
              <p className={cn('font-display text-[26px] font-semibold leading-tight tracking-[-0.03em] tabular', isToday ? 'text-primary' : off ? 'text-muted-foreground/60' : '')}>{format(d, 'd')}</p>
              <ul className="mt-1.5 space-y-1">
                {due.slice(0, 3).map((t) => (
                  <li key={t.id}>
                    <Link href={`/tasks/${t.id}`} title={`${t.title} — ${projectNames.get(t.project_id) ?? ''}`}
                      className={cn('flex items-center gap-1.5 rounded-[6px] px-1.5 py-1 text-[12px] leading-tight hover:bg-muted', t.status === 'done' && 'text-muted-foreground line-through')}>
                      <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: projectColor(t.project_id) }} />
                      <span className="truncate">{t.title}</span>
                    </Link>
                  </li>
                ))}
                {due.length > 3 && <li className="px-1.5 text-[11px] text-muted-foreground">+{due.length - 3} more</li>}
              </ul>
            </div>
          );
        })}
      </div>
    </section>
  );
}
