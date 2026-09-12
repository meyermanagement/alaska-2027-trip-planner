import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import { FEEDBACK_STATUSES, FIX_ROUTES } from "@/lib/feedback/shared";

export const runtime = "nodejs";

/**
 * POST /api/admin/feedback  { id, status?, route?, maybeFixed? }
 *
 * The three things the desk writes about a report: where it stands (new, read,
 * fixed, not doing), whether it can be handed over as asked or wants a
 * conversation first, and whether somebody suspects it has already been fixed
 * since it was filed.
 *
 * Any one of the three on its own is a valid call, so a chip can be tapped
 * without the other two being restated and quietly overwritten by a stale copy
 * of the row. Checks the allowlist for itself rather than trusting that the page
 * it was called from did -- a page that hides a button is not a permission
 * model.
 */
export async function POST(request) {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!isAdminUser(user)) {
    return NextResponse.json({ ok: false, error: "No." }, { status: 404 });
  }

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json(
      { ok: false, error: "This deployment has no service-role key." },
      { status: 500 },
    );
  }

  const body = await request.json().catch(() => null);
  const id = String(body?.id || "").trim();
  const status = String(body?.status || "").trim();
  const route = String(body?.route ?? "").trim();
  const hasRoute = Object.hasOwn(body || {}, "route");
  const hasFixed = Object.hasOwn(body || {}, "maybeFixed");

  if (!id) {
    return NextResponse.json(
      { ok: false, error: "That is not a report." },
      { status: 400 },
    );
  }
  if (status && !FEEDBACK_STATUSES.includes(status)) {
    return NextResponse.json(
      { ok: false, error: "That is not a status." },
      { status: 400 },
    );
  }
  if (hasRoute && route && !Object.hasOwn(FIX_ROUTES, route)) {
    return NextResponse.json(
      { ok: false, error: "That is not a way to fix it." },
      { status: 400 },
    );
  }
  if (!status && !hasRoute && !hasFixed) {
    return NextResponse.json(
      { ok: false, error: "Nothing to change." },
      { status: 400 },
    );
  }

  const patch = {};
  if (status) {
    patch.status = status;
    patch.handled_at = status === "new" ? null : new Date().toISOString();
  }
  // An empty string clears the judgment back to unjudged, which is how the same
  // chip both sets and unsets it.
  if (hasRoute) patch.route = route || null;
  if (hasFixed) patch.maybe_fixed = Boolean(body?.maybeFixed);

  const { error } = await admin.from("feedback").update(patch).eq("id", id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "That did not save." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
