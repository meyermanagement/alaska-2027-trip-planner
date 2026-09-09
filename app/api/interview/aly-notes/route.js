import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import { generate } from "@/lib/agent/llm";
import {
  resolveStandIn,
  standInFamilyNames,
  standInPrefsLines,
} from "@/lib/practice/standIn";

/**
 * Aly-notes-per-trip endpoint. Given the family's real upcoming trips
 * and the interview preferences the primary just saved, ask Aly to
 * write one very short paragraph per trip: "here is what I know about
 * this trip already, and here is what I'll be doing about it because
 * of what you just told me." Two or three sentences, no bullets.
 *
 * Kept as a single POST so all trips generate in parallel and the
 * client can render everything together rather than a slow trickle.
 */

const DEADLINE_MS = 26000;

function preferencesLines(prefs) {
  return (prefs || [])
    .filter((p) => (p.body || "").trim())
    .map((p) => {
      const slot = p.slot ? `[${p.slot}] ` : "";
      return `- ${slot}${p.body.trim()}`;
    });
}

export async function POST(req) {
  const body = await req.json().catch(() => null);
  const demo = Boolean(body?.demo);
  // A practice caller may carry the family it collected while walking the
  // practice chain; see lib/practice/standIn.js. Only honored for a
  // rehearsal, so a real family's notes always come from their own rows.
  const standIn = demo ? resolveStandIn(body?.standIn) : null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId || access.level !== PRIMARY) {
    return NextResponse.json({ error: "not allowed here" }, { status: 403 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: trips }, { data: prefs }, { data: travelers }] = demo
    ? [{ data: standIn.trips }, { data: [] }, { data: [] }]
    : await Promise.all([
    supabase
      .from("trips")
      .select("id, name, destination, start_date, end_date, status")
      .eq("family_id", access.familyId)
      .gte("start_date", today)
      .neq("status", "past")
      .order("start_date", { ascending: true })
      .limit(4),
    supabase
      .from("travel_preferences")
      .select("id, slot, body, reason, source")
      .eq("family_id", access.familyId)
      .in("source", ["interview", "interview_extract", "interview_promoted"]),
    supabase
      .from("travelers")
      .select("id, name")
      .eq("family_id", access.familyId)
      .eq("is_person", true),
  ]);

  if (!trips?.length) {
    return NextResponse.json({ ok: true, notes: [] });
  }

  const prefsText = demo
    ? standInPrefsLines(standIn).join("\n")
    : preferencesLines(prefs).join("\n") || "(no preferences on file)";
  const familyNames = demo
    ? standInFamilyNames(standIn)
    : (travelers || []).map((t) => t.name).filter(Boolean).join(", ");

  const system = `You are Aly, a travel assistant. Write in American English. For each trip named below, write exactly two short sentences, no lists, no headings, no emoji. Sentence one: what you already know about this specific trip that will shape your work on it. Sentence two: one concrete thing you will do differently because of the family's preferences. Reference the family by name if useful, but do not list their preferences back to them; just let them show through in what you say you'll do.

The family: ${familyNames || "(the family)"}.

Their interview preferences:
${prefsText}

Return valid JSON in the shape { "notes": [{ "trip_id": "...", "text": "..." }] } and nothing else -- no markdown fence, no prose before or after the object. One entry per trip, in the same order the trips are given.`;

  const tripLines = trips
    .map(
      (t, i) =>
        `${i + 1}. trip_id=${t.id} name="${t.name || ""}" destination="${
          t.destination || t.name || "unknown"
        }" dates=${t.start_date || "?"}..${t.end_date || "?"}`,
    )
    .join("\n");

  const res = await generate({
    system,
    messages: [{ role: "user", text: `The trips:\n${tripLines}` }],
    tools: [],
    grounded: false,
    deadline: Date.now() + DEADLINE_MS,
  }).catch(() => null);

  const raw = (res?.text || "").trim();
  let parsed = null;
  try {
    // Aly can wrap her JSON in a code fence even when told not to; strip
    // one leading fence pair before parsing rather than fail the whole
    // screen over cosmetics.
    const cleaned = raw
      .replace(/^```(?:json)?\s*/i, "")
      .replace(/\s*```\s*$/i, "");
    parsed = JSON.parse(cleaned);
  } catch {
    parsed = null;
  }

  const notes = (parsed?.notes || [])
    .filter((n) => n && n.trip_id && (n.text || "").trim())
    .map((n) => ({ trip_id: n.trip_id, text: String(n.text).trim() }));

  const enriched = trips.map((t) => ({
    trip_id: t.id,
    name: t.name || t.destination || "Trip",
    destination: t.destination || null,
    start_date: t.start_date,
    end_date: t.end_date,
    text: notes.find((n) => n.trip_id === t.id)?.text || "",
  }));

  return NextResponse.json({ ok: true, notes: enriched });
}
