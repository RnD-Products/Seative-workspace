import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { NewTaskDialog } from '@/components/tasks/task-form';
import { canAddTaskRef } from '@/components/tasks/types';
import { TaskFilters } from '@/components/tasks/task-filters';
import { TaskViews } from '@/components/tasks/task-views';
import { requireSession } from '@/lib/session';
import { db, listProfiles, listProjects, listTasks, parseFilters } from '@/lib/queries';
import { daysUntil, isOverdue } from '@/lib/domain';
import type { Task } from '@/lib/types';
import { cn } from '@/lib/utils';

export const metadata = { title: 'My Work' };

const GROUPS: { key: string; label: string; test: (t: Task) => boolean }[] = [
  { key: 'overdue', label: 'Overdue', test: (t) => isOverdue(t) },
  { key: 'today', label: 'Due today', test: (t) => t.status !== 'done' && !!t.due_date && daysUntil(t.due_date) === 0 },
  { key: 'week', label: 'Next 7 days', test: (t) => t.status !== 'done' && !!t.due_date && daysUntil(t.due_date) > 0 && daysUntil(t.due_date) <= 7 },
  { key: 'later', label: 'Later', test: (t) => t.status !== 'done' && !!t.due_date && daysUntil(t.due_date) > 7 },
  { key: 'nodate', label: 'No due date', test: (t) => t.status !== 'done' && !t.due_date },
  { key: 'done', label: 'Done', test: (t) => t.status === 'done' },
];

export default async function MyWorkPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const filters = { ...parseFilters(sp), assignee: 'me' };
  const groupByDue = sp.group !== 'none' && sp.view !== 'board';
  const supabase = await db();
  const [projects, people, tasks] = await Promise.all([listProjects(supabase), listProfiles(supabase), listTasks(supabase, session.userId, filters)]);
  const refs = projects.map((p) => ({ id: p.id, name: p.name, manager_id: p.manager_id, memberIds: p.memberIds }));
  const myProjects = refs.filter((p) => p.memberIds.includes(session.userId) || p.manager_id === session.userId);
  // Members add tasks for themselves; managers default to themselves too (they can change it).
  const addable = refs.filter((p) => canAddTaskRef(p, session.profile));
  const view = sp.view === 'board' ? 'board' : 'list';
  const common = { projects: refs, people, me: session.profile };

  return (
    <>
      <PageHeader
        title="My Work"
        description="Everything assigned to you, across all projects. Open a task to post a progress update."
        actions={(
          <>
            {view === 'list' && (
              <Button asChild variant="outline" size="sm">
                <Link href={{ query: { ...Object.fromEntries(Object.entries(sp).filter(([, v]) => typeof v === 'string')), group: groupByDue ? 'none' : 'due' } }}>
                  {groupByDue ? 'Show as one list' : 'Group by due date'}
                </Link>
              </Button>
            )}
            <NewTaskDialog projects={addable} people={people} me={session.profile} defaults={{ assignee_id: session.userId }} label="Add my task" />
          </>
        )}
      />
      <TaskFilters projects={myProjects} hide={['assignee']} />
      {!groupByDue || tasks.length === 0 ? (
        <TaskViews view={view} tasks={tasks} {...common} emptyTitle="Nothing here" emptyDescription="No tasks assigned to you match these filters." />
      ) : (
        <div className="space-y-6">
          {GROUPS.map((g) => {
            const list = tasks.filter(g.test);
            if (!list.length) return null;
            return (
              <Card key={g.key} className="border-0 bg-transparent shadow-none">
                <CardHeader className="px-0 pt-0">
                  <CardTitle className={cn(g.key === 'overdue' && 'text-destructive')}>{g.label} <span className="font-normal text-muted-foreground">· {list.length}</span></CardTitle>
                </CardHeader>
                <CardContent className="px-0 pb-0"><TaskViews view="list" tasks={list} {...common} /></CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
}
