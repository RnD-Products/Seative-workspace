import Link from 'next/link';
import { Users } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/misc';
import { Avatar, RoleBadge } from '@/components/badges';
import { requireSession } from '@/lib/session';
import { db, listProfiles, listProjects } from '@/lib/queries';
import { daysUntil, isOverdue } from '@/lib/domain';
import type { Task } from '@/lib/types';

export const metadata = { title: 'Team' };

export default async function TeamPage() {
  const session = await requireSession();
  const { profile } = session;
  const supabase = await db();
  const [people, projects, { data: taskRows }] = await Promise.all([
    listProfiles(supabase), listProjects(supabase), supabase.from('tasks').select('id, project_id, assignee_id, status, due_date, completed_at').limit(5000),
  ]);
  const tasks = (taskRows ?? []) as Pick<Task, 'id' | 'project_id' | 'assignee_id' | 'status' | 'due_date' | 'completed_at'>[];

  // Scope: CEO → everyone; PM → people on projects they manage; employee → people on shared projects.
  const scopedProjects = profile.role === 'ceo' ? projects : profile.role === 'pm' ? projects.filter((p) => p.manager_id === profile.id) : projects;
  const scopedIds = new Set(scopedProjects.map((p) => p.id));
  const memberSet = new Set(scopedProjects.flatMap((p) => [...p.memberIds, p.manager_id].filter(Boolean) as string[]));
  const visiblePeople = (profile.role === 'ceo' ? people : people.filter((p) => memberSet.has(p.id) || p.id === profile.id)).filter((p) => p.role !== 'sales');
  const scopedTasks = tasks.filter((t) => scopedIds.has(t.project_id));
  const showNumbers = profile.role !== 'employee';

  const rows = visiblePeople.map((p) => {
    const mine = scopedTasks.filter((t) => t.assignee_id === p.id);
    const open = mine.filter((t) => t.status !== 'done');
    return {
      person: p,
      projects: scopedProjects.filter((pr) => pr.memberIds.includes(p.id) || pr.manager_id === p.id),
      open: open.length,
      inProgress: open.filter((t) => t.status === 'in_progress' || t.status === 'in_review').length,
      overdue: open.filter(isOverdue).length,
      dueSoon: open.filter((t) => t.due_date && daysUntil(t.due_date) >= 0 && daysUntil(t.due_date) <= 7).length,
      doneRecently: mine.filter((t) => t.completed_at && Date.now() - Date.parse(t.completed_at) < 14 * 864e5).length,
    };
  });

  return (
    <>
      <PageHeader
        title="Team"
        description={profile.role === 'ceo' ? 'Everyone in the organization and their current workload' : profile.role === 'pm' ? 'People on the projects you manage, with workload on those projects' : 'People you work with on shared projects'}
      />
      {rows.length === 0 ? (
        <Card><EmptyState icon={Users} title="No teammates to show yet" description="People appear here once they share a project with you." /></Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <caption className="sr-only">Team members{showNumbers ? ' and workload' : ''}</caption>
              <thead className="border-b text-left text-[13px] text-muted-foreground">
                <tr>
                  <th className="px-4 py-2.5 font-medium">Person</th>
                  <th className="py-2.5 font-medium">Projects</th>
                  {showNumbers && <>
                    <th className="py-2.5 text-right font-medium">Open</th>
                    <th className="py-2.5 text-right font-medium">In progress</th>
                    <th className="py-2.5 text-right font-medium">Due in 7 days</th>
                    <th className="py-2.5 text-right font-medium">Overdue</th>
                    <th className="px-4 py-2.5 text-right font-medium">Done (14 days)</th>
                  </>}
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((r) => (
                  <tr key={r.person.id} className="align-top">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-3">
                        <Avatar person={r.person} size="md" />
                        <div className="min-w-0">
                          <p className="font-medium">{r.person.full_name}{r.person.id === profile.id && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</p>
                          <p className="flex items-center gap-2 text-xs text-muted-foreground">{r.person.job_title ?? ''} <RoleBadge role={r.person.role} /></p>
                          {(r.person.skills ?? []).length > 0 && <p className="mt-1 flex flex-wrap gap-1">{(r.person.skills ?? []).map((sk) => <span key={sk} className="rounded-[4px] border border-border-strong px-1.5 text-[11px] text-muted-foreground">{sk}</span>)}</p>}
                        </div>
                      </div>
                    </td>
                    <td className="py-3 pr-4">
                      <div className="flex max-w-xs flex-wrap gap-1">
                        {r.projects.length ? r.projects.slice(0, 4).map((p) => <Link key={p.id} href={`/projects/${p.id}`} className="rounded bg-muted px-1.5 py-0.5 text-xs hover:bg-muted/70">{p.name}</Link>) : <span className="text-xs text-muted-foreground">—</span>}
                        {r.projects.length > 4 && <span className="text-xs text-muted-foreground">+{r.projects.length - 4}</span>}
                      </div>
                    </td>
                    {showNumbers && <>
                      <td className="py-3 text-right tabular-nums">{r.open ? <Link className="hover:underline" href={`/tasks?assignee=${r.person.id}&status=open`}>{r.open}</Link> : 0}</td>
                      <td className="py-3 text-right tabular-nums">{r.inProgress}</td>
                      <td className="py-3 text-right tabular-nums">{r.dueSoon}</td>
                      <td className={`py-3 text-right tabular-nums ${r.overdue ? 'font-medium text-destructive' : ''}`}>{r.overdue}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{r.doneRecently}</td>
                    </>}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {showNumbers && <p className="mt-3 text-xs text-muted-foreground">Listed alphabetically. Figures show assigned work to help balance load — they are not a performance measure.</p>}
    </>
  );
}
