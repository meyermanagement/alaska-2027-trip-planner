// Putting a figure on the lines of a trip that nobody has priced.
//
// The Money screen's most useful state is also its least satisfying one: eleven
// lines on the trip and four numbers, so the total is confidently wrong and the
// preferred budget has nothing real to be compared against. Filling those boxes
// in is an afternoon of opening tabs -- what does a tundra tour run, what is a
// rental car in Anchorage in August, what does a night at that hotel cost -- and
// it is exactly the work a grounded model does faster and no worse.
//
// Three rules shape everything below.
//
// It only ever touches a blank. A line with an estimate on it has been priced by
// somebody, or by a quote, or by a booking, and an estimate is not an improvement
// on any of those. A line with a final figure is settled. So the candidate set is
// the unpriced lines and nothing else, and the write is conditional on the box
// still being empty when it lands.
//
// It says what it is. Every figure it writes carries a short basis in the note --
// what it is priced as, for how many people -- and that note is the difference
// between a number a family can sanity-check and a number that just appeared.
//
// It would rather say nothing. A line it cannot price is left blank. An empty box
// is honest and this screen already reads it correctly; a guess with no ground
// under it makes the total worse while looking like progress.
//
// Pure but for the one impure export at the bottom: rows in, candidates out.

import { generate as callModel } from "@/lib/agent/llm";
import { firstJson } from "@/lib/tips/parse";
import { groupLabel } from "./budget";

const clip = (value, max) => {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
};

/** The most lines one pass will price. Past this the answer runs out of time. */
export const MAX_LINES = 40;

/** Sanity bounds on a single line of a family holiday, in dollars. */
const MIN_AMOUNT = 1;
const MAX_AMOUNT = 250000;

export const ESTIMATE_SYSTEM = `You are the travel assistant for one family, pricing the parts of their trip that nobody has put a figure on yet.

You are filling in the estimate column of their budget screen. Each line below is something they are actually doing — a flight, a hotel, a tour, a car, a fee — and it currently has no number against it. Your job is a defensible market estimate for each one, for THIS party on THESE dates in THIS place.

Rules, in order of importance:

1. Price the whole line, not one person. If four people are flying, the flight line is four fares. If the party is in one room for five nights, the lodging line is five nights of that room. Say which in the basis.
2. Use what you looked up. Search for the real current price of the named place, operator, route or class of thing on those dates, and prefer a figure you found to a figure you remember. Shoulder season, school holidays and Alaskan August all move prices enough to matter.
3. Say what you priced it as, in a dozen words or fewer: "2 adults, 1 child, round trip", "5 nights, 1 room, mid-range", "per-vehicle park fee". This is how they check your work.
4. Leave out what you cannot price. If the line is too vague to price — "Explore town", "Free morning", a note with no cost — omit it entirely rather than inventing a number. An empty box is a correct answer here.
5. One figure per line, in whole US dollars, no ranges and no currency symbols. Where a real price is a range, use a sensible middle and say so in the basis.
6. Never price something at zero to be safe. A free thing should be omitted, not priced at nothing, unless it genuinely has a cost of zero worth recording.

Answer with JSON only, in this shape:

{"estimates":[{"id":"<the id given>","amount":1450,"basis":"2 adults, half-day tour"}]}

An empty list is a real answer if nothing here can be honestly priced.`;

/** One unpriced line, as the model sees it. */
function lineOut(line, index) {
  const bits = [
    `${index + 1}. id=${line.id}`,
    clip(line.label, 90) || "untitled",
  ];
  const tail = [];
  if (line.groupId) tail.push(groupLabel(line.groupId));
  if (line.category) tail.push(line.category);
  // The sub-line already opens with the date on an itinerary line, so pushing
  // both spelled the date twice and made the place look like a second one.
  const sub = clip(line.sub, 80);
  if (sub) tail.push(sub);
  else if (line.date) tail.push(line.date);
  else if (line.kind === "cost") tail.push("not on any day");
  if (line.status) tail.push(`status ${line.status}`);
  return `${bits.join(" — ")}${tail.length ? ` [${tail.join(" · ")}]` : ""}`;
}

/**
 * The brief: the trip, who is on it, what is already priced, and the blanks.
 *
 * What is already priced earns its place in the brief. It is the only thing
 * telling the model what level this family travels at — a $9,000 balcony cabin
 * and a $180 airport hotel are the same trip, and an estimate for dinner should
 * know which of the two it sits next to.
 */
export function estimateBrief({
  today,
  trip,
  travelers = [],
  lines = [],
  priced = [],
  target = null,
  facts = null,
}) {
  const out = [];
  out.push(`TODAY IS ${today}.`);
  out.push("");
  out.push(
    `THE TRIP: ${clip(trip?.name, 80) || "untitled"} — ${
      clip(trip?.destination, 80) || "destination not recorded"
    }, ${trip?.start_date || "no start date"} to ${
      trip?.end_date || "no end date"
    }.`,
  );
  const people = (travelers || []).filter((t) => t.is_person !== false);
  out.push(
    `WHO IS GOING: ${
      people.length
        ? people
            .map((t) =>
              t.age === null || t.age === undefined
                ? t.name
                : `${t.name} (${t.age} on the first day)`,
            )
            .join(", ")
        : "nobody recorded — price it for two adults and say so"
    }.`,
  );
  if (facts?.currency) out.push(`Local currency: ${clip(facts.currency, 60)}.`);
  if (target !== null)
    out.push(
      `They would like the whole trip to come to about $${Math.round(target).toLocaleString("en-US")}. This is context for the level they travel at, not a total to make your figures add up to.`,
    );
  out.push("");
  out.push(
    priced.length
      ? "WHAT IS ALREADY PRICED ON THIS TRIP, so you can see the level they travel at:"
      : "NOTHING ON THIS TRIP IS PRICED YET, so you have no level to work from — price everything as a mid-range family holiday unless the line says otherwise.",
  );
  for (const line of priced.slice(0, 30))
    out.push(
      `- ${clip(line.label, 70)}: $${Math.round(line.actual ?? line.estimate).toLocaleString("en-US")}${line.actual !== null ? " (final)" : ""}`,
    );
  out.push("");
  out.push(
    `THE LINES TO PRICE (${lines.length}). Use the id exactly as given:`,
  );
  for (const [i, line] of lines.entries()) out.push(lineOut(line, i));
  out.push("");
  out.push(
    "Now price the ones you can, omit the ones you cannot, and answer with JSON only.",
  );
  return out.join("\n");
}

/** The candidates in a reply, whatever shape the model reached for. */
export function estimatesFrom(text) {
  const parsed = firstJson(text);
  if (Array.isArray(parsed)) return parsed;
  for (const key of ["estimates", "lines", "prices", "costs"])
    if (parsed && Array.isArray(parsed[key])) return parsed[key];
  return [];
}

/**
 * Keep the candidates that name a real blank line and a believable figure.
 *
 * Everything rejected here is reported rather than swallowed. A model that
 * priced a line twice, or priced a line that was never asked about, is the kind
 * of thing worth seeing in a log before it becomes a number on somebody's
 * budget.
 */
export function acceptEstimates({ candidates = [], lines = [] }) {
  const byId = new Map(lines.map((line) => [String(line.id), line]));
  const kept = [];
  const dropped = [];
  const seen = new Set();

  for (const candidate of candidates) {
    const id = String(candidate?.id ?? "").trim();
    const line = byId.get(id);
    if (!line) {
      dropped.push({ id, why: "not one of the unpriced lines" });
      continue;
    }
    if (seen.has(id)) {
      dropped.push({ id, why: "priced twice" });
      continue;
    }
    const amount = Math.round(Number(candidate?.amount));
    if (!Number.isFinite(amount) || amount < MIN_AMOUNT) {
      dropped.push({ id, why: `no usable figure (${candidate?.amount})` });
      continue;
    }
    if (amount > MAX_AMOUNT) {
      dropped.push({ id, why: `implausible figure (${amount})` });
      continue;
    }
    seen.add(id);
    kept.push({
      id: line.id,
      kind: line.kind,
      label: line.label,
      amount,
      basis: clip(candidate?.basis, 120),
    });
  }

  return { estimates: kept, dropped };
}

/**
 * The note the family reads under the line, so a figure is never anonymous.
 *
 * The word "Estimated" leads, because it says a machine put this here and a
 * confirmation should replace it. The date it was priced on was in here too and
 * came out again: the note shares a truncated line with the day, and spending a
 * third of that width on a date pushed the useful half -- what it was priced as
 * -- off the end of the line. When it was estimated is on the row already.
 */
export function estimateNote(basis) {
  return basis ? `Estimated · ${basis}` : "Estimated";
}

/**
 * Ask the model to price the blanks. Grounded, because the answer is a price.
 *
 * @returns {{estimates: Array, dropped: Array, model: string|null, searched: boolean}}
 */
export async function estimatedCosts({ deadline = undefined, ...brief }) {
  const lines = (brief.lines || []).slice(0, MAX_LINES);
  if (!lines.length)
    return { estimates: [], dropped: [], model: null, searched: false };

  const result = await callModel({
    system: ESTIMATE_SYSTEM,
    messages: [{ role: "user", text: estimateBrief({ ...brief, lines }) }],
    temperature: 0.2,
    grounded: true,
    thinking: "low",
    ...(deadline && Number.isFinite(deadline) ? { deadline } : {}),
  });

  const { estimates, dropped } = acceptEstimates({
    candidates: estimatesFrom(result.text),
    lines,
  });

  return {
    estimates,
    dropped,
    model: result.model || null,
    searched: Boolean(result.searched),
  };
}
