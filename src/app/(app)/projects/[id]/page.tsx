import Link from 'next/link';
import { notFound } from 'next/navigation';
import { CalendarDays, History, MessagesSquare, OctagonAlert, Pencil, Sparkles, Users } from 'lucide-react';
import { BlockerRows, RaiseBlockerDialog } from '@/components/blockers/blocker-ui';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/misc';
import { Avatar, HealthBadge, PriorityBadge, ProjectStatusBadge } from '@/components/badges';
import { ActivityFeed } from '@/components/work-items';
import { TaskFilters } from '@/components/tasks/task-filters';
import { TaskViews } from '@/components/tasks/task-views';
import { NewTaskDialog } from '@/components/tasks/task-form';
import { TimeTracker, type TimeRow } from '@/components/time/time-tracker';
import { format, startOfWeek } from 'date-fns';
import { ProgressSummaryCard } from '@/components/ai/progress-summary-card';
import { RiskSignalsCard } from '@/components/ai/risk-signals-card';
import { requireSession } from '@/lib/session';
import { byId, canManage, db, getProjectDetail, listProfiles, listTasks, parseFilters } from '@/lib/queries';
import { observeRisks } from '@/lib/ai/risk-facts';
import { ROLE_LABEL, fmtDate, projectHealth, projectStats } from '@/lib/domain';
import { SalesCard } from '@/components/sales/sales-card';
import { TakeProjectButton } from '@/components/sales/incoming-actions';
import type { ProjectSales } from '@/lib/sales';
import type { Artifact, Task } from '@/lib/types';
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
  const { project, memberIds, activity, stats, health, blockers } = detail;
  const [people, filteredTasks, { data: timeData }, { data: myRun }, { data: salesRow }] = await Promise.all([
    listProfiles(supabase),
    listTasks(supabase, session.userId, { ...parseFilters(sp), project: id }),
    supabase.from('time_entries').select('id, task_id, profile_id, entry_date, minutes, note')
      .eq('project_id', id).not('minutes', 'is', null)
      .order('entry_date', { ascending: false }).order('created_at', { ascending: false }).limit(1000),
    supabase.from('time_entries').select('id, project_id, task_id, started_at, projects(name), tasks(title)')
      .eq('profile_id', session.userId).is('minutes', null).is('ended_at', null).maybeSingle(),
    supabase.from('project_sales').select('*').eq('project_id', id).maybeSingle(),
  ]);
  const sales = salesRow as ProjectSales | null;
  const timeRows = (timeData ?? []) as TimeRow[];
  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');
  const byPerson = new Map<string, number>();
  for (const e of timeRows) byPerson.set(e.profile_id, (byPerson.get(e.profile_id) ?? 0) + e.minutes);
  const timeTotals = {
    total: timeRows.reduce((n, e) => n + e.minutes, 0),
    week: timeRows.filter((e) => e.entry_date >= weekStart).reduce((n, e) => n + e.minutes, 0),
    byPerson: [...byPerson].map(([pid, minutes]) => ({ id: pid, minutes })).sort((a, b) => b.minutes - a.minutes),
  };
  const run = myRun as unknown as { id: string; project_id: string; task_id: string | null; started_at: string; projects: { name: string } | null; tasks: { title: string } | null } | null;
  const myTimer = run ? { id: run.id, project_id: run.project_id, task_id: run.task_id, started_at: run.started_at, project_name: run.projects?.name ?? 'Project', task_title: run.tasks?.title ?? null } : null;
  const peopleMap = byId(people);
  const manages = canManage(project, session.profile);
  const isMember = memberIds.includes(session.userId);
  // Salespeople who are not on the team get a read-only deal view: no tasks, time or chat.
  const dealView = session.profile.role === 'sales' && !isMember && !manages;
  let shownStats = stats;
  let shownHealth = health;
  if (dealView) {
    const { data: rows } = await supabase.rpc('deal_task_rows');
    const mine = ((rows ?? []) as { project_id: string; status: Task['status']; due_date: string | null }[]).filter((r) => r.project_id === id);
    shownStats = projectStats(mine);
    shownHealth = projectHealth(project, shownStats);
  }
  const canTake = project.status === 'incoming' && !project.manager_id && session.profile.role === 'pm';
  const openBlockers = blockers.filter((b) => b.status === 'open');
  const resolvedBlockers = blockers.filter((b) => b.status === 'resolved');
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
  const { data: chatRows } = await supabase.rpc('my_chats');
  const chatUnread = ((chatRows ?? []) as { project_id: string | null; unread: number }[]).find((c) => c.project_id === id)?.unread ?? 0;
  const chatButton = (
    <Button asChild variant="outline"><Link href={`/projects/${id}/chat`}><MessagesSquare /> Team chat{chatUnread > 0 && <span className="rounded-full bg-primary px-1.5 text-[11px] font-semibold leading-[18px] text-primary-foreground">{chatUnread}</span>}</Link></Button>
  );

  return (
    <>
      <PageHeader
        back={<Link href="/projects" className="text-sm text-muted-foreground hover:text-foreground">← Projects</Link>}
        title={project.name}
        actions={manages ? (
          <>
            {chatButton}
            <Button asChild variant="ai"><Link href={`/projects/${id}/plan`}><Sparkles /> Draft tasks with AI</Link></Button>
            <Button asChild variant="outline"><Link href={`/projects/${id}/edit`}><Pencil /> Edit</Link></Button>
            <NewTaskDialog projects={[ref]} people={people} me={session.profile} defaults={{ project_id: id }} label="Add task" />
          </>
        ) : isMember ? (
          <>{chatButton}<NewTaskDialog projects={[ref]} people={people} me={session.profile} defaults={{ project_id: id }} label="Add my task" /></>
        ) : chatButton}
      />

      {project.status === 'incoming' && (
        <div className="mb-4 flex flex-col gap-3 rounded-lg border border-deadline/30 bg-deadline-soft px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[13px] font-semibold text-deadline">Incoming project</p>
            <p className="text-[13px] text-foreground/80">
              {!project.manager_id ? 'A new deal from Sales. It needs a project manager.' : manages ? 'Pick the team to start this project.' : `Waiting for ${manager?.full_name ?? 'the PM'} to pick the team.`}
            </p>
          </div>
          <div className="flex gap-2">
            {canTake && <TakeProjectButton projectId={id} name={project.name} />}
            {manages && project.manager_id && <Button asChild><Link href={`/projects/${id}/start`}><Users /> Pick team &amp; start</Link></Button>}
            {session.profile.role === 'ceo' && !project.manager_id && <Button asChild variant="outline"><Link href="/incoming">Assign a PM</Link></Button>}
          </div>
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[1fr_320px]">
        <Card>
          <CardContent className="space-y-5 pt-5">
            <div className="flex flex-wrap gap-2">
              <ProjectStatusBadge status={project.status} />
              <HealthBadge health={shownHealth} />
              <PriorityBadge priority={project.priority} />
            </div>
            <p className="whitespace-pre-line text-sm leading-relaxed text-foreground/80">{project.description || <span className="text-muted-foreground">No description yet.</span>}</p>
            <dl className="grid gap-4 text-sm sm:grid-cols-3">
              <div><dt className="text-xs text-muted-foreground">Project manager</dt><dd className="mt-1 flex items-center gap-2 font-medium"><Avatar person={manager} />{manager?.full_name ?? 'Not assigned'}</dd></div>
              <div><dt className="text-xs text-muted-foreground">Timeline</dt><dd className="mt-1 flex items-center gap-1.5 font-medium"><CalendarDays className="size-4 text-muted-foreground" aria-hidden />{fmtDate(project.start_date, 'd MMM')} – {fmtDate(project.due_date, 'd MMM yyyy')}</dd></div>
              <div>
                <dt className="text-xs text-muted-foreground">Progress</dt>
                <dd className="mt-1.5"><div className="flex items-center gap-2"><Progress value={shownStats.percent} /><span className="text-xs tabular-nums">{shownStats.percent}%</span></div>
                  <p className="mt-1 text-xs text-muted-foreground">{shownStats.done}/{shownStats.total} done{shownStats.overdue ? ` · ${shownStats.overdue} overdue` : ''}</p></dd>
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

      {sales && (
        <div className="mt-6">
          <SalesCard sales={sales} owner={sales.sales_owner_id ? peopleMap.get(sales.sales_owner_id) ?? null : null}
            canEdit={session.profile.role === 'ceo' || sales.sales_owner_id === session.userId}
            minutesLogged={dealView ? undefined : timeTotals.total} />
        </div>
      )}

      {manages && project.status !== 'incoming' && (
        <div className="mt-6 grid gap-6 lg:grid-cols-2">
          <ProgressSummaryCard projectId={id} latest={latestSummary} aiEnabled={aiEnabled} />
          <RiskSignalsCard projectId={id} facts={observeRisks(project, detail.tasks, recentComments)} signals={signals} taskTitles={Object.fromEntries(detail.tasks.map((t) => [t.id, t.title]))} aiEnabled={aiEnabled} />
        </div>
      )}

      <Card className="mt-6 scroll-mt-20" id="blockers">
        <CardHeader>
          <div>
            <CardTitle className="flex items-center gap-2"><OctagonAlert className="size-4 text-destructive" aria-hidden /> Blockers
              {openBlockers.length > 0 && <span className="rounded-full bg-destructive-soft px-2 text-[12px] font-medium text-destructive">{openBlockers.length} open</span>}
            </CardTitle>
            <CardDescription>What is stopping work, and whose side it is on.</CardDescription>
          </div>
          {(manages || isMember || session.profile.role === 'ceo' || sales?.sales_owner_id === session.userId) && project.status !== 'completed' && (
            <RaiseBlockerDialog projectId={id} tasks={dealView ? [] : detail.tasks.filter((t) => t.status !== 'done').map((t) => ({ id: t.id, title: t.title }))}
              people={people.filter((p) => memberIds.includes(p.id) || p.id === project.manager_id).map((p) => ({ id: p.id, full_name: p.full_name }))}
              salesOnly={dealView} />
          )}
        </CardHeader>
        <CardContent>
          {blockers.length === 0 ? <p className="py-2 text-[13px] text-muted-foreground">Nothing is blocked right now.</p> : (
            <>
              <BlockerRows blockers={openBlockers} people={people} tasks={detail.tasks} meId={session.userId} managerIds={manages ? [id] : []} />
              {resolvedBlockers.length > 0 && (
                <details className="mt-2 border-t pt-2">
                  <summary className="cursor-pointer text-[12.5px] text-muted-foreground hover:text-foreground">{resolvedBlockers.length} resolved</summary>
                  <BlockerRows blockers={resolvedBlockers} people={people} tasks={detail.tasks} meId={session.userId} managerIds={manages ? [id] : []} />
                </details>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {!dealView && (<>
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
          emptyDescription={filtersActive ? 'Try clearing a filter.' : manages ? 'Add tasks one by one, or draft a plan with AI and pick the ones you want.' : isMember ? 'No tasks yet. Use “Add my task” to add something you’re working on.' : 'Your project manager hasn’t added tasks yet.'}
          emptyAction={!filtersActive && manages ? <Button asChild variant="ai"><Link href={`/projects/${id}/plan`}><Sparkles /> Draft tasks with AI</Link></Button> : undefined}
          quickAdd={manages || isMember ? { projectId: id, selfId: manages ? null : session.userId } : undefined}
          blockedTaskIds={openBlockers.map((b) => b.task_id).filter((x): x is string => Boolean(x))}
        />
      </section>

      <section className="mt-8" id="time">
        <TimeTracker
          projectId={id}
          tasks={detail.tasks.filter((t) => t.status !== 'done' || timeRows.some((e) => e.task_id === t.id)).map((t) => ({ id: t.id, title: t.title }))}
          people={people.map((p) => ({ id: p.id, full_name: p.full_name }))}
          entries={timeRows}
          totals={timeTotals}
          timer={myTimer}
          canLog={manages || memberIds.includes(session.userId) || session.profile.role === 'ceo'}
          canDeleteAll={manages}
          meId={session.userId}
        />
      </section>
      </>)}

      <Card className="mt-8">
        <CardHeader><div><CardTitle>Activity</CardTitle><CardDescription>The latest changes. The full history has every change, with filters.</CardDescription></div><Button asChild size="sm" variant="outline"><Link href={`/projects/${id}/history`}><History /> Full history</Link></Button></CardHeader>
        <CardContent><ActivityFeed items={activity} people={peopleMap} /></CardContent>
      </Card>
    </>
  );
}
