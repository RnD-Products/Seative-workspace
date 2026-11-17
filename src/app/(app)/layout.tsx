import { redirect } from 'next/navigation';
import { AppShell } from '@/components/app-shell';
import { NotConfigured } from '@/components/auth-card';
import { isSupabaseConfigured } from '@/lib/env';
import { canCreateProjects, getSession } from '@/lib/session';
import { createClient } from '@/lib/supabase/server';
import { projectColor } from '@/lib/colors';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!isSupabaseConfigured()) return <NotConfigured />;
  const session = await getSession();
  if (!session) redirect('/login');
  const supabase = await createClient();
  // Sidebar list — RLS limits it to projects this user can see.
  const isManager = session.profile.role === 'pm' || session.profile.role === 'ceo';
  const [{ data: projects }, { data: running }, { count: unread }, { data: incomingRows }, { data: blockerRows }, { data: chatRows }] = await Promise.all([
    supabase
      .from('projects')
      .select('id, name')
      .in('status', ['active', 'planning'])
      .order('due_date', { ascending: true, nullsFirst: false })
      .limit(12),
    supabase
      .from('time_entries')
      .select('id, project_id, task_id, started_at, projects(name), tasks(title)')
      .eq('profile_id', session.userId).is('ended_at', null).is('minutes', null)
      .maybeSingle(),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('recipient_id', session.userId).is('read_at', null),
    isManager ? supabase.from('projects').select('id, manager_id').eq('status', 'incoming') : Promise.resolve({ data: [] as { id: string; manager_id: string | null }[] }),
    isManager ? supabase.from('blockers').select('id, projects(manager_id)').eq('status', 'open') : Promise.resolve({ data: [] as { id: string; projects: { manager_id: string | null } | null }[] }),
    supabase.rpc('my_chats'),
  ]);
  const openBlockers = ((blockerRows ?? []) as unknown as { projects: { manager_id: string | null } | null }[]).filter((b) => session.profile.role === 'ceo' || b.projects?.manager_id === session.userId).length;
  const incoming = (incomingRows ?? []).filter((p) => session.profile.role === 'ceo' || !p.manager_id || p.manager_id === session.userId).length;
  const r = running as unknown as { id: string; project_id: string; task_id: string | null; started_at: string; projects: { name: string } | null; tasks: { title: string } | null } | null;
  const timer = r ? { id: r.id, project_id: r.project_id, task_id: r.task_id, started_at: r.started_at, project_name: r.projects?.name ?? 'Project', task_title: r.tasks?.title ?? null } : null;
  return (
    <AppShell
      user={{ id: session.profile.id, full_name: session.profile.full_name, role: session.profile.role }}
      orgName={session.org.name}
      projects={(projects ?? []).map((p) => ({ id: p.id, name: p.name, color: projectColor(p.id) }))}
      canCreate={canCreateProjects(session)}
      timer={timer}
      unread={unread ?? 0}
      incoming={incoming}
      blockers={openBlockers}
      chats={((chatRows ?? []) as { unread: number }[]).reduce((n, c) => n + (c.unread ?? 0), 0)}
    >
      {children}
    </AppShell>
  );
}
