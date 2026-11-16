import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { describeActivity, dueLabel, fmtRelative, isOverdue } from '@/lib/domain';
import type { Activity, Profile, Project, Task } from '@/lib/types';
import { Avatar, PriorityBadge, TaskStatusBadge } from './badges';
import { projectColor } from '@/lib/colors';

export function StatCard({ label, value, hint, tone, icon: Icon }: {
  label: string; value: number | string; hint?: string; tone?: 'red' | 'amber'; icon?: React.ComponentType<{ className?: string }>;
}) {
  const alert = Number(value) > 0 && tone;
  return (
    <Card className="flex items-start gap-4 px-5 py-4">
      {Icon && (
        <span className={cn('grid size-10 shrink-0 place-items-center rounded-[12px] bg-primary-soft text-primary',
          alert === 'red' && 'bg-destructive-soft text-destructive', alert === 'amber' && 'bg-deadline-soft text-deadline')}>
          <Icon className="size-[18px]" />
        </span>
      )}
      <div className="min-w-0">
        <p className="text-[13px] text-muted-foreground">{label}</p>
        <p className={cn('font-display text-[28px] font-semibold leading-tight tracking-[-0.03em] tabular', alert === 'red' && 'text-destructive', alert === 'amber' && 'text-deadline')}>{value}</p>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
    </Card>
  );
}

export function TaskRow({ task, project, assignee, showProject = true }: {
  task: Task; project?: Pick<Project, 'id' | 'name'>; assignee?: Pick<Profile, 'id' | 'full_name'> | null; showProject?: boolean;
}) {
  const late = isOverdue(task);
  return (
    <li>
      <Link href={`/tasks/${task.id}`} className="flex items-center gap-3 rounded-[10px] px-2 py-2.5 transition-colors hover:bg-muted/70">
        <span aria-hidden className="size-2 shrink-0 rounded-[3px]" style={{ background: projectColor(task.project_id) }} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{task.title}</p>
          <p className="truncate text-xs text-muted-foreground">
            {showProject && project ? <>{project.name}<span aria-hidden className="mx-1.5">/</span></> : ''}
            <span className={cn(late && 'font-medium text-destructive')}>{dueLabel(task)}</span>
          </p>
        </div>
        <span className="hidden sm:inline-flex"><PriorityBadge priority={task.priority} /></span>
        <TaskStatusBadge status={task.status} />
        {assignee !== undefined && <Avatar person={assignee} />}
      </Link>
    </li>
  );
}

export function ActivityFeed({ items, people, projects, emptyText = 'No activity yet.' }: {
  items: Activity[]; people: Map<string, Profile>; projects?: Map<string, Pick<Project, 'id' | 'name'>>; emptyText?: string;
}) {
  if (!items.length) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ol className="space-y-3">
      {items.map((a) => {
        const actor = a.actor_id ? people.get(a.actor_id) : undefined;
        const project = a.project_id ? projects?.get(a.project_id) : undefined;
        return (
          <li key={a.id} className="flex gap-3 text-sm">
            <Avatar person={actor ?? { id: 'system', full_name: 'System' }} className="mt-0.5" />
            <div className="min-w-0">
              <p>
                <span className="font-medium">{actor?.full_name ?? 'Someone'}</span>{' '}
                <span className="text-foreground/80">{describeActivity(a.action, a.details)}</span>
                {a.ai_assisted && <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-ai"><Sparkles className="size-3" aria-hidden />AI-assisted</span>}
              </p>
              <p className="text-xs text-muted-foreground">
                <time dateTime={a.created_at} title={new Date(a.created_at).toLocaleString()}>{fmtRelative(a.created_at)}</time>
                {project && <> in <Link className="hover:underline" href={`/projects/${project.id}`}>{project.name}</Link></>}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
