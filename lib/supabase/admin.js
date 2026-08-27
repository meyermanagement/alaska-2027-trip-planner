import { createClient as createSupabaseClient } from "@supabase/supabase-js";

/**
 * A client for the one job nobody is signed in for.
 *
 * Everything else in this app reads through the visitor's own session, which is
 * what makes row-level security the permission model rather than a second set of
 * checks in the code. The nightly reminder run has no visitor, so it needs the
 * service-role key — which bypasses RLS entirely.
 *
 * That makes this dangerous, so it is deliberately awkward: it lives on its own,
 * it is imported by exactly one route, and it returns null rather than a broken
 * client when the key is missing, so the caller has to say something useful.
 */
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
