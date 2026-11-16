import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Organization, Profile } from '@/lib/types';

export interface Session {
  userId: string;
  profile: Profile;
  org: Organization;
}

/** Loads the signed-in user's profile and organization once per request. */
export const getSession = cache(async (): Promise<Session | null> => {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('*').eq('id', user.id).maybeSingle<Profile>();
  if (!profile) return null;
  const { data: org } = await supabase.from('organizations').select('*').eq('id', profile.organization_id).single<Organization>();
  if (!org) return null;
  return { userId: user.id, profile, org };
});

export async function requireSession(): Promise<Session> {
  const s = await getSession();
  if (!s) redirect('/login');
  return s;
}

export const canCreateProjects = (s: Session) => s.profile.role === 'pm' || s.profile.role === 'ceo';
