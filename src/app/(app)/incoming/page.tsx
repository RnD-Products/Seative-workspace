import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Inbox, Plus, Users } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/misc';
import { Avatar } from '@/components/badges';
import { AssignManagerControl, TakeProjectButton } from '@/components/sales/incoming-actions';
import { requireSession } from '@/lib/session';
import { db, listProfiles } from '@/lib/queries';
import { daysUntil, fmtDate, fmtRelative } from '@/lib/domain';
import { PAYMENT_STATUS_LABEL, PAYMENT_TONE, fmtMoney, type ProjectSales } from '@/lib/sales';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Incoming projects' };

export default async function IncomingPage() {
  const session = await requireSession();
  const role = session.profile.role;
  if (role !== 'pm' && role !== 'ceo') redirect('/');
  const supabase = await db();
  const [{ data: projects }, { data: sales }, people] = await Promise.all([
    supabase.from('projects').select('id, name, description, priority, manager_id, due_date, created_at, created_by').eq('status', 'incoming').order('created_at', { ascending: false }),
    supabase.from('project_sales').select('*'),
    listProfiles(supabase),
  ]);
  const salesBy = new Map(((sales ?? []) as ProjectSales[]).map((s) => [s.project_id, s]));
  const peopleBy = new Map(people.map((p) => [p.id, p]));
  const managers = people.filter((p) => p.role === 'pm' || p.role === 'ceo').map((p) => ({ id: p.id, full_name: p.full_name }));
  const list = projects ?? [];

  return (
    <>
      <PageHeader
        title="Incoming projects"
        description={role === 'pm' ? 'New deals from Sales waiting for a project manager. Take one, then pick the team.' : 'New deals from Sales. Assign a project manager, who then picks the team.'}
        actions={role === 'ceo' ? <Button asChild><Link href="/deals/new"><Plus /> New deal</Link></Button> : undefined}
      />
      {list.length === 0 ? (
        <Card><EmptyState icon={Inbox} title="No incoming projects" description="When Sales adds a deal, it appears here and you get a notification." /></Card>
      ) : (
        <ul className="stagger space-y-3">
          {list.map((p) => {
            const s = salesBy.get(p.id);
            const owner = s?.sales_owner_id ? peopleBy.get(s.sales_owner_id) : null;
            const manager = p.manager_id ? peopleBy.get(p.manager_id) : null;
            const deadline = s?.client_deadline ?? p.due_date;
            const left = deadline ? daysUntil(deadline) : null;
            return (
              <li key={p.id}>
                <Card className="glow-ring transition-shadow">
                  <CardContent className="grid gap-4 pt-4 lg:grid-cols-[1fr_auto]">
                    <div className="min-w-0 space-y-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Link href={`/projects/${p.id}`} className="text-[15px] font-semibold hover:underline">{p.name}</Link>
                        {s && <Badge tone={PAYMENT_TONE[s.payment_status]} dot>{PAYMENT_STATUS_LABEL[s.payment_status]}</Badge>}
                        {manager ? <Badge tone="blue">PM: {manager.full_name}</Badge> : <Badge tone="deadline">Needs a PM</Badge>}
                      </div>
                      <dl className="grid grid-cols-2 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-4">
                        <div><dt className="text-[12px] text-muted-foreground">Client</dt><dd className="truncate">{s?.client_name ?? '—'}</dd></div>
                        <div><dt className="text-[12px] text-muted-foreground">Contract</dt><dd className="font-semibold tabular">{s ? fmtMoney(s.contract_amount, s.currency) : '—'}</dd></div>
                        <div><dt className="text-[12px] text-muted-foreground">Client deadline</dt><dd className={cn('tabular', left !== null && left <= 7 && 'text-deadline', left !== null && left < 0 && 'text-destructive')}>{fmtDate(deadline, 'd MMM')}{left !== null && ` · ${left < 0 ? `${-left}d late` : `${left}d left`}`}</dd></div>
                        <div><dt className="text-[12px] text-muted-foreground">From</dt><dd className="flex items-center gap-1.5"><Avatar person={owner ?? null} />{owner?.full_name ?? 'Sales'} <span className="text-muted-foreground">· {fmtRelative(p.created_at)}</span></dd></div>
                      </dl>
                      {s && s.requirement_tags.length > 0 && <div className="flex flex-wrap gap-1.5">{s.requirement_tags.map((t) => <span key={t} className="rounded-[5px] border border-primary/30 bg-primary-soft px-2 py-0.5 text-[12px]">{t}</span>)}</div>}
                      {s?.scope_summary && <p className="line-clamp-2 text-[13px] text-muted-foreground">{s.scope_summary}</p>}
                    </div>
                    <div className="flex flex-col items-start gap-2 lg:items-end">
                      {role === 'pm' && !p.manager_id && <TakeProjectButton projectId={p.id} name={p.name} />}
                      {role === 'ceo' && <AssignManagerControl projectId={p.id} managers={managers} current={p.manager_id} />}
                      {(p.manager_id === session.userId || role === 'ceo') && p.manager_id && (
                        <Button asChild variant={p.manager_id === session.userId ? 'default' : 'outline'}><Link href={`/projects/${p.id}/start`}><Users /> Pick team &amp; start</Link></Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
