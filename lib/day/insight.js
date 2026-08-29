/**
 * What Aly finds out about the specific things on a specific day.
 *
 * The pro tips already in the app answer "is there anything about this trip we
 * should know," and they are deliberately reluctant -- most days they return
 * nothing, which is right for advice nobody asked for. This is a different
 * question with a different bar: it is the morning of, these six things are
 * happening, and the family needs the operational detail. What do we wear. How
 * early does this place want us. Is there anything that would ruin it.
 *
 * One call for the whole day rather than one per item. Six calls would cost six
 * times as much and produce worse answers, because the useful observations are
 * about the day as a shape -- the dinner is ten minutes from the theatre, the tour
 * ends after the pharmacy shuts. The model sees the day and answers per item.
 *
 * Every field is allowed to come back empty and usually should. An insight that
 * invents a dress code for a taco stand trains the family to stop reading the line,
 * which costs more than the blank would have.
 */

import { generate as callModel } from "@/lib/agent/llm";

/** Where a claim came from matters more than the claim. */
export const INSIGHT_MODEL_TEMP = 0.2;

export { fingerprint, isStale } from "./mark";

export const INSIGHT_SYSTEM = `You are the practical half of a family's travel planner, briefing them on one day of a trip they are already on.

You are given the day's items in order. For each one, find the operational detail that a person standing there would want to have known an hour earlier. Search for the actual venue, operator, airline or restaurant. Generic advice is worthless here; the family can already guess that a boat trip might be cold.

For each item return only what you actually found:

- dress_code: what this specific place expects, in a few words ("jacket, no jeans", "closed-toe shoes required", "swimsuit under your clothes"). Null unless the venue or operator genuinely has a stated or well-established expectation. Most restaurants do not.
- arrive_minutes: how many minutes before the start time this operator tells people to arrive. Only from their own instruction. Null if you did not find one -- do not restate the general rule for the category, the app already knows those.
- arrive_why: their reason, briefly, in their terms ("the tender leaves the dock at 8:15 sharp", "check-in closes 45 minutes before").
- heads_up: the single thing that would spoil this if nobody knew it. Cash only. No large bags. Sells out. Shuts for lunch. A long walk from the drop-off. Null far more often than not.
- bring: what to have in hand for this item specifically. Null unless it is particular.

Hard rules:

- Never fill a field to look useful. Null is the expected answer for most fields on most items, and a page of nulls with two real findings is a good result.
- Do not repeat what is already on the screen. The family can see the time, the place and the confirmation number.
- No advice about weather or what to pack in general; other parts of the app do that, and the day view already shows the forecast.
- Do not tell them to arrive early "to be safe", to check the website, to allow extra time, or to book ahead for something already booked.
- If searching turned up nothing about a specific item, return all nulls for it. Say nothing rather than something.

Return JSON only, no prose and no code fence:

{"items":[{"id":"<the item id exactly as given>","dress_code":null,"arrive_minutes":null,"arrive_why":null,"heads_up":null,"bring":null}]}`;

/** The day, written out for the model. */
export function insightBrief({
  tripName,
  destination,
  date,
  weatherSaid = null,
  items = [],
}) {
  const lines = [
    `Trip: ${tripName || "a family trip"}`,
    destination ? `Where: ${destination}` : null,
    `Day: ${date}`,
    weatherSaid ? `Forecast: ${weatherSaid}` : null,
    "",
    "The day, in order:",
  ].filter(Boolean);

  for (const i of items) {
    const bits = [
      String(i.start_time || "").slice(0, 5) || "no set time",
      i.title,
      i.category ? `(${i.category})` : null,
      i.location ? `at ${i.location}` : null,
    ].filter(Boolean);
    lines.push(`- id ${i.id}: ${bits.join(" \u00b7 ")}`);
    if (i.notes)
      lines.push(`  the family's note: ${String(i.notes).slice(0, 200)}`);
  }

  lines.push(
    "",
    "Return one entry per item, using the ids exactly. Nulls are expected.",
  );
  return lines.join("\n");
}

/** Numbers arrive as strings, prose, or nonsense. Only a usable one survives. */
export function cleanMinutes(value) {
  // The schema asks for a number and usually gets one, but a model told to be
  // brief still answers "about 20 minutes" often enough to matter. The first
  // number in the string is what it meant, and dropping a real instruction from
  // the venue over the word "about" is a worse outcome than reading it loosely.
  const n =
    typeof value === "number"
      ? value
      : Number.parseInt((/-?\d+/.exec(String(value ?? "")) || [""])[0], 10);
  if (!Number.isFinite(n)) return null;
  if (n < 0 || n > 480) return null;
  return Math.round(n);
}

/** Empty strings, "null", "none", "N/A" and filler all mean nothing was found. */
export function cleanText(value, max = 240) {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s) return null;
  if (
    /^(null|none|n\/?a|unknown|not (found|applicable|specified))\.?$/i.test(s)
  )
    return null;
  return s.slice(0, max);
}

/**
 * Pull the model's answer apart, keeping only entries about items we asked about.
 *
 * An id the model invented would write advice against nothing, or worse, against
 * another family's row if it hallucinated a real uuid. So the allowed set is
 * passed in and anything outside it is dropped.
 */
export function parseInsights(text, allowedIds = []) {
  const allow = new Set(allowedIds);
  let parsed;
  try {
    const cleaned = String(text || "")
      .replace(/^\s*```(?:json)?/i, "")
      .replace(/```\s*$/, "")
      .trim();
    parsed = JSON.parse(cleaned);
  } catch {
    return [];
  }
  const rows = Array.isArray(parsed) ? parsed : parsed?.items;
  if (!Array.isArray(rows)) return [];

  const out = [];
  const claimed = new Set();
  for (const row of rows) {
    const id = typeof row?.id === "string" ? row.id.trim() : null;
    if (!id || !allow.has(id) || claimed.has(id)) continue;
    claimed.add(id);

    const insight = {
      item_id: id,
      dress_code: cleanText(row.dress_code, 120),
      arrive_minutes: cleanMinutes(row.arrive_minutes),
      arrive_why: cleanText(row.arrive_why, 200),
      heads_up: cleanText(row.heads_up, 300),
      bring: cleanText(row.bring, 160),
    };
    // A minutes figure with no reason is a rule of thumb wearing a costume; the
    // app has its own rules and labels them as such.
    if (insight.arrive_minutes !== null && !insight.arrive_why)
      insight.arrive_minutes = null;
    // Nothing found. Still returned, so the caller can record that we looked and
    // stop asking again on every page load.
    insight.empty =
      !insight.dress_code &&
      insight.arrive_minutes === null &&
      !insight.heads_up &&
      !insight.bring;
    out.push(insight);
  }
  return out;
}

/**
 * Research a day.
 *
 * @returns { insights, model, searched, sources }
 *   `searched` false means the model answered without grounding, which for
 *   operational detail about a named venue is close to worthless -- the caller
 *   records it but the screen says where it came from.
 */
export async function researchDay({ items = [], deadline, ...brief }) {
  if (items.length === 0)
    return { insights: [], model: null, searched: false, sources: [] };

  const result = await callModel({
    system: INSIGHT_SYSTEM,
    messages: [{ role: "user", text: insightBrief({ ...brief, items }) }],
    temperature: INSIGHT_MODEL_TEMP,
    grounded: true,
    thinking: "low",
    ...(deadline && Number.isFinite(deadline) ? { deadline } : {}),
  });

  return {
    insights: parseInsights(
      result.text,
      items.map((i) => i.id),
    ),
    model: result.model || null,
    searched: Boolean(result.searched),
    sources: result.sources || [],
  };
}
