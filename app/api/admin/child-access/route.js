import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import { VERIFICATION_METHODS } from "@/lib/beta/childAccess";

export async function POST(request) {
  const user = await whoIs(await createClient());
  if (!isAdminUser(user)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  let body;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Invalid review." }, { status: 400 });
  }
  if (!["verified", "rejected"].includes(body.decision) ||
      !VERIFICATION_METHODS.some(method => method.id === body.method) ||
      body.reviewConfirmed !== true ||
      !/^[a-zA-Z0-9_-]{6,160}$/.test(body.reference || "")) {
    return NextResponse.json({ error: "Confirm the completed review, select its method, and enter an opaque verification record ID (no documents or personal information)." }, { status: 400 });
  }
  const { error } = await createAdminClient().rpc("review_child_access", {
    request_uuid: body.requestId, reviewer: user.id, decision: body.decision,
    method: body.method, evidence_reference: body.reference,
  });
  if (error) return NextResponse.json({ error: error.code === "P0001" ? error.message
    : "The review could not be recorded. Nothing was activated." }, { status: 409 });
  return NextResponse.json({ ok: true, childChatEnabled: false });
}
