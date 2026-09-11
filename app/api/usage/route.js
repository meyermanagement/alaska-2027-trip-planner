import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { stepForPath } from "@/lib/usage/steps";

/**
 * Where the trail of screens and steps is written down.
 *
 * Deliberately dull and deliberately quiet. It answers 204 to everything it
 * cannot use — nobody signed in, a body that is not a list, a path that is not a
 * path — because the caller is a beacon fired at a document that is already
 * closing and has nowhere to put an error message.
 *
 * Writes go through the visitor's own session, so row-level security is the
 * permission check here as everywhere else: the policy on usage_events only
 * accepts a row whose user_id is the person writing it. Nobody can record
 * activity for somebody else, and nobody can read this table back through the
 * app at all — the beta desk reads it with the service-role key.
 */

const MAX_EVENTS = 20;
const KINDS = new Set(["page", "step"]);
// Four hours. Anything longer is a tab left open overnight rather than a person
// reading a screen, and letting it through would poison every average.
const MAX_MS = 4 * 60 * 60 * 1000;

function cleanPath(value) {
  if (typeof value !== "string" || !value.startsWith("/")) return null;
  return value.split("?")[0].slice(0, 200);
}

export async function POST(request) {
  let payload = null;
  try {
    payload = await request.json();
  } catch {
    return new NextResponse(null, { status: 204 });
  }

  const events = Array.isArray(payload?.events)
    ? payload.events.slice(0, MAX_EVENTS)
    : [];
  if (!events.length) return new NextResponse(null, { status: 204 });

  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) return new NextResponse(null, { status: 204 });

  // Which household, so the desk can tell one tester's family apart from
  // another's without joining three tables at read time.
  const { data: membership } = await supabase
    .from("family_members")
    .select("family_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  const rows = [];
  for (const event of events) {
    const kind = KINDS.has(event?.kind) ? event.kind : null;
    if (!kind) continue;
    const path = cleanPath(event?.path);
    if (kind === "page" && !path) continue;
    const step =
      kind === "step"
        ? String(event?.step || "").slice(0, 60) || null
        : stepForPath(path);
    if (kind === "step" && !step) continue;

    const ms = Number(event?.ms);
    rows.push({
      user_id: user.id,
      family_id: membership?.family_id || null,
      kind,
      path,
      step,
      ms:
        Number.isFinite(ms) && ms >= 0
          ? Math.min(Math.round(ms), MAX_MS)
          : null,
      meta:
        event?.meta &&
        typeof event.meta === "object" &&
        !Array.isArray(event.meta)
          ? event.meta
          : null,
    });
  }

  if (!rows.length) return new NextResponse(null, { status: 204 });

  await supabase.from("usage_events").insert(rows);
  return new NextResponse(null, { status: 204 });
}
