/**
 * Making a long record of places findable.
 *
 * With four past trips a page can just print everything and be read top to
 * bottom. With twenty it cannot: the list is hundreds of cards long, the trip
 * filter is a wall of chips, and the one thing somebody actually came to do —
 * find the restaurant in Juneau, or finish rating last month's trip — is buried.
 *
 * Nothing here talks to the database or to React. It decides what to show, in
 * what order, under which headings.
 */

/** How many cards a section shows before it offers the rest. */
export const SECTION_CAP = 6;

/**
 * Above this many past trips, a row of one chip per trip is worse than a list
 * you pull down, and grouping by kind is worse than grouping by trip.
 */
export const MANY_TRIPS = 6;

export const SORTS = [
  { value: "recent", label: "Most recent" },
  { value: "rated", label: "Highest rated" },
  { value: "name", label: "By name" },
];

/** Group by the trip it happened on, or by what kind of place it is. */
export const GROUPINGS = [
  { value: "trip", label: "By trip" },
  { value: "kind", label: "By kind" },
];

/**
 * A short history reads best by kind — all the stays together, so you can
 * compare them. A long one reads best by trip, because that is how anybody
 * remembers where they have been.
 */
export function defaultGroupBy(tripCount) {
  return Number(tripCount) > MANY_TRIPS ? "trip" : "kind";
}

/** Whether the trip filter should be chips or a pull-down list. */
export function tripFilterAsList(tripCount) {
  return Number(tripCount) > MANY_TRIPS;
}

/** Has anybody said anything at all about this place? */
export function isJudged(item) {
  return Boolean(item?.rating || String(item?.review || "").trim());
}

function haystack(item) {
  return [
    item?.title,
    item?.location,
    item?.notes,
    item?.review,
    item?.trip?.name,
    item?.trip?.destination,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

/**
 * Every word typed has to appear somewhere, in any order. "juneau crab" finds
 * the crab shack in Juneau without anybody having to remember which field the
 * word was in.
 */
export function matchesQuery(item, query) {
  const words = String(query || "")
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean);
  if (words.length === 0) return true;
  const hay = haystack(item);
  return words.every((word) => hay.includes(word));
}

export function filterPlaces({
  items = [],
  query = "",
  tripId = "all",
  unjudgedOnly = false,
} = {}) {
  return items.filter((item) => {
    if (tripId && tripId !== "all" && item?.trip_id !== tripId) return false;
    if (unjudgedOnly && isJudged(item)) return false;
    return matchesQuery(item, query);
  });
}

const byName = (a, b) =>
  String(a?.title || "").localeCompare(String(b?.title || ""));

const byDateDesc = (a, b) => {
  const cmp = String(b?.item_date || "").localeCompare(
    String(a?.item_date || ""),
  );
  return cmp !== 0 ? cmp : byName(a, b);
};

export function sortPlaces(items = [], sort = "recent") {
  const list = items.slice();
  if (sort === "name") return list.sort(byName);
  if (sort === "rated") {
    // An unrated place is not a nought-star place, so it sorts after everything
    // anybody has had an opinion about rather than beneath the worst of them.
    return list.sort((a, b) => {
      const ra = a?.rating || 0;
      const rb = b?.rating || 0;
      if (ra !== rb) return rb - ra;
      return byDateDesc(a, b);
    });
  }
  return list.sort(byDateDesc);
}

/** "3 rated · 2 with nothing said" for one section, or the whole page. */
export function tally(items = []) {
  const total = items.length;
  const judged = items.filter(isJudged).length;
  return { total, judged, unjudged: total - judged };
}

function tripSort(a, b) {
  // Most recently finished first; a trip with no dates falls to the bottom
  // rather than to the top, where it would be read as the latest thing done.
  const ea = String(a?.end_date || "");
  const eb = String(b?.end_date || "");
  if (!ea && !eb)
    return String(a?.name || "").localeCompare(String(b?.name || ""));
  if (!ea) return 1;
  if (!eb) return -1;
  return eb.localeCompare(ea);
}

/**
 * The sections to draw, in order. Empty ones are dropped: a heading over
 * nothing is a heading you have to read to learn it was pointless.
 */
export function groupPlaces({
  items = [],
  by = "kind",
  trips = [],
  kinds = [],
}) {
  if (by === "trip") {
    const known = trips.slice().sort(tripSort);
    const sections = known.map((trip) => ({
      key: trip.id,
      label: [trip.cover_emoji, trip.name].filter(Boolean).join(" ").trim(),
      trip,
      items: items.filter((i) => i.trip_id === trip.id),
    }));
    // A place whose trip is not in the list would otherwise disappear without
    // ever being drawn, which is worse than an odd heading.
    const orphans = items.filter((i) => !known.some((t) => t.id === i.trip_id));
    if (orphans.length) {
      sections.push({
        key: "_other",
        label: "Somewhere else",
        trip: null,
        items: orphans,
      });
    }
    return sections.filter((s) => s.items.length > 0);
  }
  return kinds
    .map((kind) => ({
      key: kind.key,
      label: kind.label,
      blurb: kind.blurb || "",
      trip: null,
      items: items.filter((i) => (kind.categories || []).includes(i.category)),
    }))
    .filter((s) => s.items.length > 0);
}

/**
 * Which sections start open. Grouped by kind there are three and they all open.
 * Grouped by trip there could be twenty, so only the most recent opens —
 * except when a search or a filter has already cut the list down to something
 * short, in which case hiding the few matches behind headings is just work.
 */
export function openByDefault({
  sections = [],
  by = "kind",
  narrowed = false,
}) {
  if (by !== "trip" || narrowed) return sections.map((s) => s.key);
  return sections.slice(0, 1).map((s) => s.key);
}

/** Everything the browsing controls do, in one pass. */
export function browsePlaces({
  items = [],
  trips = [],
  kinds = [],
  query = "",
  tripId = "all",
  unjudgedOnly = false,
  sort = "recent",
  by = "kind",
} = {}) {
  const matched = filterPlaces({ items, query, tripId, unjudgedOnly });
  const ordered = sortPlaces(matched, sort);
  const sections = groupPlaces({ items: ordered, by, trips, kinds });
  const narrowed = Boolean(
    String(query || "").trim() || unjudgedOnly || (tripId && tripId !== "all"),
  );
  return {
    sections,
    narrowed,
    shown: matched.length,
    total: items.length,
    tally: tally(matched),
    open: openByDefault({ sections, by, narrowed }),
  };
}

/** Counts beside each trip in the pull-down, so an empty one is obvious. */
export function tripOptions({ items = [], trips = [] }) {
  return trips
    .slice()
    .sort(tripSort)
    .map((trip) => ({
      id: trip.id,
      name: [trip.cover_emoji, trip.name].filter(Boolean).join(" ").trim(),
      // Grouped in the list by the year the trip ended, which is how anybody
      // narrows down twenty of them.
      year: String(trip.end_date || trip.start_date || "").slice(0, 4) || "",
      count: items.filter((i) => i.trip_id === trip.id).length,
    }));
}

/** The years in the pull-down, newest first, each with its trips. */
export function tripYears(options = []) {
  const years = [];
  for (const option of options) {
    let row = years.find((y) => y.year === option.year);
    if (!row) {
      row = { year: option.year, trips: [] };
      years.push(row);
    }
    row.trips.push(option);
  }
  return years;
}
