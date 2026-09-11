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
 * Answers one real trip question with the interview answers folded into the
 * system prompt. The point is that the interview earns itself in front of the
 * primary right after they finish it, about a place they actually named,
 * against the actual model they'll be using -- not in an abstract "your
 * preferences have been saved" toast.
 *
 * It used to run the same question twice, the second time as if Aly knew
 * nothing about the family, so the client could show the two side by side. The
 * generic column was a straw man the family did not ask for, it halved the
 * width of the answer they did ask for, and it doubled the wait and the spend
 * on the slowest screen in onboarding. Every row of the real answer already
 * names the preference that drove it, which is the same proof without paying
 * for a second opinion nobody wanted.
 *
 * Kept as a POST so a retry can re-ask without cache trouble.
 *
 * There is one question, not a menu of them. It asks for four pieces of a
 * trip -- a meal, an activity, how the family gets around, and where they
 * sleep -- because those four are the decisions a person can immediately
 * judge, and because a food answer and a day answer shown one at a time made
 * the reader choose which one to look at instead of seeing the spread.
 *
 * The same call also returns what to pack for that day and a couple of pro
 * tips, both tied to the choices it just made rather than to the destination in
 * general. Packing and tips are two of the things the family was told Aly looks
 * after on the way in, and a screen that proves she can plan a day but not
 * mention either leaves those claims unproven. Asking for them in the same call
 * is also what keeps them honest: a list written beside a named restaurant and
 * a named activity can say what the activity needs, which is a different thing
 * from a generic packing list for the city.
 * The question set stays server-side, so nothing a caller sends chooses it.
 */

// Raised from 22 seconds when the answer grew from four rows to nine. There is
// only one model call on this screen now, so the extra room costs a slower
// worst case rather than a second call's worth of waiting, and a run that times
// out here loses the packing list and the tips as well as the plan.
const DEADLINE_MS = 28000;

// The lead-in is separate from the question because at this point in onboarding
// there is no trip to be going on. Nothing in the welcome chain creates one --
// it collects the family, then the interview -- so the primary is asked where
// they are thinking of going and the question is honest about being about a
// trip they do not have yet.
//
// The question is also about an average day rather than the first one. An
// arrival day is nobody's normal -- it is a late flight, a check-in and
// whatever is still open -- so advice about it turns on the itinerary rather
// than on the family, which is the one thing this screen is trying to show.
const QUESTION = (lead) =>
  `${lead ? `${lead} ` : ""}For an average day of the trip, not the day we arrive: pick us one meal, one thing to do, how we get around, and where we stay. For each one, say what you would choose and why that and not something else.`;

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

// The answer comes back as a plan rather than a paragraph.
//
// The screen exists to show that the interview changed the recommendation, and
// a paragraph buries that: the reason a choice was made ends up in the middle
// of a sentence about the choice. Rows make it structural instead -- the slot,
// the choice, and the reason on its own line, so a person reads four decisions
// and four reasons rather than hunting for them.
//
// The shape is pipe-delimited on purpose. It survives a model that ignores
// markdown instructions, it parses without a JSON mode the deadline can't
// afford to retry, and a row that comes back malformed is dropped rather than
// breaking the render -- with the raw text still returned as a fallback so a
// wholly non-compliant answer is shown as prose instead of as nothing.
//
// Four rows, fixed and in order: a meal, a thing to do, how the family moves
// around, a place to sleep. Fixed slots are what keep the answer a set of
// decisions somebody can judge. A model left to choose its own rows fills them
// with waking up and getting back to the hotel, which are not decisions and
// carry no reason worth reading.
const SLOTS = ["Meal", "Something to do", "Getting around", "Where you stay"];

// The packing and tip rows come back in the same pipe shape as the plan, marked
// by their own labels rather than sent as a second call. One call keeps the
// screen's wait to one wait, and -- more to the point -- a model that has just
// named the restaurant and the activity can pack for those; a separate call
// would only know the city and would write the same list for anybody.
const PACK_LABEL = "Pack";
const TIP_LABEL = "Tip";

/**
 * The follow-up asked only of the answer that knew nothing.
 *
 * The generic answer is a reference reading, and on its own it is easy to read
 * charitably: four plausible choices about a real place, and nothing on the
 * screen saying what is wrong with them. This asks the same model to mark the
 * rows that the onboarding answers rule out, and to say which answer rules each
 * one out -- which is the difference the interview made, stated against the
 * generic plan rather than inferred from the good one.
 *
 * Rows are marked only where there is something to mark. A generic choice that
 * happens to suit the family is left alone, and a run with nothing captured
 * never asks the question at all, because a screen that manufactures four
 * objections whatever the family said is the straw man this screen already
 * stopped showing.
 */
const MISFIT_SHAPE = `Reply with one line per row you are marking, and nothing else:

LABEL | WHY NOT

LABEL is copied exactly from the row you are marking. WHY NOT is one sentence, at most twenty-two words, naming the specific thing this family told us that rules the choice out or makes it a poor fit -- the preference, the age, the limit, the hour. Quote or name their own answer; do not write a general objection that would apply to any family.

Mark only rows where there is a real conflict with what they told us. Leave a row out when the choice happens to suit them, and leave it out when your objection would be a guess. If no row conflicts, reply with exactly NONE and nothing else.`;

const PLAN_SHAPE = `Answer as a plan, not a paragraph. Exactly nine rows, one per line, each in this shape:

LABEL | WHAT | WHY

Use the pipe character to separate the three parts. No bullets, no numbering, no headings, no blank lines, and nothing before the first row or after the last.

The first four rows are the day. LABEL is one of ${SLOTS.join(", ")} -- use all four, once each, in that order. WHAT is the choice itself, named, at most twelve words, and may include a time when the hour is part of the choice. WHY is one sentence, at most twenty words, saying why that choice and not another. Every one must be a real decision somebody could disagree with -- a named restaurant, a named thing to do, a named way of getting around, a named kind of place to stay. Do not answer a row with a category when you could answer it with a choice.

The next three rows are packing. LABEL is ${PACK_LABEL}. WHAT is one thing to pack, at most eight words. WHY says which of the four choices above needs it, naming that choice. Pack for the day you just planned -- what the activity, the weather at that hour, the meal's dress code or the way of getting around actually demands. Do not list things every traveler packs anyway, like a passport, a phone charger or clothes.

The last two rows are tips. LABEL is ${TIP_LABEL}. WHAT is the tip itself, at most fourteen words. WHY is why it matters here. Each tip must be about one of the four choices above and must name it -- when to book it, when to turn up, what to ask for, what will otherwise go wrong. Do not give general advice about the destination.`;

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
 * @returns [{ when, what, why }], at most twelve rows
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
      .slice(0, 12)
  );
}

/**
 * The parsed rows, split into the day, the packing list and the tips.
 *
 * Split here rather than in three parses of the same text, and split on the
 * label rather than on position, because the failure that actually happens is a
 * model that writes the nine rows in a different order or drops one. A row whose
 * label is none of the eleven known ones is kept in the day, which is where a
 * model inventing a fifth slot means it to go.
 */
function split(rows) {
  const day = [];
  const pack = [];
  const tips = [];
  for (const row of rows) {
    const label = row.when.toLowerCase();
    if (label.startsWith("pack")) pack.push(row);
    else if (label.startsWith("tip") || label.startsWith("pro tip"))
      tips.push(row);
    else day.push(row);
  }
  return { day, pack: pack.slice(0, 4), tips: tips.slice(0, 3) };
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
  const demo = Boolean(body?.demo);
  // The same question with the family struck out of the prompt, so whoever is
  // testing the chain can read what the answer looks like without an interview
  // and judge whether the real one is actually different. It is only ever an
  // internal comparison, so it is accepted in practice and nowhere else: on a
  // real family's proof screen the generic column was the straw man this screen
  // stopped showing, and there is no reason to spend a model call on it or to
  // let a caller ask for one.
  const generic = demo && Boolean(body?.generic);
  // In practice mode the caller may carry the family they typed while
  // walking the practice chain. Merged over the built-in stand-in, so a
  // half-finished run still produces a complete prompt. Ignored outright
  // when the request is not a rehearsal, so nothing a client sends can
  // reshape a real family's proof screen.
  const standIn = demo ? resolveStandIn(body?.standIn) : null;

  // A rehearsal reads nothing about the real family. Everything its prompt
  // needs is in the run the client carried, so the queries below are skipped
  // outright rather than run and discarded -- a practice screen should be
  // provably about the stand-in and about nothing that is already saved.
  const [{ data: family }, { data: prefs }, { data: people }, { data: pets }] =
    demo
      ? [{}, {}, {}, {}]
      : await Promise.all([
          supabase
            .from("families")
            .select("home_address")
            .eq("id", access.familyId)
            .maybeSingle(),
          supabase
            .from("travel_preferences")
            .select("id, slot, body, reason, source")
            .eq("family_id", access.familyId)
            .in("source", [
              "interview",
              "interview_extract",
              "interview_promoted",
            ]),
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

  // The destination is whatever the person named on the screen, and nothing
  // else. This route used to look up the family's next trip and answer about
  // that when one existed. That was wrong for the only place the screen is
  // ever shown: it runs inside the first-login sequence, and inside the
  // practice rehearsal of that sequence, where the family is being built from
  // scratch and has no trips at all -- the trip builder comes after this
  // screen. Reading the table only ever produced two bad outcomes: a
  // rehearsal answered about the stand-in's Paris trip instead of asking, and
  // the place picker hidden from anybody whose account happened to hold a
  // trip already.
  const destination = cleanDestination(body?.destination);

  // No trip and nothing typed yet: say so instead of inventing a destination.
  // The client turns this into one question rather than a spinner, and asks
  // again with an answer.
  if (!destination) {
    return NextResponse.json({
      ok: true,
      needsDestination: true,
      demo,
      standInCustom: Boolean(standIn?.custom),
    });
  }

  const prompt = QUESTION(
    `We're thinking about ${destination} for our next trip.`,
  );

  const baseSystem = `You are Aly, a travel assistant. Answer in American English. No emoji, no source citations. Do not preface with "great question" or similar. Do not caveat with "of course, this depends on your preferences" -- just answer.\n\n${PLAN_SHAPE}`;

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
  // The last sentence is load-bearing, and it is here because of a real
  // report: this answer came back explaining a choice with the family's slow
  // mornings, on a run that had been told nothing about any family. Nothing had
  // leaked -- the model had simply written a plausible household and then cited
  // it -- but an answer that invents a taste and attributes it is the one thing
  // this comparison cannot do, because the whole point of it is showing what an
  // answer looks like when nobody has said anything.
  const genericSystem = `${baseSystem}\n\nYou know nothing about the family beyond the place they named. Answer as you would for anybody who asked about ${destination}, and let each WHY stand on the choice itself. You must not attribute a preference, a habit, a pace, an age, a limit or a taste to whoever is asking, and you must not imply you were told one: you have not been. No WHY may begin \"they like\", \"they prefer\", \"they said\", \"you like\", \"you prefer\" or \"since your\", and none may name a household trait such as slow mornings, early starts, small children or an aversion to crowds. Recommend on the place itself -- what is good there, when it is quiet, how far apart things are.`;

  const withSystem = `${baseSystem}\n\nWhat you know about the family:\n${familyLinesText || "(nothing extra)"}\n\nThe family's travel preferences from their interview:\n${prefsText || "(no preferences recorded)"}\n\nEvery WHY must name the specific thing about this family that drove the choice -- the preference, the age, the limit, the hour they said they get up. "Well reviewed" and "a local favorite" are not reasons here; those are what the answer looks like without an interview. If a preference rules something out, the WHY may say what you are avoiding and why.`;

  const deadline = Date.now() + DEADLINE_MS;
  // What onboarding actually captured, as one block. Used to decide whether the
  // second pass below is worth asking for at all: with nothing captured there is
  // nothing to hold the generic answer against.
  const captured = [familyLinesText, prefsText].filter(Boolean).join("\n\n");

  // One call. A failure returns null and the client shows its own retry rather
  // than an empty card, because there is no longer a second answer to carry the
  // screen on its own.
  const withRes = await generate({
    system: generic ? genericSystem : withSystem,
    messages: [{ role: "user", text: prompt }],
    tools: [],
    grounded: false,
    deadline,
  }).catch(() => null);

  const parsed = split(planRows(withRes?.text));

  // Second pass, generic runs only: which of those four choices the onboarding
  // answers rule out, and why. Skipped when nothing was captured, when the plan
  // came back unparsable, and when the first call left too little of the
  // deadline for a short second one -- in all three cases the card simply shows
  // the generic plan with nothing marked, which is what it did before.
  let clashRows = [];
  if (
    generic &&
    captured &&
    parsed.day.length &&
    Date.now() < deadline - 6000
  ) {
    const rows = parsed.day
      .map((row) => `${row.when} | ${row.what}`)
      .join("\n");
    const misfitRes = await generate({
      system: `You are Aly, a travel assistant. Answer in American English. No emoji, no preamble.\n\n${MISFIT_SHAPE}`,
      messages: [
        {
          role: "user",
          text: `This is what we know about the family:\n${captured}\n\nThese four choices were made for a day in ${destination} by someone who knew none of that:\n${rows}\n\nWhich of them would not work for this family, and why?`,
        },
      ],
      tools: [],
      grounded: false,
      deadline,
    }).catch(() => null);
    const text = (misfitRes?.text || "").trim();
    if (!/^none\b/i.test(text)) {
      const labels = parsed.day.map((row) => row.when.toLowerCase());
      const seen = new Set();
      clashRows = planRows(text)
        // The label has to be one of the four rows on screen, or the objection
        // has nothing to attach itself to. A model that renames the slot is
        // dropped rather than shown floating above the plan.
        .filter((row) => labels.includes(row.when.toLowerCase()))
        .filter((row) => {
          const key = row.when.toLowerCase();
          if (seen.has(key)) return false;
          seen.add(key);
          return true;
        })
        .map((row) => ({
          what: row.when,
          why: [row.what, row.why].filter(Boolean).join(" ").trim(),
        }))
        .filter((row) => row.why)
        .slice(0, 4);
    }
  }

  return NextResponse.json({
    ok: true,
    destination,
    demo,
    generic,
    // Lets the proof screen say whose answers it worked from, so a person
    // who typed a family into practice can tell their run reached the
    // prompt rather than guessing from the wording of the answer.
    standInCustom: Boolean(standIn?.custom),
    withPrefs: (withRes?.text || "").trim(),
    // Parsed rows for the itinerary render. Empty when the model ignored the
    // shape, which is the client's cue to fall back to the raw text above.
    // Packing and tips are separate lists so the client can head them and can
    // leave a heading out entirely when a run came back without those rows.
    withPrefsRows: parsed.day,
    packRows: parsed.pack,
    tipRows: parsed.tips,
    // Only ever populated on a generic run, and empty when nothing about the
    // family contradicted the answer. The client heads the list only when there
    // is something in it.
    clashRows,
    preferenceCount: generic || !prefsText ? 0 : prefsText.split("\n").length,
  });
}
