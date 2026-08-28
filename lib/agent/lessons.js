// What Aly has learned, kept where the next conversation can read it.
//
// A model does not remember anything. What looks like memory in a good assistant
// is a store somebody wrote on purpose, plus the discipline to read it back at
// the right moment. So there is no training here and no fine-tuning: a lesson is
// a row, written when something turns out to be worth keeping, and read into the
// prompt on every request that could plausibly want it.
//
// Two ways in and two ways out, deliberately:
//
//   in    record_lesson, proposed on a confirmation card like every other change,
//         because a store that writes itself unsupervised becomes a store of
//         confident mistakes. Mark presses the card, so nothing enters this
//         table that a person has not read.
//   out   the slice below, which goes into the context of every request, and
//         recall_lessons for the rest of the store when a slice is not enough.
//
// The slice is the important half. A tool the model has to remember to call is a
// tool it will forget to call; the lessons most likely to matter are simply
// there, and the tool is for the long tail.
//
// Pure functions over rows. No database, no clock, no network.

const STOP = new Set([
  "about",
  "after",
  "again",
  "already",
  "also",
  "always",
  "another",
  "anything",
  "because",
  "been",
  "before",
  "being",
  "book",
  "booked",
  "booking",
  "both",
  "could",
  "does",
  "doing",
  "done",
  "down",
  "each",
  "else",
  "ever",
  "every",
  "from",
  "give",
  "going",
  "have",
  "here",
  "into",
  "just",
  "know",
  "like",
  "made",
  "make",
  "many",
  "more",
  "most",
  "much",
  "need",
  "next",
  "only",
  "open",
  "other",
  "over",
  "really",
  "same",
  "should",
  "since",
  "some",
  "something",
  "still",
  "such",
  "sure",
  "take",
  "than",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "they",
  "thing",
  "things",
  "think",
  "this",
  "those",
  "time",
  "trip",
  "very",
  "want",
  "well",
  "were",
  "what",
  "when",
  "where",
  "which",
  "while",
  "will",
  "with",
  "would",
  "your",
]);

/** The kinds a lesson can be filed under. Matches the check on the column. */
export const LESSON_KINDS = [
  "operator",
  "place",
  "family",
  "logistics",
  "money",
  "health",
  "packing",
  "other",
];

const text = (value) => (typeof value === "string" ? value : "");

/** The words in a phrase worth matching on: long, lowercase, and not filler. */
export function keywords(value) {
  const out = new Set();
  for (const word of text(value)
    .toLowerCase()
    .split(/[^a-z0-9]+/)) {
    if (word.length < 4) continue;
    if (STOP.has(word)) continue;
    out.add(word);
  }
  return [...out];
}

const lessonText = (row) =>
  `${text(row?.subject)} ${text(row?.body)} ${text(row?.kind)}`.toLowerCase();

/**
 * How much this lesson is worth showing on this request.
 *
 * A lesson about the trip that is open beats one about another trip, a lesson
 * about the family everywhere is always worth something, and words shared with
 * what was just asked count for more than either. Being useful before counts a
 * little: a lesson nobody has ever needed sinks slowly under the ones that keep
 * coming up.
 */
export function scoreLesson(row, { tripId = null, words = [] } = {}) {
  if (!row || row.status === "retired") return -1;
  let score = 0;
  if (row.trip_id && tripId && row.trip_id === tripId) score += 6;
  else if (!row.trip_id) score += 3;
  else score += 0;
  const haystack = lessonText(row);
  const hits = words.filter((word) => haystack.includes(word)).length;
  score += Math.min(hits, 4) * 3;
  score += Math.min(Number(row.times_recalled) || 0, 3);
  return score;
}

/**
 * The lessons to put in front of her this time, best first.
 *
 * Everything about the open trip, everything true of the family everywhere, and
 * whatever else the question itself reaches for. Capped, because this rides along
 * on every single message.
 */
export function rankLessons({
  lessons = [],
  tripId = null,
  message = "",
  limit = 14,
} = {}) {
  const words = keywords(message);
  return (lessons || [])
    .filter((row) => row && row.status !== "retired" && text(row.body).trim())
    .map((row) => ({ row, score: scoreLesson(row, { tripId, words }) }))
    .filter((entry) => entry.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        String(b.row.created_at || "").localeCompare(
          String(a.row.created_at || ""),
        ),
    )
    .slice(0, Math.max(0, limit))
    .map((entry) => entry.row);
}

const clip = (value, max) => {
  const raw = text(value).trim();
  return raw.length > max ? `${raw.slice(0, max - 1).trimEnd()}…` : raw;
};

/**
 * The lessons slice of the context.
 *
 * Ids are registered so she can retire one by id without being told it exists in
 * a second place.
 */
export function lessonLines(
  lessons = [],
  tripNameById = new Map(),
  known = null,
) {
  const lines = [
    "",
    "WHAT YOU HAVE LEARNED ABOUT THIS FAMILY AND THESE TRIPS (your own notes from earlier conversations, saved because they were worth keeping — lean on them, and say when one is why you are suggesting something):",
  ];
  if (!lessons.length) {
    lines.push(
      "(nothing recorded yet — when something you work out here would save time or a mistake on a later trip, record it with record_lesson)",
    );
    return lines;
  }
  for (const row of lessons) {
    if (row?.id && known?.lessons)
      known.lessons.set(row.id, clip(row.subject, 60));
    const whose = row.trip_id
      ? tripNameById.get(row.trip_id) || "one trip"
      : "every trip";
    lines.push(
      `- ${clip(row.subject, 70)} [${whose}]: ${clip(row.body, 260)}${
        row.learned_from === "family" ? " (they told you this)" : ""
      }${row.id ? ` [id: ${row.id}]` : ""}`,
    );
  }
  return lines;
}

/**
 * The lessons that answer one recall_lessons call, best first.
 *
 * The whole store this time rather than the slice, and matched on the words of
 * what she asked for rather than on which trip is open — that is the point of
 * asking.
 */
export function matchLessons(lessons = [], ask = {}, limit = 8) {
  const words = keywords(`${text(ask.about)} ${text(ask.subject)}`);
  const scored = (lessons || [])
    .filter((row) => row && row.status !== "retired")
    .map((row) => {
      const haystack = lessonText(row);
      const hits = words.filter((word) => haystack.includes(word)).length;
      return { row, hits };
    })
    .filter((entry) => entry.hits > 0 || !words.length);
  scored.sort(
    (a, b) =>
      b.hits - a.hits ||
      String(b.row.created_at || "").localeCompare(
        String(a.row.created_at || ""),
      ),
  );
  return scored.slice(0, Math.max(0, limit)).map((entry) => entry.row);
}

/** What goes back to her after a recall, appended to the same system prompt. */
export function recallSection(rows = [], ask = {}) {
  const asked = clip(ask?.about, 120) || "your own notes";
  if (!rows.length) {
    return `YOU ASKED YOUR OWN NOTES ABOUT: ${asked}\nThere is nothing recorded about that. Say so plainly rather than inventing a recollection, answer from the trip data below, and do not call recall_lessons again.`;
  }
  const lines = rows.map(
    (row) =>
      `- ${clip(row.subject, 70)}: ${clip(row.body, 300)}${
        row.learned_from === "family" ? " (they told you this)" : ""
      }`,
  );
  return `YOU ASKED YOUR OWN NOTES ABOUT: ${asked}\nThis is what is recorded. Use it, say plainly that it is something you noted earlier rather than something they just said, and do not call recall_lessons again.\n${lines.join("\n")}`;
}

/**
 * Take a recall_lessons call out of a reply.
 *
 * Like the places and tips calls, this one is not a change to anything, so it
 * must never reach the code that turns calls into confirmation cards.
 */
export function splitRecallCalls(calls = []) {
  const kept = [];
  let asked = null;
  for (const call of calls || []) {
    if (call?.name === "recall_lessons") {
      if (!asked)
        asked = {
          about: clip(call?.args?.about, 300),
          subject: clip(call?.args?.subject, 80),
        };
      continue;
    }
    kept.push(call);
  }
  return { calls: kept, asked };
}

export const LESSON_RULE = `WHAT YOU LEARN, AND KEEPING IT:
- You have a place to keep what you work out. It is not a memory you have; it is a set of notes the app saves for you, listed in the context above and searchable with recall_lessons. Everything you know about this family beyond the current conversation comes from there or from the trip data.
- Record a lesson when something you have just established would save time, money or a mistake on a later trip: how an operator's booking window actually works, that a level they hold moves a date, that a place turned out to be the wrong shape for them, a habit that keeps repeating. One or two sentences, concrete, with the reason it matters. Give it a short subject and file it against the trip it belongs to, or leave the trip off when it is true of them everywhere.
- Do not record what the app already holds. A preference belongs in the preferences, a date belongs on the itinerary, a job belongs in a task, a balance belongs in the Wallet. A lesson is for the knowledge behind those — the thing that would otherwise have to be worked out again.
- Do not record a guess, and never record something you read once on the web as if it were settled. If you are unsure, say it in your reply instead.
- Use recall_lessons when the answer probably depends on something you noted earlier and the notes above do not cover it — "what did we decide about", "last time", "have we been through this before", or any question about an operator's rules on a trip that is not open. It costs a moment, so do not reach for it when the notes above already answer.
- A note that turns out to be wrong or out of date should be retired with retire_lesson rather than left to mislead you later.`;
