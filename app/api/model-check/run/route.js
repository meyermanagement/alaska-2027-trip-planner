// One test case against one model. The page runs a handful of these at once
// and fills in its grid as they come back; cost is worked out on the page so a
// price edited there applies to results already in hand.
//
// Made-up data only: every request is built from lib/model-lab/fixtures.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { isAdminUser } from "@/lib/auth/admin";
import { runCase } from "@/lib/model-lab/run";
import { geminiCandidate, openaiCandidate } from "@/lib/model-lab/catalog";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request) {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!isAdminUser(user)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const body = await request.json().catch(() => ({}));
  const model = String(body.model || "");
  // Only names that look like a text model the app could use, so the route
  // cannot be pointed at an arbitrary URL segment.
  if (!geminiCandidate(model) && !openaiCandidate(model))
    return NextResponse.json({ ok: false, error: "Not a model the lab tests" }, { status: 400 });
  const result = await runCase({
    model,
    scenario: String(body.scenario || ""),
    caseId: String(body.caseId || ""),
    effort: body.effort === "high" ? "high" : "low",
  });
  return NextResponse.json(result);
}
