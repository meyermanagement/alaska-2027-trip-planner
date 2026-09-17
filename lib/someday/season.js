// When to go, asked about one place and answered against one family.
//
// The bucket-list form has twelve month boxes and no help, which is a fair way of
// asking a question nobody can answer. Whether Kyoto is an April place or a
// November place is a research question, and whether this household could go in
// either is a question about school, work, heat and crowds. Both halves are
// needed: the season answer alone is a travel article, and the family answer
// alone cannot tell you it rains.
//
// So this is one grounded model call, given the place, what they said they want to
// do there, and the record -- their preferences, the hard limits on the people
// going, their ages, and the months currently ticked. It comes back with at most
// three windows, each with a sentence for why.
//
// It is deliberately not told about the trips they already have. A bucket-list
// place has no dates, so a window is a month or two wide and a trip is a week
// inside it: every answer could be made to collide with something, and a warning
// that fires on a place nobody has scheduled is noise in front of the question
// actually being asked. The dates get checked when the trip becomes a trip.
//
// Nothing here writes. The windows arrive as months somebody can press, the same
// rule the preference suggestions follow: Aly proposes, a person accepts, and the
// sentence she gave is stored beside the ticks so that in eighteen months the row
// can still say why March was left off.
//
// Pure except for one function. Rows and strings in, candidate windows out; the
// model call is the last export and the only impure one.

import { generate as callModel } from "@/lib/agent/llm";
import { firstJson } from "@/lib/tips/parse";
import { monthsSaid, parseMonths } from "./months";

const clip = (value, max) => {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.length > max ? `${raw.slice(0, max - 1)}\u2026` : raw;
};

/** The most windows one ask hands back. Past three this is a calendar, not advice. */
export const MAX_WINDOWS = 3;

/** Below this, a reason is a label rather than something anybody can disagree with. */
const MIN_BECAUSE = 20;
const MAX_BECAUSE = 260;
const MAX_LABEL = 48;
const MAX_NOTE = 220;

export const SEASON_SYSTEM = `You are the travel assistant for one family, answering one question about one place on their bucket list: which months should they go in?

Two halves, and an answer missing either one is no use to them.

The first half is the place. When is it actually good, when is it cheap, when is it wet, when is it unbearable, and when is the specific thing they said they want to do there possible at all? A reef trip in hurricane season, a cherry blossom trip three weeks late and an aurora trip in June are all failures of this half. Search for it. Say the ordinary trade-off out loud: the month with the best weather is very often the month with the worst prices and the worst crowds, and a family who knows that can choose.

The second half is this family. Their record is below. What they can stand, what they have said about crowds and money and heat, the hard limits on the people going, and the ages of the children. A window that is perfect for the place and impossible for them is the wrong answer.

Give at most three windows, in the order you would recommend them, best first. Fewer is better than padding: one window is a fine answer when there is only one good month, and two is normal.

Rules that matter:
1. Every window must be a run of months a person would say out loud, not a scatter. "Late April into May" or "September" or "December through February", not "April, July and November".
2. The reason must be specific to this place and, wherever the record allows it, to this family. "Good weather" is not a reason. "The rain drops off after March and the reef visibility is best before the June swell, and it is outside hurricane season" is.
3. Never invent a fact about them. If nothing in the record bears on a window, give the season reason alone and do not dress it up as something you know about them.
4. Where the months they have already ticked are wrong, say so plainly in "note", and give the window you would tick instead. Where their ticks are right, say that too -- an answer that confirms what they already thought is worth having.
5. American spelling. No exclamation marks. Do not address them as "you" in the label; the label is a name for the window, not a sentence.

Reply with JSON and nothing else, in this exact shape:

{"windows":[{"label":"…","months":["Apr","May"],"because":"…"}],"note":"…"}

  label    a short name for the window, under 40 characters, sentence case
  months   the months in it, as three-letter names or numbers, in order
  because  one or two sentences on why this window, under 240 characters
  note     one line about the months already ticked, or omit it entirely`;

/**
 * The brief, as the model sees it.
 *
 * Written as headed blocks rather than JSON because the thing it is mostly made
 * of is people's own sentences, and a model reads those better in prose than in a
 * structure. Every block is omitted when it is empty rather than sent as a
 * heading with nothing under it, which reads to a model as an assertion that the
 * family has no preferences.
 */
export function seasonBrief({
  place = "",
  region = "",
  why = "",
  months = [],
  travelerNames = [],
  ages = [],
  about = [],
  preferences = [],
  facts = [],
  today = "",
}) {
  const blocks = [];

  const where = [clip(place, 160), clip(region, 80)].filter(Boolean).join(", ");
  blocks.push(
    `THE PLACE\n${where || "somewhere they have not named precisely"}`,
  );

  if (why) {
    blocks.push(
      `WHAT THEY SAID THEY WANT TO DO THERE\n${clip(why, 400)}\nThis is the part a season answer has to serve. If what they want is only possible in certain weeks, that decides the window.`,
    );
  }

  blocks.push(
    months.length
      ? `MONTHS THEY HAVE ALREADY TICKED\n${monthsSaid(months)}\nSay in "note" whether these are right.`
      : `MONTHS THEY HAVE ALREADY TICKED\nNone. Nobody has answered this yet, which is why they are asking.`,
  );

  if (travelerNames.length) {
    blocks.push(`WHO IT IS FOR\n${travelerNames.join(", ")}`);
  }

  const agesSaid = (ages || [])
    .filter((row) => row?.name && Number.isFinite(row.age))
    .map((row) => `${row.name} is ${row.age}`);
  if (agesSaid.length) {
    blocks.push(
      `AGES\n${agesSaid.join("; ")}\nSchool terms, heat and how long a day can run all follow from this.`,
    );
  }

  if (about.length) {
    blocks.push(`ABOUT THEM, IN THEIR OWN WORDS\n${about.join("\n")}`);
  }

  const prefSaid = (preferences || [])
    .map((row) => {
      const body = clip(row?.body, 220);
      if (!body) return null;
      const topics = Array.isArray(row?.topics)
        ? row.topics.filter(Boolean)
        : [];
      const head = topics.length ? topics.join(", ") : row?.topic || "";
      return head ? `${head}: ${body}` : body;
    })
    .filter(Boolean)
    .slice(0, 24);
  if (prefSaid.length) {
    blocks.push(`HOW THEY LIKE TO TRAVEL\n${prefSaid.join("\n")}`);
  }

  const factSaid = (facts || [])
    .map((row) => clip(row?.body, 200))
    .filter(Boolean)
    .slice(0, 16);
  if (factSaid.length) {
    blocks.push(
      `HARD LIMITS, NOT TASTE\n${factSaid.join("\n")}\nA window that breaks one of these is not a window.`,
    );
  }

  if (today) blocks.push(`TODAY\n${today}`);

  return blocks.join("\n\n");
}

/** The candidate windows the model sent, before anything is judged. */
export function windowsFrom(text) {
  const parsed = firstJson(text);
  const list = Array.isArray(parsed?.windows) ? parsed.windows : [];
  return {
    candidates: list,
    note: clip(parsed?.note, MAX_NOTE) || null,
  };
}

/**
 * The windows worth showing somebody.
 *
 * A window with no months cannot be pressed, and a window with no reason is a
 * month range with a machine's word behind it, which is exactly what this feature
 * exists to replace. Both are dropped rather than repaired. Two windows covering
 * the same months are one window with two descriptions, and the first survives.
 */
export function acceptWindows(candidates = []) {
  const kept = [];
  const seen = new Set();

  for (const raw of Array.isArray(candidates) ? candidates : []) {
    if (kept.length >= MAX_WINDOWS) break;
    const months = parseMonths(raw?.months);
    if (!months.length || months.length > 8) continue;

    const because = clip(raw?.because, MAX_BECAUSE);
    if (because.length < MIN_BECAUSE) continue;

    const key = months.join(",");
    if (seen.has(key)) continue;
    seen.add(key);

    kept.push({
      label: clip(raw?.label, MAX_LABEL) || monthsSaid(months),
      months,
      said: monthsSaid(months),
      because,
    });
  }

  return kept;
}

/**
 * The line stored on the place when somebody accepts a window.
 *
 * The months are named inside it on purpose. The reason sits beside a row of
 * ticks that anybody can change afterwards, and a sentence that does not say
 * which months it was about becomes a lie the first time somebody adds one.
 */
export function reasonFor(chosen) {
  if (!chosen) return "";
  const said = chosen.said || monthsSaid(chosen.months || []);
  return clip(`${said}: ${chosen.because}`, 500);
}

/**
 * Ask when to go. Grounded, because half the answer is about the place.
 *
 * @returns {{windows: Array, note: string|null, sources: Array, model: string|null, searched: boolean}}
 */
export async function seasonWindows({ deadline = undefined, ...brief }) {
  const result = await callModel({
    feature: "someday.season",
    system: SEASON_SYSTEM,
    messages: [{ role: "user", text: seasonBrief(brief) }],
    temperature: 0.3,
    grounded: true,
    thinking: "low",
    ...(deadline && Number.isFinite(deadline) ? { deadline } : {}),
  });

  const { candidates, note } = windowsFrom(result.text);

  return {
    windows: acceptWindows(candidates),
    note,
    sources: Array.isArray(result.sources) ? result.sources.slice(0, 4) : [],
    model: result.model || null,
    searched: Boolean(result.searched),
  };
}
