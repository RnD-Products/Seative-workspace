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
  const { data: projects } = await supabase
    .from('projects')
    .select('id, name')
    .in('status', ['active', 'planning'])
    .order('due_date', { ascending: true, nullsFirst: false })
    .limit(12);
  return (
    <AppShell
      user={{ id: session.profile.id, full_name: session.profile.full_name, role: session.profile.role }}
      orgName={session.org.name}
      projects={(projects ?? []).map((p) => ({ id: p.id, name: p.name, color: projectColor(p.id) }))}
      canCreate={canCreateProjects(session)}
    >
      {children}
    </AppShell>
  );
}
