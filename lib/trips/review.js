// Asking what a change to the family's circumstances does to a trip.
//
// This is the quiet half of the changes work. The loud half —
// lib/trips/contradictions.js — is arithmetic, and it answers the questions that
// have only one answer. Everything else is a judgement: a wheelchair added for
// Veda does not contradict the catamaran on day four, it raises a question about
// it, and the answer depends on that operator, that dock and that tender. So it
// is asked, once, against the trip as it actually stands.
//
// Built on the tips brief rather than beside it. The same question — "given
// everything this family has written down, is there anything worth telling them"
// — is already asked well here, with the roster, the ages, the preferences, the
// money and the itinerary in it. What this adds is the reason for asking: the
// sentences saying what has drifted since the trip was planned, and an
// instruction to answer about those and nothing else.
//
// The answers come back as ordinary pro tips, on the trip, in the shapes the app
// already has. That is deliberate. A separate wall of prose about changes would
// be a second place to look for advice, with its own clearing, its own staleness
// and its own screen — and the family would have to remember which of the two
// they had read.

import { generate as callModel } from "@/lib/agent/llm";
import { TIP_SYSTEM, tipBrief } from "@/lib/tips/brief";
import { tipsFrom } from "@/lib/tips/parse";
import { acceptTips } from "@/lib/tips/tip";
import { MAX_SAID } from "@/lib/trips/circumstances";

/**
 * How long an unsearched answer needs, so a grounded pass that runs out of time
 * still leaves something behind. Same floor as the tips look, for the same
 * reason: an apology is worth less than an unverified answer that says so.
 */
const UNSEARCHED_FLOOR_MS = 12000;

/** The share of the budget the searched attempt may have. */
const SEARCH_SHARE = 0.75;

const clip = (value, max) =>
  String(value ?? "")
    .trim()
    .slice(0, max);

/**
 * The brief for a changes pass: the ordinary trip brief, then what changed, then
 * the rule about what an answer may be about.
 */
export function reviewBrief({ changes = [], contradictions = [], ...brief }) {
  const lines = [tipBrief({ ...brief, scope: "trip" })];

  lines.push("");
  lines.push(
    "WHY YOU ARE BEING ASKED. This is not a general look at the trip. The family's own circumstances have changed since this trip was planned, and they have pressed a button that asks one question: what do these changes do to the plan above?",
  );
  lines.push("");
  lines.push("WHAT CHANGED:");
  lines.push(
    changes.length
      ? changes.map((change) => `- ${clip(change.said, 240)}`).join("\n")
      : "- they asked without anything having changed, so re-read the trip against the people and animals on it as they now stand",
  );

  if (contradictions.length) {
    lines.push("");
    lines.push(
      "ALREADY SAID, LOUDLY, BY THE APP ITSELF. These are on the screen above your answer in a red band. Do not repeat them, and do not soften them:",
    );
    lines.push(
      contradictions.map((one) => `- ${clip(one.headline, 200)}`).join("\n"),
    );
  }

  lines.push("");
  lines.push(
    [
      "WHAT AN ANSWER MAY BE. Every tip must follow from one of the changes above and must name the thing on this trip it affects — a booking, a day, a task, something on the packing list. A tip that would have been just as true before the change is not an answer to this question and will be thrown away.",
      "Where a change makes something already booked doubtful, say what to ask and who to ask it of, in one sentence, rather than telling them to reconsider the trip.",
      "Where a change creates work with a deadline, put the deadline in act_by so it becomes a dated thing to do.",
      "Say nothing rather than reaching. Two real answers are better than five, and none is a legitimate answer: some changes genuinely do not touch the plan, and saying so is what makes the button worth pressing next time.",
    ].join("\n"),
  );

  return lines.join("\n");
}

/**
 * Run the pass. Returns the tips worth keeping and what was thrown away, in the
 * same shape the tips look returns, so the route that writes them does not have
 * to know which question was asked.
 *
 * @param {object} input
 * @param {Array}  input.changes   drift sentences from lib/trips/circumstances
 * @param {Array}  input.avoid     things already written down
 * @param {Array}  input.known     fingerprints already in the database
 * @param {Array}  input.subjects  titles already offered here
 * @param {object} input.place     {family_id, trip_id, scope}
 * @param {number} input.deadline  epoch ms this call must be finished by
 */
export async function reviewTrip({
  place,
  avoid = [],
  known = [],
  subjects = [],
  deadline = undefined,
  ...brief
}) {
  const asked = { role: "user", text: reviewBrief(brief) };
  const left = () => (deadline ? deadline - Date.now() : Infinity);
  const askFor = (grounded, until) =>
    callModel({
      system: TIP_SYSTEM,
      messages: [asked],
      temperature: 0.3,
      grounded,
      thinking: "low",
      ...(until && Number.isFinite(until) ? { deadline: until } : {}),
    });

  let result;
  try {
    result = await askFor(
      true,
      deadline ? Date.now() + Math.round(left() * SEARCH_SHARE) : null,
    );
  } catch (error) {
    if (!error?.timedOut || left() < UNSEARCHED_FLOOR_MS) throw error;
    result = await askFor(false, deadline || null);
  }

  const { tips, dropped } = acceptTips({
    candidates: tipsFrom(result.text),
    today: brief.today,
    place,
    avoid,
    known,
    subjects,
    sources: result.sources,
    model: result.model || null,
    searched: Boolean(result.searched),
  });

  return {
    tips,
    dropped,
    model: result.model || null,
    searched: Boolean(result.searched),
  };
}

/** The sentence a screen says about a pass that found nothing. */
export function nothingFound(changes = []) {
  const said = changes.length
    ? changes.length === 1
      ? "that change"
      : `those ${changes.length} changes`
    : "the changes";
  return `Nothing on this trip needs to move because of ${said}. The plan still fits the people and animals on it.`;
}

export { MAX_SAID };
