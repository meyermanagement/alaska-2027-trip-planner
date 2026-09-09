import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import { generate } from "@/lib/agent/llm";

/**
 * Ask-once endpoint. The final onboarding moment: the primary types one
 * real question and gets one grounded answer from Aly, using the same
 * preferences+family context that will back every future turn. Kept
 * purposely thin -- it does not open a chat, does not persist history,
 * does not tool-call. The point is a first taste of the real answer, on
 * a real family, so the primary understands what \"talk to Aly\" means
 * before they even find the Ask Aly button in the app chrome.
 */

const DEADLINE_MS = 22000;
const MAX_LEN = 600;

function preferencesLines(prefs) {
  return (prefs || [])
    .filter((p) => (p.body || "").trim())
    .map((p) => {
      const slot = p.slot ? `[${p.slot}] ` : "";
      return `- ${slot}${p.body.trim()}`;
    });
}

export async function POST(req) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "sign in first" }, { status: 401 });
  const access = await resolveAccess(supabase, user);
  if (!access?.familyId || access.level !== PRIMARY) {
    return NextResponse.json({ error: "not allowed here" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const question = String(body?.question || "").trim().slice(0, MAX_LEN);
  if (!question) {
    return NextResponse.json({ error: "type a question" }, { status: 400 });
  }

  const today = new Date().toISOString().slice(0, 10);
  const [{ data: trips }, { data: prefs }, { data: travelers }, { data: pets }] =
    await Promise.all([
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
        .select("id, name, date_of_birth")
        .eq("family_id", access.familyId)
        .eq("is_person", true),
      supabase
        .from("pets")
        .select("id, name, species")
        .eq("family_id", access.familyId),
    ]);

  const prefsText = preferencesLines(prefs).join("\n") || "(no preferences)";
  const familyNames = (travelers || []).map((t) => t.name).filter(Boolean).join(", ");
  const tripsText = (trips || [])
    .map(
      (t) =>
        `- ${t.name || t.destination}: ${t.destination || "?"}, ${
          t.start_date || "?"
        } to ${t.end_date || "?"}`,
    )
    .join("\n");
  const petsText = (pets || []).length
    ? (pets || []).map((p) => `${p.name} (${p.species || "pet"})`).join(", ")
    : "(no pets)";

  const system = `You are Aly, the family's travel assistant. Answer in American English. Reply in one to three short paragraphs, no lists, no headings, no emoji. Use everything you know about the family below to make the answer specific to them, not generic. When something you can't be sure of would change your answer, say so briefly rather than make it up.

Family: ${familyNames || "(the family)"}. Pets: ${petsText}.

Upcoming trips:
${tripsText || "(no trips yet)"}

Preferences from the family's interview:
${prefsText}`;

  const res = await generate({
    system,
    messages: [{ role: "user", text: question }],
    tools: [],
    grounded: false,
    deadline: Date.now() + DEADLINE_MS,
  }).catch(() => null);

  if (!res || !res.text) {
    return NextResponse.json(
      { error: "Aly didn't answer that one. Try again in a moment." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true, question, answer: res.text.trim() });
}
