import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseEnv } from '@/lib/env';

/**
 * Service-role client. Bypasses RLS, so it is used in exactly one place: creating a new
 * member's login after the caller has been verified as the organization's CEO.
 */
export function createAdminClient() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set, so new members cannot be created.');
  const { url } = supabaseEnv();
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
