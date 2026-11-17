import 'server-only';
import { addMonths, endOfMonth, format, parse, startOfMonth } from 'date-fns';
import type { createClient } from '@/lib/supabase/server';
import type { Session } from '@/lib/session';
import type { Profile } from '@/lib/types';
import { projectColor } from '@/lib/colors';

type Supabase = Awaited<ReturnType<typeof createClient>>;

export const canSeeReports = (s: Session) => s.profile.role === 'ceo' || s.profile.role === 'pm';

/** "2026-11" from a query value; falls back to the current month (Dhaka). */
export function parseMonth(raw: unknown) {
  const now = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Dhaka' }));
  const value = typeof raw === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : format(now, 'yyyy-MM');
  const start = startOfMonth(parse(value, 'yyyy-MM', now));
  return {
    value,
    label: format(start, 'MMMM yyyy'),
    from: format(start, 'yyyy-MM-dd'),
    to: format(endOfMonth(start), 'yyyy-MM-dd'),
    prev: format(addMonths(start, -1), 'yyyy-MM'),
    next: format(addMonths(start, 1), 'yyyy-MM'),
    isCurrent: value === format(now, 'yyyy-MM'),
  };
}

export interface ReportProject { id: string; name: string; color: string; minutes: number }
export interface ReportRow { person: Pick<Profile, 'id' | 'full_name' | 'job_title' | 'role'>; minutes: number; byProject: Record<string, number>; days: number }

/**
 * Time logged in one month, per person and project.
 * CEO: every project. PM: the projects they manage. RLS still applies underneath.
 */
export async function loadMonthlyReport(supabase: Supabase, session: Session, month: ReturnType<typeof parseMonth>) {
  const isCeo = session.profile.role === 'ceo';
  const [{ data: projectRows }, { data: members }, { data: people }] = await Promise.all([
    supabase.from('projects').select('id, name, manager_id').order('name'),
    supabase.from('project_members').select('project_id, profile_id'),
    supabase.from('profiles').select('id, full_name, job_title, role').order('full_name'),
  ]);
  const scoped = (projectRows ?? []).filter((p) => isCeo || p.manager_id === session.userId);
  const scopedIds = scoped.map((p) => p.id);

  const entries = scopedIds.length
    ? (await supabase.from('time_entries').select('profile_id, project_id, minutes, entry_date')
        .in('project_id', scopedIds).not('minutes', 'is', null)
        .gte('entry_date', month.from).lte('entry_date', month.to).limit(20000)).data ?? []
    : [];

  // People in scope: everyone for the CEO; for a PM, the people on their projects. Anyone who logged time is included.
  const inScope = new Set<string>();
  if (isCeo) (people ?? []).forEach((p) => inScope.add(p.id));
  else {
    (members ?? []).filter((m) => scopedIds.includes(m.project_id)).forEach((m) => inScope.add(m.profile_id));
    scoped.forEach((p) => p.manager_id && inScope.add(p.manager_id));
  }
  entries.forEach((e) => inScope.add(e.profile_id));

  const rowsById = new Map<string, ReportRow & { dates: Set<string> }>();
  for (const p of people ?? []) {
    if (inScope.has(p.id)) rowsById.set(p.id, { person: p, minutes: 0, byProject: {}, days: 0, dates: new Set() });
  }
  const projTotals = new Map<string, number>();
  for (const e of entries) {
    const row = rowsById.get(e.profile_id);
    if (!row) continue;
    const m = e.minutes ?? 0;
    row.minutes += m;
    row.byProject[e.project_id] = (row.byProject[e.project_id] ?? 0) + m;
    row.dates.add(e.entry_date);
    projTotals.set(e.project_id, (projTotals.get(e.project_id) ?? 0) + m);
  }

  const rows: ReportRow[] = [...rowsById.values()]
    .map(({ dates, ...r }) => ({ ...r, days: dates.size }))
    .sort((a, b) => b.minutes - a.minutes || a.person.full_name.localeCompare(b.person.full_name));
  // Projects with time first (most first), then the rest of the scoped projects.
  const projects: ReportProject[] = scoped
    .map((p) => ({ id: p.id, name: p.name, color: projectColor(p.id), minutes: projTotals.get(p.id) ?? 0 }))
    .sort((a, b) => b.minutes - a.minutes || a.name.localeCompare(b.name));
  const total = rows.reduce((n, r) => n + r.minutes, 0);
  return { rows, projects, total, entryCount: entries.length, scope: isCeo ? 'all projects' : 'the projects you manage' };
}
