import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import { FEEDBACK_STATUSES } from "@/lib/feedback/shared";

export const runtime = "nodejs";

/**
 * POST /api/admin/feedback  { id, status }
 *
 * Where a report stands: new, read, fixed, or not doing. The only thing the
 * desk writes. Checks the allowlist for itself rather than trusting that the
 * page it was called from did -- a page that hides a button is not a permission
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
  if (!id || !FEEDBACK_STATUSES.includes(status)) {
    return NextResponse.json(
      { ok: false, error: "That is not a status." },
      { status: 400 },
    );
  }

  const { error } = await admin
    .from("feedback")
    .update({
      status,
      handled_at: status === "new" ? null : new Date().toISOString(),
    })
    .eq("id", id);

  if (error) {
    return NextResponse.json(
      { ok: false, error: "That did not save." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}
