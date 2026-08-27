// What the family's loyalty standing means for advice.
//
// A booking window is not one date. Disney Cruise Line opens shore excursions to
// Castaway Club members before it opens them to everybody, and the day depends on
// which level you are; a Walt Disney World resort guest gets a different Lightning
// Lane morning from a day guest; hotel elite tiers move check-in and upgrade
// windows; airline status moves seat selection. So a tip that says "excursions open
// 75 days out" is not merely vague to this family — it is wrong for them, and
// wrong in the direction that loses the excursion.
//
// The standings are already recorded on the Rewards page, tier and all. What was
// missing is that nothing carried them into the research, so every window came
// back at the public number. These lines are what the model gets told, and the
// rule below is what it is told to do about them.
//
// Pure: rows in, strings out.

const clip = (value, max) => {
  const raw = typeof value === "string" ? value.trim() : "";
  return raw.length > max ? `${raw.slice(0, max - 1)}…` : raw;
};

const KINDS = {
  cruise: "cruise line",
  airline: "airline",
  hotel: "hotel",
  car: "car rental",
  credit_card: "credit card",
  rail: "rail",
  park: "parks",
  other: "",
};

/**
 * One line per standing worth mentioning.
 *
 * A program with no tier recorded is still said, because "they are a member but
 * have no status" is a real answer and stops the model inventing one. A program
 * switched off is left out entirely.
 *
 * @param {Array} programs   rewards_programs rows
 * @param {Array} travelers  for putting a name to a row that belongs to a person
 * @returns {string[]}
 */
export function memberLines(programs = [], travelers = []) {
  const byId = new Map((travelers || []).map((t) => [t.id, t.name]));
  const rows = (programs || [])
    .filter(
      (row) =>
        row && row.is_active !== false && (row.brand || row.program_name),
    )
    .slice(0, 30)
    .map((row) => {
      const brand = clip(row.brand || row.program_name, 70);
      const kind = KINDS[String(row.kind || "").toLowerCase()] ?? "";
      const who = row.traveler_id ? byId.get(row.traveler_id) : null;
      const tier = clip(row.status_tier, 60);
      const bits = [brand];
      if (kind) bits.push(kind);
      bits.push(tier ? `level: ${tier}` : "member, no level recorded");
      if (who) bits.push(who);
      else bits.push("the whole family");
      const perks = clip(row.perks, 200);
      return `- ${bits.join(" | ")}${perks ? ` — ${perks}` : ""}`;
    });

  return rows.length
    ? rows
    : [
        "- nothing recorded, so assume no status anywhere and say nothing about it",
      ];
}

/**
 * What to do with the standings, said once and reused in both prompts.
 *
 * Deliberately about dates and eligibility rather than about perks. "You get a
 * free drink" is not a tip; "your level is why this can be booked eleven days
 * earlier than the page says, and the earlier day is the one that matters" is the
 * whole game.
 */
export const MEMBER_RULE = `Their loyalty standings are listed below, with levels. Treat them as facts about who this family is, not as a topic.

Where a level changes WHEN something can be done, the level's date is the only date worth giving them. Cruise lines open shore excursions, dining and activities to their loyalty members in waves by level; theme parks open ride reservations and dining differently to resort guests and to ticket holders; hotel and airline levels move check-in, upgrade and seat selection windows. Look up the wave or window for the exact level they hold and give them that day, and say which level it rests on. If a level they hold makes them eligible for something a non-member cannot book at all, that is worth saying for the same reason.

Never invent a level they do not hold, never assume a level is higher than what is recorded, and if you cannot verify what a level changes, say nothing about it rather than guessing a day.`;
