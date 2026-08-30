/**
 * The next question, offered rather than waited for.
 *
 * An answer usually leaves two or three obvious things to ask, and typing one out
 * on a phone in a hotel lobby is enough friction to stop the conversation there.
 * So Aly may end an answer by offering the follow-ups herself, and the panel
 * shows them as buttons that ask on the family's behalf.
 *
 * These are questions, not changes. Pressing one sends a message; nothing is
 * saved, and every change still arrives as a card to approve.
 */

const MAX = 4;
const MAX_CHARS = 90;

function clean(value) {
  const said = String(value == null ? "" : value)
    .replace(/\s+/g, " ")
    .trim();
  if (!said) return "";
  // Her own list markers and numbering leak in surprisingly often.
  return said.replace(/^[-*•\d.)\s]{1,4}/, "").slice(0, MAX_CHARS);
}

/**
 * The questions from one offer_followups call: trimmed, deduplicated, capped.
 *
 * A question that is really an instruction is dropped. A button that quietly
 * proposes changing the trip is not a follow-up, and the family pressing it would
 * not have meant it as one.
 */
const INSTRUCTS =
  /^(add|put|book|reserve|schedule|save|create|delete|remove|clear|log|move|change|update|set)\b/i;

export function normalizeFollowups(args) {
  const list = Array.isArray(args?.questions) ? args.questions : [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const said = clean(raw);
    if (!said || said.length < 6) continue;
    if (INSTRUCTS.test(said)) continue;
    const key = said
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, " ")
      .trim();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(said);
    if (out.length >= MAX) break;
  }
  return out;
}

/**
 * Pull the offer_followups calls out of a model reply.
 *
 * Taken out before anything treats a call as a change, for the same reason
 * show_places is: this one describes what could be asked next, not something to
 * save.
 */
export function splitFollowupCalls(calls) {
  const kept = [];
  let questions = [];
  for (const call of Array.isArray(calls) ? calls : []) {
    if (call?.name === "offer_followups") {
      questions = questions.concat(normalizeFollowups(call.args));
    } else if (call) {
      kept.push(call);
    }
  }
  return { calls: kept, followups: questions.slice(0, MAX) };
}
