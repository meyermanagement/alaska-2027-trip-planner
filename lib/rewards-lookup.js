// Looking up a rewards program the app does not already ship an entry for.
//
// The catalog in rewards-catalog.js covers the programs an American family is
// most likely to hold, and picking one out of it fills the form in a keystroke.
// Everything else -- a regional airline, a hotel group outside the big five, a
// credit union card, a cruise line's own club -- had to be typed out by hand off
// the program's website, which is exactly the work nobody does. So the same
// filling-in is offered for any name: I go and read the program's own pages and
// come back with the earning rules, the credits, the tiers and a rough worth per
// point, in the same shape a catalog entry has.
//
// Grounded, because none of this can be answered from memory. Rates and fees move
// constantly and a program invented from training data is worse than a blank
// form: a blank form is obviously unfinished, whereas a plausible wrong rate gets
// saved and then quietly decides which card a flight goes on.
//
// Every field is allowed to come back empty and the whole answer is allowed to
// come back "I could not find it". A lookup that fills in something reasonable
// for a program it never found is the one failure that matters here, so the
// prompt says so repeatedly and the parser below throws away anything it cannot
// recognize.

import { generate as callModel } from "@/lib/agent/llm";
import { normalizeCredits, normalizeRules, REWARD_KINDS } from "@/lib/rewards";

/** Read off pages rather than reasoned about, so there is nothing to be creative with. */
export const LOOKUP_TEMP = 0.1;

const KINDS = REWARD_KINDS.map((k) => k.key);

const PERIODS = ["monthly", "quarterly", "semiannual", "annual", "multiyear"];

export const LOOKUP_SYSTEM = `You are filling in a rewards program for a family's travel wallet. They typed a name. Search for that program or card and report what its own pages say.

Report only what you found on the program's, airline's, hotel group's, cruise line's or card issuer's own site. A points-valuation site is acceptable for the cents-per-point figure only. Never fill a field from memory, and never estimate a rate, a fee or a credit.

Assume the United States version of the program unless the name says otherwise.

Return JSON only, no prose and no code fence:

{"found":true,"kind":"credit_card","program_name":null,"currency_label":"points","point_value_cents":null,"annual_fee":null,"tiers":null,"expiry_note":null,"perks":null,"earn_rules":[{"rate":3,"on":"dining","note":null}],"credits":[{"amount":100,"on":"hotel stays booked through the portal","resets":"annual","note":null}],"as_of":null}

Fields:

- found: false if you could not identify a real program by that name. Everything else null when found is false. Do not guess at a near match with a different name.
- kind: one of credit_card, airline, hotel, car, cruise, other.
- program_name: for a credit card, the currency its points land in ("Chase Ultimate Rewards"). Null for a program that is its own currency.
- currency_label: what the program calls them -- points, miles, Rewards Dollars, stars.
- point_value_cents: a rough cents-per-point figure, from a published valuation. Null if you did not find one.
- annual_fee: dollars a year for a card. 0 for a card with no fee. Null for anything that is not a card.
- tiers: the program's status levels in order, as one line ("Silver, Gold, Platinum and Diamond Elite"). Null if the program has none.
- expiry_note: one sentence on when points expire, and who is exempt. Null if they do not expire.
- perks: what a member gets that is not a rate or a credit -- a free night, a companion fare, checked bags -- in one or two sentences. Null if there is nothing worth the line.
- earn_rules: what each dollar earns, best rate first, at most eight rows. rate is the multiplier as a number: 3 for 3x, and 1.5 for 1.5% cash back written as 1.5. on is what it applies to, in a few words. note only for a real condition ("not warehouse clubs", "first $6,000 a year").
- credits: recurring statement credits a traveler would weigh at booking time -- travel, hotel, airline, dining, car rental, trusted-traveller fees. resets is one of monthly, quarterly, semiannual, annual, multiyear. Skip sign-up bonuses, short promotions and anything not about travel.
- as_of: the month and year of the pages you read ("September 2026"), if they say.

Hard rules:

- Null beats a plausible number. A row with two real findings is a good result.
- Do not return a rate you could not find on a page, and do not average conflicting ones -- report the program's own published rate.
- No advice, no marketing language, no reasons to sign up.`;

/** The question, written out for the model. */
export function lookupBrief({ brand, kind = null }) {
  const lines = [`Program or card name: ${String(brand || "").trim()}`];
  const label = REWARD_KINDS.find((k) => k.key === kind)?.label;
  if (label) lines.push(`The family filed it under: ${label}`);
  lines.push(
    "",
    "Search for it and return the JSON. If the name matches nothing real, return found false.",
  );
  return lines.join("\n");
}

function text(value, max) {
  if (typeof value !== "string") return null;
  const clean = value.trim().replace(/\s+/g, " ");
  if (!clean || clean.toLowerCase() === "null") return null;
  return clean.slice(0, max);
}

/** A fee of zero is a real answer; a fee of nonsense is not. */
function money(value, max) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > max) return null;
  return n;
}

/**
 * The model's JSON → something the form can hold. Anything unrecognized is
 * dropped rather than repaired, because a half-understood rate is the one thing
 * this must never hand back.
 */
export function parseLookup(raw) {
  const body = String(raw || "").trim();
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  let parsed;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  if (parsed.found === false) return { found: false };

  const rules = normalizeRules(
    Array.isArray(parsed.earn_rules)
      ? parsed.earn_rules.map((r) => ({
          rate: r?.rate,
          on: text(r?.on, 90) || "",
          note: text(r?.note, 120) || "",
        }))
      : [],
  ).slice(0, 8);

  const credits = normalizeCredits(
    Array.isArray(parsed.credits)
      ? parsed.credits.map((c) => ({
          amount: c?.amount,
          on: text(c?.on, 120) || "",
          resets: PERIODS.includes(c?.resets) ? c.resets : "annual",
          note: text(c?.note, 140) || "",
        }))
      : [],
  ).slice(0, 8);

  const entry = {
    found: true,
    kind: KINDS.includes(parsed.kind) ? parsed.kind : null,
    program_name: text(parsed.program_name, 80),
    currency_label: text(parsed.currency_label, 30),
    point_value_cents: money(parsed.point_value_cents, 500),
    annual_fee: money(parsed.annual_fee, 5000),
    tiers: text(parsed.tiers, 160),
    expiry_note: text(parsed.expiry_note, 300),
    perks: text(parsed.perks, 400),
    earn_rules: rules,
    credits,
    as_of: text(parsed.as_of, 40),
  };

  // Nothing but a kind is not a finding. Better to say I came back empty than to
  // hand over a form that looks filled in and is not.
  const anything =
    entry.earn_rules.length > 0 ||
    entry.credits.length > 0 ||
    entry.point_value_cents !== null ||
    entry.annual_fee !== null ||
    entry.tiers ||
    entry.expiry_note ||
    entry.perks;
  if (!anything) return { found: false };
  return entry;
}

/**
 * @returns { entry, model, searched, sources } where entry is null when nothing
 * usable came back and { found: false } when the program itself was not found.
 */
export async function lookupProgram({ brand, kind = null, deadline = null }) {
  const name = String(brand || "").trim();
  if (name.length < 2) return { entry: null, model: null, sources: [] };

  const result = await callModel({
    system: LOOKUP_SYSTEM,
    messages: [{ role: "user", text: lookupBrief({ brand: name, kind }) }],
    temperature: LOOKUP_TEMP,
    grounded: true,
    thinking: "low",
    ...(deadline && Number.isFinite(deadline) ? { deadline } : {}),
  });

  return {
    entry: parseLookup(result.text),
    model: result.model || null,
    searched: Boolean(result.searched),
    sources: (result.sources || []).slice(0, 6),
  };
}
