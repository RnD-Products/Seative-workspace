import Link from 'next/link';
import { notFound } from 'next/navigation';
import { format, parseISO } from 'date-fns';
import { Download, History } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { Avatar } from '@/components/badges';
import { requireSession } from '@/lib/session';
import { canManage, db, listProfiles } from '@/lib/queries';
import { ACTIVITY_GROUPS, ACTIVITY_GROUP_ACTIONS, activityGroup, describeActivity, type ActivityGroup } from '@/lib/domain';
import type { Activity } from '@/lib/types';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Project history' };
const PAGE = 100;
const GROUP_TONE: Record<ActivityGroup, string> = {
  tasks: 'bg-info', project: 'bg-primary', team: 'bg-violet-400', blockers: 'bg-destructive', time: 'bg-success', comments: 'bg-muted-foreground', sales: 'bg-emerald-400', ai: 'bg-ai',
};

export default async function HistoryPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<Record<string, string | undefined>> }) {
  const [{ id }, sp, session] = await Promise.all([params, searchParams, requireSession()]);
  const supabase = await db();
  const { data: project } = await supabase.from('projects').select('id, name, manager_id').eq('id', id).maybeSingle();
  if (!project) notFound();
  const people = await listProfiles(supabase);
  const person = people.some((p) => p.id === sp.person) ? sp.person! : '';
  const group = (sp.type && sp.type in ACTIVITY_GROUPS ? sp.type : '') as ActivityGroup | '';
  const from = /^\d{4}-\d{2}-\d{2}$/.test(sp.from ?? '') ? sp.from! : '';
  const to = /^\d{4}-\d{2}-\d{2}$/.test(sp.to ?? '') ? sp.to! : '';
  const limit = Math.min(1000, Math.max(PAGE, Number(sp.limit) || PAGE));

  let query = supabase.from('activity_log').select('*').eq('project_id', id).order('created_at', { ascending: false }).limit(limit + 1);
  if (person) query = query.eq('actor_id', person);
  if (group) query = group === 'team' ? query.or('action.like.member_%,action.eq.project_manager_changed') : group === 'project' ? query.like('action', 'project_%').neq('action', 'project_manager_changed') : query.like('action', ACTIVITY_GROUP_ACTIONS[group]);
  if (from) query = query.gte('created_at', `${from}T00:00:00+06:00`);
  if (to) query = query.lte('created_at', `${to}T23:59:59+06:00`);
  const { data } = await query;
  const rows = ((data ?? []) as Activity[]);
  const more = rows.length > limit;
  const items = rows.slice(0, limit);
  const peopleMap = new Map(people.map((p) => [p.id, p]));
  const days = new Map<string, Activity[]>();
  for (const a of items) {
    const d = format(new Date(new Date(a.created_at).toLocaleString('en-US', { timeZone: 'Asia/Dhaka' })), 'yyyy-MM-dd');
    days.set(d, [...(days.get(d) ?? []), a]);
  }
  const qs = (patch: Record<string, string>) => {
    const u = new URLSearchParams(Object.entries({ person, type: group, from, to, ...patch }).filter(([, v]) => v) as [string, string][]);
    return `?${u.toString()}`;
  };
  const canExport = canManage(project, session.profile);
  const filtered = Boolean(person || group || from || to);

  return (
    <>
      <PageHeader
        back={<Link href={`/projects/${id}`} className="text-sm text-muted-foreground hover:text-foreground">← {project.name}</Link>}
        title="Project history"
        description="Every change on this project, recorded automatically by the database. Nobody can edit or delete it."
        actions={canExport ? <Button asChild variant="outline"><a href={`/projects/${id}/history/export${qs({})}`} download><Download /> Export CSV</a></Button> : undefined}
      />
      <form className="mb-4 flex flex-wrap items-end gap-2" action="">
        <label className="text-[12px] text-muted-foreground">Person
          <select name="person" defaultValue={person} className="select-chevron mt-1 block h-8 w-44 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[12.5px] text-foreground">
            <option value="">Everyone</option>
            {people.map((p) => <option key={p.id} value={p.id}>{p.full_name}</option>)}
          </select>
        </label>
        <label className="text-[12px] text-muted-foreground">Type
          <select name="type" defaultValue={group} className="select-chevron mt-1 block h-8 w-36 appearance-none rounded-md border border-input bg-card pl-2.5 pr-7 text-[12.5px] text-foreground">
            <option value="">All changes</option>
            {Object.entries(ACTIVITY_GROUPS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
        <label className="text-[12px] text-muted-foreground">From<input type="date" name="from" defaultValue={from} className="mt-1 block h-8 rounded-md border border-input bg-card px-2 text-[12.5px] text-foreground" /></label>
        <label className="text-[12px] text-muted-foreground">To<input type="date" name="to" defaultValue={to} className="mt-1 block h-8 rounded-md border border-input bg-card px-2 text-[12.5px] text-foreground" /></label>
        <button className="h-8 rounded-md border border-border-strong bg-card px-3 text-[12.5px] hover:bg-muted">Apply</button>
        {filtered && <Link href={`/projects/${id}/history`} className="grid h-8 place-items-center px-2 text-[12.5px] text-muted-foreground hover:text-foreground">Clear</Link>}
      </form>

      {items.length === 0 ? (
        <Card><EmptyState icon={History} title={filtered ? 'No changes match these filters' : 'No history yet'} description={filtered ? 'Try a wider date range or another type.' : 'Changes appear here as people work on the project.'} /></Card>
      ) : (
        <div className="space-y-5">
          {[...days].map(([day, list]) => (
            <section key={day}>
              <h2 className="mb-2 text-[12px] font-medium text-muted-foreground">{format(parseISO(day), 'EEEE d MMMM yyyy')}</h2>
              <Card>
                <ol className="divide-y">
                  {list.map((a) => {
                    const actor = a.actor_id ? peopleMap.get(a.actor_id) ?? null : null;
                    const g = activityGroup(a.action);
                    return (
                      <li key={a.id} className="flex gap-3 px-4 py-2.5 text-[13px]">
                        <span className="relative mt-1"><Avatar person={actor} /><span className={cn('absolute -bottom-0.5 -right-0.5 size-2 rounded-full ring-2 ring-card', GROUP_TONE[g])} aria-hidden /></span>
                        <div className="min-w-0 flex-1">
                          <p><span className="font-medium">{actor?.full_name ?? 'System'}</span> <span className="text-foreground/85">{describeActivity(a.action, a.details)}</span>{a.ai_assisted && <span className="ml-1.5 rounded-full bg-ai-soft px-1.5 text-[11px] text-ai">AI-assisted</span>}</p>
                          <p className="text-[11.5px] text-muted-foreground">
                            <time dateTime={a.created_at} suppressHydrationWarning>{new Date(a.created_at).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Dhaka' })}</time>
                            {' · '}{ACTIVITY_GROUPS[g]}
                            {a.task_id && <> · <Link href={`/tasks/${a.task_id}`} className="hover:underline">open task</Link></>}
                          </p>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              </Card>
            </section>
          ))}
          {more && <div className="text-center"><Button asChild variant="outline"><Link href={qs({ limit: String(limit + PAGE) })} scroll={false}>Load more</Link></Button></div>}
        </div>
      )}
    </>
  );
}
