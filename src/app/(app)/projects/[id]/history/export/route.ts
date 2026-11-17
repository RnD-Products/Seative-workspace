import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { canManage } from '@/lib/queries';
import { ACTIVITY_GROUPS, ACTIVITY_GROUP_ACTIONS, activityGroup, describeActivity, type ActivityGroup } from '@/lib/domain';

const cell = (v: unknown) => { const s = v == null ? '' : String(v); return `"${(/^[=+\-@\t\r]/.test(s) ? `'${s}` : s).replace(/"/g, '""')}"`; };

/** Project history as CSV, for the project manager and the CEO. Same filters as the page. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session) return NextResponse.json({ error: 'Sign in required' }, { status: 401 });
  const supabase = await createClient();
  const { data: project } = await supabase.from('projects').select('id, name, manager_id').eq('id', id).maybeSingle();
  if (!project) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  if (!canManage(project, session.profile)) return NextResponse.json({ error: 'Only the project manager and the CEO can export history' }, { status: 403 });
  const sp = new URL(req.url).searchParams;
  let q = supabase.from('activity_log').select('*').eq('project_id', id).order('created_at', { ascending: true }).limit(20000);
  const person = sp.get('person'); const type = sp.get('type') as ActivityGroup | null; const from = sp.get('from'); const to = sp.get('to');
  if (person && /^[0-9a-f-]{36}$/.test(person)) q = q.eq('actor_id', person);
  if (type && type in ACTIVITY_GROUPS) q = type === 'team' ? q.or('action.like.member_%,action.eq.project_manager_changed') : type === 'project' ? q.like('action', 'project_%').neq('action', 'project_manager_changed') : q.like('action', ACTIVITY_GROUP_ACTIONS[type]);
  if (from && /^\d{4}-\d{2}-\d{2}$/.test(from)) q = q.gte('created_at', `${from}T00:00:00+06:00`);
  if (to && /^\d{4}-\d{2}-\d{2}$/.test(to)) q = q.lte('created_at', `${to}T23:59:59+06:00`);
  const [{ data }, { data: people }] = await Promise.all([q, supabase.from('profiles').select('id, full_name')]);
  const names = new Map((people ?? []).map((p) => [p.id, p.full_name]));
  const lines = [['Date (Dhaka)', 'Person', 'Type', 'Change', 'AI-assisted'].map(cell).join(',')];
  for (const a of data ?? []) {
    lines.push([new Date(a.created_at).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka' }), names.get(a.actor_id) ?? 'System', ACTIVITY_GROUPS[activityGroup(a.action)], describeActivity(a.action, a.details), a.ai_assisted ? 'yes' : ''].map(cell).join(','));
  }
  const filename = `${project.name.replace(/[^\w\- ]+/g, '').trim().replace(/\s+/g, '-') || 'project'}-history.csv`;
  return new NextResponse('﻿' + lines.join('\r\n'), { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${filename}"`, 'Cache-Control': 'no-store' } });
}
