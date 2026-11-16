import Link from 'next/link';
import { redirect } from 'next/navigation';
import { AuthCard, NotConfigured } from '@/components/auth-card';
import { SignInForm } from '@/components/forms/sign-in-form';
import { Alert } from '@/components/ui/misc';
import { isSupabaseConfigured } from '@/lib/env';
import { createClient } from '@/lib/supabase/server';
import { getSession } from '@/lib/session';
import { signOut } from '@/app/actions/auth';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Sign in' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if (!isSupabaseConfigured()) return <NotConfigured />;
  const { next } = await searchParams;
  const supabase = await createClient();
  const [{ data: { user } }, { data: setupAvailable }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.rpc('setup_available'),
  ]);

  if (user) {
    if (await getSession()) redirect('/');
    // Signed in but not attached to an organization.
    if (setupAvailable) redirect('/setup');
    return (
      <AuthCard title="No workspace access yet" description={`You're signed in as ${user.email}.`}>
        <Alert tone="warning">This account isn&apos;t part of an organization. Ask your CEO to add you from Settings → Members.</Alert>
        <form action={signOut} className="mt-4"><button className="text-sm text-primary underline-offset-4 hover:underline">Sign out</button></form>
      </AuthCard>
    );
  }

  return (
    <AuthCard title="Sign in" description="Welcome back. Sign in to see your projects and tasks.">
      {setupAvailable && (
        <Alert tone="info" className="mb-5" title="New workspace">
          No organization exists yet. <Link href="/setup" className="font-medium underline">Run first-time setup</Link> to create it and your CEO account.
        </Alert>
      )}
      <SignInForm next={next} />
      <p className="mt-6 text-center text-[13px] text-muted-foreground">Accounts are created by your organization&apos;s CEO.</p>
    </AuthCard>
  );
}
