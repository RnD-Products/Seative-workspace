import Link from 'next/link';
import { AlarmClock, CheckCircle2, CircleCheckBig, FolderKanban, Inbox, ListTodo, Percent, TriangleAlert } from 'lucide-react';
import { WeekStrip } from '@/components/week-strip';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState, Progress } from '@/components/ui/misc';
import { HealthBadge, Avatar } from '@/components/badges';
import { ActivityFeed, StatCard, TaskRow } from '@/components/work-items';
import { CategoryBars, WorkloadBars } from '@/components/charts';
import { OrgSummaryCard } from '@/components/ai/org-summary-card';
import { requireSession } from '@/lib/session';
import { projectColor } from '@/lib/colors';
import { byId, db, listProfiles, listProjects } from '@/lib/queries';
import { PROJECT_STATUS_LABEL, TASK_STATUS_LABEL, daysUntil, fmtDate, isOverdue } from '@/lib/domain';
import type { Activity, Artifact, Task } from '@/lib/types';

export const metadata = { title: 'Overview' };

const STATUS_COLOR = { todo: '#94a0b8', in_progress: '#2f6fd6', in_review: '#e09b26', done: '#17a673' };
const PROJECT_COLOR = { planning: '#5b6cff', active: '#2f6fd6', on_hold: '#e09b26', completed: '#17a673' };

export default async function OverviewPage() {
  const session = await requireSession();
  const { profile } = session;
  const supabase = await db();
  const [projects, people, { data: taskRows }, { data: activityRows }] = await Promise.all([
    listProjects(supabase),
    listProfiles(supabase),
    supabase.from('tasks').select('*').limit(2000),
    supabase.from('activity_log').select('*').order('created_at', { ascending: false }).limit(12),
  ]);
  const tasks = (taskRows ?? []) as Task[];
  const activity = (activityRows ?? []) as Activity[];
  const peopleMap = byId(people);
  const projectMap = byId(projects);
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Dhaka' }).format(new Date()));
  const greeting = `${hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening'}, ${profile.full_name.split(' ')[0]}`;
  const today = new Intl.DateTimeFormat('en-GB', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'Asia/Dhaka' }).format(new Date());
  const projectNames = new Map(projects.map((p) => [p.id, p.name]));

  // ---------------- Employee ----------------
  if (profile.role === 'employee') {
    const mine = tasks.filter((t) => t.assignee_id === profile.id);
    const open = mine.filter((t) => t.status !== 'done').sort((a, b) => (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999'));
    const overdue = open.filter(isOverdue);
    const dueSoon = open.filter((t) => t.due_date && daysUntil(t.due_date) >= 0 && daysUntil(t.due_date) <= 7);
    const doneRecently = mine.filter((t) => t.completed_at && Date.now() - Date.parse(t.completed_at) < 14 * 864e5);
    return (
      <>
        <PageHeader title={greeting} description={today} actions={<Button asChild variant="outline"><Link href="/my-work">Open My Work</Link></Button>} />
        <WeekStrip tasks={mine} projectNames={projectNames} title="Your week" />
        <div className="stagger mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard icon={ListTodo} label="Open tasks" value={open.length} />
          <StatCard icon={AlarmClock} label="Due in the next 7 days" value={dueSoon.length} tone="amber" />
          <StatCard icon={TriangleAlert} label="Overdue" value={overdue.length} tone="red" />
          <StatCard icon={CircleCheckBig} label="Completed in the last 14 days" value={doneRecently.length} />
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
          <Card>
            <CardHeader><CardTitle>Up next</CardTitle><CardDescription>Your open tasks, soonest first</CardDescription></CardHeader>
            <CardContent>
              {open.length ? (
                <ul className="-mx-2 divide-y">{open.slice(0, 10).map((t) => <TaskRow key={t.id} task={t} project={projectMap.get(t.project_id)} />)}</ul>
              ) : (
                <EmptyState icon={CheckCircle2} title="You're all caught up" description="No open tasks are assigned to you right now." />
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Recent updates</CardTitle><CardDescription>From projects you&apos;re on</CardDescription></CardHeader>
            <CardContent><ActivityFeed items={activity} people={peopleMap} projects={projectMap} emptyText="Updates from your projects will appear here." /></CardContent>
          </Card>
        </div>
      </>
    );
  }

  // ---------------- PM & CEO ----------------
  const isCeo = profile.role === 'ceo';
  const scoped = isCeo ? projects : projects.filter((p) => p.manager_id === profile.id);
  const scopedIds = new Set(scoped.map((p) => p.id));
  const scopedTasks = tasks.filter((t) => scopedIds.has(t.project_id));
  const openTasks = scopedTasks.filter((t) => t.status !== 'done');
  const overdue = openTasks.filter(isOverdue).sort((a, b) => (a.due_date ?? '').localeCompare(b.due_date ?? ''));
  const live = scoped.filter((p) => p.status !== 'completed');
  const needsAttention = live.filter((p) => p.health === 'at_risk' || p.health === 'off_track');
  const done = scopedTasks.filter((t) => t.status === 'done').length;

  const workload = people
    .filter((p) => openTasks.some((t) => t.assignee_id === p.id))
    .map((p) => {
      const mineOpen = openTasks.filter((t) => t.assignee_id === p.id);
      const od = mineOpen.filter(isOverdue).length;
      return { name: p.full_name, open: mineOpen.length - od, overdue: od };
    });
  const unassigned = openTasks.filter((t) => !t.assignee_id).length;

  let orgSummary: Artifact | null = null;
  if (isCeo) {
    const { data } = await supabase.from('ai_generated_artifacts').select('*').eq('kind', 'org_summary').order('created_at', { ascending: false }).limit(1).maybeSingle();
    orgSummary = data as Artifact | null;
  }

  return (
    <>
      <PageHeader title={greeting} description={isCeo ? `${today}. Here's the whole company.` : `${today}. Here are the projects you manage.`} />
      <WeekStrip tasks={scopedTasks} projectNames={projectNames} title={isCeo ? 'This week across the company' : 'This week on your projects'} />
      <div className="stagger mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard icon={FolderKanban} label={isCeo ? 'Active projects' : 'Your active projects'} value={live.length} hint={needsAttention.length ? `${needsAttention.length} need attention` : 'All on track'} />
        <StatCard icon={Percent} label="Task completion" value={`${scopedTasks.length ? Math.round((done / scopedTasks.length) * 100) : 0}%`} hint={`${done} of ${scopedTasks.length} tasks done`} />
        <StatCard icon={ListTodo} label="Open tasks" value={openTasks.length} hint={unassigned ? `${unassigned} unassigned` : 'All assigned'} />
        <StatCard icon={TriangleAlert} label="Overdue tasks" value={overdue.length} tone="red" />
      </div>

      {isCeo && <div className="mt-6"><OrgSummaryCard latest={orgSummary} aiEnabled={Boolean(process.env.ANTHROPIC_API_KEY)} /></div>}

      {scoped.length === 0 ? (
        <Card className="mt-6">
          <EmptyState icon={Inbox} title="No projects yet" description={isCeo ? 'Create the first project and assign a project manager.' : 'Projects you create or are made manager of will show up here.'}
            action={<Button asChild><Link href="/projects/new">Create a project</Link></Button>} />
        </Card>
      ) : (
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Card className="lg:col-span-2">
            <CardHeader><CardTitle>Project health</CardTitle><CardDescription>Calculated from task status and due dates</CardDescription></CardHeader>
            <CardContent>
              <div className="-mx-5 overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="text-left text-[13px] text-muted-foreground">
                    <tr><th className="px-5 py-2 font-medium">Project</th>{isCeo && <th className="py-2 font-medium">Manager</th>}<th className="py-2 font-medium">Progress</th><th className="py-2 font-medium">Due</th><th className="py-2 font-medium">Overdue</th><th className="px-5 py-2 font-medium">Health</th></tr>
                  </thead>
                  <tbody className="divide-y">
                    {live.map((p) => (
                      <tr key={p.id} className="hover:bg-muted/40">
                        <td className="px-5 py-3"><Link href={`/projects/${p.id}`} className="flex items-center gap-2.5 font-medium hover:underline"><span aria-hidden className="size-2.5 rounded-[3px]" style={{ background: projectColor(p.id) }} />{p.name}</Link></td>
                        {isCeo && <td className="py-3"><span className="flex items-center gap-2"><Avatar person={p.manager_id ? peopleMap.get(p.manager_id) : null} />{p.manager_id ? peopleMap.get(p.manager_id)?.full_name : 'Unassigned'}</span></td>}
                        <td className="w-48 py-3 pr-4"><div className="flex items-center gap-2"><Progress value={p.stats.percent} /><span className="w-9 text-right text-xs tabular-nums text-muted-foreground">{p.stats.percent}%</span></div></td>
                        <td className="py-3 text-muted-foreground">{fmtDate(p.due_date, 'd MMM')}</td>
                        <td className={p.stats.overdue ? 'py-3 font-medium text-destructive' : 'py-3 text-muted-foreground'}>{p.stats.overdue}</td>
                        <td className="px-5 py-3"><HealthBadge health={p.health} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {isCeo && (
            <Card>
              <CardHeader><CardTitle>Projects by status</CardTitle></CardHeader>
              <CardContent>
                <CategoryBars label="Projects by status" data={(['planning', 'active', 'on_hold', 'completed'] as const).map((s) => ({ name: PROJECT_STATUS_LABEL[s], value: projects.filter((p) => p.status === s).length, color: PROJECT_COLOR[s] }))} />
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader><CardTitle>Tasks by status</CardTitle></CardHeader>
            <CardContent>
              <CategoryBars label="Tasks by status" data={(['todo', 'in_progress', 'in_review', 'done'] as const).map((s) => ({ name: TASK_STATUS_LABEL[s], value: scopedTasks.filter((t) => t.status === s).length, color: STATUS_COLOR[s] }))} />
            </CardContent>
          </Card>

          <Card className={isCeo ? '' : ''}>
            <CardHeader><CardTitle>Team workload</CardTitle><CardDescription>Open tasks per person{isCeo ? '' : ' on your projects'}</CardDescription></CardHeader>
            <CardContent>
              {workload.length ? <WorkloadBars data={workload} /> : <p className="py-6 text-center text-sm text-muted-foreground">No open tasks are assigned yet.</p>}
            </CardContent>
          </Card>

          <Card className={isCeo ? 'lg:col-span-1' : ''}>
            <CardHeader><CardTitle>Overdue work</CardTitle><CardDescription>Open tasks past their due date</CardDescription></CardHeader>
            <CardContent>
              {overdue.length ? (
                <ul className="-mx-2 divide-y">{overdue.slice(0, 8).map((t) => <TaskRow key={t.id} task={t} project={projectMap.get(t.project_id)} assignee={t.assignee_id ? peopleMap.get(t.assignee_id) ?? null : null} />)}</ul>
              ) : (
                <EmptyState icon={CheckCircle2} title="Nothing overdue" className="py-8" />
              )}
            </CardContent>
          </Card>

          <Card className={isCeo ? 'lg:col-span-2' : ''}>
            <CardHeader><CardTitle>Recent activity</CardTitle></CardHeader>
            <CardContent><ActivityFeed items={activity} people={peopleMap} projects={projectMap} /></CardContent>
          </Card>
        </div>
      )}
    </>
  );
}
