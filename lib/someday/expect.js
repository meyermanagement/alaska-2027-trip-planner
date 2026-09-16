// What to expect of a bucket-list place, asked about one place and one family.
//
// A wish list is a column of place names, and a place name is the least useful
// thing anybody could look at when deciding what to do next. Eleven names give no
// way to tell the trip this household would love from the one that would break
// them by the third morning, and no way to tell the place that is two hundred
// dollars away from the place that is two thousand.
//
// So this asks four things at once, because they are the four that change a
// decision. What it costs to get there from their own airports, said as the
// ordinary range and sharpened with a fare they have actually been sent. What the
// trip is really like, held against what they have written down about themselves.
// How far ahead it has to be booked, because a Galapagos boat and a beach are not
// the same sport. And the thing that quietly rules it out, read off the hard
// limits and the ages, which is the one worth interrupting somebody for.
//
// Beside that it lists what this family in particular should think about before
// going, each line drawn from something they have written down about themselves
// with a sentence on how the place sits against it. It does not grade the place
// and it does not count the lines. A machine telling a family that somewhere on
// their own wish list is probably not for them is answering a question nobody
// asked, and any single number behind that -- a percentage, or four out of seven
// -- invites the one question it cannot answer, which is why not five. The lines
// are the answer. Somebody who reads them knows more than a score could tell
// them, and can disagree with a line rather than with a verdict.
//
// Nothing here writes to the columns a fare is judged against. The months, the
// ceiling and the traveler list are still only ever set by a person.
//
// Pure except for one function. Rows and strings in, a panel out; the model call
// is the last export and the only impure one.

import { generate as callModel } from "@/lib/agent/llm";
import { firstJson } from "@/lib/tips/parse";
import { monthsSaid } from "./months";

const clip = (value, max) => {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.length > max ? `${raw.slice(0, max - 1)}\u2026` : raw;
};

/** Past this it stops being a list somebody reads and becomes one they skim. */
export const MAX_CHECKS = 7;

const MIN_BECAUSE = 20;
const MAX_BECAUSE = 220;
const MAX_ABOUT = 40;
const MAX_TIP = 300;

/** The four things a bucket-list place cannot tell you about itself. */
export const TIP_KINDS = ["cost", "like", "book", "stop"];

export const EXPECT_SYSTEM = `You are the travel assistant for one family, giving them a straight read on one place that is on their bucket list. Nothing is booked and there are no dates. They want to know what this place would actually be like for them, and what it would take.

Four things, and an answer missing the first two is no use.

WHAT IT COSTS TO GET THERE. Price the flight from their own airports, listed below, as the ordinary round-trip economy range a person planning this would budget for, per adult. Say the shape of it: which months are dear, whether a stop halves it, whether it is a route where fares move a lot. If they have been sent a real fare to this place it is listed below with the newsletter that sent it, and you must name that number and where it came from -- but it is one data point beside the range, not the range itself. Never invent a specific fare. If you cannot say anything honest about the cost, leave it out.

WHAT THE TRIP IS REALLY LIKE. Not the brochure. The rhythm of the days, the early starts, the driving, the altitude, the walking, the humidity, the noise, how much of it is sitting in a vehicle. Written against this family, whose record is below.

HOW FAR AHEAD IT HAS TO BE BOOKED. Only when it is unusual. Permits, licensed boats, huts, one good lodge, a festival, a school holiday that sells out a year ahead. A place you can book six weeks out does not need this line.

WHAT WOULD RULE IT OUT. Only when something in their record really does collide with the place: a hard limit, a mobility note, an age, a stated thing they cannot stand. If nothing does, leave it out. Do not manufacture a warning.

Then the things this family should think about before going. Between three and seven of them, drawn from what is in their record below and nothing else, the ones that would actually change how they feel about the trip. For each, say whether this place lines up with it, collides with it, or cannot be called. Never invent a preference, and never list something the record does not mention just to reach seven. "unsure" is a real answer and a better one than a guess. Do not grade the place overall and do not recommend for or against it; they already want to go, and your job is to tell them what going would mean.

Rules that matter:
1. Every claim about the place should be specific enough to be wrong. "Beautiful beaches" is not an answer. "The east coast is windward and choppy most of the year, which is why the resorts are all on the west side" is.
2. Never invent a fact about this family. If the record does not say it, you do not know it.
3. Say the trade-off out loud. The cheapest month is very often the worst month, and a family who knows that can choose.
4. American spelling. No exclamation marks. Do not sell them the place; they already want to go.

Reply with JSON and nothing else, in this exact shape:

{"cost":"…","like":"…","book":"…","stop":"…","checks":[{"about":"…","match":"yes","because":"…"}]}

  cost    what getting there costs from their airports, under 280 characters, or omit
  like    what the trip is actually like for them, under 280 characters, or omit
  book    how far ahead it has to be booked, only when unusual, or omit
  stop    what would rule it out, only when something really does, or omit
  checks  three to seven things for them to consider, each with:
            about    a short name for it, under 36 characters, sentence case
            match    "yes" if this place lines up with it, "no" if it collides, "unsure" if you cannot tell
            because  one sentence on how this place sits against it, under 200 characters`;

/**
 * The brief, as the model sees it.
 *
 * Headed blocks rather than JSON, because most of it is people's own sentences
 * and a model reads those better as prose. Every block is omitted when it is
 * empty rather than sent as a heading with nothing under it, which reads as an
 * assertion that the family has no preferences.
 */
export function expectBrief({
  place = "",
  region = "",
  why = "",
  months = [],
  travelerNames = [],
  ages = [],
  about = [],
  preferences = [],
  facts = [],
  airports = [],
  fares = [],
  today = "",
}) {
  const blocks = [];

  const where = [clip(place, 160), clip(region, 80)].filter(Boolean).join(", ");
  blocks.push(
    `THE PLACE\n${where || "somewhere they have not named precisely"}`,
  );

  if (why) {
    blocks.push(
      `WHAT THEY SAID THEY WANT TO DO THERE\n${clip(why, 400)}\nThis is the trip they are picturing. Say whether the place delivers it.`,
    );
  }

  if (months?.length) {
    blocks.push(
      `MONTHS THEY WOULD GO\n${monthsSaid(months)}\nPrice and describe the place in these months rather than in general.`,
    );
  }

  // The airports come before the people because the cost line is the one part of
  // this that is wrong without them: a range from the wrong city is not a range.
  const airportSaid = (airports || [])
    .map((row) => {
      const code = clip(row?.code, 4);
      if (!code) return null;
      const bits = [code, clip(row?.city, 60) || clip(row?.name, 80)].filter(
        Boolean,
      );
      const drive = Number.isFinite(row?.drive_minutes)
        ? `${row.drive_minutes} minutes away`
        : "";
      if (drive) bits.push(drive);
      if (row?.is_primary) bits.push("the one they usually use");
      return bits.join(", ");
    })
    .filter(Boolean)
    .slice(0, 6);
  blocks.push(
    airportSaid.length
      ? `THE AIRPORTS THEY FLY FROM\n${airportSaid.join("\n")}\nPrice from these. If the route is much better from one of them, say which.`
      : `THE AIRPORTS THEY FLY FROM\nThey have not said. Give the cost as a general range and say it is not from their own airport.`,
  );

  const fareSaid = (fares || [])
    .map((row) => {
      const price = Number(row?.price);
      if (!Number.isFinite(price)) return null;
      const bits = [
        `${row?.origin || "somewhere"} to ${row?.destination || place}`,
        `$${Math.round(price)} round trip`,
      ];
      if (row?.airline) bits.push(clip(row.airline, 40));
      if (row?.seen) bits.push(`seen ${row.seen}`);
      if (row?.source_name) bits.push(`sent by ${clip(row.source_name, 60)}`);
      return bits.join(", ");
    })
    .filter(Boolean)
    .slice(0, 4);
  if (fareSaid.length) {
    blocks.push(
      `FARES THEY HAVE ACTUALLY BEEN SENT FOR THIS PLACE\n${fareSaid.join("\n")}\nName the number and who sent it in the cost line. It is one data point beside the range, not the range.`,
    );
  }

  if (travelerNames.length) {
    blocks.push(`WHO IT IS FOR\n${travelerNames.join(", ")}`);
  }

  const agesSaid = (ages || [])
    .filter((row) => row?.name && Number.isFinite(row.age))
    .map((row) => `${row.name} is ${row.age}`);
  if (agesSaid.length) {
    blocks.push(
      `AGES\nHow long a day can run, what a child will sit through and what a place will even admit them to all follow from this.\n${agesSaid.join("; ")}`,
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
    blocks.push(
      `HOW THEY LIKE TO TRAVEL\n${prefSaid.join("\n")}\nThese are what the checks are made of. Use their words.`,
    );
  }

  const factSaid = (facts || [])
    .map((row) => clip(row?.body, 200))
    .filter(Boolean)
    .slice(0, 16);
  if (factSaid.length) {
    blocks.push(
      `HARD LIMITS, NOT TASTE\n${factSaid.join("\n")}\nA place that breaks one of these is what "what would rule it out" is for.`,
    );
  }

  if (today) blocks.push(`TODAY\n${today}`);

  return blocks.join("\n\n");
}

/**
 * The things worth considering, and nothing else.
 *
 * A line with no sentence is a label with a machine's word behind it, which is
 * the thing this feature exists to replace, so it is dropped rather than
 * repaired. Two lines about the same part of the record are one line said twice,
 * and the first survives. One surviving line is still worth reading: there is no
 * fraction here that a single line would make look silly.
 */
export function acceptChecks(candidates = []) {
  const kept = [];
  const seen = new Set();

  for (const raw of Array.isArray(candidates) ? candidates : []) {
    if (kept.length >= MAX_CHECKS) break;

    const about = clip(raw?.about, MAX_ABOUT);
    if (!about) continue;

    const because = clip(raw?.because, MAX_BECAUSE);
    if (because.length < MIN_BECAUSE) continue;

    const said = String(raw?.match || "").toLowerCase();
    const match = said === "yes" ? "yes" : said === "no" ? "no" : "unsure";

    const key = about.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);

    kept.push({ about, match, because });
  }

  return kept;
}

/**
 * What the shut band says there is inside it.
 *
 * The length of the list, and deliberately nothing about how it came out. A
 * count of the lines is a fact about the answer; a count of the ones that line up
 * is a score, and a score is what this stopped doing.
 */
export function considerSaid(checks = []) {
  if (!checks.length) return "";
  return checks.length === 1
    ? "1 thing to consider"
    : `${checks.length} things to consider`;
}

/** The four tips, in the order they change a decision, dropping the empty ones. */
export function acceptTips(parsed) {
  const tips = [];
  for (const kind of TIP_KINDS) {
    const body = clip(parsed?.[kind], MAX_TIP);
    if (body.length >= MIN_BECAUSE) tips.push({ kind, body });
  }
  return tips;
}

/** The whole panel, from whatever the model sent back. */
export function panelFrom(text) {
  const parsed = firstJson(text) || {};
  const checks = acceptChecks(parsed?.checks);
  return {
    tips: acceptTips(parsed),
    checks,
    consider: considerSaid(checks),
  };
}

/**
 * Ask what to expect. Grounded, because the cost and the shape of the days are
 * facts about the world and not about this family.
 *
 * @returns {{tips: Array, checks: Array, consider: string, sources: Array, model: string|null, searched: boolean}}
 */
export async function placeExpectation({ deadline = undefined, ...brief }) {
  const result = await callModel({
    system: EXPECT_SYSTEM,
    messages: [{ role: "user", text: expectBrief(brief) }],
    temperature: 0.3,
    grounded: true,
    thinking: "low",
    ...(deadline && Number.isFinite(deadline) ? { deadline } : {}),
  });

  return {
    ...panelFrom(result.text),
    sources: Array.isArray(result.sources) ? result.sources.slice(0, 4) : [],
    model: result.model || null,
    searched: Boolean(result.searched),
  };
}
