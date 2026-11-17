import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

const csvCell = (v: unknown) => {
  const s = v == null ? '' : String(v);
  // Quote everything; neutralise spreadsheet formulas.
  const safe = /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  return `"${safe.replace(/"/g, '""')}"`;
};

/** CSV of a project's logged time. RLS decides what the caller can see. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const { data: project } = await supabase.from('projects').select('name').eq('id', id).maybeSingle();
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data, error } = await supabase
    .from('time_entries')
    .select('entry_date, minutes, note, profiles(full_name), tasks(title)')
    .eq('project_id', id).not('minutes', 'is', null)
    .order('entry_date', { ascending: true });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const rows = (data ?? []) as unknown as { entry_date: string; minutes: number; note: string; profiles: { full_name: string } | null; tasks: { title: string } | null }[];
  const lines = [
    ['Date', 'Person', 'Task', 'Note', 'Minutes', 'Hours'].map(csvCell).join(','),
    ...rows.map((r) => [r.entry_date, r.profiles?.full_name ?? '', r.tasks?.title ?? '', r.note, r.minutes, (r.minutes / 60).toFixed(2)].map(csvCell).join(',')),
  ];
  const total = rows.reduce((n, r) => n + r.minutes, 0);
  lines.push(['Total', '', '', '', total, (total / 60).toFixed(2)].map(csvCell).join(','));
  const filename = `${project.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'project'}-time.csv`;
  return new NextResponse('﻿' + lines.join('\r\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' },
  });
}
