import { createClient } from "@/lib/supabase/server";
import { aiAllowed } from "@/lib/beta/consent";
import { resolveAccess } from "@/lib/travelers/access";
import { requestOrigin } from "@/lib/childView/server";

export async function archiveContext(request) {
  requestOrigin(request);
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Please sign in again.", status: 401 };
  const { data: session, error } = await supabase.rpc("account_session_allowed");
  if (error || session !== true) return { error: "Please sign in to your adult account.", status: 403 };
  const access = await resolveAccess(supabase, user);
  // Cleared-tip surfaces are currently primary-only. Do not add a new route
  // around that restriction, child-view locks, or trip-level RLS.
  if (!access?.can.editTrips) return { error: "A primary traveler can search cleared tips.", status: 403 };
  return { supabase, familyId: access.familyId, ai: await aiAllowed(supabase, user.id) };
}
