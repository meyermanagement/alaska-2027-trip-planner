import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import { generate } from "@/lib/agent/llm";
import {
  resolveStandIn,
  standInFamilyLines,
  standInPrefsLines,
} from "@/lib/practice/standIn";

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

// The lead-in is separate from the question because at this point in onboarding
// there is very often no trip to be going on. Nothing in the welcome chain
// creates one -- it collects the family, then the interview -- so a family that
// signed up today reaches this screen with an empty calendar, and the screen
// used to paper over that by asking Aly about a destination literally named
// "your next trip". Now the primary is asked where they are thinking of going
// and the question is honest about being about a trip they do not have yet.
//
// The question is also about an average day rather than the first one. An
// arrival day is nobody's normal -- it is a late flight, a check-in and
// whatever is still open -- so advice about it turns on the itinerary rather
// than on the family, which is the one thing this screen is trying to show.
const QUESTIONS = {
  food: (lead) =>
    `${lead} Plan our food for a normal evening of the trip, not the evening we arrive. Where are we eating, roughly when, and why that and not something else?`,
  day: (lead) =>
    `${lead} Plan an average day there, not the day we arrive. Where are we going, roughly when, and why that and not something else?`,
};

/**
 * A destination the primary typed on the proof screen, made safe to interpolate.
 *
 * Caller-controlled text reaching a prompt, so it is flattened to one line and
 * capped -- a place name is a few words, and anything longer is either a mistake
 * or somebody trying to write the system prompt themselves.
 */
function cleanDestination(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
}

// Both answers come back as a plan rather than a paragraph.
//
// The screen exists to show that the interview changed the recommendation, and
// a paragraph makes that comparison hard work: the reader has to hold two
// pieces of prose side by side and find the sentence that differs. Rows make
// the difference structural instead. The same three or four slots appear in
// both columns, so a person reads down one column and across to the other and
// sees that the eight o'clock reservation became a six o'clock one, and the
// reason column says which of their own answers did that.
//
// The shape is pipe-delimited on purpose. It survives a model that ignores
// markdown instructions, it parses without a JSON mode the deadline can't
// afford to retry, and a row that comes back malformed is dropped rather than
// breaking the render -- with the raw text still returned as a fallback so a
// wholly non-compliant answer is shown as prose instead of as nothing.
//
// Highlights, not a timetable. Three rows, and each one has to be a choice
// somebody could disagree with -- the restaurant, the hour, the thing skipped.
// A four-row plan filled out to look complete spends a row on breakfast and
// another on getting back to the hotel, and those rows are identical in both
// columns, which makes the screen look like the interview changed less than
// it did.
const PLAN_SHAPE = `Answer as a plan, not a paragraph. Exactly three rows, one per line, in exactly this shape:

WHEN | WHAT | WHY

WHEN is a clock time or a short label of at most four words. WHAT is the choice itself, named, at most ten words. WHY is one sentence, at most twenty words, saying why that choice and not another. Use the pipe character to separate the three parts. No bullets, no numbering, no headings, no blank lines, and nothing before the first row or after the last.

Give only the highlights of the day. Every row must be a real decision -- a named place, a chosen hour, something done instead of something else. Do not spend a row on waking up, breakfast, checking in, travel between stops, or going to bed unless that is itself the interesting choice.`;

/**
 * The model's plan text, as rows the client can lay out.
 *
 * Deliberately forgiving about everything except the pipe. A model that adds a
 * bullet, numbers the rows, wraps a part in asterisks, or writes a sentence of
 * preamble above the plan still parses, because those are the failures that
 * actually happen and none of them change the meaning of the row. A line with
 * no pipe is dropped rather than guessed at, and a run with nothing parsable
 * returns an empty array so the caller falls back to the raw text.
 *
 * @param text the model's reply
 * @returns [{ when, what, why }], at most five rows
 */
function planRows(text) {
  return (
    String(text || "")
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => line.includes("|"))
      .map((line) =>
        line
          // Bold markers come off first: a row written as "**6:30 pm**" would
          // otherwise lose one asterisk to the bullet strip below and keep the
          // other, and the hour would render as "*6:30 pm".
          .replace(/\*\*/g, "")
          // A leading bullet or "2." is noise; a leading "6:30" is the answer, so
          // only strip a number when a list marker follows it.
          .replace(/^([-*•–]|\d+[.)])\s*/, "")
          .split("|")
          .map((part) => part.trim()),
      )
      // A model that reaches for a markdown table writes leading and trailing
      // pipes, a header row, and a row of dashes. Drop the empty edge cells, then
      // drop those two rows, and the table parses as the plan it was trying to be.
      .map((parts) => {
        const trimmed = [...parts];
        if (trimmed[0] === "") trimmed.shift();
        if (trimmed[trimmed.length - 1] === "") trimmed.pop();
        return trimmed;
      })
      .filter((parts) => !parts.every((part) => /^:?-{2,}:?$/.test(part)))
      .filter(
        (parts) =>
          !/^(when|what|why|time|choice|reason)$/i.test(parts[0] || ""),
      )
      .filter((parts) => parts.length >= 2 && parts[0] && parts[1])
      .map((parts) => ({
        when: parts[0],
        what: parts[1],
        why: parts.slice(2).join(" ").trim(),
      }))
      .slice(0, 5)
  );
}

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
  if (!user)
    return NextResponse.json({ error: "sign in first" }, { status: 401 });

  const access = await resolveAccess(supabase, user);
  if (!access?.familyId || access.level !== PRIMARY) {
    return NextResponse.json({ error: "not allowed here" }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  const category = body?.category === "day" ? "day" : "food";
  const demo = Boolean(body?.demo);
  // In practice mode the caller may carry the family they typed while
  // walking the practice chain. Merged over the built-in stand-in, so a
  // half-finished run still produces a complete prompt. Ignored outright
  // when the request is not a rehearsal, so nothing a client sends can
  // reshape a real family's proof screen.
  const standIn = demo ? resolveStandIn(body?.standIn) : null;

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

  const upcoming = demo ? standIn.trips[0] || null : (trips || [])[0] || null;
  const onCalendar = (upcoming?.destination || upcoming?.name || "").trim();
  const typed = cleanDestination(body?.destination);
  // Typed wins over the calendar. The calendar used to win, which meant a
  // family with a trip booked could not ask the same question about anywhere
  // else -- the picker on the screen would set a place and get their own trip
  // back. Their trip is still what the screen opens on, because `typed` is
  // empty until they pick something.
  const destination = typed || onCalendar;
  const usingCalendar = Boolean(onCalendar) && !typed;

  // No trip and nothing typed yet: say so instead of inventing a destination.
  // The client turns this into one question rather than a spinner, and asks
  // again with an answer.
  if (!destination) {
    return NextResponse.json({
      ok: true,
      needsDestination: true,
      category,
      demo,
      standInCustom: Boolean(standIn?.custom),
    });
  }

  const question = QUESTIONS[category](
    usingCalendar
      ? `We're going to ${destination} soon.`
      : `We're thinking about ${destination} for our next trip.`,
  );

  const baseSystem = `You are Aly, a travel assistant. Answer in American English. No emoji, no source citations. Do not preface with "great question" or similar. Do not caveat with "of course, this depends on your preferences" -- just answer.\n\n${PLAN_SHAPE}`;

  const withoutSystem = `${baseSystem}\n\nYou do not know anything about the family asking. Choose the way a general travel article would choose -- named places, common picks, the safe recommendation. Each WHY should be the reason an article would give: that it is well reviewed, famous, central, a classic. Do not invent a family to justify a choice.`;

  const familyLinesText = demo
    ? standInFamilyLines(standIn).join("\n")
    : familyLines({
        people,
        pets,
        homeAddress: family?.home_address,
      }).join("\n");
  const prefsText = demo
    ? standInPrefsLines(standIn).join("\n")
    : preferencesLines(prefs).join("\n");
  const withSystem = `${baseSystem}\n\nWhat you know about the family:\n${familyLinesText || "(nothing extra)"}\n\nThe family's travel preferences from their interview:\n${prefsText || "(no preferences recorded)"}\n\nEvery WHY must name the specific thing about this family that drove the choice -- the preference, the age, the limit, the hour they said they get up. "Well reviewed" and "a local favorite" are not reasons here; those are what the answer looks like without an interview. If a preference rules something out, the WHY may say what you are avoiding and why.`;

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
    // Lets the screen say the plan is about a trip being considered rather than
    // one on the calendar, which is the honest framing during onboarding, and
    // decides whether the button at the bottom goes to the trip list or the
    // trip builder. True whenever the family has a trip at all, even when this
    // particular answer was about somewhere else they picked.
    onCalendar: Boolean(onCalendar),
    // The trip on their calendar, so the picker can offer it as the place to
    // come back to after a detour.
    calendarDestination: onCalendar || null,
    // Whether this pair of answers is about that trip.
    answeringCalendar: usingCalendar,
    tripName: upcoming?.name || null,
    category,
    question,
    demo,
    // Lets the proof screen say whose answers it worked from, so a person
    // who typed a family into practice can tell their run reached the
    // prompt rather than guessing from the wording of the answer.
    standInCustom: Boolean(standIn?.custom),
    without: (withoutRes?.text || "").trim(),
    withPrefs: (withRes?.text || "").trim(),
    // Parsed rows for the itinerary render. Empty when the model ignored the
    // shape, which is the client's cue to fall back to the raw text above.
    withoutRows: planRows(withoutRes?.text),
    withPrefsRows: planRows(withRes?.text),
    preferenceCount: prefsText ? prefsText.split("\n").length : 0,
  });
}
