// Chip bookkeeping for the interview's reason rows.
//
// A reason chip is saved as its own preference row, so which chips are still
// live is an answer-shaping question rather than a display detail, and the
// rules live here where they can be read and tested on their own instead of
// inside a component.

import { personalizeReasons } from "./interviewPersonalize";

// The cache key a chip's Aly-written follow-ups live under. Shared by the
// panel that fetches them and the prune below, so the two cannot drift into
// looking in different places. v4 keys start with a version tag so entries
// cached before the prompt was tightened do not survive a refresh; bump it
// when the /api/interview/suggest prompt changes materially. The option is
// deliberately absent: a chip's text belongs to exactly one option, and
// keying on the pick cached the same chip twice on a question where several
// options can be ticked at once.
export function suggestionKey(slot, chip) {
  return `v4::${slot}::${String(chip || "").toLowerCase()}`;
}

// Every chip that exists because one option is ticked: that option's own
// hand-written reasons, plus the follow-ups Aly generated from them, which are
// reachable only while their parent chip is on screen.
export function chipsBelongingTo({ question, value, context, cacheGet }) {
  const opt = (question?.options || []).find((o) => o.value === value);
  const out = new Set();
  for (const chip of personalizeReasons((opt && opt.reasons) || [], context)) {
    out.add(chip.toLowerCase());
    const generated =
      (typeof cacheGet === "function"
        ? cacheGet(suggestionKey(question?.slot, chip))
        : null) || [];
    for (const g of generated) out.add(String(g || "").toLowerCase());
  }
  return out;
}

// The saved reasons that survive unticking `removed`, given the ticks that
// remain. A reason is dropped only when it traces to the removed option and to
// none of the remaining ones: a chip that two ticked options both happen to
// carry stays, and the question's neutral chips belong to no option and are
// never touched. Order is preserved, and the same array is returned when
// nothing needs dropping so a caller can skip a needless state write.
export function whysAfterUntick({
  question,
  removed,
  remaining,
  whys,
  context,
  cacheGet,
}) {
  const list = Array.isArray(whys) ? whys : [];
  if (list.length === 0) return list;
  const orphaned = chipsBelongingTo({
    question,
    value: removed,
    context,
    cacheGet,
  });
  if (orphaned.size === 0) return list;
  const kept = new Set();
  for (const other of remaining || []) {
    if (other === removed) continue;
    for (const chip of chipsBelongingTo({
      question,
      value: other,
      context,
      cacheGet,
    })) {
      kept.add(chip);
    }
  }
  const next = list.filter((why) => {
    const key = String(why || "").toLowerCase();
    return !orphaned.has(key) || kept.has(key);
  });
  return next.length === list.length ? list : next;
}
