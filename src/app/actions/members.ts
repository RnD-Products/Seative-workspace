'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { requireSession } from '@/lib/session';
import { fieldErrors, newMemberSchema, profileSchema, roleEnum } from '@/lib/validation';
import type { ActionResult } from '@/lib/types';

/**
 * CEO-only: create a login for a new team member and attach them to the organization.
 * The caller's role is verified from their own RLS-scoped profile before the service-role
 * client is touched; the organization comes from the session, never from the request.
 */
export async function addMember(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  if (session.profile.role !== 'ceo') return { ok: false, error: 'Only the CEO can add members.' };
  const parsed = newMemberSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields', fieldErrors: fieldErrors(parsed.error) };
  const v = parsed.data;

  let admin;
  try {
    admin = createAdminClient();
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  const { data: created, error } = await admin.auth.admin.createUser({
    email: v.email,
    password: v.password,
    email_confirm: true,
    user_metadata: { full_name: v.fullName },
  });
  if (error || !created.user) {
    return { ok: false, error: error?.message.includes('already') ? 'A user with that email already exists.' : error?.message ?? 'Could not create user' };
  }
  const { error: profileError } = await admin.from('profiles').insert({
    id: created.user.id,
    organization_id: session.org.id,
    full_name: v.fullName,
    email: v.email,
    role: v.role,
    job_title: v.jobTitle || null,
  });
  if (profileError) {
    await admin.auth.admin.deleteUser(created.user.id); // don't leave an orphan login behind
    return { ok: false, error: profileError.message };
  }
  revalidatePath('/settings');
  revalidatePath('/team');
  return { ok: true, message: `${v.fullName} can now sign in with ${v.email} and the temporary password you set.` };
}

export async function changeRole(profileId: string, role: unknown): Promise<ActionResult> {
  await requireSession();
  const r = roleEnum.safeParse(role);
  if (!r.success || !z.string().uuid().safeParse(profileId).success) return { ok: false, error: 'Invalid request' };
  const supabase = await createClient();
  // The database enforces CEO-only role changes and keeps at least one CEO.
  const { data, error } = await supabase.from('profiles').update({ role: r.data }).eq('id', profileId).select('id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: "You don't have permission to change roles." };
  revalidatePath('/settings');
  return { ok: true };
}

export async function updateMyProfile(input: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const parsed = profileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: 'Check the highlighted fields', fieldErrors: fieldErrors(parsed.error) };
  const supabase = await createClient();
  const { error } = await supabase
    .from('profiles')
    .update({ full_name: parsed.data.fullName, job_title: parsed.data.jobTitle || null })
    .eq('id', session.userId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Profile saved.' };
}

export async function updateOrganization(name: unknown): Promise<ActionResult> {
  const session = await requireSession();
  const n = z.string().trim().min(2, 'Name is too short').max(120).safeParse(name);
  if (!n.success) return { ok: false, error: n.error.issues[0].message };
  const supabase = await createClient();
  const { data, error } = await supabase.from('organizations').update({ name: n.data }).eq('id', session.org.id).select('id');
  if (error) return { ok: false, error: error.message };
  if (!data?.length) return { ok: false, error: 'Only the CEO can rename the organization.' };
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Organization renamed.' };
}
