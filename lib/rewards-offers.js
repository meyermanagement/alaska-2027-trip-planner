// What makes a card recommendation this family's rather than everybody's.
//
// The complaint about a generic points newsletter is exact: it tells you to open
// a card you already carry. That is not a hard problem when the app already
// knows what is in the Wallet -- it is only a problem when nothing checks. So
// three things are checked here, mechanically, after the model has spoken and
// before anything reaches the screen.
//
// One: they do not already hold it. A held card is a row in the Wallet, and a
// suggestion whose name is that row's name is dropped, whatever the prompt said.
//
// Two: they have not already turned it down. An offer is filed as a row with the
// terms it carried, so the same offer coming round in November can be recognized
// as the one waved off in September and left alone. Not forever -- if the bonus
// goes up, or the spend or the fee comes down, that is a new offer and it is
// allowed to ask again. Anything else is asking twice.
//
// Three: the numbers exist. An offers tip has to arrive with the bonus, the
// spending, the window and the fee as fields, not as adjectives in a sentence.
// A tip that cannot fill those in did not read an offer page, and the one thing
// this feature cannot afford is a bonus figure somebody makes a decision on that
// came out of a model's memory of last year.
//
// The dates the arithmetic below runs on -- opened, closed, bonus earned -- are
// dates the family types into the Wallet. Nothing here infers them from a bank
// feed or a parsed email, and nothing here touches their credit. The point of
// knowing them is narrow: to say whether an issuer rule is anywhere near them
// instead of reciting the rule at everybody.

const MONTH = 30.44 * 24 * 60 * 60 * 1000;

/** Punctuation, spacing and casing thrown away so two spellings of one card meet. */
export function cardKey(name) {
  return String(name || "")
    .toLowerCase()
    .replace(/\bcard\b/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

const isCard = (row) => row?.kind === "credit_card";
const held = (row) => isCard(row) && row.is_active !== false;

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

const positive = (value) => {
  const n = num(value);
  return n !== null && n > 0 ? n : null;
};

const dateOf = (value) => {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const monthsBetween = (from, to) =>
  from && to ? Math.round((to.getTime() - from.getTime()) / MONTH) : null;

const monthName = (value) => {
  const when = dateOf(value);
  return when
    ? when.toLocaleDateString("en-US", {
        month: "long",
        year: "numeric",
        timeZone: "UTC",
      })
    : null;
};

/**
 * The names of the cards they carry right now.
 *
 * @param {Array} programs rewards_programs rows
 * @returns {Map<string, object>} normalized name → row
 */
export function heldCards(programs = []) {
  const map = new Map();
  for (const row of programs || []) {
    if (!held(row)) continue;
    const name = [row.brand, row.program_name].filter(Boolean).join(" ");
    const key = cardKey(name);
    if (key) map.set(key, row);
  }
  return map;
}

/**
 * Whether a suggested card is one they already have.
 *
 * Containment either way, because the Wallet says "Chase Sapphire Preferred"
 * and an issuer's page says "Chase Sapphire Preferred Card". Deliberately not
 * cleverer than that: a rule that guessed at product families would refuse
 * Sapphire Reserve to somebody holding Sapphire Preferred, which is a judgment
 * about issuer rules and belongs to the pass that can read them, not to a string
 * comparison.
 *
 * @param {string} name
 * @param {Map<string, object>} cards from heldCards()
 * @returns {object|null} the row they hold, when they do
 */
export function alreadyHeld(name, cards) {
  const key = cardKey(name);
  if (!key) return null;
  for (const [heldKey, row] of cards) {
    if (key === heldKey || key.includes(heldKey) || heldKey.includes(key))
      return row;
  }
  return null;
}

/**
 * The dates an issuer rule would actually turn on, per person.
 *
 * Counts every card row, open or closed, because a card closed last year still
 * counts as an account opened last year everywhere it matters.
 *
 * @param {object} input
 * @param {Array} input.programs
 * @param {Array} input.travelers
 * @param {string} input.today
 */
export function cardHistory({ programs = [], travelers = [], today } = {}) {
  const now = dateOf(today) || new Date();
  const nameOf = new Map(
    (travelers || []).filter((t) => t?.id).map((t) => [t.id, t.name]),
  );
  const people = new Map();

  const bucket = (id) => {
    const key = id || "household";
    if (!people.has(key)) {
      people.set(key, {
        who: id ? nameOf.get(id) || "someone unnamed" : "the household",
        recent: [],
        older: 0,
        undated: 0,
        bonuses: [],
      });
    }
    return people.get(key);
  };

  let anyOpenedDate = false;

  for (const row of programs || []) {
    if (!isCard(row)) continue;
    const name = [row.brand, row.program_name].filter(Boolean).join(" ");
    const person = bucket(row.traveler_id);
    const opened = dateOf(row.opened_on);
    if (opened) {
      anyOpenedDate = true;
      const age = monthsBetween(opened, now);
      if (age !== null && age <= 24)
        person.recent.push({ name, opened: row.opened_on, age });
      else person.older += 1;
    } else {
      person.undated += 1;
    }
    if (row.bonus_earned_on) {
      person.bonuses.push({
        name,
        earned: row.bonus_earned_on,
        age: monthsBetween(dateOf(row.bonus_earned_on), now),
      });
    }
  }

  return { people: [...people.values()], anyOpenedDate };
}

/** cardHistory() as lines for the brief. */
export function historyLines(history) {
  if (!history?.people?.length) return [];
  const lines = [];
  for (const person of history.people) {
    const bits = [];
    if (person.recent.length) {
      bits.push(
        `${person.recent.length} card ${
          person.recent.length === 1 ? "account" : "accounts"
        } opened in the last 24 months (${person.recent
          .map((c) => `${c.name} ${monthName(c.opened) || c.opened}`)
          .join("; ")})`,
      );
    } else if (person.older || person.undated) {
      bits.push("no card opened in the last 24 months that we know of");
    }
    if (person.older) bits.push(`${person.older} opened longer ago than that`);
    if (person.undated)
      bits.push(
        `${person.undated} with no opening date recorded, so they could be recent`,
      );
    if (person.bonuses.length) {
      bits.push(
        `welcome bonuses earned: ${person.bonuses
          .map(
            (b) =>
              `${b.name} ${monthName(b.earned) || b.earned}${
                b.age !== null ? ` (${b.age} months ago)` : ""
              }`,
          )
          .join("; ")}`,
      );
    }
    if (bits.length) lines.push(`- ${person.who}: ${bits.join(". ")}.`);
  }
  return lines;
}

/** Cards they used to hold. Closed is not the same as never had. */
export function closedLines(programs = []) {
  return (programs || [])
    .filter((row) => isCard(row) && row.is_active === false)
    .map((row) => {
      const name = [row.brand, row.program_name].filter(Boolean).join(" ");
      const when = monthName(row.closed_on);
      const bonus = monthName(row.bonus_earned_on);
      return `- ${name}${when ? `, closed ${when}` : ", closed"}${
        bonus ? `, welcome bonus earned ${bonus}` : ""
      }`;
    });
}

/**
 * One string standing for a set of terms.
 *
 * The card, the bonus, the spend and the fee. Change any of those and it is a
 * different offer that deserves to be asked again; change only the wording and
 * it is the same offer wearing a new sentence.
 */
export function termsKey(offer) {
  return [
    cardKey(offer?.card_name),
    positive(offer?.bonus_amount) ?? cardKey(offer?.bonus_text).slice(0, 40),
    positive(offer?.min_spend) ?? "nospend",
    num(offer?.annual_fee) ?? "nofee",
  ].join("|");
}

/**
 * The offer object off a model's tip, or null if it is not one.
 *
 * Every field here has to be present because every one of them is in the
 * sentence a person would use to decide: what you get, what you have to spend,
 * how long you have, what it costs to hold, and where we read it.
 */
export function offerFrom(candidate) {
  const raw = candidate?.offer;
  if (!raw || typeof raw !== "object") return null;
  const text = (value, max) => {
    const out = typeof value === "string" ? value.trim() : "";
    return out ? out.slice(0, max) : null;
  };
  const card_name = text(raw.card_name || candidate.about, 120);
  const bonus_text = text(raw.bonus, 240);
  const min_spend = positive(raw.min_spend);
  const spend_window_days = positive(raw.spend_window_days);
  const annual_fee = num(raw.annual_fee);
  const source_url = text(raw.source_url, 500);
  if (
    !card_name ||
    !bonus_text ||
    min_spend === null ||
    spend_window_days === null ||
    annual_fee === null ||
    !source_url ||
    !/^https?:\/\//i.test(source_url)
  )
    return null;
  const offer = {
    issuer: text(raw.issuer, 80) || card_name.split(" ")[0],
    card_name,
    bonus_text,
    bonus_amount: positive(raw.bonus_amount),
    bonus_unit: text(raw.bonus_unit, 40),
    min_spend,
    spend_window_days: Math.min(spend_window_days, 730),
    annual_fee,
    offer_ends_on: /^\d{4}-\d{2}-\d{2}$/.test(String(raw.ends_on || ""))
      ? raw.ends_on
      : null,
    source_url,
    source_title: text(raw.source_title, 200),
  };
  offer.terms_key = termsKey(offer);
  return offer;
}

/**
 * Has this been turned down before, and has it got better since?
 *
 * @param {object} offer from offerFrom()
 * @param {Array} ledger card_offers rows for the family
 * @returns {{row: object, better: boolean}|null}
 */
export function priorDecision(offer, ledger = []) {
  if (!offer) return null;
  const key = cardKey(offer.card_name);
  const declined = (ledger || []).filter(
    (row) => row?.status === "declined" && cardKey(row.card_name) === key,
  );
  if (!declined.length) return null;
  // The kindest of the refusals to compare against, so an offer only gets
  // through if it beats the best they have already said no to.
  const best = declined.reduce((a, b) => {
    const score = (row) =>
      (positive(row.bonus_amount) || 0) -
      (positive(row.min_spend) || 0) / 1000 -
      (num(row.annual_fee) || 0);
    return score(b) > score(a) ? b : a;
  });
  const bonusUp =
    positive(offer.bonus_amount) !== null &&
    positive(best.bonus_amount) !== null &&
    positive(offer.bonus_amount) > positive(best.bonus_amount);
  const spendDown =
    positive(offer.min_spend) !== null &&
    positive(best.min_spend) !== null &&
    positive(offer.min_spend) < positive(best.min_spend);
  const feeDown =
    num(offer.annual_fee) !== null &&
    num(best.annual_fee) !== null &&
    num(offer.annual_fee) < num(best.annual_fee);
  return { row: best, better: bonusUp || spendDown || feeDown };
}

/** How a refusal reads in the brief. */
export function declinedLines(ledger = []) {
  return (ledger || [])
    .filter((row) => row?.status === "declined")
    .slice(0, 20)
    .map((row) => {
      const bits = [
        row.card_name,
        row.bonus_text ? `offer was ${row.bonus_text}` : null,
        positive(row.min_spend)
          ? `after $${Math.round(row.min_spend)} of spending`
          : null,
        num(row.annual_fee) !== null
          ? `$${Math.round(row.annual_fee)} a year`
          : null,
        monthName(row.decided_on)
          ? `turned down ${monthName(row.decided_on)}`
          : null,
      ].filter(Boolean);
      return `- ${bits.join(", ")}`;
    });
}

/** How an offer already on the table reads in the brief. */
export function openLines(ledger = []) {
  return (ledger || [])
    .filter((row) => row?.status === "open")
    .slice(0, 20)
    .map(
      (row) =>
        `- ${row.card_name}: ${row.bonus_text || "offer recorded"}${
          row.offer_ends_on ? `, ends ${row.offer_ends_on}` : ""
        }${row.verified_on ? `, read ${row.verified_on}` : ""}`,
    );
}

/** A ledger row ready to be written, given the offer and where it belongs. */
export function ledgerRow({ offer, familyId, tipId = null, today }) {
  return {
    family_id: familyId,
    tip_id: tipId,
    issuer: offer.issuer,
    card_name: offer.card_name,
    terms_key: offer.terms_key,
    bonus_text: offer.bonus_text,
    bonus_amount: offer.bonus_amount,
    bonus_unit: offer.bonus_unit,
    min_spend: offer.min_spend,
    spend_window_days: offer.spend_window_days,
    annual_fee: offer.annual_fee,
    offer_ends_on: offer.offer_ends_on,
    source_url: offer.source_url,
    source_title: offer.source_title,
    verified_on: today,
    first_seen_on: today,
    status: "open",
  };
}

/** Offers whose end date has passed, so the ledger stops calling them open. */
export function staleOffers(ledger = [], today) {
  return (ledger || [])
    .filter(
      (row) =>
        row?.status === "open" &&
        row.offer_ends_on &&
        String(row.offer_ends_on) < String(today),
    )
    .map((row) => row.id);
}

// The site a set of terms was read off, said the way a person would say it.
// "chase.com" is a claim somebody can check; a 180-character tracking URL is
// not, so the link keeps the full address and the words keep the host.
export function offerHost(url) {
  if (!url) return "the issuer's page";
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "the issuer's page";
  }
}

// A date on an offer, said the short way. The weekday is noise on "read on" and
// "ends on" -- nobody plans a card application around it being a Tuesday -- and
// the year has to stay, because an offer read in a different year is the whole
// reason for printing the date at all.
export function offerDate(value) {
  if (!value) return "";
  const date = new Date(`${value}T12:00:00`);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
