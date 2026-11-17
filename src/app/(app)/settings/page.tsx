import { PageHeader } from '@/components/page-header';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, RoleBadge } from '@/components/badges';
import { AddMemberDialog, OrgNameForm, PasswordForm, ProfileForm, RoleSelect } from '@/components/forms/settings-forms';
import { NotificationPrefs, SkillsEditor } from '@/components/forms/people-settings';
import { requireSession } from '@/lib/session';
import { db, listProfiles } from '@/lib/queries';
import { fmtDate } from '@/lib/domain';

export const metadata = { title: 'Settings' };

export default async function SettingsPage() {
  const session = await requireSession();
  const isCeo = session.profile.role === 'ceo';
  const people = isCeo ? await listProfiles(await db()) : [];
  const ceoCount = people.filter((p) => p.role === 'ceo').length;

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader title="Settings" description={`${session.org.name} · signed in as ${session.profile.email}`} />
      <Card>
        <CardHeader><div><CardTitle>Your profile</CardTitle><CardDescription>Shown to teammates on tasks and activity.</CardDescription></div><RoleBadge role={session.profile.role} /></CardHeader>
        <CardContent><ProfileForm fullName={session.profile.full_name} jobTitle={session.profile.job_title ?? ''} /></CardContent>
      </Card>
      <Card>
        <CardHeader><div><CardTitle>Notifications</CardTitle><CardDescription>Choose what shows up in your bell.</CardDescription></div></CardHeader>
        <CardContent><NotificationPrefs role={session.profile.role} prefs={session.profile.notification_prefs ?? {}} /></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Password</CardTitle></CardHeader>
        <CardContent><PasswordForm /></CardContent>
      </Card>
      {isCeo && (
        <>
          <Card>
            <CardHeader><CardTitle>Organization</CardTitle></CardHeader>
            <CardContent><OrgNameForm name={session.org.name} /></CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div><CardTitle>Members</CardTitle><CardDescription>Add people, set their role and skills. Sales add deals; project managers run projects; employees see projects they&apos;re added to.</CardDescription></div>
              <AddMemberDialog canCreate={Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY)} />
            </CardHeader>
            <CardContent>
              <ul className="divide-y">
                {people.map((p) => (
                  <li key={p.id} className="flex flex-wrap items-center gap-3 py-3">
                    <Avatar person={p} size="md" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{p.full_name}{p.id === session.userId && <span className="ml-1 text-xs text-muted-foreground">(you)</span>}</p>
                      <p className="truncate text-xs text-muted-foreground">{p.email}{p.job_title ? ` · ${p.job_title}` : ''} · joined {fmtDate(p.created_at.slice(0, 10))}</p>
                      {p.role !== 'sales' && <div className="mt-1"><SkillsEditor profileId={p.id} name={p.full_name} skills={p.skills ?? []} /></div>}
                    </div>
                    <RoleSelect profileId={p.id} role={p.role} disabled={p.role === 'ceo' && ceoCount === 1} />
                  </li>
                ))}
              </ul>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}
