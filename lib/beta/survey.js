/**
 * The beta survey: the questions, and the only place they are defined.
 *
 * The page draws these, the API route validates against these, and the desk
 * reads answers back through these. A survey whose questions live in the markup
 * cannot be read back later without the reader guessing what "3" meant, and a
 * survey whose ids drift between the form and the report quietly loses answers
 * that were given.
 *
 * Answers are stored as one jsonb object keyed by question id, rather than a row
 * per answer. A tester edits their own sheet over weeks and comes back to it;
 * the whole sheet is what gets read, written and shown, and there is never a
 * query that wants one question across everybody without wanting the rest of
 * that person's answers for context.
 *
 * Ids are permanent. Changing the wording of a prompt is free -- the stored
 * answer is still an answer to that question. Changing an id abandons every
 * answer already given to it, so a question that changes meaning gets a new id
 * and the old one is left in the file as retired rather than repurposed.
 *
 * Four kinds of question:
 *
 *   scale   1 to 5, with the ends said in words rather than left to the number.
 *           `unused: true` adds a way to say the part was never opened, which is
 *           not the same as rating it one and matters more than the rating: a
 *           feature nobody tried is a different problem from a feature everybody
 *           dislikes.
 *   choice  One of a fixed list. The stored value is the option's own words, so
 *           a report is readable without this file beside it.
 *   money   A price, kept as text on purpose. "$10", "10-15", "nothing", "less
 *           than I pay for streaming" are all real answers to a pricing
 *           question, and a number input would refuse three of them and lose
 *           the fourth. `dollarsFrom` pulls a figure out for arithmetic where
 *           one can be found, and the words are kept either way.
 *   text    Free writing.
 *
 * Two of the choice questions carry a `short` word for each option as well. A
 * report that groups scores by what kind of traveler somebody is cannot print
 * "I plan our own trips, but I would not call myself good at it" as a column
 * heading, and the desk should not be inventing its own abbreviations for
 * answers this file defines.
 */

/**
 * Who is answering, asked as two questions rather than one.
 *
 * How often somebody travels and how much of a planner they are come apart in
 * both directions: the once-a-year family that plans obsessively, and the
 * frequent flyer who books a hotel from the taxi. Averaging the two together
 * produces advice for nobody, which is what these two taps are for.
 *
 * Written as pairs so an option and its short word cannot drift apart. A short
 * label keyed by a string that no longer matches an option would silently stop
 * labelling anything.
 */
const TRAVEL_OFTEN = [
  ["Less than once a year", "rarely"],
  ["About once a year", "once a year"],
  ["Two or three times a year", "2-3 a year"],
  ["Four to eight times a year", "4-8 a year"],
  ["Almost constantly", "constantly"],
];

const PLANNER_KIND = [
  ["New to it — I mostly follow somebody else's plan", "novice"],
  [
    "I plan our own trips, but I would not call myself good at it",
    "self-taught",
  ],
  ["I plan in detail and enjoy the planning", "detailed"],
  ["I travel for work, or I plan travel for other people", "professional"],
];

function fromPairs(pairs) {
  return {
    options: pairs.map(([option]) => option),
    short: Object.fromEntries(pairs),
  };
}

/** The two questions the desk groups everything else by. */
export const FREQUENCY_ID = "travel_often";
export const PLANNER_ID = "planner_kind";

export const SURVEY_SECTIONS = [
  {
    key: "traveler",
    title: "What kind of traveler you are",
    blurb:
      "Two taps before the real questions, so we can read your answers in the right light rather than averaging you with somebody who travels nothing like you do.",
    questions: [
      {
        id: FREQUENCY_ID,
        kind: "choice",
        prompt: "How often do you travel?",
        ...fromPairs(TRAVEL_OFTEN),
      },
      {
        id: PLANNER_ID,
        kind: "choice",
        prompt: "How would you describe yourself as a planner?",
        ...fromPairs(PLANNER_KIND),
      },
    ],
  },
  {
    key: "overall",
    title: "How it is going",
    blurb:
      "The short version first, so if you stop after this section we still have the answer that matters most.",
    questions: [
      {
        id: "overall_working",
        kind: "scale",
        prompt: "Overall, how well is Alyeska working for you?",
        low: "Not working",
        high: "Works well",
      },
      {
        id: "first_run",
        kind: "scale",
        prompt:
          "How did getting started go — signing in, the first questions, your first trip?",
        low: "Confusing",
        high: "Effortless",
      },
      {
        id: "phone",
        kind: "scale",
        prompt: "How well does it work on your phone?",
        low: "Fighting it",
        high: "No trouble",
      },
      {
        id: "best_text",
        kind: "text",
        prompt:
          "What is working best? The one thing you would not want taken away.",
      },
      {
        id: "worst_text",
        kind: "text",
        prompt:
          "What is getting in your way? Anything confusing, slow, or that you expected to work and it did not.",
      },
    ],
  },
  {
    key: "aly",
    title: "Aly herself",
    blurb:
      "The assistant is the part of this that is either worth having or is decoration, so it gets its own section.",
    questions: [
      {
        id: "aly_useful",
        kind: "scale",
        prompt: "How useful are Aly's answers?",
        low: "Generic",
        high: "Genuinely useful",
      },
      {
        id: "aly_trust",
        kind: "scale",
        prompt: "How much do you trust what she tells you?",
        low: "I check everything",
        high: "I take her word",
      },
      {
        id: "aly_wrong_text",
        kind: "text",
        prompt:
          "When has she got something wrong, or missed something you expected her to already know?",
      },
      {
        id: "aly_ask_text",
        kind: "text",
        prompt: "What have you wanted to ask her that she could not answer?",
      },
    ],
  },
  {
    key: "parts",
    title: "The parts you have used",
    blurb:
      "Rate only what you have actually opened. Skipping one tells us as much as rating it.",
    questions: [
      {
        id: "part_trips",
        kind: "scale",
        unused: true,
        prompt: "Trips, and the day-by-day itinerary",
        low: "Needs work",
        high: "Works well",
      },
      {
        id: "part_packing",
        kind: "scale",
        unused: true,
        prompt: "Packing lists and templates",
        low: "Needs work",
        high: "Works well",
      },
      {
        id: "part_reminders",
        kind: "scale",
        unused: true,
        prompt: "Reminders, and what is due before you go",
        low: "Needs work",
        high: "Works well",
      },
      {
        id: "part_inbox",
        kind: "scale",
        unused: true,
        prompt: "Forwarding confirmations to your trip inbox",
        low: "Needs work",
        high: "Works well",
      },
      {
        id: "part_documents",
        kind: "scale",
        unused: true,
        prompt: "Travel documents and passport dates",
        low: "Needs work",
        high: "Works well",
      },
      {
        id: "part_wallet",
        kind: "scale",
        unused: true,
        prompt: "Wallet — points, miles and card perks",
        low: "Needs work",
        high: "Works well",
      },
      {
        id: "part_family",
        kind: "scale",
        unused: true,
        prompt: "Family, pets and travel preferences",
        low: "Needs work",
        high: "Works well",
      },
      {
        id: "part_budget",
        kind: "scale",
        unused: true,
        prompt: "Budget, and what a trip is costing",
        low: "Needs work",
        high: "Works well",
      },
    ],
  },
  {
    key: "missing",
    title: "What is missing",
    blurb:
      "What we have not built yet is more useful to us than what we have, so take your time here.",
    questions: [
      {
        id: "missing_text",
        kind: "text",
        prompt:
          "What is missing that would make this the first thing you open when a trip comes up?",
      },
      {
        id: "outside_text",
        kind: "text",
        prompt:
          "What are you still doing outside the app — a spreadsheet, notes, screenshots, a folder of email?",
      },
      {
        id: "replace_choice",
        kind: "choice",
        prompt: "How much of your own planning has it taken over so far?",
        options: [
          "None of it yet",
          "Some of it",
          "Most of it",
          "All of it",
          "I have not planned a trip with it yet",
        ],
      },
    ],
  },
  {
    key: "price",
    title: "What it is worth",
    blurb:
      "Say the honest number rather than the kind one. A price that flatters us is the most expensive thing you could tell us.",
    questions: [
      {
        id: "price_fair",
        kind: "money",
        prompt: "What is a fair price for your household, per month?",
        hint: "A figure, a range, or nothing at all — whichever is true.",
      },
      {
        id: "price_too_much",
        kind: "money",
        prompt: "At what monthly price would you stop considering it?",
        hint: "The point where you would close the tab rather than think about it.",
      },
      {
        id: "price_shape",
        kind: "choice",
        prompt: "How would you rather pay?",
        options: [
          "Monthly",
          "Once a year, cheaper per month",
          "Per trip",
          "Once, and then own it",
          "I would not pay for this",
        ],
      },
      {
        id: "price_today",
        kind: "choice",
        prompt:
          "If the beta ended today, at the price you just called fair, what would you do?",
        options: [
          "Subscribe today",
          "Subscribe once a few things are fixed",
          "Wait and see",
          "Not subscribe",
        ],
      },
      {
        id: "price_spend_text",
        kind: "text",
        prompt:
          "What do you spend today on anything that does part of this job — an agent, another app, a subscription, a service that came with a card?",
      },
      {
        id: "price_why_text",
        kind: "text",
        prompt: "What would have to be true for it to be worth paying for?",
      },
    ],
  },
  {
    key: "last",
    title: "Anything else",
    blurb: "",
    questions: [
      {
        id: "anything_text",
        kind: "text",
        prompt:
          "Anything at all. Half-formed thoughts and small annoyances both welcome.",
      },
      {
        id: "follow_up",
        kind: "choice",
        prompt: "May we come back to you about any of this?",
        options: [
          "Yes, happy to talk it through",
          "Yes, by email only",
          "Rather not",
        ],
      },
    ],
  },
];

/** The value stored when somebody says they never opened a part of the app. */
export const NOT_USED = "not-used";

export const SURVEY_QUESTIONS = SURVEY_SECTIONS.flatMap(
  (section) => section.questions,
);

export const SURVEY_TOTAL = SURVEY_QUESTIONS.length;

const BY_ID = new Map(SURVEY_QUESTIONS.map((q) => [q.id, q]));

export function questionById(id) {
  return BY_ID.get(id) || null;
}

// Long enough for somebody who really wants to explain a problem, short enough
// that one answer cannot be used to fill the table.
const MAX_TEXT = 4000;
const MAX_MONEY = 80;

/**
 * Keep what is a real answer to a real question and drop everything else.
 *
 * Run on the server on every write, because the browser is not the only thing
 * that can reach the route and an unvalidated jsonb column is a place to put
 * anything at all. An unknown id, a scale of 9, a choice nobody was offered:
 * dropped, silently. Nothing here is worth failing somebody's save over --
 * losing an hour of typing because one field was malformed is a far worse
 * outcome than quietly ignoring that field.
 *
 * An empty string is deletion, not an answer. That is how somebody takes back
 * something they typed, and it keeps `answered` honest.
 */
export function sanitizeAnswers(input) {
  const clean = {};
  if (!input || typeof input !== "object") return clean;

  for (const [id, raw] of Object.entries(input)) {
    const question = BY_ID.get(id);
    if (!question) continue;

    if (question.kind === "scale") {
      if (question.unused && raw === NOT_USED) {
        clean[id] = NOT_USED;
        continue;
      }
      const n = Math.round(Number(raw));
      if (Number.isFinite(n) && n >= 1 && n <= 5) clean[id] = n;
      continue;
    }

    if (question.kind === "choice") {
      const value = String(raw ?? "").trim();
      if (question.options.includes(value)) clean[id] = value;
      continue;
    }

    const value = String(raw ?? "")
      .slice(0, question.kind === "money" ? MAX_MONEY : MAX_TEXT)
      .trim();
    if (value) clean[id] = value;
  }

  return clean;
}

/** How many questions have an answer of any kind, "never used it" included. */
export function answeredCount(answers) {
  if (!answers) return 0;
  return SURVEY_QUESTIONS.reduce((total, question) => {
    const value = answers[question.id];
    if (value === 0) return total + 1;
    return total + (value ? 1 : 0);
  }, 0);
}

/** Answered and total for one section, for the progress line on its heading. */
export function sectionProgress(section, answers) {
  const answered = section.questions.reduce((total, question) => {
    const value = answers?.[question.id];
    return total + (value || value === 0 ? 1 : 0);
  }, 0);
  return { answered, total: section.questions.length };
}

/**
 * A dollar figure out of a price answer, where there is one to find.
 *
 * "$12" is twelve. "10-15" is twelve and a half, because the midpoint of a range
 * somebody offered is the closest thing to the number they meant. "$120/year" is
 * ten, since every price question on this survey asks per month and a tester
 * answering in years is answering the question rather than a different one.
 * "Nothing" is zero, which is a real answer and not a missing one. Anything else
 * is null, and the words are shown instead of being forced into a column.
 */
export function dollarsFrom(text) {
  const said = String(text || "")
    .toLowerCase()
    .trim();
  if (!said) return null;
  if (/^(nothing|none|nil|zero|free|\$?0(\.00)?)$/.test(said)) return 0;

  const figures = (said.match(/\d+(?:\.\d+)?/g) || [])
    .map(Number)
    .filter((n) => Number.isFinite(n));
  if (!figures.length) return null;

  const range = figures.slice(0, 2);
  const monthly = range.reduce((sum, n) => sum + n, 0) / range.length;
  const perYear = /\b(year|yr|annual|annually|per year|a year)\b/.test(said);
  const value = perYear ? monthly / 12 : monthly;
  return Math.round(value * 100) / 100;
}

/** The short word for what somebody answered, or null if they have not. */
export function shortAnswer(id, answers) {
  const question = BY_ID.get(id);
  const said = answers?.[id];
  if (!question?.short || !said) return null;
  return question.short[said] || null;
}

/**
 * One sheet described in a few words: how often they travel, and what kind of
 * planner they are. Null when they have said neither, so a caller can leave the
 * line off rather than print an empty tag.
 */
export function travelerTag(answers) {
  const said = [FREQUENCY_ID, PLANNER_ID]
    .map((id) => shortAnswer(id, answers))
    .filter(Boolean);
  return said.length ? said.join(" · ") : null;
}

/**
 * Sheets split by what kind of planner wrote them, for the breakdown lines.
 *
 * Grouped by the planner question rather than by frequency because it is the one
 * that changes what an answer means -- a novice rating packing lists a two is
 * telling us something different from a professional doing the same. Frequency is
 * shown per sheet in the roll call instead, where it can be read alongside it.
 *
 * Empty groups are dropped, so a beta of four people does not print four columns
 * with nothing under three of them. Sheets that skipped the question are kept as
 * a group of their own: they are still answers, and hiding them would make the
 * per-group counts fail to add up to the whole.
 */
export function travelerSegments(sheets) {
  const question = BY_ID.get(PLANNER_ID);
  const groups = question.options.map((option) => ({
    key: option,
    label: question.short[option],
    sheets: sheets.filter((sheet) => sheet.answers?.[PLANNER_ID] === option),
  }));
  groups.push({
    key: "unsaid",
    label: "not said",
    sheets: sheets.filter((sheet) => !sheet.answers?.[PLANNER_ID]),
  });
  return groups.filter((group) => group.sheets.length);
}

/** The middle price of a set of answers, for the desk. Null when none parse. */
export function medianDollars(values) {
  const numbers = values
    .map((value) => dollarsFrom(value))
    .filter((n) => n !== null)
    .sort((a, b) => a - b);
  if (!numbers.length) return null;
  const middle = Math.floor(numbers.length / 2);
  const median =
    numbers.length % 2
      ? numbers[middle]
      : (numbers[middle - 1] + numbers[middle]) / 2;
  return Math.round(median * 100) / 100;
}
