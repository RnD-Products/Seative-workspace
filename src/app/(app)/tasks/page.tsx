import Link from 'next/link';
import { PageHeader } from '@/components/page-header';
import { Button } from '@/components/ui/button';
import { TaskFilters } from '@/components/tasks/task-filters';
import { TaskViews } from '@/components/tasks/task-views';
import { NewTaskDialog } from '@/components/tasks/task-form';
import { canManageRef } from '@/components/tasks/types';
import { requireSession } from '@/lib/session';
import { db, listProfiles, listProjects, listTasks, parseFilters } from '@/lib/queries';

export const metadata = { title: 'All tasks' };

export default async function TasksPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const supabase = await db();
  const [projects, people, tasks] = await Promise.all([
    listProjects(supabase), listProfiles(supabase), listTasks(supabase, session.userId, parseFilters(sp)),
  ]);
  const refs = projects.map((p) => ({ id: p.id, name: p.name, manager_id: p.manager_id, memberIds: p.memberIds }));
  const manageable = refs.filter((p) => canManageRef(p, session.profile));
  return (
    <>
      <PageHeader
        title="All tasks"
        description="Every task in the projects you can see"
        back={<Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">← Projects</Link>}
        actions={<NewTaskDialog projects={manageable} people={people} />}
      />
      <TaskFilters projects={refs} people={people} />
      <TaskViews
        view={sp.view === 'board' ? 'board' : 'list'}
        tasks={tasks}
        projects={refs}
        people={people}
        me={session.profile}
        emptyTitle="No tasks found"
        emptyDescription={projects.length ? 'No tasks match these filters.' : "You aren't on any projects yet."}
        emptyAction={projects.length ? <Button asChild variant="outline"><Link href="/tasks">Clear filters</Link></Button> : undefined}
      />
    </>
  );
}
