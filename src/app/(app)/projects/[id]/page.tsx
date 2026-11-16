import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, Pencil, Sparkles, Users } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/misc';
import { Avatar, HealthBadge, PriorityBadge, ProjectStatusBadge } from '@/components/badges';
import { ActivityFeed } from '@/components/work-items';
import { TaskFilters } from '@/components/tasks/task-filters';
import { TaskViews } from '@/components/tasks/task-views';
import { NewTaskDialog } from '@/components/tasks/task-form';
import { ProgressSummaryCard } from '@/components/ai/progress-summary-card';
import { RiskSignalsCard } from '@/components/ai/risk-signals-card';
import { requireSession } from '@/lib/session';
import { byId, canManage, db, getProjectDetail, listProfiles, listTasks, parseFilters } from '@/lib/queries';
import { observeRisks } from '@/lib/ai/risk-facts';
import { ROLE_LABEL, fmtDate } from '@/lib/domain';
import type { Artifact } from '@/lib/types';
import type { ProgressSummary, RiskSignalContent } from '@/lib/ai/schemas';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await db();
  const { data } = await supabase.from('projects').select('name').eq('id', id).maybeSingle();
  return { title: data?.name ?? 'Project' };
}

export default async function ProjectPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ id }, sp, session] = await Promise.all([params, searchParams, requireSession()]);
  const supabase = await db();
  const detail = await getProjectDetail(supabase, id);
  if (!detail) notFound(); // also covers "exists but you can't see it" — RLS hides it
  const { project, memberIds, activity, stats, health } = detail;
  const [people, filteredTasks] = await Promise.all([
    listProfiles(supabase),
    listTasks(supabase, session.userId, { ...parseFilters(sp), project: id }),
  ]);
  const peopleMap = byId(people);
  const manages = canManage(project, session.profile);
  const manager = project.manager_id ? peopleMap.get(project.manager_id) : null;
  const ref = { id: project.id, name: project.name, manager_id: project.manager_id, memberIds };
  const members = memberIds.map((m) => peopleMap.get(m)).filter((p): p is NonNullable<typeof p> => Boolean(p));
  const filtersActive = ['assignee', 'status', 'priority', 'due', 'q'].some((k) => sp[k]);

  let latestSummary: Artifact<ProgressSummary> | null = null;
  let signals: Artifact<RiskSignalContent>[] = [];
  let recentComments: { task_id: string; body: string; created_at: string }[] = [];
  if (manages) {
    const [{ data: s }, { data: r }] = await Promise.all([
      supabase.from('ai_generated_artifacts').select('*').eq('project_id', id).eq('kind', 'progress_summary').order('created_at', { ascending: false }).limit(1).maybeSingle(),
      supabase.from('ai_generated_artifacts').select('*').eq('project_id', id).eq('kind', 'risk_signal').eq('status', 'open').order('created_at', { ascending: false }).limit(30),
    ]);
    latestSummary = s as Artifact<ProgressSummary> | null;
    // Show the most recent scan only; older open signals are superseded.
    const open = (r ?? []) as Artifact<RiskSignalContent & { batch?: string }>[];
    const latestBatch = open[0]?.content.batch;
    signals = open.filter((x) => x.content.batch === latestBatch);
    const openIds = detail.tasks.filter((t) => t.status !== 'done').map((t) => t.id);
    if (openIds.length) {
      const { data: c } = await supabase.from('comments').select('task_id, body, created_at').in('task_id', openIds.slice(0, 300)).order('created_at', { ascending: false }).limit(200);
      recentComments = c ?? [];
    }
  }
  const aiEnabled = Boolean(process.env.ANTHROPIC_API_KEY);

  return (
    <>
      <PageHeader
        back={<Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">← Projects</Link>}
        title={project.name}
        actions={manages && (
          <>
            <Button asChild variant="ai"><Link href={`/projects/${id}/plan`}><Sparkles /> Draft tasks with AI</Link></Button>
            <Button asChild variant="outline"><Link href={`/projects/${id}/edit`}><Pencil /> Edit</Link></Button>
            <NewTaskDialog projects={[ref]} people={people} defaults={{ project_id: id }} label="Add task" />
          </>
        )}
      />

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="space-y-5 pt-5">
            <div className="flex flex-wrap gap-2">
              <ProjectStatusBadge status={project.status} />
              <HealthBadge health={health} />
              <PriorityBadge priority={project.priority} />
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">{project.description || <span className="text-muted-foreground">No description yet.</span>}</p>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Project manager</dt><dd className="mt-1 flex items-center gap-2 font-medium"><Avatar person={manager} />{manager?.full_name ?? 'Not assigned'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Timeline</dt><dd className="mt-1 flex items-center gap-1.5 font-medium"><CalendarDays className="size-4 text-muted-foreground" aria-hidden />{fmtDate(project.start_date, 'd MMM')} – {fmtDate(project.due_date, 'd MMM yyyy')}</dd></div>
              <div>
                <dt className="text-xs text-muted-foreground">Progress</dt>
                <dd className="mt-1.5"><div className="flex items-center gap-2"><Progress value={stats.percent} /><span className="text-xs tabular-nums">{stats.percent}%</span></div>
                  <p className="mt-1 text-xs text-muted-foreground">{stats.done}/{stats.total} done{stats.overdue ? ` · ${stats.overdue} overdue` : ''}</p></dd>
              </div>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Users className="size-4" aria-hidden /> Members</CardTitle><span className="text-xs text-muted-foreground">{members.length}</span></CardHeader>
          <CardContent>
            {members.length ? (
              <ul className="space-y-2.5">
                {members.map((m) => (
                  <li key={m.id} className="flex items-center gap-2.5 text-sm">
                    <Avatar person={m} size="md" />
                    <div className="min-w-0"><p className="truncate font-medium">{m.full_name}</p><p className="truncate text-xs text-muted-foreground">{m.job_title ?? ROLE_LABEL[m.role]}</p></div>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">No members yet.{manages && <> <Link href={`/projects/${id}/edit`} className="text-primary hover:underline">Add people</Link> so you can assign them tasks.</>}</p>
            )}
          </CardContent>
        </Card>
      </div>

      {manages && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <ProgressSummaryCard projectId={id} latest={latestSummary} aiEnabled={aiEnabled} />
          <RiskSignalsCard projectId={id} facts={observeRisks(project, detail.tasks, recentComments)} signals={signals} taskTitles={Object.fromEntries(detail.tasks.map((t) => [t.id, t.title]))} aiEnabled={aiEnabled} />
        </div>
      )}

      <section className="mt-8" aria-labelledby="tasks-heading">
        <h2 id="tasks-heading" className="mb-3 text-lg font-semibold">Tasks</h2>
        <TaskFilters people={people.filter((p) => memberIds.includes(p.id) || p.id === project.manager_id)} hide={['project']} />
        <TaskViews
          view={sp.view === 'board' ? 'board' : 'list'}
          tasks={filteredTasks}
          projects={[ref]}
          people={people}
          me={session.profile}
          showProject={false}
          emptyTitle={filtersActive ? 'No tasks match these filters' : 'No tasks yet'}
          emptyDescription={filtersActive ? 'Try clearing a filter.' : manages ? 'Add tasks one by one, or draft a plan with AI and pick the ones you want.' : 'Your project manager hasn’t added tasks yet.'}
          emptyAction={!filtersActive && manages ? <Button asChild variant="ai"><Link href={`/projects/${id}/plan`}><Sparkles /> Draft tasks with AI</Link></Button> : undefined}
        />
      </section>

      <Card className="mt-8">
        <CardHeader><CardTitle>Activity</CardTitle><CardDescription>Who changed what, and when</CardDescription></CardHeader>
        <CardContent><ActivityFeed items={activity} people={peopleMap} /></CardContent>
      </Card>
    </>
  );
}
