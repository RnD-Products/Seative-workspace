import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { fmtMinutes } from '@/lib/domain';
import { canSeeReports, loadMonthlyReport, parseMonth } from '@/lib/reports';

const cell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** Monthly time report as CSV: one row per person and project, plus totals. */
export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  if (!canSeeReports(session)) return NextResponse.json({ error: 'Only the CEO and project managers can export reports' }, { status: 403 });
  const month = parseMonth(new URL(req.url).searchParams.get('month'));
  const { rows, projects, total } = await loadMonthlyReport(await createClient(), session, month);
  const names = new Map(projects.map((p) => [p.id, p.name]));
  const lines = [[`Time report — ${month.label}`].map(cell).join(','), '', ['Person', 'Job title', 'Project', 'Hours', 'Minutes', 'Readable'].map(cell).join(',')];
  for (const r of rows.filter((x) => x.minutes)) {
    for (const [pid, m] of Object.entries(r.byProject).sort((a, b) => b[1] - a[1])) {
      lines.push([r.person.full_name, r.person.job_title ?? '', names.get(pid) ?? '', (m / 60).toFixed(2), m, fmtMinutes(m)].map(cell).join(','));
    }
    lines.push([r.person.full_name, r.person.job_title ?? '', 'TOTAL', (r.minutes / 60).toFixed(2), r.minutes, fmtMinutes(r.minutes)].map(cell).join(','));
  }
  lines.push('', ['All people', '', 'GRAND TOTAL', (total / 60).toFixed(2), total, fmtMinutes(total)].map(cell).join(','));
  return new NextResponse('﻿' + lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="time-report-${month.value}.csv"`, 'Cache-Control': 'no-store' },
  });
}
