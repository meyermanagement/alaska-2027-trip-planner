import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resolveAccess, PRIMARY } from "@/lib/travelers/access";
import { generate } from "@/lib/agent/llm";
import {
  resolveStandIn,
  standInFamilyLines,
  standInPrefsLines,
} from "@/lib/practice/standIn";
import { familyLines, preferencesLines } from "@/lib/interview/proofContext";
import {
  PLACE_AND_CONFLICT,
  INSIDE_THE_PLACE,
  DAY_BAND_RULE,
} from "@/lib/agent/advice";

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
 * The second pass asked only of the answer that knew nothing.
 *
 * The generic plan on its own is easy to read charitably: four plausible
 * choices about a real place, and nothing on the screen saying how they differ
 * from the recommended ones. Reading the two plans side by side and working
 * out what changed is exactly the work the screen exists to do for the person,
 * and a note that only marked the worst rows left the rest of the comparison
 * unexplained -- a row where both plans landed on the same restaurant for
 * different reasons looked, on screen, like a row where the interview had
 * changed nothing.
 *
 * So this pass is handed both plans and answers for every slot, not only the
 * ones that clash: what the recommended plan chose instead, or that it kept the
 * same choice, and which onboarding answer accounts for it. The instruction to
 * name the family's own words rather than a general objection is what keeps it
 * from writing four sentences that would fit anybody.
 */
const COMPARE_SHAPE = `Reply with one line per row, and nothing else:

LABEL | WHAT CHANGED

Write one line for every label you are given, in the order you are given them. LABEL is copied exactly. WHAT CHANGED is one or two sentences, at most thirty-four words, and it does two things: it says how the two choices differ -- or that both plans chose the same thing -- and it names the specific thing this family told us that accounts for it, in their own words rather than your summary of them.

Where the recommended plan chose something else, say what it chose and what about the family made the generic choice the wrong one. Where both plans chose the same thing, say so plainly and say whether the reason changed, which is worth knowing: the same restaurant picked because it is famous is not the same recommendation as the same restaurant picked because one of them cannot eat shellfish. Never write a difference that is only wording, and never write an objection that would apply to any family.

Write it for the family to read. Do not say "Plan A" or "Plan B" -- the two plans are "this one", the one they are looking at, and "the recommended plan", the one written with their answers.`;

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
  // The plan the interview produced, carried by the client so the second pass
  // below can compare row against row instead of grading the generic plan on
  // its own. Caller-controlled text reaching a prompt, so every part is
  // flattened and capped, and only the four slots are kept.
  const recommendedRows = generic
    ? (Array.isArray(body?.recommendedRows) ? body.recommendedRows : [])
        .slice(0, 4)
        .map((row) => ({
          when: cleanDestination(row?.when),
          what: String(row?.what || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 160),
          why: String(row?.why || "")
            .replace(/\s+/g, " ")
            .trim()
            .slice(0, 240),
        }))
        .filter((row) => row.when && row.what)
    : [];

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

  const withSystem = `${baseSystem}\n\nWhat you know about the family:\n${familyLinesText || "(nothing extra)"}\n\nThe family's travel preferences from their interview:\n${prefsText || "(no preferences recorded)"}\n\nEvery WHY must name the specific thing that drove the choice, and the strongest ones name two: what this family said -- the preference, the age, the limit -- and what this place makes true, such as the season, the distance, the closing day or the hour the heat arrives. A WHY may rest on the place alone when the place fact is that specific. "Well reviewed" and "a local favorite" are never reasons here; those are what the answer looks like without an interview. If a preference rules something out, the WHY may say what you are avoiding and why. Where a choice goes against something they said, keep it and say so in the WHY along with what made it worth suggesting anyway.\n\n${PLACE_AND_CONFLICT}\n\n${INSIDE_THE_PLACE}\n\n${DAY_BAND_RULE}`;

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

  // Second pass, generic runs only: how the four generic choices differ from
  // the ones the interview produced, and which answer accounts for each
  // difference. Skipped when nothing was captured, when the plan came back
  // unparsable, and when the first call left too little of the deadline for a
  // short second one -- in all three cases the card shows the generic plan on
  // its own, which is what it did before.
  let diffRows = [];
  if (
    generic &&
    captured &&
    parsed.day.length &&
    Date.now() < deadline - 6000
  ) {
    const rows = parsed.day
      .map((row) => `${row.when} | ${row.what}`)
      .join("\n");
    // Both plans when the client carried one, which is the comparison worth
    // reading. With no recommended plan to hold it against -- a run whose first
    // answer came back unparsable -- the pass falls back to grading the generic
    // choices against the family alone.
    const recommended = recommendedRows
      .map(
        (row) => `${row.when} | ${row.what}${row.why ? ` | ${row.why}` : ""}`,
      )
      .join("\n");
    const ask = recommended
      ? `This is what we know about the family:\n${captured}\n\nPlan A was written for a day in ${destination} by someone who knew none of that:\n${rows}\n\nPlan B answered the same question knowing everything above, and each of its rows carries the reason it was chosen:\n${recommended}\n\nFor each label, what is the difference between the two, and which of the family's own answers accounts for it?`
      : `This is what we know about the family:\n${captured}\n\nThese choices were made for a day in ${destination} by someone who knew none of that:\n${rows}\n\nFor each label, say what this family's own answers would change about the choice, and which answer changes it. Where a choice happens to suit them already, say so and say which answer it happens to match.`;
    const diffRes = await generate({
      system: `You are Aly, a travel assistant. Answer in American English. No emoji, no preamble.\n\n${COMPARE_SHAPE}`,
      messages: [{ role: "user", text: ask }],
      tools: [],
      grounded: false,
      deadline,
    }).catch(() => null);
    const text = (diffRes?.text || "").trim();
    const labels = parsed.day.map((row) => row.when.toLowerCase());
    const seen = new Set();
    diffRows = planRows(text)
      // The label has to be one of the rows on screen, or the line has nothing
      // to attach itself to. A model that renames the slot is dropped rather
      // than shown floating above the plan.
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
    // Only ever populated on a generic run: one line per slot saying how the
    // generic choice differs from the recommended one and which onboarding
    // answer accounts for it. Empty when the pass was skipped or came back
    // unusable, and the client heads the list only when there is something in
    // it.
    diffRows,
    preferenceCount: generic || !prefsText ? 0 : prefsText.split("\n").length,
  });
}
