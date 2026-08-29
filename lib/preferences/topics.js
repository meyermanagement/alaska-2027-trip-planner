// Topics as a list, and the ordering that makes a list of them readable.
//
// A preference is often about more than one thing. "Prefer a hotel with a spa" is
// about where we stay and about what we do, and the only way to say that in a
// single text field was to type "Accommodations and Activities" — which produced a
// heading holding one entry directly beside a heading holding five that meant the
// same thing. So a preference carries several topics, and the screen lets somebody
// pick them rather than compose them.
//
// The topics themselves stay open. A fixed dropdown would be the app deciding in
// advance what a family is allowed to care about, and the first person with a
// preference about their dog's kennel would have nowhere to put it. What is fixed
// is the running order, and the list of terms used to recognize what somebody
// meant — recognition being a much weaker claim than validation.
//
// Three jobs, kept apart on purpose:
//
//  1. Grouping merges only what is indisputably the same word — case, spacing,
//     punctuation, a trailing s. The heading shows the spelling used most often,
//     because the app should not quietly retype what somebody wrote.
//
//  2. Ordering recognizes a topic loosely, including through a typo, and uses that
//     only to decide what comes first. A wrong guess costs a reader nothing worse
//     than a group in an odd place, and it usefully lands two spellings of one idea
//     next to each other.
//
//  3. Merging and renaming are never automatic. Where the loose match thinks two
//     groups are one thing, this offers the sentence and somebody presses the
//     button. The one thing worse than a misspelled heading is an app that edits
//     your writing without asking.

/** Blank topics sort last, after everything named. */
const NO_TOPIC_ORDER = 9000;
/** A named topic the list does not recognize sorts after the ones it does. */
const UNKNOWN_ORDER = 8000;

/** How a preference with no topic at all is headed. */
export const NO_TOPIC_LABEL = "Anything else";

/**
 * The topics a trip actually has, in the order somebody plans one.
 *
 * Not a list of allowed values — nothing here restricts what can be typed or
 * saved. It is the running order, plus the terms used to recognize a topic.
 */
export const TOPIC_FAMILIES = [
  {
    key: "stay",
    label: "Where we stay",
    terms: [
      "accommodation",
      "accommodations",
      "lodging",
      "hotel",
      "hotels",
      "resort",
      "resorts",
      "room",
      "rooms",
      "suite",
      "suites",
      "stay",
      "staying",
      "airbnb",
      "rental",
      "rentals",
    ],
  },
  {
    key: "around",
    label: "Getting around",
    terms: [
      "transportation",
      "transport",
      "transit",
      "flight",
      "flights",
      "flying",
      "airline",
      "airlines",
      "airport",
      "airports",
      "driving",
      "car",
      "cars",
      "train",
      "trains",
      "ferry",
      "ferries",
      "parking",
      "cruise",
      "cruises",
    ],
  },
  {
    key: "food",
    label: "Food",
    terms: [
      "food",
      "restaurant",
      "restaurants",
      "dining",
      "dinner",
      "breakfast",
      "lunch",
      "eating",
      "meal",
      "meals",
      "drinks",
      "coffee",
      "snacks",
    ],
  },
  {
    key: "doing",
    label: "Things we do",
    terms: [
      "excursion",
      "excursions",
      "activity",
      "activities",
      "tour",
      "tours",
      "attraction",
      "attractions",
      "sightseeing",
      "shows",
      "museums",
      "wildlife",
      "shopping",
      "spa",
    ],
  },
  {
    key: "pace",
    label: "Pace",
    terms: [
      "pace",
      "schedule",
      "scheduling",
      "timing",
      "downtime",
      "rest",
      "mornings",
      "evenings",
      "rhythm",
    ],
  },
  {
    key: "money",
    label: "Money",
    terms: [
      "money",
      "budget",
      "budgets",
      "cost",
      "costs",
      "price",
      "prices",
      "spending",
      "tipping",
    ],
  },
  {
    key: "people",
    label: "Who we are",
    terms: [
      "accessibility",
      "mobility",
      "health",
      "allergies",
      "allergy",
      "diet",
      "dietary",
      "pets",
      "kids",
      "children",
    ],
  },
  {
    key: "packing",
    label: "Packing",
    terms: ["packing", "luggage", "bags", "baggage", "clothes", "laundry"],
  },
  {
    key: "weather",
    label: "Weather",
    terms: ["weather", "climate", "season", "seasons", "heat", "cold", "rain"],
  },
  {
    key: "breakers",
    label: "Deal breakers",
    terms: [
      "dealbreaker",
      "dealbreakers",
      "breaker",
      "breakers",
      "never",
      "avoid",
      "limits",
    ],
  },
];

/**
 * The comparable form of a topic: lowercase, single-spaced, no punctuation, no
 * trailing s on a word.
 *
 * The s comes off per word rather than off the whole string, so "hotels and rooms"
 * and "hotel and room" agree. Words of three letters or fewer are left alone,
 * because dropping the s off "us" leaves nothing worth matching.
 */
export function normalizeTopic(text) {
  const flat = String(text ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!flat) return "";
  return flat
    .split(" ")
    .map((word) =>
      word.length > 3 && word.endsWith("s") ? word.slice(0, -1) : word,
    )
    .join(" ");
}

/**
 * Every term, pointing at the family it belongs to, built once.
 *
 * A family's own label is indexed alongside its terms, or the app would fail to
 * recognize the very words it puts on its own pills: "Getting around" is not the
 * word "transportation", and somebody who picks the offered pill should not end up
 * with a topic the ordering treats as unknown.
 */
const TERM_INDEX = new Map();
TOPIC_FAMILIES.forEach((family, order) => {
  for (const term of [...family.terms, normalizeTopic(family.label)]) {
    if (term && !TERM_INDEX.has(term)) TERM_INDEX.set(term, order);
  }
});

/** How long a topic may be, matching what the database and Aly's tool accept. */
export const TOPIC_MAX = 60;
/** How many topics one preference may carry before the pills stop being a help. */
export const TOPICS_MAX = 6;

/** One typed topic, tidied for saving: trimmed, single-spaced, length-capped. */
export function cleanTopic(text) {
  return String(text ?? "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, TOPIC_MAX);
}

/**
 * The topics on a preference, in order, de-duplicated.
 *
 * Falls back to the old single `topic` column when the list is empty, so a row
 * written by something that has not caught up still reads correctly instead of
 * appearing to have no topic at all.
 */
export function topicsOf(pref) {
  const raw = Array.isArray(pref?.topics) ? pref.topics : null;
  const source = raw && raw.length ? raw : pref?.topic ? [pref.topic] : [];
  return dedupe(source);
}

/** Trim, drop blanks, drop repeats by comparable form, keep the first spelling. */
export function dedupe(list = []) {
  const seen = new Set();
  const out = [];
  for (const item of list || []) {
    const label = cleanTopic(item);
    if (!label) continue;
    const key = normalizeTopic(label);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(label);
  }
  return out;
}

/**
 * What to write when saving. Both columns, because several readers still print the
 * old single `topic` — the packing generator, the tips brief, the wallet, Aly's
 * own context — and the first topic is the closest true answer for them.
 */
export function topicPatch(list = []) {
  const topics = dedupe(list).slice(0, TOPICS_MAX);
  return { topics, topic: topics[0] || null };
}

/** The list with one topic added, or unchanged if it is already there. */
export function withTopic(list = [], topic) {
  const label = cleanTopic(topic);
  if (!label) return dedupe(list);
  const next = dedupe([...(list || []), label]);
  return next.slice(0, TOPICS_MAX);
}

/** The list with one topic removed, matched loosely so a retype still matches. */
export function withoutTopic(list = [], topic) {
  const key = normalizeTopic(topic);
  if (!key) return dedupe(list);
  return dedupe(list).filter((item) => normalizeTopic(item) !== key);
}

/** Whether a topic is on a list, compared loosely. */
export function hasTopic(list = [], topic) {
  const key = normalizeTopic(topic);
  if (!key) return false;
  return dedupe(list).some((item) => normalizeTopic(item) === key);
}

/** Levenshtein distance, capped: anything past the cap is not interesting. */
function distance(a, b, cap = 2) {
  if (a === b) return 0;
  if (Math.abs(a.length - b.length) > cap) return cap + 1;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const row = [i];
    let best = i;
    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      row[j] = Math.min(row[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost);
      if (row[j] < best) best = row[j];
    }
    if (best > cap) return cap + 1;
    prev = row;
  }
  return prev[b.length];
}

/**
 * How close a typo may be: one letter in a medium word, two in a long one.
 *
 * Short terms are excluded from the spelling pass entirely, which is what stops
 * "monkey" being filed under money. One edit is simply too small a difference to
 * mean anything among five-letter words, and a wrong guess here silently sorts a
 * topic under a subject it has nothing to do with.
 */
const FUZZY_MIN = 6;

function within(word, term) {
  if (term.length < FUZZY_MIN) return false;
  const cap = term.length >= 9 ? 2 : 1;
  return distance(word, term, cap) <= cap;
}

/**
 * The family a typed topic probably belongs to, or null.
 *
 * Whole string first, so "getting around" is not read as "around" something else.
 * Then word by word in the order typed. Then a spelling-mistake pass, last,
 * because an exact match on a later word beats a near-match on an earlier one.
 */
export function topicFamily(text) {
  const key = normalizeTopic(text);
  if (!key) return null;
  const exact = TERM_INDEX.get(key);
  if (exact !== undefined) return { ...TOPIC_FAMILIES[exact], order: exact };

  const words = key.split(" ");
  for (const word of words) {
    const hit = TERM_INDEX.get(word);
    if (hit !== undefined) return { ...TOPIC_FAMILIES[hit], order: hit };
  }
  for (const word of words) {
    if (word.length < FUZZY_MIN - 1) continue;
    for (const [term, order] of TERM_INDEX) {
      if (within(word, term))
        return { ...TOPIC_FAMILIES[order], order, fuzzy: true };
    }
  }
  return null;
}

/** Where a topic sits in the running order. */
export function topicOrder(text) {
  if (!normalizeTopic(text)) return NO_TOPIC_ORDER;
  const family = topicFamily(text);
  return family ? family.order : UNKNOWN_ORDER;
}

/**
 * The preferences gathered under their topics, in a stable order.
 *
 * A preference with three topics appears under all three. That is the honest
 * reading of "this is about all of these", and it is why every item carries `also`
 * — the other headings it is filed under — so somebody who meets the same
 * sentence twice knows why rather than suspecting a duplicate.
 *
 * Stable is the point. The old list grouped in order of first appearance, so
 * adding one preference could move three headings, and the resulting order meant
 * nothing. This order is the same every time it is drawn: planning order for what
 * the app recognizes, then unrecognized topics alphabetically rather than by
 * arrival, then whatever has no topic at all.
 */
export function groupPreferences(preferences = []) {
  const groups = new Map();
  const add = (key, pref, raw, others) => {
    let group = groups.get(key);
    if (!group) {
      group = { key, items: [], spellings: new Map() };
      groups.set(key, group);
    }
    group.items.push({ pref, also: others });
    if (raw) group.spellings.set(raw, (group.spellings.get(raw) || 0) + 1);
  };

  for (const pref of preferences || []) {
    if (!pref) continue;
    const topics = topicsOf(pref);
    if (!topics.length) {
      add("", pref, "", []);
      continue;
    }
    topics.forEach((topic, index) => {
      add(
        normalizeTopic(topic),
        pref,
        topic,
        topics.filter((_, other) => other !== index),
      );
    });
  }

  const out = [];
  for (const group of groups.values()) {
    // The spelling used most often becomes the heading. A tie keeps the one typed
    // first, the only tiebreak that does not look random.
    let label = "";
    let best = 0;
    for (const [spelling, count] of group.spellings) {
      if (count > best) {
        best = count;
        label = spelling;
      }
    }
    out.push({
      key: group.key,
      label: label || NO_TOPIC_LABEL,
      items: group.items,
      family: group.key ? topicFamily(label) : null,
      order: topicOrder(label),
      spellings: [...group.spellings.keys()],
    });
  }

  out.sort((a, b) => {
    if (a.order !== b.order) return a.order - b.order;
    // Inside one family the fuller group leads: it is what somebody is more
    // likely looking for, and it reads as the main heading a stray one-entry
    // duplicate belongs under.
    if (b.items.length !== a.items.length)
      return b.items.length - a.items.length;
    return a.label.localeCompare(b.label);
  });
  return out;
}

/**
 * The topics in use, with counts, in the same order as the groups. Drives the
 * filter row and the pills the forms offer — a family's own words being a better
 * suggestion than a generic list.
 */
export function topicsInUse(preferences = []) {
  return groupPreferences(preferences)
    .filter((group) => group.key)
    .map((group) => ({
      key: group.key,
      label: group.label,
      count: group.items.length,
    }));
}

/**
 * The pills a form should offer: what this family already uses, then the standard
 * topics they have not used yet, then anything already on this preference that is
 * in neither list — so a topic Aly invented or somebody typed once is still a
 * pill rather than something that has to be retyped from memory.
 */
export function topicChoices(preferences = [], selected = []) {
  const rows = [];
  const seen = new Set();
  const push = (label, count, kind) => {
    const key = normalizeTopic(label);
    if (!key || seen.has(key)) return;
    seen.add(key);
    rows.push({ key, label, count, kind });
  };
  for (const row of topicsInUse(preferences))
    push(row.label, row.count, "used");
  for (const label of dedupe(selected)) push(label, 0, "own");
  for (const family of TOPIC_FAMILIES) push(family.label, 0, "idea");
  return rows;
}

/** Whether every word of `inner` appears in `outer`, and outer says more. */
function wordsContain(outer, inner) {
  if (!outer || !inner || outer === inner) return false;
  const words = new Set(outer.split(" "));
  const parts = inner.split(" ");
  if (parts.length >= words.size) return false;
  return parts.every((word) => words.has(word));
}

/**
 * Pairs of groups that look like one topic typed two ways.
 *
 * Suggestions only, worded as a question rather than an action taken. Two groups
 * qualify when the app recognizes them as the same subject, or when one topic's
 * words are contained in the other's. The smaller group is always the one proposed
 * for moving, because merging five entries into one is the same change described
 * the wrong way round.
 */
export function mergeSuggestions(preferences = []) {
  const groups = groupPreferences(preferences).filter((g) => g.key);
  const out = [];
  for (let i = 0; i < groups.length; i += 1) {
    for (let j = i + 1; j < groups.length; j += 1) {
      const a = groups[i];
      const b = groups[j];
      const sameFamily = Boolean(
        a.family && b.family && a.family.key === b.family.key,
      );
      const contained =
        wordsContain(a.key, b.key) || wordsContain(b.key, a.key);
      if (!sameFamily && !contained) continue;
      // Smaller into larger; a tie keeps the running order, so the answer does
      // not depend on which of two equal groups was read first.
      const [from, into] =
        a.items.length === b.items.length
          ? [b, a]
          : a.items.length < b.items.length
            ? [a, b]
            : [b, a];
      out.push({
        from: from.label,
        into: into.label,
        fromKey: from.key,
        intoKey: into.key,
        fromCount: from.items.length,
        intoCount: into.items.length,
        ids: from.items.map((row) => row.pref?.id).filter(Boolean),
        because: contained
          ? `\u201C${from.label}\u201D says everything \u201C${into.label}\u201D says.`
          : `Both are about ${into.family?.label?.toLowerCase() || "the same thing"}.`,
      });
    }
  }
  // One suggestion per group at most: a page offering to move the same entries to
  // two different places is asking a question it has not thought through.
  const claimed = new Set();
  return out.filter((row) => {
    if (claimed.has(row.fromKey)) return false;
    claimed.add(row.fromKey);
    return true;
  });
}

/**
 * Topics that look misspelled, with the standard wording they resemble.
 *
 * Merging cannot help a lone misspelling: "Restaurans" twice, with no correctly
 * spelled group beside it, is nothing to merge into, so the pairing pass finds it
 * and says nothing — which is exactly the case that produced the complaint. What
 * the app does know is that it only recognized the topic by guessing at the
 * spelling, and that is worth saying out loud.
 *
 * Still a suggestion. It offers the standard label rather than a corrected
 * spelling of the family's own word, because guessing which letter was dropped is
 * a second guess on top of the first.
 */
export function spellingHints(preferences = []) {
  const groups = groupPreferences(preferences).filter((g) => g.key);
  const out = [];
  for (const group of groups) {
    if (!group.family?.fuzzy) continue;
    const suggested = group.family.label;
    if (normalizeTopic(suggested) === group.key) continue;
    // If a correctly spelled group already exists in the same family, the merge
    // suggestion covers it and two offers about one heading is one too many.
    if (
      groups.some(
        (other) =>
          other !== group &&
          other.family?.key === group.family.key &&
          !other.family?.fuzzy,
      )
    )
      continue;
    out.push({
      key: group.key,
      from: group.label,
      into: suggested,
      count: group.items.length,
      said: `\u201C${group.label}\u201D looks misspelled. Rename it to \u201C${suggested}\u201D?`,
    });
  }
  return out;
}

/**
 * What renaming a topic will actually do, in one sentence, so the button is never
 * pressed on a guess.
 */
export function renameEffect({ from, next, count = 0, existing = [] }) {
  const wanted = cleanTopic(next);
  const things = `${count} ${count === 1 ? "preference" : "preferences"}`;
  if (!wanted) {
    return {
      ok: true,
      merges: false,
      removes: true,
      said: `\u201C${cleanTopic(from) || NO_TOPIC_LABEL}\u201D will come off ${things}.`,
    };
  }
  const key = normalizeTopic(wanted);
  const fromKey = normalizeTopic(from);
  if (key === fromKey) {
    // Not nothing: fixing the case or the spacing is a real edit, and saying "no
    // change" over one is how somebody stops trusting the sentence.
    const same = wanted === cleanTopic(from);
    return {
      ok: !same,
      merges: false,
      said: same
        ? "That is what it says already."
        : `${things} will be relabelled \u201C${wanted}\u201D.`,
    };
  }
  const hit = (existing || []).find((row) => row.key === key);
  if (hit) {
    return {
      ok: true,
      merges: true,
      into: hit.label,
      said: `${things} will join \u201C${hit.label}\u201D. Some may already be there, so the heading will hold at most ${count + hit.count}.`,
    };
  }
  return {
    ok: true,
    merges: false,
    said: `${things} will move to a new topic, \u201C${wanted}\u201D.`,
  };
}

/**
 * Every preference's new topic list after renaming one topic — computed here, so
 * the screen, the API route and Aly all rename the same way.
 *
 * Renaming into a topic a preference already carries removes the duplicate rather
 * than saving the same word twice, which is what makes rename and merge the same
 * operation instead of two.
 *
 * @returns {Array<{id:string, topics:string[], topic:string|null, before:string[]}>}
 *   one row per preference that actually changes.
 */
export function renamePlan(preferences = [], from, next) {
  const fromKey = normalizeTopic(from);
  if (!fromKey) return [];
  const wanted = cleanTopic(next);
  const out = [];
  for (const pref of preferences || []) {
    if (!pref?.id) continue;
    const before = topicsOf(pref);
    if (!before.some((item) => normalizeTopic(item) === fromKey)) continue;
    const swapped = wanted
      ? before.map((item) => (normalizeTopic(item) === fromKey ? wanted : item))
      : before.filter((item) => normalizeTopic(item) !== fromKey);
    const patch = topicPatch(swapped);
    if (
      patch.topics.length === before.length &&
      patch.topics.every((item, index) => item === before[index])
    )
      continue;
    out.push({ id: pref.id, ...patch, before });
  }
  return out;
}
