import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  applyPropagation,
  narrowPlan,
  planFor,
} from "@/lib/packing/propagateRun";

export const runtime = "nodejs";
export const maxDuration = 60;

// Push template changes onto trips that have not happened yet.
//
// Two calls, on purpose. A plain POST plans and returns what it would do without
// writing anything; POST with apply: true does it. The panel on the templates page
// uses the first, shows the plan, and only sends the second once the family has
// read it. A pass that can delete is not one to run blind.
export async function POST(request) {
  let payload = {};
  try {
    payload = (await request.json()) || {};
  } catch {
    payload = {};
  }
  const apply = payload?.apply === true;
  // Which of the proposed changes to make. Absent means all of them, which is
  // what this route did before it could be narrowed. The keys come from the plan
  // the browser was shown, and they are only ever used to filter a plan made
  // fresh here -- the browser cannot describe a change, only pick one out.
  const only = Array.isArray(payload?.only)
    ? payload.only.slice(0, 5000)
    : null;

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  }

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  const familyId = memberships?.[0]?.family_id;
  if (!familyId) {
    return NextResponse.json({ error: "No family found." }, { status: 400 });
  }

  const plan = await planFor({ supabase, familyId });

  if (!apply) {
    // `loaded` is the raw rows the plan was made from. Useful on the server, not
    // something the screen needs, and big.
    const { loaded, ...rest } = plan;
    void loaded;
    return NextResponse.json(rest);
  }

  const chosen = narrowPlan(plan, only);
  if (only && !chosen.totals.trips) {
    return NextResponse.json({
      applied: {
        adds: 0,
        updates: 0,
        removes: 0,
        errors: [],
        missing: chosen.missing.length,
      },
      totals: chosen.totals,
    });
  }

  const result = await applyPropagation({
    supabase,
    familyId,
    userId: user.id,
    plan: chosen,
  });
  return NextResponse.json(result);
}
