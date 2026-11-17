'use server';

import { redirect } from 'next/navigation';
import { createAdminClient } from '@/lib/supabase/admin';
import { createClient } from '@/lib/supabase/server';
import { TEST_ACCOUNTS, TEST_LOGIN_ENABLED } from '@/lib/test-login';

/** TESTING ONLY: sign in as a role's test account without a password (see lib/test-login.ts). */
export async function testSignIn(formData: FormData) {
  if (!TEST_LOGIN_ENABLED) redirect('/login');
  const account = TEST_ACCOUNTS.find((a) => a.role === formData.get('role'));
  if (!account) redirect('/login?test_error=unknown');
  const admin = createAdminClient();

  // PM and Sales test accounts are created on first use, in the CEO's organization, with no password.
  if (account.create) {
    const { data: existing } = await admin.from('profiles').select('id').eq('email', account.email).maybeSingle();
    if (!existing) {
      const { data: ceo } = await admin.from('profiles').select('organization_id').eq('role', 'ceo').limit(1).maybeSingle();
      if (!ceo) redirect('/login?test_error=setup');
      let userId: string | undefined;
      const { data: created, error } = await admin.auth.admin.createUser({ email: account.email, email_confirm: true, user_metadata: { full_name: account.fullName } });
      if (created?.user) userId = created.user.id;
      else if (error?.message.toLowerCase().includes('already')) {
        const { data: list } = await admin.auth.admin.listUsers({ perPage: 1000 });
        userId = list?.users.find((u) => u.email === account.email)?.id;
      }
      if (!userId) redirect('/login?test_error=create');
      const { error: pErr } = await admin.from('profiles').insert({
        id: userId, organization_id: ceo.organization_id, full_name: account.fullName, email: account.email, role: account.role,
        job_title: account.role === 'pm' ? 'Project Manager (test)' : 'Sales (test)',
      });
      if (pErr) redirect('/login?test_error=create');
    }
  }

  // One-time sign-in link, verified right here on the server, so no password is involved.
  const { data: link, error: linkErr } = await admin.auth.admin.generateLink({ type: 'magiclink', email: account.email });
  if (linkErr || !link?.properties?.hashed_token) redirect('/login?test_error=link');
  const supabase = await createClient();
  await supabase.auth.signOut();
  const { error } = await supabase.auth.verifyOtp({ type: 'magiclink', token_hash: link.properties.hashed_token });
  if (error) redirect('/login?test_error=verify');
  redirect('/');
}
