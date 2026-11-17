import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  HEALTH_LABEL, PRIORITY_LABEL, PROJECT_STATUS_LABEL, ROLE_LABEL, TASK_STATUS_LABEL, type Health,
} from '@/lib/domain';
import type { Priority, ProjectStatus, Role, TaskStatus } from '@/lib/types';

const projTone = { planning: 'purple', active: 'blue', on_hold: 'amber', completed: 'green' } as const;
const healthTone = { on_track: 'green', at_risk: 'amber', off_track: 'red', completed: 'gray', not_started: 'gray' } as const;

export const TaskStatusBadge = ({ status }: { status: TaskStatus }) => (
  <Badge tone="gray" className="pl-1.5 text-foreground/85"><StatusIcon status={status} className="size-3" />{TASK_STATUS_LABEL[status]}</Badge>
);
export const ProjectStatusBadge = ({ status }: { status: ProjectStatus }) => <Badge tone={projTone[status]} dot>{PROJECT_STATUS_LABEL[status]}</Badge>;
export const PriorityBadge = ({ priority }: { priority: Priority }) => (
  <Badge tone={priority === 'urgent' ? 'red' : 'gray'} className="pl-1.5"><PriorityIcon priority={priority} className="size-3" />{PRIORITY_LABEL[priority]}</Badge>
);
export const HealthBadge = ({ health }: { health: Health }) => <Badge tone={healthTone[health]} dot>{HEALTH_LABEL[health]}</Badge>;
export const RoleBadge = ({ role }: { role: Role }) => <Badge tone={role === 'ceo' ? 'purple' : role === 'pm' ? 'blue' : 'gray'}>{ROLE_LABEL[role]}</Badge>;

const COLORS = ['bg-indigo-500/90', 'bg-rose-500/90', 'bg-amber-600/90', 'bg-emerald-600/90', 'bg-sky-600/90', 'bg-violet-500/90', 'bg-teal-600/90', 'bg-orange-500/90'];
const colorFor = (id: string) => COLORS[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
export const initials = (name: string) => name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export function Avatar({ person, size = 'sm', className }: { person?: { id: string; full_name: string } | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dims = { sm: 'size-5 text-[9px]', md: 'size-7 text-[11px]', lg: 'size-9 text-[13px]' }[size];
  if (!person) {
    return <span className={cn('inline-grid shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-muted-foreground', dims, className)} title="Unassigned" aria-label="Unassigned">?</span>;
  }
  return (
    <span className={cn('inline-grid shrink-0 place-items-center rounded-full font-semibold text-white', dims, colorFor(person.id), className)} title={person.full_name} aria-hidden>
      {initials(person.full_name)}
    </span>
  );
}

export function AiLabel({ className, children = 'AI-generated' }: { className?: string; children?: React.ReactNode }) {
  return <Badge tone="ai" className={className}>✦ {children}</Badge>;
}

/** Compact status mark: empty ring → half → three-quarters → filled check. Colour carries the same meaning as the badges. */
export function StatusIcon({ status, className }: { status: TaskStatus; className?: string }) {
  const color = { todo: 'text-muted-foreground', in_progress: 'text-info', in_review: 'text-warning', done: 'text-success' }[status];
  const frac = { todo: 0, in_progress: 0.5, in_review: 0.75, done: 1 }[status];
  const r = 3.2;
  const a = frac * 2 * Math.PI;
  const x = 7 + r * Math.sin(a);
  const y = 7 - r * Math.cos(a);
  return (
    <svg viewBox="0 0 14 14" className={cn('size-3.5 shrink-0', color, className)} role="img" aria-label={TASK_STATUS_LABEL[status]}>
      {status === 'done' ? (
        <>
          <circle cx="7" cy="7" r="6" fill="currentColor" />
          <path d="M4.3 7.2 6.1 9l3.6-3.8" fill="none" stroke="var(--background)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </>
      ) : (
        <>
          <circle cx="7" cy="7" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeDasharray={status === 'todo' ? '2.2 1.6' : undefined} />
          {frac > 0 && <path d={`M7 7 L7 ${7 - r} A${r} ${r} 0 ${frac > 0.5 ? 1 : 0} 1 ${x.toFixed(2)} ${y.toFixed(2)} Z`} fill="currentColor" />}
        </>
      )}
    </svg>
  );
}

/** Priority as signal bars; urgent is a filled red tile. */
export function PriorityIcon({ priority, className }: { priority: Priority; className?: string }) {
  if (priority === 'urgent') {
    return (
      <svg viewBox="0 0 14 14" className={cn('size-3.5 shrink-0 text-destructive', className)} role="img" aria-label={PRIORITY_LABEL[priority]}>
        <rect x="1" y="1" width="12" height="12" rx="3" fill="currentColor" />
        <path d="M7 3.8v4" stroke="var(--background)" strokeWidth="1.7" strokeLinecap="round" /><circle cx="7" cy="10.2" r="0.95" fill="var(--background)" />
      </svg>
    );
  }
  const level = { low: 1, medium: 2, high: 3 }[priority];
  return (
    <svg viewBox="0 0 14 14" className={cn('size-3.5 shrink-0 text-foreground/80', className)} role="img" aria-label={PRIORITY_LABEL[priority]}>
      {[0, 1, 2].map((i) => (
        <rect key={i} x={1.5 + i * 4} y={9 - i * 3} width="3" height={3.5 + i * 3} rx="0.8" fill="currentColor" opacity={i < level ? 1 : 0.22} />
      ))}
    </svg>
  );
}
