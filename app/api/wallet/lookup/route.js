// Reading a rewards program's own pages so the family does not have to.
//
// Writes nothing. The answer comes back as form values the person looks at and
// presses Save on, the same way picking a program out of the shipped catalog
// fills the form -- so a wrong rate is something they see and correct before it
// is theirs, not something that arrives in the wallet behind their back.
//
// Grounded and therefore slow and paid for, so the route is behind the same door
// as the wallet itself: signed in, in a family, and not a secondary traveler.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess } from "@/lib/travelers/access";
import { REWARD_KINDS } from "@/lib/rewards";
import { lookupProgram } from "@/lib/rewards-lookup";

export const runtime = "nodejs";
// A grounded read of several pages. The day's research sits at the same ceiling
// for the same reason: cutting it shorter turns a slow answer into no answer.
export const maxDuration = 120;

const MODEL_BUDGET_MS = 90000;

const KINDS = REWARD_KINDS.map((k) => k.key);

const bad = (message, status = 400) =>
  NextResponse.json({ error: message }, { status });

export async function POST(request) {
  const startedAt = Date.now();
  let body;
  try {
    body = await request.json();
  } catch {
    body = {};
  }
  const brand = String(body?.brand || "")
    .trim()
    .slice(0, 80);
  const kind = KINDS.includes(String(body?.kind)) ? String(body.kind) : null;
  if (brand.length < 2) return bad("Type the program's name first.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad("Sign in first.", 401);

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id);
  if (!memberships?.[0]?.family_id) return bad("Join a family first.", 403);

  const access = await resolveAccess(supabase, user);
  if (access?.can.isSecondary)
    return bad("Only a primary traveler can add a rewards program.", 403);

  let result;
  try {
    result = await lookupProgram({
      brand,
      kind,
      deadline: startedAt + MODEL_BUDGET_MS,
    });
  } catch (error) {
    const status = Number(error?.status) || 502;
    return bad(
      error?.message || "I could not look that one up just now.",
      status >= 400 && status < 600 ? status : 502,
    );
  }

  console.log(
    `[wallet/lookup] brand=${brand} found=${result.entry?.found === true} rules=${
      result.entry?.earn_rules?.length || 0
    } credits=${result.entry?.credits?.length || 0} searched=${result.searched} model=${
      result.model || "none"
    } ms=${Date.now() - startedAt}`,
  );

  if (!result.entry || result.entry.found === false)
    return NextResponse.json({
      found: false,
      brand,
      sources: [],
    });

  return NextResponse.json({
    found: true,
    brand,
    entry: result.entry,
    sources: result.sources,
    model: result.model,
  });
}
