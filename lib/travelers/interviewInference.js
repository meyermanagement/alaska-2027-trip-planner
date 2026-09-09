import { questionFor } from "./interview";

// What the interview can work out on its own.
//
// The questions are not independent. Somebody who says the good part of the day
// is dawn, before anyone else is up, has already answered the one about the
// famous thing with a queue -- the early option there is literally "Nine,
// before anybody else is up", and one of its reasons is "The first entry of the
// day is worth losing sleep for", which is the dawn reason reworded. Asking it
// cold reads as though nothing was listened to.
//
// So: before putting a question, the interview asks this module whether an
// earlier answer already settles it. When one does, the question is shown as
// already worked out, with the implied option picked and a sentence saying what
// it was worked out from, and confirming is one tap. Nothing here writes an
// answer on its own -- the primary still agrees or corrects, and an agreed
// answer is stored with source 'derived' so the file never claims they said
// outright something that was worked out for them.
//
// Two strengths, because Mark asked for the airtight links and the reasonable
// ones together and they do not deserve the same wording:
//
//   sure    the two questions are near-verbatim the same instinct
//   likely  the same taste, one step of reasoning away
//
// A sure rule beats a likely one for the same slot. Two rules of the same
// strength that disagree cancel, and the question is asked cold -- a
// contradiction is exactly the case where the interview does not know.

/** "Dawn, before anyone else is up" -> "dawn, before anyone else is up". */
function lower(label) {
  const text = String(label || "").trim();
  if (!text) return "";
  // The first character only, and left alone when the leading word is an
  // initialism or an acronym -- "A rental, with a kitchen" wants lowercasing
  // and "B&B on the square" does not.
  const firstWord = text.split(/\s+/)[0].replace(/[^A-Za-z&]/g, "");
  if (firstWord.length > 1 && firstWord === firstWord.toUpperCase())
    return text;
  if (!/^[A-Z]/.test(text)) return text;
  return text[0].toLowerCase() + text.slice(1);
}

// Spelled out because "2 of your answers" in a sentence somebody reads once is
// worse than the word.
const COUNT_WORD = ["", "One", "Two", "Three", "Four", "Five"];

/** The label of the option a slot's value refers to, or the raw value. */
function labelFor(slot, value) {
  const question = questionFor(slot);
  const opt = (question?.options || []).find((o) => o.value === value);
  return opt?.label || value || "";
}

/**
 * The reason the primary ticked on an earlier question that most supports this
 * inference, if they ticked one. Matched on a distinctive fragment rather than
 * the whole sentence, because the chip text and the rule are maintained apart
 * and an exact-match rule would quietly stop firing the first time a chip was
 * reworded.
 */
function supportingWhy(whys, fragments) {
  if (!Array.isArray(whys) || !fragments?.length) return null;
  for (const why of whys) {
    const text = String(why || "").trim();
    if (!text) continue;
    const hay = text.toLowerCase();
    if (fragments.some((f) => hay.includes(f))) return text;
  }
  return null;
}

// Each rule reads earlier answers and, when it fires, names the slot it
// settles, the value it settles on, and the fragments of an earlier reason
// that would make the explanation concrete if one was ticked.
const RULES = [
  {
    id: "dawn-empty",
    strength: "sure",
    from: "day_shape",
    when: (a) => a.day_shape?.value === "dawn",
    implies: { slot: "crowds", value: "without" },
    whyFragments: ["losing sleep for", "empty version", "skip the parking"],
  },
  {
    id: "quiet-table-empty-room",
    strength: "sure",
    from: "food",
    when: (a) => a.food?.value === "quiet",
    implies: { slot: "crowds", value: "without" },
    whyFragments: ["nobody in the way", "empty table", "wait in a line"],
  },
  {
    id: "line-worth-waiting",
    strength: "sure",
    from: "food",
    when: (a) => a.food?.value === "line",
    implies: { slot: "crowds", value: "with" },
    whyFragments: ["worth waiting", "worth the wait", "queue"],
  },
  {
    id: "morning-beat-the-crowd",
    strength: "likely",
    from: "day_shape",
    when: (a) => a.day_shape?.value === "morning",
    implies: { slot: "crowds", value: "without" },
    whyFragments: ["beat the crowd", "out the door by nine"],
  },
  {
    id: "evening-city-full",
    strength: "likely",
    from: "day_shape",
    when: (a) => a.day_shape?.value === "evening",
    implies: { slot: "crowds", value: "with" },
    whyFragments: ["wasted city", "want it full", "sleep in"],
  },
  {
    id: "driver-buys-the-line",
    strength: "likely",
    from: "getting_around",
    when: (a) => a.getting_around?.value === "driver",
    implies: { slot: "money", value: "experiences" },
    whyFragments: ["private guide", "somebody local", "knows where to go"],
  },
];

/**
 * Every rule that fires for this slot, given the answers so far.
 *
 * Exported for the tests and for the recap screen, which wants to say what was
 * worked out and from how many directions.
 */
export function firingRules(slot, prior) {
  const answers = prior || {};
  return RULES.filter(
    (rule) => rule.implies.slot === slot && rule.when(answers),
  );
}

/**
 * What the interview already knows about this slot, or null when it should ask
 * cold.
 *
 * @param slot the slot about to be asked
 * @param prior { [slot]: { value, whys: [text] } } answers already on file,
 *   from earlier in this sitting or from a previous one
 * @returns null, or
 *   { slot, value, strength, because, from: [slot], quote, ruleIds: [id] }
 */
export function inferAnswer(slot, prior) {
  const answers = prior || {};
  // Never work out an answer to a question that is already answered, and never
  // work one out for the free-text or moments questions -- there is no option
  // set to imply, and putting words in somebody's mouth about an allergy or a
  // favorite memory would be a different kind of wrong entirely.
  if (answers[slot]) return null;
  const question = questionFor(slot);
  if (!question || question.kind !== "options") return null;

  const firing = firingRules(slot, answers);
  if (!firing.length) return null;

  // Strongest strength present wins outright; a likely rule never argues with
  // a sure one.
  const strength = firing.some((r) => r.strength === "sure")
    ? "sure"
    : "likely";
  const contenders = firing.filter((r) => r.strength === strength);
  const values = [...new Set(contenders.map((r) => r.implies.value))];
  // Same-strength rules pointing different ways: the interview does not know,
  // so it asks.
  if (values.length !== 1) return null;
  const value = values[0];
  if (!(question.options || []).some((o) => o.value === value)) return null;

  // The explanation. One source reads as a sentence; two read better as a pair,
  // and two independent answers agreeing is the most convincing thing the
  // screen can say.
  const parts = contenders.map((rule) => {
    const answer = answers[rule.from];
    const quote = supportingWhy(answer?.whys, rule.whyFragments);
    return {
      from: rule.from,
      said: lower(labelFor(rule.from, answer?.value)),
      quote,
      label: questionFor(rule.from)?.label || rule.from,
    };
  });

  const quote = parts.find((p) => p.quote)?.quote || null;
  let because;
  if (parts.length === 1) {
    because = `You said ${parts[0].said}.`;
  } else {
    // Several answers agreeing is the most convincing thing this screen can
    // say, so it leads with the agreement rather than burying it in a list.
    // The option labels carry commas of their own, which is why they are joined
    // with "and" after a colon rather than run together in a sentence.
    const said = parts.map((p) => p.said);
    const last = said.pop();
    const count = COUNT_WORD[parts.length] || String(parts.length);
    because = `${count} of your answers point the same way: ${said.join(", ")}, and ${last}.`;
  }
  if (quote) because += ` And that ${lower(stripPeriod(quote))}.`;

  return {
    slot,
    value,
    strength,
    because,
    quote,
    from: parts.map((p) => p.from),
    ruleIds: contenders.map((r) => r.id),
  };
}

/** "The empty version is worth it." -> "The empty version is worth it" */
function stripPeriod(text) {
  return String(text || "")
    .trim()
    .replace(/\.$/, "");
}

/**
 * Rebuild the answers already on file into the shape inferAnswer wants.
 *
 * The interview stores an option pick as the option's own label on the slot row
 * and each ticked reason as its own preference row, so the answers can be read
 * back without a second table and without any new column. The base preference
 * row is recognized by its "Question label: Option label" shape and left out of
 * the reasons, since it is the answer rather than a reason for it.
 *
 * @param slots traveler_slots rows for the family (family-wide ones)
 * @param preferences travel_preferences rows for the family
 */
export function priorAnswersFrom({ slots, preferences } = {}) {
  const out = {};
  for (const row of slots || []) {
    if (row?.traveler_id) continue;
    if (row?.status !== "settled") continue;
    const question = questionFor(row.slot);
    if (!question || question.kind !== "options") continue;
    const note = String(row.note || "").trim();
    const opt = (question.options || []).find((o) => o.label === note);
    // A settled option slot whose note does not match any option is an
    // own-words answer. It counts as answered -- so nothing is inferred for it
    // -- but it implies nothing for other slots, because the sentence is theirs
    // and this module does not read prose.
    out[row.slot] = { value: opt?.value || null, whys: [] };
  }
  for (const row of preferences || []) {
    if (row?.traveler_id) continue;
    const slot = row?.slot;
    if (!slot || !out[slot]) continue;
    const body = String(row.body || "").trim();
    if (!body) continue;
    const question = questionFor(slot);
    if (body.startsWith(`${question.label}: `)) continue;
    out[slot].whys.push(body);
  }
  return out;
}
