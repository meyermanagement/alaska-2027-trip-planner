// Asking Aly what is missing from "how we like to travel".
//
// The preferences screen has always had one way in: a blank box and the hope that
// somebody remembers, unprompted, that they would rather drive than fly under six
// hours. Nobody sits down and writes that. It comes out when a plan is already
// wrong, which is the one moment it is too late to be useful.
//
// So this asks the opposite question. Aly already knows a great deal about this
// family — where they have been, what they gave five stars to and what they gave
// two, who is going on what, how old everybody is, what is already saved here —
// and from that she can see the gaps: the decisions she keeps having to guess at.
// A suggestion is a draft of the sentence they would have written, in their own
// voice, with the reason she thinks it applies.
//
// The single most important rule in this file is that nothing here writes
// anything. A preference is the family telling the app what is true of them, and
// a machine quietly filing an opinion under their name would poison every plan
// made afterwards — silently, and in a way nobody would ever go looking for. So a
// suggestion arrives as editable text next to a Save button, and the words that
// get saved are words a person has just read.
//
// Pure: rows in, strings and candidate objects out. No database, no model, no
// clock. The model call lives at the bottom and is the only impure export.

import { generate as callModel } from "@/lib/agent/llm";
import { firstJson } from "@/lib/tips/parse";
import { SHARED_LABEL } from "./scope";
import { aboutLines } from "../travelers/profile";
import { agesOn } from "../travelers/ages";

const clip = (value, max) => {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
};

/** The most a single ask will hand back, however keen the model is. */
export const MAX_SUGGESTIONS = 6;

/** Below this a "preference" is a fragment, not a sentence anybody can act on. */
const MIN_BODY = 25;
const MAX_BODY = 400;

export const SUGGEST_SYSTEM = `You are the travel assistant for one family, and you are being asked a question about your own working knowledge: what do you keep having to guess about how this family likes to travel?

You are looking at the "How we like to travel" screen of their planner. Everything already saved there is listed below. Your job is to propose the sentences that are MISSING — the standing decisions you would need in order to plan for them without asking, and which nobody has written down yet.

Each suggestion is a draft written in the family's own voice, as if they wrote it: "We would rather…", "Around $400 a night is our ceiling…". Never address them as "you". They will read it, edit it, and decide whether it is true, so a draft that is close but wrong is useful and a draft that is vague is not.

What makes a good suggestion:
1. It would change a real decision. If knowing it would not change which hotel, flight, restaurant or day plan you propose, do not suggest it.
2. You can say why you are asking. Best is a line of the record below — a five-star review, a two-star review, the ages of the people going, the pets, a pattern across their past trips, or a gap an upcoming trip makes urgent. Where the record says nothing, a decision that every single trip needs is still fair game: say so plainly in "because", as "a decision every trip needs, and nothing here says which way you lean". Never dress up a universal decision as something you spotted in their record.
3. It is not already saved. Read the saved list carefully — a rewording of something already there is the worst possible suggestion, because it teaches them the feature is noise.
4. It is a standing preference, not a task and not a fact about one trip. "Book the Denali shuttle" is a task. "We would rather book excursions ahead than leave the day open" is a preference.
5. It is one decision per suggestion. Two decisions in one sentence cannot be edited or filed.

Never invent a fact about them. You are proposing what they might say, not reporting what they have said. Where you are guessing at the direction of a preference, phrase the draft the way the record leans and say in "because" that it is an inference — they will correct it.

Returning an empty list is a real answer. If everything worth knowing is already saved, say so with an empty list rather than padding.

Reply with JSON and nothing else, in this exact shape:

{"suggestions":[{"topic":"…","body":"…","whose":"…","because":"…"}]}

  topic    two or three words, sentence case, reusing one of their existing topics where it fits
  body     one or two sentences in the family's own voice, under 300 characters, American spelling, no exclamation marks
  whose    the exact name of one person if it is only true of them, otherwise "Shared"
  because  the line of their record this rests on, in your own words, under 160 characters`;

export const STARTER_RULE = `
YOU ARE BEING ASKED THE BEGINNER'S VERSION OF THIS QUESTION. Either almost nothing is recorded about this family yet, or they have asked outright for ordinary ideas rather than for what you have spotted about them. Most families never volunteer their preferences unprompted, and being handed a plausible draft to correct is the only way many of them ever will.

So the question changes. Do not hunt their record for gaps. Give them the standing decisions that every trip needs an answer to, drafted the ordinary way most households would answer them, so that each card is one press from being true or one edit from being right. A plausible draft they correct is worth ten empty screens.

Cover different ground with each suggestion, from across these: how they get around at each end of a trip and where the line between driving and flying falls; what kind of place they sleep in and roughly what a night is worth to them; how full a day should be; food, including anything nobody in the house will eat; how many rooms or beds they need; where they would rather spend and where they would rather save; flying — seat, time of day, connections, bags; and anything that would rule a place out completely.

Two rules from above still hold without exception. Every suggestion must still be one decision, in their own voice, that would genuinely change which hotel, flight or day plan you would propose. And you still must not invent a fact about them: "Around $250 a night is our ceiling for a normal hotel" is a draft of an ordinary answer they will correct, while "You usually stay in boutique hotels" is a claim about a family you know nothing about, and the second is never acceptable.

Returning an empty list is the wrong answer here. A family with nothing saved is exactly who this is for.`;

/** The two questions this screen can ask. */
export const MODES = ["missing", "ideas"];

/** Is there anything in the record to reason from, or is this a blank account? */
export function starterFor({
  preferences = [],
  places = [],
  travelers = [],
} = {}) {
  // Their own words are what make an inference possible. Three preferences is
  // where a pattern starts to exist; below that the model is guessing anyway, and
  // guessing openly is better than guessing while claiming to have noticed
  // something.
  const saved = (preferences || []).filter((pref) =>
    String(pref?.body || "").trim(),
  ).length;
  if (saved >= 3) return false;
  // A verdict on somewhere they have been is worth more than any number of trips.
  const judged = (places || []).some((place) => place?.rating || place?.review);
  if (judged) return false;
  // And so is anything they have written about themselves.
  const told = (travelers || []).some(
    (person) =>
      person?.is_person !== false && String(person?.about_me || "").trim(),
  );
  return !told;
}

/**
 * Everything the model is told about this family, as one block of text.
 *
 * Deliberately includes the saved preferences in full rather than a count. The
 * failure this feature will be judged on is suggesting something already written
 * down, and the only way to avoid it is for the model to have read them.
 */
export function suggestBrief({
  travelers = [],
  preferences = [],
  trips = [],
  past = [],
  places = [],
  pets = [],
  topics = [],
  whose = "",
  tripName = "",
  today = "",
} = {}) {
  const people = travelers.filter((t) => t?.is_person !== false);
  const out = [];

  out.push(`Today is ${today || "an unknown date"}.`);

  if (people.length) {
    out.push(
      `\nWho travels: ${people
        .map((p) => p.name)
        .filter(Boolean)
        .join(", ")}.`,
    );
    // Ages, not ageLines: that helper writes "on the first day of this trip",
    // and this screen is not standing on a trip.
    const ages = agesOn(people, today).filter(
      (row) => typeof row.age === "number",
    );
    if (ages.length) {
      out.push(
        `Ages today: ${ages
          .map((row) => `${row.name} ${row.age} (${row.band})`)
          .join("; ")}.`,
      );
    }
    // Returns lines, not a line.
    out.push(...aboutLines(people));
  }

  if (pets.length) {
    out.push(
      `\nAnimals: ${pets
        .map(
          (p) =>
            [p.name, p.species, p.breed].filter(Boolean).join(", ") || p.name,
        )
        .filter(Boolean)
        .join("; ")}.`,
    );
  }

  // What is coming. These are the trips a missing preference is about to cost
  // them something on, which is what makes one gap more worth naming than another.
  if (trips.length) {
    out.push("\nTrips still to come:");
    for (const trip of trips) {
      const when = [trip.start_date, trip.end_date]
        .filter(Boolean)
        .join(" to ");
      out.push(
        `- ${trip.name}${trip.destination ? ` — ${trip.destination}` : ""}${
          when ? ` (${when})` : ""
        }${trip.status ? `, ${trip.status}` : ""}`,
      );
    }
  }

  if (past.length) {
    out.push("\nTrips already taken:");
    for (const trip of past) {
      out.push(
        `- ${trip.name}${trip.destination ? ` — ${trip.destination}` : ""}${
          trip.end_date ? ` (ended ${trip.end_date})` : ""
        }`,
      );
    }
  }

  // Their own verdicts, which are the most useful thing in the whole brief: a
  // two-star hotel review says more about what they will not put up with than any
  // amount of demographic guessing.
  const rated = places.filter((p) => p?.rating || p?.review);
  if (rated.length) {
    out.push("\nTheir own reviews of places they have been:");
    for (const place of rated.slice(0, 40)) {
      const stars = place.rating ? `${place.rating}/5` : "no rating";
      out.push(
        `- ${place.title}${place.category ? ` (${place.category})` : ""} — ${stars}${
          place.review ? `: "${clip(place.review, 220)}"` : ""
        }`,
      );
    }
  }

  if (preferences.length) {
    out.push(
      "\nAlready saved on this screen — do not suggest any of these again:",
    );
    for (const pref of preferences) {
      // An owner who has since been deleted reads as Shared, the same way the
      // screen itself renders them — the preference is still true of the family
      // and there is nobody left to file it under.
      const owner =
        (pref.traveler_id &&
          travelers.find((t) => t.id === pref.traveler_id)?.name) ||
        SHARED_LABEL;
      out.push(
        `- [${pref.topic?.trim() || "no topic"}, ${owner}] ${clip(pref.body, 300)}`,
      );
    }
  } else {
    out.push("\nNothing is saved on this screen yet.");
  }

  if (topics.length) {
    out.push(`\nTopics they already use: ${topics.join(", ")}.`);
  }

  // The screen's own filters, which is the whole of what "Aly understands the
  // screen you are on" means here. Somebody who has filtered to Veda is asking
  // what is missing about Veda, not about the family.
  if (whose && whose !== SHARED_LABEL) {
    out.push(
      `\nThey are looking at ${whose}'s preferences right now, so weight your suggestions towards what is missing about ${whose}.`,
    );
  } else if (whose === SHARED_LABEL) {
    out.push(
      "\nThey are looking at the family's shared preferences right now, so weight your suggestions towards what the whole family has not decided.",
    );
  }
  if (tripName) {
    out.push(
      `They are filtered to ${tripName}, so weight your suggestions towards the decisions that trip is about to need.`,
    );
  }

  out.push(
    `\nSuggest at most ${MAX_SUGGESTIONS}. Fewer, better ones is the right answer.`,
  );

  return out.join("\n");
}

/** The comparable core of a sentence, for spotting a reworded repeat. */
export function looseWords(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s]+/g, " ")
    .split(/\s+/)
    .filter((word) => word.length > 3 && !STOP.has(word));
}

// Words that carry no meaning in a preference and would otherwise make every
// sentence look like every other sentence.
const STOP = new Set([
  "would",
  "rather",
  "than",
  "with",
  "that",
  "this",
  "have",
  "want",
  "like",
  "prefer",
  "will",
  "them",
  "they",
  "when",
  "what",
  "over",
  "into",
  "from",
  "about",
  "there",
  "where",
  "somewhere",
  "anything",
  "always",
  "never",
  "keep",
  "make",
  "most",
  "much",
  "very",
  "well",
  "good",
  "better",
  "best",
]);

/**
 * How much two sentences say the same thing, 0 to 1.
 *
 * Measured against the shorter of the two on purpose. "We fly business on
 * anything over eight hours" is a repeat of "Business class on long flights" even
 * though one is twice the length, and dividing by the union would let the longer
 * sentence through.
 */
export function overlap(a, b) {
  const left = new Set(looseWords(a));
  const right = new Set(looseWords(b));
  if (!left.size || !right.size) return 0;
  let shared = 0;
  for (const word of left) if (right.has(word)) shared++;
  return shared / Math.min(left.size, right.size);
}

/** Past this much shared meaning, it is the same preference in other words. */
const SAME = 0.6;

/**
 * Which of the model's candidates are worth putting in front of somebody.
 *
 * Everything rejected is returned with a reason rather than dropped, because the
 * question when this button appears to do nothing is always "did it find nothing,
 * or did it find things and throw them away".
 */
export function acceptSuggestions({
  candidates = [],
  preferences = [],
  travelers = [],
  limit = MAX_SUGGESTIONS,
} = {}) {
  const suggestions = [];
  const dropped = [];
  const people = travelers.filter((t) => t?.is_person !== false);

  const toss = (candidate, reason) =>
    dropped.push({
      body: clip(candidate?.body, 120) || "(empty)",
      reason,
    });

  for (const candidate of Array.isArray(candidates) ? candidates : []) {
    if (suggestions.length >= limit) {
      toss(candidate, `more than ${limit} were offered`);
      continue;
    }
    const body =
      typeof candidate?.body === "string" ? candidate.body.trim() : "";
    if (body.length < MIN_BODY) {
      toss(candidate, "too short to be a preference anybody could act on");
      continue;
    }
    if (body.length > MAX_BODY) {
      toss(candidate, "too long to read next to a Save button");
      continue;
    }
    // A question is not a preference. The model does this when it has nothing:
    // it starts interviewing them instead.
    if (body.endsWith("?")) {
      toss(candidate, "a question rather than a preference");
      continue;
    }

    const already = preferences.find(
      (pref) => overlap(pref.body, body) >= SAME,
    );
    if (already) {
      toss(candidate, `already saved: "${clip(already.body, 80)}"`);
      continue;
    }
    const twice = suggestions.find((kept) => overlap(kept.body, body) >= SAME);
    if (twice) {
      toss(candidate, "the same suggestion twice over");
      continue;
    }

    // Whose it is. An unrecognized name is filed as Shared rather than thrown
    // away: the sentence may still be exactly right, and the owner is a dropdown
    // sitting next to it.
    const said = String(candidate?.whose || "").trim();
    const owner =
      said && said.toLowerCase() !== SHARED_LABEL.toLowerCase()
        ? people.find((p) => p.name?.toLowerCase() === said.toLowerCase())
        : null;

    suggestions.push({
      topic: clip(candidate?.topic, 60),
      body,
      travelerId: owner?.id || null,
      whose: owner?.name || SHARED_LABEL,
      because: clip(candidate?.because, 200),
    });
  }

  return { suggestions, dropped };
}

/** The candidates in a model reply, before any judgement is passed on them. */
export function suggestionsFrom(text) {
  const parsed = firstJson(text);
  if (Array.isArray(parsed)) return parsed;
  if (parsed && Array.isArray(parsed.suggestions)) return parsed.suggestions;
  // Cheap generosity: the model sometimes answers the shape it knows from the
  // tips brief rather than the one it was given.
  if (parsed && Array.isArray(parsed.preferences)) return parsed.preferences;
  return [];
}

/**
 * Ask the model, and keep only what clears the bar.
 *
 * Ungrounded on purpose, and it is worth being clear why: everything this answer
 * rests on is already in the record. The open web does not know whether this
 * family would rather drive than fly, and a search here would only add latency
 * and the temptation to write a travel article.
 *
 * @returns {{suggestions: Array, dropped: Array, model: string|null}}
 */
export async function suggestedPreferences({
  deadline = undefined,
  mode = "missing",
  ...brief
}) {
  // Two ways in. "Ideas" asks for the ordinary decisions outright, which is the
  // right question for somebody who does not think of themselves as a traveler
  // and would not know where to start.
  //
  // "What is missing" falls back to the same question when there is nothing of
  // theirs to reason from, because a family who has told the app nothing is not a
  // family with nothing to say — asked the sharper question they would get an
  // empty list, and an empty list is exactly the wrong answer for the people who
  // need this most.
  const starter = mode === "ideas" || starterFor(brief);
  const result = await callModel({
    system: starter ? `${SUGGEST_SYSTEM}\n${STARTER_RULE}` : SUGGEST_SYSTEM,
    messages: [{ role: "user", text: suggestBrief(brief) }],
    temperature: 0.4,
    grounded: false,
    thinking: "low",
    ...(deadline && Number.isFinite(deadline) ? { deadline } : {}),
  });

  const { suggestions, dropped } = acceptSuggestions({
    candidates: suggestionsFrom(result.text),
    preferences: brief.preferences || [],
    travelers: brief.travelers || [],
  });

  return {
    suggestions,
    dropped,
    starter,
    mode: mode === "ideas" ? "ideas" : "missing",
    model: result.model || null,
  };
}
