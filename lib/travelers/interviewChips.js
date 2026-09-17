// Chip bookkeeping for the interview's reason rows.
//
// A reason chip is saved as its own preference row, so which chips are still
// live is an answer-shaping question rather than a display detail, and the
// rules live here where they can be read and tested on their own instead of
// inside a component.

import { personalizeReasons } from "./interviewPersonalize";

// Every chip that exists because one option is ticked: that option's own
// hand-written reasons, and the second row of follow-ups written against the
// same option. Both ship with the question, and both are reachable only while
// that option is ticked, so both go when the tick does.
export function chipsBelongingTo({ question, value, context }) {
  const opt = (question?.options || []).find((o) => o.value === value);
  const out = new Set();
  const owned = [...((opt && opt.reasons) || []), ...((opt && opt.more) || [])];
  for (const chip of personalizeReasons(owned, context)) {
    out.add(chip.toLowerCase());
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
}) {
  const list = Array.isArray(whys) ? whys : [];
  if (list.length === 0) return list;
  const orphaned = chipsBelongingTo({ question, value: removed, context });
  if (orphaned.size === 0) return list;
  const kept = new Set();
  for (const other of remaining || []) {
    if (other === removed) continue;
    for (const chip of chipsBelongingTo({ question, value: other, context })) {
      kept.add(chip);
    }
  }
  const next = list.filter((why) => {
    const key = String(why || "").toLowerCase();
    return !orphaned.has(key) || kept.has(key);
  });
  return next.length === list.length ? list : next;
}
