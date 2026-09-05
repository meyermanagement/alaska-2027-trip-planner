/**
 * What a trip is expected to cost, worked out from the trip itself.
 *
 * There is no separate ledger. A budget is the itinerary read a second way: the
 * flight, the hotel, the whale watching and the one good dinner are already
 * written down with dates and places, and each of them carries two numbers -- what
 * we think it will cost, and what it came to. Adding a "budget item" for a hotel
 * that is already on the itinerary would mean maintaining the same booking twice
 * and watching the two copies drift, so the tab does not offer it.
 *
 * What the itinerary genuinely does not hold is the money that is not an event:
 * groceries, gas, checked bags, souvenirs, boarding the horse. Those are the only
 * lines the family adds by hand, and they live in trip_costs.
 *
 * The groups below are the parts of a trip in the order it gets decided in,
 * because a family that wants to spend less looks for the concession in the same
 * place it made the decision. A group with nothing in it is not drawn.
 *
 * This module does no writing and talks to nothing. The tab, the totals, the
 * feasibility line and Aly's briefing all read these functions, so they cannot
 * disagree about what a trip costs.
 */

/** The groups, in the order a trip gets decided in. */
export const BUDGET_GROUPS = [
  {
    id: "getting_there",
    label: "Getting there",
    // Which itinerary categories land here. A category appears in exactly one.
    categories: ["flight"],
    hint: "Flights, and the fares to get to and from the airport.",
  },
  {
    id: "cruise",
    label: "The cruise",
    categories: ["cruise"],
    hint: "The fare itself, plus what gets added on board.",
  },
  {
    id: "staying",
    label: "Where you stay",
    categories: ["lodging"],
    hint: "Hotels, rentals, lodges — resort fees and taxes included.",
  },
  {
    id: "getting_around",
    label: "Getting around",
    categories: ["transport"],
    hint: "Car rental, gas, trains, parking, transfers.",
  },
  {
    id: "food",
    label: "Food and drink",
    categories: ["dining"],
    hint: "Reservations you can price, and a working number for the rest.",
  },
  {
    id: "doing",
    label: "Things you do",
    categories: ["activity", "excursion"],
    hint: "Tickets, tours, excursions, lessons, entry fees.",
  },
  {
    id: "other",
    label: "Everything else",
    categories: ["note"],
    hint: "Bags, gear, souvenirs, the dog sitter, the passport photos.",
  },
];

/** The categories the family can file a hand-entered cost under. */
export const COST_CATEGORIES = BUDGET_GROUPS.map((g) => g.id);

const GROUP_BY_ID = new Map(BUDGET_GROUPS.map((g) => [g.id, g]));

const GROUP_FOR_CATEGORY = new Map();
for (const group of BUDGET_GROUPS) {
  // A hand-entered cost is filed under a group id directly; an itinerary item
  // arrives with its own category. Both resolve through the same map.
  GROUP_FOR_CATEGORY.set(group.id, group.id);
  for (const category of group.categories) {
    GROUP_FOR_CATEGORY.set(category, group.id);
  }
}

/** The group a category belongs in, falling back to Everything else. */
export function groupIdFor(category) {
  return GROUP_FOR_CATEGORY.get(String(category || "").trim()) || "other";
}

/** The group whose id you have. */
export function budgetGroup(id) {
  return GROUP_BY_ID.get(id) || null;
}

export function groupLabel(id) {
  return budgetGroup(id)?.label || "Everything else";
}

/**
 * A number, or null.
 *
 * Everything from an input arrives as a string, sometimes with a dollar sign and
 * commas in it because that is how people write money. An empty box is null and
 * not zero: "we have not priced this yet" and "this is free" are different
 * answers, and the difference is the whole of whether the totals can be trusted.
 */
export function readMoney(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const text = String(value)
    .replace(/[$,\s]/g, "")
    .trim();
  if (!text) return null;
  const n = Number(text);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

/** Money as a person writes it: $1,240, or $18.50 when the cents matter. */
export function money(value) {
  const n = readMoney(value);
  if (n === null) return "";
  const cents = Math.abs(n % 1) > 0.004;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: cents ? 2 : 0,
    maximumFractionDigits: cents ? 2 : 0,
  });
}

/** Rounded to something a person would say out loud: about $1,200. */
export function roughMoney(value) {
  const n = readMoney(value);
  if (n === null) return "";
  const step = n >= 2000 ? 100 : n >= 200 ? 50 : 10;
  return money(Math.round(n / step) * step);
}

/**
 * One line of a budget, from either source.
 *
 * `paid` is the one figure the rest of the app should use for "what has this
 * cost": the final number when there is one, and the estimate until then. Sums
 * over `paid` are what makes the spent column mean something on a trip that is
 * half booked.
 */
function line(kind, row, opts) {
  const estimate = readMoney(row.cost_estimate);
  const actual = readMoney(row.cost_actual);
  return {
    kind,
    id: row.id,
    label: opts.label,
    sub: opts.sub || "",
    date: opts.date || null,
    status: opts.status || null,
    groupId: opts.groupId,
    estimate,
    actual,
    note: row.cost_note || "",
    priced: estimate !== null || actual !== null,
    settled: actual !== null,
  };
}

/** The date and place under a line's name, said once and short. */
function itemSub(item) {
  const bits = [];
  if (item.item_date) bits.push(item.item_date);
  if (item.location) bits.push(item.location);
  return bits.join(" · ");
}

/**
 * The whole budget of one trip: every line, grouped, with the sums.
 *
 * Cancelled itinerary items are left out entirely. A cancelled tour is not a
 * cheaper tour, it is a tour that is not happening, and leaving its estimate in
 * the total is how a budget quietly lies.
 */
export function buildBudget({ trip, itinerary = [], costs = [] } = {}) {
  const buckets = new Map(
    BUDGET_GROUPS.map((g) => [g.id, { ...g, lines: [] }]),
  );

  for (const item of itinerary) {
    if (!item || item.status === "cancelled") continue;
    const groupId = groupIdFor(item.category);
    const hasMoney =
      readMoney(item.cost_estimate) !== null ||
      readMoney(item.cost_actual) !== null;
    // A note with no money on it is not a cost. Everything else on the itinerary
    // is something the family is doing, so it belongs in the budget even at zero
    // -- an unpriced line is the useful half of this screen.
    if (item.category === "note" && !hasMoney) continue;
    buckets.get(groupId).lines.push(
      line("item", item, {
        label: item.title || "Untitled",
        sub: itemSub(item),
        date: item.item_date || null,
        status: item.status || null,
        groupId,
      }),
    );
  }

  for (const cost of costs) {
    if (!cost) continue;
    const groupId = groupIdFor(cost.category);
    buckets.get(groupId).lines.push(
      line("cost", cost, {
        label: cost.label || "Untitled",
        groupId,
      }),
    );
  }

  const groups = [];
  for (const group of buckets.values()) {
    if (!group.lines.length) continue;
    group.lines.sort((a, b) => {
      if (a.date && b.date && a.date !== b.date)
        return a.date < b.date ? -1 : 1;
      if (a.date && !b.date) return -1;
      if (!a.date && b.date) return 1;
      return a.label.localeCompare(b.label);
    });
    group.estimate = sum(group.lines.map((l) => l.estimate));
    group.actual = sum(group.lines.map((l) => l.actual));
    group.expected = sum(group.lines.map((l) => l.actual ?? l.estimate));
    group.unpriced = group.lines.filter((l) => !l.priced).length;
    groups.push(group);
  }

  const lines = groups.flatMap((g) => g.lines);
  const estimate = sum(lines.map((l) => l.estimate));
  const actual = sum(lines.map((l) => l.actual));
  const expected = sum(lines.map((l) => l.actual ?? l.estimate));
  const target = readMoney(trip?.budget_target);
  const unpriced = lines.filter((l) => !l.priced).length;

  return {
    groups,
    lines,
    target,
    estimate,
    actual,
    // What the trip now looks like it will cost: real numbers where they exist,
    // estimates for everything still ahead.
    expected,
    unpriced,
    settled: lines.filter((l) => l.settled).length,
    // Positive means over the preferred budget. Null when there is no preference
    // to compare with, which is not the same as being on target.
    over: target === null ? null : round(expected - target),
    share: target && target > 0 ? expected / target : null,
  };
}

function sum(values) {
  let total = 0;
  for (const v of values) if (typeof v === "number") total += v;
  return round(total);
}

function round(n) {
  return Math.round(n * 100) / 100;
}

/**
 * How the budget stands, in one sentence, for the tab and for Aly alike.
 *
 * The preferred budget is a preference. Being over it is worth saying plainly
 * and worth saying once; it is not a warning, and nothing about it is red.
 */
export function budgetSentence(budget) {
  if (!budget) return "";
  if (budget.target === null) {
    if (!budget.expected) return "Nothing priced yet.";
    return `${money(budget.expected)} priced so far, with no preferred budget set.`;
  }
  const over = budget.over ?? 0;
  const near = Math.abs(over) <= Math.max(50, budget.target * 0.03);
  if (near)
    return `About on target: ${money(budget.expected)} against ${money(budget.target)}.`;
  if (over > 0)
    return `${roughMoney(over)} over the ${money(budget.target)} you had in mind.`;
  return `${roughMoney(-over)} under the ${money(budget.target)} you had in mind.`;
}

/** The budget as a few lines of text, for Aly's briefing. */
export function budgetBriefing(budget) {
  if (!budget || (!budget.lines.length && budget.target === null)) return "";
  const rows = [];
  if (budget.target !== null)
    rows.push(
      `Preferred budget: ${money(budget.target)} (a target, not a cap).`,
    );
  if (budget.expected)
    rows.push(
      `Priced so far: ${money(budget.expected)}${
        budget.actual ? `, of which ${money(budget.actual)} is final` : ""
      }.`,
    );
  if (budget.unpriced)
    rows.push(
      `${budget.unpriced} thing${budget.unpriced === 1 ? " on the trip still carries" : "s on the trip still carry"} no figure.`,
    );
  for (const group of budget.groups) {
    if (!group.expected) continue;
    rows.push(`- ${group.label}: ${money(group.expected)}`);
  }
  if (budget.over !== null && budget.over > 0)
    rows.push(
      `That is ${money(budget.over)} over the preferred budget. Say where the concessions could come from rather than telling them to spend less.`,
    );
  return rows.join("\n");
}
