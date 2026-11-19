import Link from 'next/link';
import { Sparkles } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { describeActivity, dueLabel, fmtRelative, isOverdue } from '@/lib/domain';
import type { Activity, Profile, Project, Task } from '@/lib/types';
import { Avatar, PriorityIcon, StatusIcon } from './badges';
import { projectColor } from '@/lib/colors';

/** Big numbers in the dashboard style: the trailing part (decimals, %, last group) is dimmed. */
export function SplitNumber({ value }: { value: number | string }) {
  const str = String(value);
  const m = /^(.*?)([.,]\d+|%|h)$/.exec(str) ?? /^(\d+)(%)$/.exec(str);
  if (!m || !m[1]) return <>{str}</>;
  return <>{m[1]}<span className="text-muted-foreground/70">{m[2]}</span></>;
}

export function StatCard({ label, value, hint, tone, icon: Icon }: {
  label: string; value: number | string; hint?: string; tone?: 'red' | 'amber'; icon?: React.ComponentType<{ className?: string }>;
}) {
  const alert = Number(value) > 0 && tone;
  return (
    <Card className="glow-ring px-5 py-4 transition-colors duration-300">
      <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
        {Icon && <Icon className={cn('size-3.5', alert === 'red' && 'text-destructive', alert === 'amber' && 'text-deadline')} />}{label}
      </p>
      <p className={cn('mt-3 text-[34px] font-light leading-none tracking-[-0.04em] tabular', alert === 'red' ? 'text-destructive' : alert === 'amber' ? 'text-deadline' : 'text-foreground')}><SplitNumber value={value} /></p>
      {hint && <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p>}
    </Card>
  );
}

export function TaskRow({ task, project, assignee, showProject = true }: {
  task: Task; project?: Pick<Project, 'id' | 'name'>; assignee?: Pick<Profile, 'id' | 'full_name'> | null; showProject?: boolean;
}) {
  const late = isOverdue(task);
  return (
    <li>
      <Link href={`/tasks/${task.id}`} className="flex h-10 items-center gap-2.5 rounded-md px-2 transition-colors hover:bg-foreground/[0.04]">
        <PriorityIcon priority={task.priority} className="hidden sm:block" />
        <StatusIcon status={task.status} />
        <p className="min-w-0 flex-1 truncate text-[13px] font-medium">{task.title}</p>
        {showProject && project && (
          <span className="hidden max-w-[11rem] items-center gap-1.5 truncate text-[12px] text-muted-foreground md:flex">
            <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: projectColor(task.project_id) }} />
            <span className="truncate">{project.name}</span>
          </span>
        )}
        <span className={cn('shrink-0 text-[12px] text-muted-foreground tabular', late && 'font-medium text-destructive')}>{dueLabel(task)}</span>
        {assignee !== undefined && <Avatar person={assignee} />}
      </Link>
    </li>
  );
}

export function ActivityFeed({ items, people, projects, emptyText = 'No activity yet.' }: {
  items: Activity[]; people: Map<string, Profile>; projects?: Map<string, Pick<Project, 'id' | 'name'>>; emptyText?: string;
}) {
  if (!items.length) return <p className="py-6 text-center text-[13px] text-muted-foreground">{emptyText}</p>;
  return (
    <ol className="space-y-3">
      {items.map((a) => {
        const actor = a.actor_id ? people.get(a.actor_id) : undefined;
        const project = a.project_id ? projects?.get(a.project_id) : undefined;
        return (
          <li key={a.id} className="flex gap-2.5 text-[13px]">
            <Avatar person={actor ?? { id: 'system', full_name: 'System' }} className="mt-0.5" />
            <div className="min-w-0">
              <p>
                <span className="font-medium">{actor?.full_name ?? 'Someone'}</span>{' '}
                <span className="text-foreground/80">{describeActivity(a.action, a.details)}</span>
                {a.ai_assisted && <span className="ml-1.5 inline-flex items-center gap-0.5 text-xs text-ai"><Sparkles className="size-3" aria-hidden />AI-assisted</span>}
              </p>
              <p className="text-[12px] text-muted-foreground">
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
