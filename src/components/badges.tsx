import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import {
  HEALTH_LABEL, PRIORITY_LABEL, PROJECT_STATUS_LABEL, ROLE_LABEL, TASK_STATUS_LABEL, type Health,
} from '@/lib/domain';
import type { Priority, ProjectStatus, Role, TaskStatus } from '@/lib/types';

const taskTone = { todo: 'gray', in_progress: 'blue', in_review: 'amber', done: 'green' } as const;
const projTone = { planning: 'purple', active: 'blue', on_hold: 'amber', completed: 'green' } as const;
const prioTone = { low: 'gray', medium: 'blue', high: 'amber', urgent: 'red' } as const;
const healthTone = { on_track: 'green', at_risk: 'amber', off_track: 'red', completed: 'gray', not_started: 'gray' } as const;

export const TaskStatusBadge = ({ status }: { status: TaskStatus }) => <Badge tone={taskTone[status]} dot>{TASK_STATUS_LABEL[status]}</Badge>;
export const ProjectStatusBadge = ({ status }: { status: ProjectStatus }) => <Badge tone={projTone[status]} dot>{PROJECT_STATUS_LABEL[status]}</Badge>;
export const PriorityBadge = ({ priority }: { priority: Priority }) => <Badge tone={prioTone[priority]}>{PRIORITY_LABEL[priority]}</Badge>;
export const HealthBadge = ({ health }: { health: Health }) => <Badge tone={healthTone[health]} dot>{HEALTH_LABEL[health]}</Badge>;
export const RoleBadge = ({ role }: { role: Role }) => <Badge tone={role === 'ceo' ? 'purple' : role === 'pm' ? 'blue' : 'gray'}>{ROLE_LABEL[role]}</Badge>;

const COLORS = ['bg-indigo-500', 'bg-rose-500', 'bg-amber-500', 'bg-emerald-500', 'bg-sky-500', 'bg-violet-500', 'bg-teal-500', 'bg-orange-500'];
const colorFor = (id: string) => COLORS[[...id].reduce((s, c) => s + c.charCodeAt(0), 0) % COLORS.length];
export const initials = (name: string) => name.trim().split(/\s+/).map((p) => p[0]).slice(0, 2).join('').toUpperCase();

export function Avatar({ person, size = 'sm', className }: { person?: { id: string; full_name: string } | null; size?: 'sm' | 'md' | 'lg'; className?: string }) {
  const dims = { sm: 'size-6 text-[10px]', md: 'size-8 text-xs', lg: 'size-10 text-sm' }[size];
  if (!person) {
    return <span className={cn('inline-grid shrink-0 place-items-center rounded-full border border-dashed border-input text-muted-foreground', dims, className)} title="Unassigned" aria-label="Unassigned">?</span>;
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
