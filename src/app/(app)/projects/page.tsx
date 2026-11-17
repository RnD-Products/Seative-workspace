import Link from 'next/link';
import { CalendarDays, FolderKanban, ListChecks, Plus, Search } from 'lucide-react';
import { projectColor } from '@/lib/colors';
import { cn } from '@/lib/utils';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { EmptyState } from '@/components/ui/misc';
import { Avatar, HealthBadge } from '@/components/badges';
import { requireSession, canCreateProjects } from '@/lib/session';
import { byId, db, listProfiles, listProjects } from '@/lib/queries';
import { PROJECT_STATUSES, PROJECT_STATUS_LABEL, daysUntil, fmtDate } from '@/lib/domain';

export const metadata = { title: 'Projects' };

export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await requireSession();
  const sp = await searchParams;
  const q = (sp.q ?? '').trim().toLowerCase().slice(0, 100);
  const status = (['incoming', ...PROJECT_STATUSES] as string[]).includes(sp.status ?? '') ? sp.status : '';
  const scope = sp.scope === 'mine' ? 'mine' : 'all';
  const supabase = await db();
  const [all, people] = await Promise.all([listProjects(supabase), listProfiles(supabase)]);
  const peopleMap = byId(people);
  const projects = all.filter((p) =>
    (!q || p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q))
    && (!status || p.status === status)
    && (scope === 'all' || p.manager_id === session.userId || p.memberIds.includes(session.userId)));
  const filtered = Boolean(q || status || scope === 'mine');

  return (
    <>
      <PageHeader
        title={session.profile.role === 'sales' ? 'Deals' : 'Projects'}
        description={session.profile.role === 'sales' ? 'Projects you sold, with their progress' : session.profile.role === 'employee' ? 'Projects you are a member of' : session.profile.role === 'pm' ? 'Projects you manage or belong to' : 'Every project in your organization'}
        actions={session.profile.role === 'sales' ? <Button asChild><Link href="/deals/new"><Plus /> New deal</Link></Button> : <>
          <Button asChild variant="outline"><Link href="/tasks"><ListChecks /> All tasks</Link></Button>
        </>}
      />
      <form className="mb-5 flex flex-col gap-2 sm:flex-row" role="search">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-2.5 size-4 text-muted-foreground" aria-hidden />
          <label htmlFor="q" className="sr-only">Search projects</label>
          <Input id="q" name="q" defaultValue={sp.q ?? ''} placeholder="Search projects" className="pl-9" />
        </div>
        <label htmlFor="status" className="sr-only">Status</label>
        <NativeSelect id="status" name="status" defaultValue={status} className="sm:w-44">
          <option value="">All statuses</option>
          {(['incoming', ...PROJECT_STATUSES] as const).map((s) => <option key={s} value={s}>{PROJECT_STATUS_LABEL[s]}</option>)}
        </NativeSelect>
        {(session.profile.role === 'pm' || session.profile.role === 'ceo') && (
          <>
            <label htmlFor="scope" className="sr-only">Scope</label>
            <NativeSelect id="scope" name="scope" defaultValue={scope} className="sm:w-44">
              <option value="all">All visible projects</option>
              <option value="mine">Only mine</option>
            </NativeSelect>
          </>
        )}
        <Button type="submit" variant="secondary">Apply</Button>
        {filtered && <Button asChild variant="ghost"><Link href="/projects">Clear</Link></Button>}
      </form>

      {projects.length === 0 ? (
        <Card>
          {filtered ? (
            <EmptyState icon={Search} title="No projects match these filters" description="Try a different search or clear the filters." action={<Button asChild variant="outline"><Link href="/projects">Clear filters</Link></Button>} />
          ) : (
            <EmptyState
              icon={FolderKanban}
              title="No projects yet"
              description={canCreateProjects(session) ? 'Create a project to start planning work with your team.' : "You haven't been added to any projects yet. Your project manager will add you."}
              action={canCreateProjects(session) ? <Button asChild><Link href="/projects/new"><Plus /> Create a project</Link></Button> : undefined}
            />
          )}
        </Card>
      ) : (
        <ul className="stagger grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {projects.map((p) => {
            const manager = p.manager_id ? peopleMap.get(p.manager_id) : null;
            const team = p.memberIds.map((id) => peopleMap.get(id)).filter((x): x is NonNullable<typeof x> => Boolean(x));
            const color = projectColor(p.id);
            const left = p.due_date ? daysUntil(p.due_date) : null;
            const soon = left !== null && left >= 0 && left <= 14 && p.status !== 'completed';
            const late = left !== null && left < 0 && p.status !== 'completed';
            return (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="lift sheen glow-ring group relative flex h-full flex-col overflow-hidden rounded-lg border bg-card p-4 hover:border-primary/40">
                                    <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span aria-hidden className="grid size-7 shrink-0 place-items-center rounded-md text-[12px] font-semibold text-white" style={{ background: color, boxShadow: `0 0 16px -2px ${color}` }}>{p.name.trim()[0]?.toUpperCase()}</span>
                      <div className="min-w-0">
                        <h2 className="truncate text-[14px] font-semibold">{p.name}</h2>
                        <p className="truncate text-[12px] text-muted-foreground">{manager ? `Led by ${manager.full_name}` : 'No manager yet'}</p>
                      </div>
                    </div>
                    <HealthBadge health={p.health} />
                  </div>
                  <p className="mt-3 line-clamp-2 min-h-[38px] text-[13px] leading-[1.45] text-muted-foreground">{p.description || 'No description yet.'}</p>
                  <div className="mt-4">
                    <div className="mb-1.5 flex items-baseline justify-between text-[12px]">
                      <span className="text-muted-foreground">{p.stats.done} of {p.stats.total} tasks done</span>
                      <span className="font-medium text-foreground tabular">{p.stats.percent}%</span>
                    </div>
                    <div className="h-1 overflow-hidden rounded-full bg-foreground/[0.08]"><div className="h-full rounded-full" style={{ width: `${p.stats.percent}%`, background: color, boxShadow: `0 0 10px ${color}` }} /></div>
                  </div>
                  <div className="mt-auto flex items-center justify-between gap-3 border-t pt-3 mt-4">
                    <div className="flex -space-x-1.5">
                      {team.slice(0, 4).map((m) => <Avatar key={m.id} person={m} className="ring-2 ring-card" />)}
                      {team.length > 4 && <span className="grid size-5 place-items-center rounded-full bg-muted text-[10px] font-medium ring-2 ring-card">+{team.length - 4}</span>}
                      {team.length === 0 && <span className="text-xs text-muted-foreground">No members</span>}
                    </div>
                    <span className={cn('inline-flex items-center gap-1.5 text-[12px] tabular', late ? 'font-medium text-destructive' : soon ? 'font-medium text-deadline' : 'text-muted-foreground')}>
                      <CalendarDays className="size-3.5" aria-hidden />
                      {p.due_date ? (late ? `${-left!}d late` : left === 0 ? 'Due today' : soon ? `${left}d left` : fmtDate(p.due_date, 'd MMM')) : 'No due date'}
                    </span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
