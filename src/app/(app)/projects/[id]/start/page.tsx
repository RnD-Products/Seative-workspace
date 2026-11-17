import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { format, startOfWeek, addDays } from 'date-fns';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { SalesCard } from '@/components/sales/sales-card';
import { TeamPicker, type Candidate } from '@/components/sales/incoming-actions';
import { requireSession } from '@/lib/session';
import { canManage, db, listProfiles } from '@/lib/queries';
import { ROLE_LABEL, todayISO } from '@/lib/domain';
import type { ProjectSales } from '@/lib/sales';

export const metadata = { title: 'Pick the team' };

export default async function StartProjectPage({ params }: { params: Promise<{ id: string }> }) {
  const [{ id }, session] = await Promise.all([params, requireSession()]);
  const supabase = await db();
  const { data: project } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
  if (!project) notFound();
  if (!canManage(project, session.profile)) redirect(`/projects/${id}`);

  const weekStart = format(startOfWeek(new Date(), { weekStartsOn: 0 }), 'yyyy-MM-dd');
  const weekEnd = format(addDays(startOfWeek(new Date(), { weekStartsOn: 0 }), 6), 'yyyy-MM-dd');
  const [people, { data: sales }, { data: members }, { data: tasks }, { data: time }] = await Promise.all([
    listProfiles(supabase),
    supabase.from('project_sales').select('*').eq('project_id', id).maybeSingle(),
    supabase.from('project_members').select('profile_id').eq('project_id', id),
    supabase.from('tasks').select('assignee_id, status, due_date').neq('status', 'done').not('assignee_id', 'is', null).limit(5000),
    supabase.from('time_entries').select('profile_id, minutes').gte('entry_date', weekStart).lte('entry_date', weekEnd).not('minutes', 'is', null).limit(5000),
  ]);
  const current = new Set((members ?? []).map((m) => m.profile_id));
  const today = todayISO();
  // Workload is what this manager can see (their projects; everything for the CEO).
  const candidates: Candidate[] = people
    .filter((p) => p.role !== 'sales')
    .map((p) => {
      const mine = (tasks ?? []).filter((t) => t.assignee_id === p.id);
      return {
        id: p.id, full_name: p.full_name, job_title: p.job_title, role: ROLE_LABEL[p.role], skills: p.skills ?? [],
        open: mine.length,
        dueWeek: mine.filter((t) => t.due_date && t.due_date >= today && t.due_date <= weekEnd).length,
        overdue: mine.filter((t) => t.due_date && t.due_date < today).length,
        weekMinutes: (time ?? []).filter((e) => e.profile_id === p.id).reduce((n, e) => n + (e.minutes ?? 0), 0),
        current: current.has(p.id),
      };
    });
  const s = sales as ProjectSales | null;
  const owner = s?.sales_owner_id ? people.find((p) => p.id === s.sales_owner_id) ?? null : null;

  return (
    <>
      <PageHeader
        back={<Link href={`/projects/${id}`} className="text-sm text-muted-foreground hover:text-foreground">← {project.name}</Link>}
        title="Pick the team"
        description={project.status === 'incoming' ? 'Choose designers and developers for this deal, then start the project. Everyone you pick is notified.' : 'Add more people to this project.'}
      />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <CardHeader><div><CardTitle>People</CardTitle><CardDescription>Best skill matches first, then the least busy. Workload counts open tasks you can see and hours logged this week.</CardDescription></div></CardHeader>
          <CardContent><TeamPicker projectId={id} candidates={candidates} required={s?.requirement_tags ?? []} defaultStart={project.start_date ?? today} /></CardContent>
        </Card>
        <div className="space-y-4">{s ? <SalesCard sales={s} owner={owner} canEdit={false} compact /> : <Card><CardContent className="pt-4 text-[13px] text-muted-foreground">No sales info on this project.</CardContent></Card>}</div>
      </div>
    </>
  );
}
