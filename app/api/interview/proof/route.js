import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import { generate } from "@/lib/agent/llm";

/**
 * The interview-proof endpoint.
 *
 * Runs the same real trip question twice: once as if Aly knew nothing
 * about the family, and once with the interview answers folded into the
 * system prompt. Both answers are returned so the client can render them
 * side by side. The point is that the interview earns itself in front of
 * the primary right after they finish it, on their actual next trip,
 * against the actual model they'll be using -- not in an abstract
 * "your preferences have been saved" toast.
 *
 * Kept as a POST so retries can vary the question without cache trouble.
 * The client picks a category ("food", "day") and the endpoint chooses
 * the prompt from a small local table -- open-ended and safe because the
 * question set is server-side, not caller-controlled.
 */

const DEADLINE_MS = 22000;

const QUESTIONS = {
  food: (dest) =>
    `We're going to ${dest} soon. Where should we go for dinner our first night? Answer in one short paragraph, no lists, no headings. Name a concrete place if one fits and explain why in one clause. If the trip's shape or the family's shape suggests a different kind of dinner, say so.`,
  day: (dest) =>
    `We're going to ${dest} soon. What should we do on our first full day there? Answer in one short paragraph, no lists, no headings. Name concrete places and times if they fit. Match the pace and shape you know about the family.`,
};

function preferencesLines(prefs) {
  return (prefs || [])
    .filter((p) => (p.body || "").trim())
    .map((p) => {
      const slot = p.slot ? `[${p.slot}] ` : "";
      return `- ${slot}${p.body.trim()}`;
    });
}

function familyLines({ people, pets, homeAddress }) {
  const lines = [];
  if (homeAddress) lines.push(`Home: ${homeAddress}`);
  if (people?.length) {
    lines.push(
      `People: ${people
        .map((p) => {
          const name = p.name || "(unnamed)";
          if (!p.date_of_birth) return name;
          const born = new Date(`${p.date_of_birth}T12:00:00Z`);
          const now = new Date();
          let age = now.getUTCFullYear() - born.getUTCFullYear();
          if (
            now.getUTCMonth() < born.getUTCMonth() ||
            (now.getUTCMonth() === born.getUTCMonth() &&
              now.getUTCDate() < born.getUTCDate())
          )
            age -= 1;
          return `${name} (${age})`;
        })
        .join(", ")}`,
    );
  }
  if (pets?.length) {
    lines.push(
      `Pets: ${pets.map((p) => `${p.name || "?"} (${p.species || "?"})`).join(", ")}`,
    );
  }
  return lines;
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
  const category = body?.category === "day" ? "day" : "food";

  const today = new Date().toISOString().slice(0, 10);
  const [
    { data: family },
    { data: trips },
    { data: prefs },
    { data: people },
    { data: pets },
  ] = await Promise.all([
    supabase
      .from("families")
      .select("home_address")
      .eq("id", access.familyId)
      .maybeSingle(),
    supabase
      .from("trips")
      .select("id, name, destination, start_date, end_date, status")
      .eq("family_id", access.familyId)
      .gte("start_date", today)
      .neq("status", "past")
      .order("start_date", { ascending: true })
      .limit(1),
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

  const upcoming = (trips || [])[0] || null;
  const destination =
    (upcoming?.destination || upcoming?.name || "").trim() || "your next trip";

  const question = QUESTIONS[category](destination);

  const baseSystem = `You are Aly, a travel assistant. Answer in American English. One short paragraph. No lists, no headings, no emoji, no source citations. Do not preface with "great question" or similar. Do not caveat with "of course, this depends on your preferences" -- just answer.`;

  const withoutSystem = `${baseSystem}\n\nYou do not know anything about the family asking. Answer the way a general travel article would answer -- named places, common picks, the safe recommendation.`;

  const familyLinesText = familyLines({
    people,
    pets,
    homeAddress: family?.home_address,
  }).join("\n");
  const prefsText = preferencesLines(prefs).join("\n");
  const withSystem = `${baseSystem}\n\nWhat you know about the family:\n${familyLinesText || "(nothing extra)"}\n\nThe family's travel preferences from their interview:\n${prefsText || "(no preferences recorded)"}\n\nUse this to shape your one-paragraph answer. Name at least one specific way the family's preferences change the recommendation from what a generic answer would say. Do not list the preferences back to the family; just let them show through in your choice.`;

  const deadline = Date.now() + DEADLINE_MS;

  // Two calls in parallel. If either fails, we still show the other; the
  // client renders a plain fallback for the missing side rather than an
  // error, because the point of the screen is comparison and one side is
  // still comparison-with-a-known-empty.
  const [withoutRes, withRes] = await Promise.all([
    generate({
      system: withoutSystem,
      messages: [{ role: "user", text: question }],
      tools: [],
      grounded: false,
      deadline,
    }).catch(() => null),
    generate({
      system: withSystem,
      messages: [{ role: "user", text: question }],
      tools: [],
      grounded: false,
      deadline,
    }).catch(() => null),
  ]);

  return NextResponse.json({
    ok: true,
    destination,
    tripName: upcoming?.name || null,
    category,
    question,
    without: (withoutRes?.text || "").trim(),
    withPrefs: (withRes?.text || "").trim(),
    preferenceCount: prefsText ? prefsText.split("\n").length : 0,
  });
}
