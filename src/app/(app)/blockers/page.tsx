import Link from 'next/link';
import { redirect } from 'next/navigation';
import { OctagonAlert } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/misc';
import { BlockerRows } from '@/components/blockers/blocker-ui';
import { requireSession } from '@/lib/session';
import { db, listProfiles } from '@/lib/queries';
import { projectColor } from '@/lib/colors';
import { BLOCKER_SIDES, SIDE_HINT, SIDE_LABEL, SIDE_STYLE, blockerAge, type Blocker, type BlockerSide } from '@/lib/blockers';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Blockers' };

export default async function BlockersPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const [session, sp] = await Promise.all([requireSession(), searchParams]);
  const role = session.profile.role;
  if (role !== 'pm' && role !== 'ceo') redirect('/');
  const supabase = await db();
  const [{ data: rows }, { data: projectRows }, people] = await Promise.all([
    supabase.from('blockers').select('*').order('created_at', { ascending: true }).limit(2000),
    supabase.from('projects').select('id, name, manager_id'),
    listProfiles(supabase),
  ]);
  // CEO: every project. PM: the projects they manage.
  const scope = new Set((projectRows ?? []).filter((p) => role === 'ceo' || p.manager_id === session.userId).map((p) => p.id));
  const all = ((rows ?? []) as Blocker[]).filter((b) => scope.has(b.project_id));
  const side = BLOCKER_SIDES.includes(sp.side as BlockerSide) ? (sp.side as BlockerSide) : null;
  const project = sp.project && scope.has(sp.project) ? sp.project : null;
  const showResolved = sp.show === 'resolved';
  const list = all.filter((b) => (showResolved ? b.status === 'resolved' : b.status === 'open') && (!side || b.side === side) && (!project || b.project_id === project));
  const open = all.filter((b) => b.status === 'open');
  const projects = Object.fromEntries((projectRows ?? []).map((p) => [p.id, { name: p.name, color: projectColor(p.id) }]));
  const q = (patch: Record<string, string | null>) => {
    const u = new URLSearchParams(Object.entries({ side, project, show: showResolved ? 'resolved' : null, ...patch }).filter(([, v]) => v) as [string, string][]);
    const s = u.toString();
    return s ? `/blockers?${s}` : '/blockers';
  };
  const stale = open.filter((b) => blockerAge(b) >= 3).length;

  return (
    <>
      <PageHeader title="Blockers" description={role === 'ceo' ? 'Everything that is stuck across the company, and whose side it is on.' : 'What is stuck on the projects you manage, and whose side it is on.'} />

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Link href={q({ side: null, show: null })} className={cn('sheen glow-ring rounded-lg border bg-card px-4 py-3.5 transition-shadow', !side && !showResolved && 'border-primary/40')}>
          <p className="text-[12.5px] text-muted-foreground">Open blockers</p>
          <p className="mt-1.5 text-[26px] font-semibold leading-none tabular text-gradient">{open.length}</p>
          <p className={cn('mt-1.5 text-[12px]', stale ? 'text-deadline' : 'text-muted-foreground')}>{stale} open 3+ days</p>
        </Link>
        {BLOCKER_SIDES.map((s) => {
          const n = open.filter((b) => b.side === s).length;
          return (
            <Link key={s} href={q({ side: side === s ? null : s, show: null })} title={SIDE_HINT[s]}
              className={cn('sheen glow-ring rounded-lg border bg-card px-4 py-3.5 transition-shadow', side === s && 'border-primary/40')}>
              <p className="flex items-center gap-1.5 text-[12.5px] text-muted-foreground"><span className={cn('size-2 rounded-full', SIDE_STYLE[s].dot)} />{SIDE_LABEL[s]}</p>
              <p className="mt-1.5 text-[26px] font-semibold leading-none tabular">{n}</p>
              <p className="mt-1.5 text-[12px] text-muted-foreground">{open.length ? Math.round((n / open.length) * 100) : 0}% of open</p>
            </Link>
          );
        })}
      </div>

      <Card className="mt-4">
        <CardHeader className="flex-wrap">
          <div>
            <CardTitle>{showResolved ? 'Resolved blockers' : 'Open blockers'}{side ? ` · ${SIDE_LABEL[side]}` : ''}</CardTitle>
            <CardDescription>{showResolved ? 'Newest first.' : 'Oldest first, so long-running blockers stay at the top. Amber after 3 days, red after 7.'}</CardDescription>
          </div>
          <form className="flex flex-wrap gap-2" action="/blockers">
            {side && <input type="hidden" name="side" value={side} />}
            {showResolved && <input type="hidden" name="show" value="resolved" />}
            <select name="project" defaultValue={project ?? ''} className="select-chevron h-8 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[12.5px]" aria-label="Project">
              <option value="">All projects</option>
              {(projectRows ?? []).filter((p) => scope.has(p.id)).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button className="h-8 rounded-md border border-border-strong bg-card px-2.5 text-[12.5px] hover:bg-muted">Filter</button>
            <Link href={q({ show: showResolved ? null : 'resolved' })} className="grid h-8 place-items-center rounded-md px-2.5 text-[12.5px] text-muted-foreground hover:bg-muted hover:text-foreground">{showResolved ? 'Show open' : 'Show resolved'}</Link>
          </form>
        </CardHeader>
        <CardContent>
          {list.length === 0 ? (
            <EmptyState icon={OctagonAlert} title={showResolved ? 'No resolved blockers' : 'Nothing is blocked'} description={showResolved ? 'Resolved blockers will appear here.' : 'When someone raises a blocker on a project, it shows up here.'} />
          ) : (
            <BlockerRows blockers={showResolved ? [...list].reverse() : list} people={people} meId={session.userId} managerIds={role === 'ceo' ? 'all' : [...scope]} projects={projects} />
          )}
        </CardContent>
      </Card>
    </>
  );
}
