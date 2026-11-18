import Link from 'next/link';
import { redirect } from 'next/navigation';
import { BarChart3, ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/misc';
import { Avatar, RoleBadge } from '@/components/badges';
import { requireSession } from '@/lib/session';
import { db } from '@/lib/queries';
import { fmtMinutes } from '@/lib/domain';
import { canSeeReports, loadMonthlyReport, parseMonth } from '@/lib/reports';
import { cn } from '@/lib/utils';

export const metadata = { title: 'Time reports' };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [session, sp] = await Promise.all([requireSession(), searchParams]);
  if (!canSeeReports(session)) redirect('/');
  const month = parseMonth(sp.month);
  const report = await loadMonthlyReport(await db(), session, month);
  const { rows, projects, total } = report;
  const active = rows.filter((r) => r.minutes > 0);
  const withTime = projects.filter((p) => p.minutes > 0);
  const cellMax = Math.max(1, ...rows.flatMap((r) => Object.values(r.byProject)));

  return (
    <>
      <PageHeader
        title="Time reports"
        description={`Hours logged by each person on each project, for ${report.scope}.`}
        actions={
          <>
            <nav aria-label="Month" className="flex items-center rounded-md border bg-card">
              <Link href={`/reports?month=${month.prev}`} className="grid size-8 place-items-center rounded-l-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Previous month"><ChevronLeft className="size-4" /></Link>
              <span className="min-w-[132px] px-2 text-center text-[13px] font-medium tabular" aria-live="polite">{month.label}</span>
              {month.isCurrent ? (
                <span className="grid size-8 place-items-center text-muted-foreground/40" aria-hidden><ChevronRight className="size-4" /></span>
              ) : (
                <Link href={`/reports?month=${month.next}`} className="grid size-8 place-items-center rounded-r-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Next month"><ChevronRight className="size-4" /></Link>
              )}
            </nav>
            {!month.isCurrent && <Button asChild variant="ghost" size="sm"><Link href="/reports">This month</Link></Button>}
            {report.entryCount > 0 && <Button asChild variant="outline"><a href={`/reports/export?month=${month.value}`} download><Download /> Export CSV</a></Button>}
          </>
        }
      />

      <div className="stagger grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label="Total logged" value={fmtMinutes(total)} hint={`${report.entryCount} entries`} />
        <Stat label="People who logged time" value={`${active.length}`} hint={`of ${rows.length} in scope`} />
        <Stat label="Projects with time" value={`${withTime.length}`} hint={`of ${projects.length}`} />
        <Stat label="Average per person" value={active.length ? fmtMinutes(total / active.length) : '0m'} hint="among people who logged" />
      </div>

      {report.entryCount === 0 ? (
        <Card className="mt-4">
          <EmptyState icon={BarChart3} title={`No time logged in ${month.label}`}
            description="Time appears here once people use the timer or log time on a project." />
        </Card>
      ) : (
        <>
          <Card className="mt-4 overflow-hidden">
            <CardHeader>
              <div><CardTitle>People × projects</CardTitle><CardDescription>Darker cells mean more time. Totals are at the right and bottom.</CardDescription></div>
            </CardHeader>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] border-t text-[13px]">
                <thead className="bg-muted/40 text-[12px] text-muted-foreground">
                  <tr>
                    <th scope="col" className="sticky left-0 z-10 md:static min-w-[200px] bg-card py-2 pl-4 text-left font-medium">Person</th>
                    {projects.map((p) => (
                      <th key={p.id} scope="col" className="max-w-[150px] px-3 py-2 text-right font-medium">
                        <Link href={`/projects/${p.id}#time`} className="inline-flex max-w-[140px] items-center gap-1.5 hover:text-foreground" title={p.name}>
                          <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: p.color }} /><span className="truncate">{p.name}</span>
                        </Link>
                      </th>
                    ))}
                    <th scope="col" className="py-2 pl-3 pr-4 text-right font-semibold text-foreground">Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {rows.map((r) => (
                    <tr key={r.person.id} className={cn('hover:bg-foreground/[0.02]', r.minutes === 0 && 'text-muted-foreground')}>
                      <th scope="row" className="sticky left-0 z-10 md:static bg-card py-2 pl-4 text-left font-normal">
                        <a href={`#person-${r.person.id}`} className="flex items-center gap-2 hover:underline">
                          <Avatar person={r.person} />
                          <span className="min-w-0"><span className="block truncate font-medium text-foreground">{r.person.full_name}</span>{r.person.job_title && <span className="block truncate text-[11.5px] text-muted-foreground">{r.person.job_title}</span>}</span>
                        </a>
                      </th>
                      {projects.map((p) => {
                        const m = r.byProject[p.id] ?? 0;
                        return (
                          <td key={p.id} className="px-3 py-2 text-right tabular">
                            {m ? <span className="inline-block min-w-14 rounded-[4px] px-1.5 py-0.5 text-foreground" style={{ background: `color-mix(in oklab, var(--primary) ${Math.round(8 + (m / cellMax) * 40)}%, transparent)` }}>{fmtMinutes(m)}</span> : <span className="text-muted-foreground/50">—</span>}
                          </td>
                        );
                      })}
                      <td className="py-2 pl-3 pr-4 text-right font-semibold tabular">{r.minutes ? fmtMinutes(r.minutes) : <span className="font-normal text-muted-foreground">No time</span>}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot className="border-t bg-muted/40 font-semibold">
                  <tr>
                    <th scope="row" className="sticky left-0 z-10 md:static bg-card py-2 pl-4 text-left">Total</th>
                    {projects.map((p) => <td key={p.id} className="px-3 py-2 text-right tabular">{p.minutes ? fmtMinutes(p.minutes) : '—'}</td>)}
                    <td className="py-2 pl-3 pr-4 text-right tabular text-primary">{fmtMinutes(total)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Card>

          <h2 className="mb-3 mt-8 text-[15px] font-semibold">Each person in {month.label}</h2>
          <ul className="stagger grid gap-3 md:grid-cols-2">
            {active.map((r) => {
              const parts = projects.filter((p) => r.byProject[p.id]).map((p) => ({ ...p, m: r.byProject[p.id] })).sort((a, b) => b.m - a.m);
              return (
                <li key={r.person.id} id={`person-${r.person.id}`} className="scroll-mt-20">
                  <Card className="h-full">
                    <CardContent className="space-y-3 pt-4">
                      <div className="flex items-center gap-3">
                        <Avatar person={r.person} size="md" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-medium">{r.person.full_name}</p>
                          <p className="flex items-center gap-2 text-[12px] text-muted-foreground"><RoleBadge role={r.person.role} />{r.days} {r.days === 1 ? 'day' : 'days'} with time</p>
                        </div>
                        <p className="text-right"><span className="block text-[22px] font-normal tracking-[-0.03em] leading-none tabular text-gradient">{fmtMinutes(r.minutes)}</span><span className="text-[11.5px] text-muted-foreground">this month</span></p>
                      </div>
                      {/* Share of the month, by project */}
                      <div className="flex h-2 overflow-hidden rounded-full bg-foreground/[0.06]" aria-hidden>
                        {parts.map((p) => <span key={p.id} style={{ width: `${(p.m / r.minutes) * 100}%`, background: p.color }} />)}
                      </div>
                      <ul className="space-y-1.5 text-[13px]">
                        {parts.map((p) => (
                          <li key={p.id} className="flex items-center gap-2">
                            <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={{ background: p.color }} />
                            <Link href={`/projects/${p.id}#time`} className="min-w-0 flex-1 truncate hover:underline">{p.name}</Link>
                            <span className="text-[12px] text-muted-foreground tabular">{Math.round((p.m / r.minutes) * 100)}%</span>
                            <span className="w-16 text-right font-medium tabular">{fmtMinutes(p.m)}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </li>
              );
            })}
          </ul>
          {rows.length > active.length && (
            <p className="mt-4 text-[13px] text-muted-foreground">
              No time logged in {month.label}: {rows.filter((r) => !r.minutes).map((r) => r.person.full_name).join(', ')}.
            </p>
          )}
        </>
      )}
    </>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <Card className="glow-ring px-4 py-3.5 transition-shadow duration-300">
      <p className="text-[12.5px] text-muted-foreground">{label}</p>
      <p className="mt-1.5 text-[24px] font-normal tracking-[-0.03em] leading-none tracking-[-0.03em] tabular text-gradient">{value}</p>
      {hint && <p className="mt-1.5 text-[12px] text-muted-foreground">{hint}</p>}
    </Card>
  );
}
