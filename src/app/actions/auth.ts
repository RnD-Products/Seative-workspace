'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { TEST_LOGIN_ENABLED } from '@/lib/test-login';
import { fieldErrors, finishSetupSchema, setupSchema, signInSchema } from '@/lib/validation';
import type { ActionResult } from '@/lib/types';

const safeNext = (next: unknown) =>
  typeof next === 'string' && next.startsWith('/') && !next.startsWith('//') ? next : '/';

export async function signIn(input: unknown, next?: string): Promise<ActionResult> {
  const parsed = signInSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields', fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    return { ok: false, error: error.message === 'Invalid login credentials' ? 'Email or password is incorrect.' : error.message };
  }
  redirect(safeNext(next));
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  // TESTING ONLY: put the demo data back, so the next person sees the same starting point.
  if (TEST_LOGIN_ENABLED) {
    try { await createAdminClient().rpc('reset_demo_data'); } catch { /* the demo reset is best-effort */ }
  }
  redirect('/login');
}

/** First run: create the CEO's login, then the organization. */
export async function setupWorkspace(input: unknown): Promise<ActionResult> {
  const parsed = setupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields', fieldErrors: fieldErrors(parsed.error) };
  const { orgName, fullName, email, password } = parsed.data;
  const supabase = await createClient();

  const { data: available } = await supabase.rpc('setup_available');
  if (!available) return { ok: false, error: 'This workspace has already been set up. Sign in instead.' };

  const { data, error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } });
  if (error) return { ok: false, error: error.message };
  if (!data.session) {
    return {
      ok: true,
      message:
        'Account created. Confirm your email using the link Supabase sent, then sign in to finish setting up the organization. (To skip this step in development, turn off "Confirm email" in Supabase → Authentication → Providers → Email.)',
    };
  }
  const { error: rpcError } = await supabase.rpc('create_organization', { org_name: orgName, ceo_name: fullName });
  if (rpcError) return { ok: false, error: rpcError.message };
  redirect('/');
}

/** For a signed-in user who confirmed their email but has no organization yet. */
export async function finishSetup(input: unknown): Promise<ActionResult> {
  const parsed = finishSetupSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields', fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase.rpc('create_organization', { org_name: parsed.data.orgName, ceo_name: parsed.data.fullName });
  if (error) return { ok: false, error: error.message };
  redirect('/');
}
