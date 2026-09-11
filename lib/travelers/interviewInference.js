import {
  BAND_BUCKETS,
  bandBucket,
  bandSentence,
  parseBandNote,
} from "./dayBand";
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
  if (opt?.label) return opt.label;
  // The day band has no options: its value is the coarse bucket worked out
  // from the hours, so the phrase that reads back into a sentence comes from
  // the bucket list rather than from an option label.
  if (question?.kind === "band") {
    const bucket = BAND_BUCKETS.find((b) => b.value === value);
    if (bucket) return bucket.label;
  }
  return value || "";
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
//
// needsWhy marks the rules that hang on the reason rather than the option. The
// airtight ones mostly do, and for a good reason: a picked option is a broad
// answer -- "the local place with the line" says something about restaurants and
// not much about where the money goes -- while the reasons under it are
// specific, and several of them are word-for-word a reason belonging to a later
// question. Somebody who ticked "We book the hard reservation before we book
// the flights" under the food question has already written the money question's
// own answer for it, because that exact sentence is one of the reasons offered
// under The meals. Those are the links worth calling airtight. Rules with
// needsWhy do not fire on the option alone, so no chip means no claim.
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

  // ---------------------------------------------------------------------
  // Airtight: the reason ticked on the earlier question is, word for word or
  // near enough, a reason offered under the option this settles. Each one
  // below was found by comparing every reason in the interview against every
  // reason on a later question, not by guessing at which tastes go together.
  // ---------------------------------------------------------------------

  // "The hard reservation before the flights" is offered under both The local
  // place with the line and The meals, identically.
  {
    id: "meals-books-the-reservation-first",
    strength: "sure",
    from: "food",
    needsWhy: true,
    when: (a) => a.food?.value === "line",
    implies: { slot: "money", value: "meals" },
    whyFragments: ["hard reservation before"],
  },
  // "A tasting menu once a trip" against The meals' own "One tasting menu per
  // trip".
  {
    id: "meals-tasting-menu-floor",
    strength: "sure",
    from: "food",
    needsWhy: true,
    when: (a) => a.food?.value === "line",
    implies: { slot: "money", value: "meals" },
    whyFragments: ["tasting menu"],
  },
  // "A driver who speaks the language" against The experiences' own "A guide
  // who speaks the language".
  {
    id: "experiences-speaks-the-language",
    strength: "sure",
    from: "getting_around",
    needsWhy: true,
    when: (a) => a.getting_around?.value === "driver",
    implies: { slot: "money", value: "experiences" },
    whyFragments: ["speaks the language"],
  },
  // "A guide who skips the line beats the cheaper ticket" against The
  // experiences' "A private guide over a group tour".
  // Somebody who would pay for the guide over the cheaper ticket has said
  // where the money goes.
  {
    id: "experiences-guide-over-cheaper-ticket",
    strength: "sure",
    from: "crowds",
    needsWhy: true,
    when: (a) => a.crowds?.value === "with",
    implies: { slot: "money", value: "experiences" },
    whyFragments: ["cheaper self-guided", "skips the line beats"],
  },
  // "A timed ticket, booked six months out" against The experiences'
  // "A hard-to-get ticket, six months out".
  {
    id: "experiences-books-six-months-out",
    strength: "sure",
    from: "crowds",
    needsWhy: true,
    when: (a) => a.crowds?.value === "with",
    implies: { slot: "money", value: "experiences" },
    whyFragments: ["six months out"],
  },
  // "A walkable neighborhood is worth paying up for on the room" names the
  // room as the thing worth paying up for, which is the whole of The room.
  {
    id: "room-walkable-neighborhood",
    strength: "sure",
    from: "getting_around",
    needsWhy: true,
    when: (a) => a.getting_around?.value === "walk",
    implies: { slot: "money", value: "room" },
    whyFragments: ["paying up for on the room"],
  },
  // "Free parking is worth paying up for on the room" does the same from
  // the other direction: a different reason for it, the same place to spend.
  {
    id: "room-pays-up-for-parking",
    strength: "sure",
    from: "getting_around",
    needsWhy: true,
    when: (a) => a.getting_around?.value === "car",
    implies: { slot: "money", value: "room" },
    whyFragments: ["paying up for on the room"],
  },
  // "A twenty-minute walk, not an hour"
  // against Walkable enough not to need one's "Twenty minutes on foot is the
  // sweet spot; forty is too far". The same tolerance, to the minute.
  {
    id: "walk-twenty-minutes-is-the-sweet-spot",
    strength: "sure",
    from: "doing_or_seeing",
    needsWhy: true,
    when: (a) => a.doing_or_seeing?.value === "seeing",
    implies: { slot: "getting_around", value: "walk" },
    whyFragments: ["twenty-minute walk", "ask for a walk, not a workout"],
  },
  // "An empty city is a wasted city; we want it full" is the queue
  // question answered outright, in the opposite words to the early option.
  // This is why the evening rule above stays likely: the option alone is a
  // guess, and this reason is not.
  {
    id: "crowds-wants-the-city-full",
    strength: "sure",
    from: "day_shape",
    needsWhy: true,
    when: (a) => a.day_shape?.value === "evening",
    implies: { slot: "crowds", value: "with" },
    whyFragments: ["wasted city", "want it full"],
  },
  // "We skip the parking problem entirely" -- only
  // somebody parking a car has a parking problem to skip.
  {
    id: "car-skips-the-parking-problem",
    strength: "sure",
    from: "day_shape",
    needsWhy: true,
    when: (a) => a.day_shape?.value === "dawn",
    implies: { slot: "getting_around", value: "car" },
    whyFragments: ["parking problem"],
  },

  // ---------------------------------------------------------------------
  // Reasonable: the same taste, a step of reasoning away. These lose to any
  // airtight rule that disagrees with them.
  // ---------------------------------------------------------------------

  // "First-class on a train over two hours"
  // against Getting there in comfort's "Business class over economy for
  // anything longer than six hours". The same instinct about long journeys,
  // but a train is not a flight and the reason itself draws a line under two
  // hours, so it stays a guess.
  {
    id: "flights-pays-up-past-a-few-hours",
    strength: "likely",
    from: "getting_around",
    needsWhy: true,
    when: (a) => a.getting_around?.value === "transit",
    implies: { slot: "money", value: "flights" },
    whyFragments: ["first-class on a train"],
  },
  // "One splurge meal a trip; the rest simple" puts the splurge on a
  // meal, though the second half is the sound of somebody who might rather
  // spend it elsewhere.
  {
    id: "meals-one-splurge-meal",
    strength: "likely",
    from: "food",
    needsWhy: true,
    when: (a) => a.food?.value === "line",
    implies: { slot: "money", value: "meals" },
    whyFragments: ["splurge meal"],
  },
  // "A guided activity is worth it" is
  // a willingness to pay for the doing, which is what The experiences is.
  {
    id: "experiences-pays-for-the-guide",
    strength: "likely",
    from: "doing_or_seeing",
    needsWhy: true,
    when: (a) => a.doing_or_seeing?.value === "doing",
    implies: { slot: "money", value: "experiences" },
    whyFragments: ["guided activity is worth it"],
  },
  // "Two tickets a day; the rest should be walking" makes
  // walking the default way through a day, which is close to the walkable
  // option without being it -- walking between stops is not the same as
  // choosing a base you can walk out of.
  {
    id: "walk-the-rest-should-be-walking",
    strength: "likely",
    from: "pace",
    needsWhy: true,
    when: (a) => a.pace?.value === "one_thing",
    implies: { slot: "getting_around", value: "walk" },
    whyFragments: ["rest should be walking"],
  },
  // "A hotel bar we would actually use" is about the
  // hotel rather than the room itself, which is why it is not airtight.
  {
    id: "room-pays-up-for-the-hotel",
    strength: "likely",
    from: "staying",
    needsWhy: true,
    when: (a) => a.staying?.value === "hotel",
    implies: { slot: "money", value: "room" },
    whyFragments: ["hotel bar we would actually use", "bigger room"],
  },
  // "The empty version is worth losing sleep for" is about
  // sights, and a restaurant is not a sight -- plenty of people want the
  // museum empty and the dining room loud -- so the same reason that settles
  // the queue question outright only guesses at this one.
  {
    id: "quiet-table-from-empty-places",
    strength: "likely",
    from: "day_shape",
    needsWhy: true,
    when: (a) => a.day_shape?.value === "dawn",
    implies: { slot: "food", value: "quiet" },
    whyFragments: ["empty version"],
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
  return RULES.filter((rule) => {
    if (rule.implies.slot !== slot) return false;
    if (!rule.when(answers)) return false;
    // A rule that hangs on a reason needs that reason actually ticked. The
    // option on its own is not the claim these rules make.
    if (rule.needsWhy)
      return Boolean(
        supportingWhy(answers[rule.from]?.whys, rule.whyFragments),
      );
    return true;
  });
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
  // Ranked questions are inferable too, and what gets worked out is first
  // place -- the rules imply "the money goes on the room", which is a claim
  // about what comes first and says nothing about the order below it. A multi
  // question is inferable in the same narrow way: one thing they would book,
  // offered as a first tick for the primary to add to or take out.
  if (
    !question ||
    (question.kind !== "options" &&
      question.kind !== "rank" &&
      question.kind !== "multi")
  )
    return null;

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
  //
  // One entry per earlier question, not per rule. Several rules can fire off
  // the same answer -- ticking both the hard-reservation reason and the
  // tasting-menu one under the restaurant question fires two -- and counting
  // those as two answers agreeing would be flattery: it is one answer, and
  // saying "Two of your answers point the same way" then naming the same
  // question twice is exactly the kind of thing that makes somebody stop
  // believing the rest of the sentence. Where a question fires more than once,
  // the reason that carries a quote is the one kept, since it is the one with
  // something to show.
  const bySource = new Map();
  for (const rule of contenders) {
    const answer = answers[rule.from];
    const quote = supportingWhy(answer?.whys, rule.whyFragments);
    const already = bySource.get(rule.from);
    if (already && (already.quote || !quote)) continue;
    bySource.set(rule.from, {
      from: rule.from,
      // A slot may carry the phrase the family actually gave, which the day
      // band does: the rules read the coarse bucket the hours fall in, but
      // "you said your day starts at dawn" is the app's wording and "you said
      // your day runs 6 am to 8 pm" is theirs. When a slot supplies its own
      // phrase, the explanation quotes that instead of the bucket.
      said: lower(answer?.said || labelFor(rule.from, answer?.value)),
      quote,
      label: questionFor(rule.from)?.label || rule.from,
    });
  }
  const parts = [...bySource.values()];

  const quote = parts.find((p) => p.quote)?.quote || null;
  // Their reason goes in quotation marks rather than folded into the sentence.
  // The reasons are not all shaped like clauses -- "First-class on a train
  // longer than two hours; coach is fine under" is a note, not a sentence --
  // and running one of those on after "and that" produces something nobody
  // wrote and nobody can parse. In quotation marks every reason reads correctly
  // whatever its shape, and it is clearer besides: these are the primary's own
  // words being handed back, so they should look like a quotation.
  const ticked = quote ? `"${stripPeriod(quote)}."` : null;
  let because;
  if (parts.length === 1) {
    because = ticked
      ? `You said ${parts[0].said}, and ticked ${ticked}`
      : `You said ${parts[0].said}.`;
  } else {
    // Several answers agreeing is the most convincing thing this screen can
    // say, so it leads with the agreement rather than burying it in a list.
    // The option labels carry commas of their own, which is why they are joined
    // with "and" after a colon rather than run together in a sentence.
    const said = parts.map((p) => p.said);
    const last = said.pop();
    const count = COUNT_WORD[parts.length] || String(parts.length);
    because = `${count} of your answers point the same way: ${said.join(", ")}, and ${last}.`;
    if (ticked) because += ` You also ticked ${ticked}`;
  }

  return {
    slot,
    value,
    strength,
    because,
    quote,
    from: parts.map((p) => p.from),
    ruleIds: contenders.map((r) => r.id),
    // How many distinct earlier answers point this way. The screen does not
    // use it yet; the recap will, and it is the honest count rather than the
    // rule count.
    sources: parts.length,
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
    if (
      !question ||
      (question.kind !== "options" &&
        question.kind !== "rank" &&
        question.kind !== "multi" &&
        question.kind !== "band" &&
        question.kind !== "pets")
    )
      continue;
    const note = String(row.note || "").trim();
    // The day band's note is the hours in words -- "7:30 am to 9 pm". The
    // rules were written against the five shapes a day can take, so the hours
    // are read back into the coarse bucket they fall in and the rules go on
    // reading the same values they always did. The bucket is worked out here
    // and never stored: a family whose hours change should not have to correct
    // a summary of them filed somewhere else.
    if (question.kind === "band") {
      const band = parseBandNote(note);
      out[row.slot] = {
        value: band ? bandBucket(band) : null,
        whys: [],
        said: band ? `Your day runs ${bandSentence(band)}` : null,
      };
      continue;
    }
    // The animals note is already a sentence about the animals, and no rule has
    // ever been written against it: what the dog does tells us nothing about
    // how fast the family walks. So the slot carries no value into the rules and
    // only the sentence, which is what Aly reads when she writes about a day
    // the animals are part of.
    if (question.kind === "pets") {
      out[row.slot] = { value: null, whys: [], said: note || null };
      continue;
    }
    // A ranked slot's note is the order in labels -- "The room, then the
    // meals" -- and first place is the claim the rules read, the same claim
    // the single-pick version of that question used to make. The places below
    // first are deliberately not read here: no rule has ever been written
    // against "second favorite", and inventing one from an order would be
    // reading more into the answer than it says.
    //
    // A multi slot's note is the ticked labels joined with a semicolon. One
    // tick reads as a plain answer and the rules may act on it; TWO OR MORE
    // deliberately read as no value at all. "They eat at the place with the
    // line and at the quiet table" is precisely the case where their tolerance
    // for a queue is unknown, and letting whichever card they tapped first
    // stand in for the pair would make the rules fire on a coin toss. The slot
    // still counts as answered, so nothing is inferred FOR it either.
    const labelForRules = (() => {
      if (question.kind === "rank") return note.split(", then ")[0].trim();
      if (question.kind === "multi") {
        const ticks = note
          .split(";")
          .map((part) => part.trim())
          .filter(Boolean);
        return ticks.length === 1 ? ticks[0] : "";
      }
      return note;
    })();
    const opt = (question.options || []).find((o) => o.label === labelForRules);
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
