import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard, NotConfigured } from '@/components/auth-card';
import { FinishSetupForm, SetupForm } from '@/components/forms/setup-form';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'First-time setup' };

export default async function SetupPage() {
  if (!isSupabaseConfigured()) return <NotConfigured />;
  const supabase = await createClient();
  const [{ data: { user } }, { data: available }] = await Promise.all([supabase.auth.getUser(), supabase.rpc('setup_available')]);
  if (user && (await getSession())) redirect('/');

  if (!available) {
    return (
      <AuthCard title="Setup is complete" description="This workspace already has an organization.">
        <p className="text-sm text-muted-foreground">Sign in with the account your CEO created for you.</p>
        <Link href="/login" className="mt-4 inline-block text-sm font-medium text-primary hover:underline">Go to sign in →</Link>
      </AuthCard>
    );
  }

  if (user) {
    return (
      <AuthCard title="Name your organization" description={`Signed in as ${user.email}. You'll be the organization's CEO.`}>
        <FinishSetupForm defaultName={(user.user_metadata?.full_name as string | undefined) ?? ''} />
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Set up your workspace" description="Create your organization and the first CEO account. This page closes once setup is done.">
      <SetupForm />
    </AuthCard>
  );
}
