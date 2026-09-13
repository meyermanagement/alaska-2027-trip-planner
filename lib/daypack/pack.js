// What is in the bag today, worked out from three places.
//
// A day pack line can be a row the family wrote, a row that started life as a pro
// tip and was accepted onto the day, a tip filed onto the day and not accepted
// yet, or a note. The third kind is the interesting one: it is shown as a line
// with a tick box like the others, and ticking it is what writes the row. So the
// morning reads as one list even though half of it is still advice.
//
// The fourth kind is what the third one turned out to be hiding. Aly files advice
// onto a day whenever it is about that day, and some of that advice is a thing to
// carry while some of it is a fact about the day: the floatplane weighs your bag,
// the crew hands out ponchos, take less than you think. Both used to arrive as a
// line with a tick box, so agreeing with the second kind wrote its whole sentence
// onto the trip's packing list as an item. A note is that second kind: it has no
// tick box, it is not counted, and it is read and cleared instead of packed.
//
// Everything here is pure. Nothing in this file knows about a database, which is
// what lets the same merge run on the day panel and on the Packing page and agree.

import { carryItemOf } from "@/lib/tips/tip";

/** The label for a line that is carried on every day of the trip. */
export const EVERY_DAY = "Every day";

/**
 * Whether a line is a thing you can put in the bag and tick off.
 *
 * The two kinds of advice that arrive on a day are not the same kind of thing. A
 * tip that names an object is a line with a tick box, and accepting it writes
 * that object into the bag and onto the packing list. A tip that says something
 * about the day -- that the floatplane weighs your bag, that the crew hands out
 * ponchos -- names nothing to tick, and it used to get a tick box anyway, which
 * meant agreeing with it put its whole sentence on the packing list as an item.
 * So it is a note now: shown under the bag, worth reading, with nothing to
 * accept and no count of its own.
 */
export function isThing(line) {
  return Boolean(line) && line.kind !== "note";
}

const text = (value) => (typeof value === "string" ? value.trim() : "");
const same = (a, b) => text(a).toLowerCase() === text(b).toLowerCase();

/**
 * A day's lines, in reading order.
 *
 * @param {object} input
 * @param {Array} input.rows  day_pack_items for the trip
 * @param {Array} input.tips  active pro tips with scope 'daypack'
 * @param {string} input.date ISO date, or null for the every-day set on its own,
 *   which is how the Packing page shows the things carried on all of them
 * @param {string[]} input.who names of the travelers on this trip, or empty for
 *   everybody. A line assigned to somebody not going is not on this list.
 * @returns {Array} {key, kind, item, why, assignee, isPacked, everyDay, source,
 *   rowId, tipId, fromPackingId}
 */
export function dayPackLines({ rows = [], tips = [], date = null, who = [] }) {
  const wanted = (assignee) =>
    !who.length ||
    !text(assignee) ||
    same(assignee, "Shared") ||
    who.some((name) => same(name, assignee));

  const mine = (rows || [])
    .filter((row) => row && wanted(row.assignee))
    .filter((row) =>
      date ? !row.item_date || row.item_date === date : !row.item_date,
    );

  const lines = mine.map((row) => ({
    key: `row:${row.id}`,
    kind: "row",
    item: text(row.item),
    why: text(row.why),
    assignee: text(row.assignee) || "Shared",
    isPacked: Boolean(row.is_packed),
    everyDay: !row.item_date,
    source: row.source || "you",
    rowId: row.id,
    tipId: row.from_tip_id || null,
    // The suitcase line this is the same object as, so the screen can ask about
    // the case when somebody takes it off the day.
    fromPackingId: row.from_packing_id || null,
  }));

  // A tip already accepted onto this day is a row now, and the row is what gets
  // shown. Matched on the tip's id rather than on the words, because the family is
  // allowed to rename the line after accepting it and renaming it should not bring
  // the advice back as a second line.
  const taken = new Set(lines.map((line) => line.tipId).filter(Boolean));
  const waiting = (tips || [])
    .filter((tip) => tip && (tip.status || "active") === "active")
    .filter((tip) => (date ? tip.for_date === date : false))
    .filter((tip) => !taken.has(tip.id))
    .map((tip) => {
      // The object, when the tip named one. What goes in the bag is that noun
      // phrase and not the title, because the title is a sentence and a sentence
      // is what nobody wants on their packing list six months later.
      const thing = carryItemOf(tip.carry_item);
      return {
        key: `tip:${tip.id}`,
        kind: thing ? "tip" : "note",
        item: thing || text(tip.title),
        // A thing keeps the tip's sentence as its reason. A note has its title as
        // the thing being said, so the sentence goes underneath it rather than
        // standing in for it.
        why: text(tip.body) || text(tip.because),
        title: text(tip.title),
        assignee: "Shared",
        isPacked: false,
        everyDay: false,
        source: "tip",
        rowId: null,
        tipId: tip.id,
        fromPackingId: null,
      };
    });

  return [...lines, ...waiting].sort(byReadingOrder);
}

// Dated things before every-day things, advice last, and alphabetical inside each
// group so two devices showing the same morning show it in the same order.
function byReadingOrder(a, b) {
  const rank = (line) =>
    line.kind === "note" ? 3 : line.kind === "tip" ? 2 : line.everyDay ? 1 : 0;
  const step = rank(a) - rank(b);
  if (step) return step;
  return a.item.localeCompare(b.item);
}

/**
 * How full each day's pack is, for the index on the Packing page.
 *
 * @param {object} input
 * @param {Array} input.rows day_pack_items for the trip
 * @param {Array} input.tips active daypack-scoped tips
 * @param {string[]} input.days every day of the trip, ISO, in order
 * @returns {Array} {date, total, packed, everyDay} one per day that has anything,
 *   plus the every-day set first when there is one
 */
export function dayPackSummary({ rows = [], tips = [], days = [] }) {
  const out = [];
  const everyDay = (rows || []).filter((row) => row && !row.item_date);
  if (everyDay.length) {
    out.push({
      date: null,
      everyDay: true,
      total: everyDay.length,
      packed: everyDay.filter((row) => row.is_packed).length,
    });
  }
  for (const date of days) {
    // Every-day lines count towards each day, because the count is a promise
    // about what you will find when you open it: five boxes behind "1 of 5", not
    // four and a surprise. They are still listed once under Every day, which is
    // where the set itself is edited.
    const lines = dayPackLines({ rows, tips, date }).filter(isThing);
    if (!lines.length) continue;
    out.push({
      date,
      everyDay: false,
      total: lines.length,
      packed: lines.filter((line) => line.isPacked).length,
    });
  }
  return out;
}

/** "3 of 7", or nothing at all when the day has nothing on it. */
export function packedLabel(lines = []) {
  // Notes are not counted. "1 of 4" has to be a promise about boxes to tick, and
  // counting a thing worth knowing among them makes the day look unfinished
  // forever -- there is nothing to tick on it, so the count could never close.
  const things = (lines || []).filter(isThing);
  if (!things.length) return "";
  const packed = things.filter((line) => line.isPacked).length;
  return `${packed} of ${things.length}`;
}

/** Whether a trip has any day-pack lines or advice at all. */
export function hasDayPack({ rows = [], tips = [] }) {
  return Boolean(
    (rows || []).length ||
    (tips || []).some((tip) => (tip.status || "active") === "active"),
  );
}
