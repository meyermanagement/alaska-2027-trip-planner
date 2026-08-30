/**
 * The trip taking shape, read out of the conversation that is building it.
 *
 * A builder conversation is a stream of words with confirmation cards in it, and
 * that is a bad way to see a trip. By the fourth exchange the destination is
 * eight hundred pixels up the panel, half the itinerary was proposed in one card
 * and half in another, and the only way to know what the trip actually says now
 * is to save everything and go and look at the page. So people save early to see
 * where they are, which is the opposite of what a draft is for.
 *
 * The fix is not more prose. It is one thing on the screen that IS the trip, kept
 * current as the conversation goes: the six basics, what is on the itinerary, what
 * is on the packing list, what still has to be booked. It updates twice per
 * exchange -- once when Aly proposes a change, faintly, and again when the family
 * presses the card and it becomes real.
 *
 * Everything here is a pure reduction over the actions the chat panel already
 * holds. There is no fetch, no clock and no database: the panel knows what has
 * been proposed and what has been saved, and this file turns those two lists into
 * a trip-shaped object that the existing basics helpers can read. Deriving it
 * rather than storing it means the artifact cannot drift out of step with the
 * cards -- there is only one source of truth, and it is the actions.
 */

/** Trip columns the artifact tracks, in the order they matter on screen. */
const TRIP_FIELDS = [
  "name",
  "destination",
  "start_date",
  "end_date",
  "date_note",
  "dates_approximate",
  "status",
  "cover_emoji",
  "summary",
  "getting_there",
  "staying",
  "doing",
  "getting_around",
];

const LIST_FOR_TOOL = {
  add_itinerary_item: "itinerary",
  add_packing_item: "packing",
  add_task: "tasks",
  add_note: "notes",
};

const clean = (value) =>
  value === null || value === undefined ? "" : String(value).trim();

/** An artifact with nothing in it yet. */
export function emptyArtifact() {
  return {
    trip: {},
    pendingFields: [],
    itinerary: [],
    packing: [],
    tasks: [],
    notes: [],
    travelers: [],
    pets: [],
    created: false,
    createdPending: false,
    pendingCount: 0,
    empty: true,
  };
}

function rowFrom(action, pending) {
  const patch = action?.patch || {};
  return {
    title: clean(patch.title) || clean(patch.item) || clean(patch.body),
    date: clean(patch.item_date) || clean(patch.due_date),
    time: clean(patch.start_time),
    category: clean(patch.category),
    assignee: clean(patch.assignee),
    timing: clean(patch.timing),
    status: clean(patch.status),
    pending,
  };
}

/**
 * The trip as the conversation has it so far.
 *
 * Two lists in, one artifact out. Saved actions are applied first and proposed
 * ones on top, so a proposal that changes a field the family already saved shows
 * the new value -- marked as not saved rather than quietly replacing it, because
 * "the dates are wrong on the card" has to be visible before the card is pressed,
 * not after.
 */
export function buildArtifact(applied = [], proposed = []) {
  const art = emptyArtifact();
  const pendingFields = new Set();

  const step = (action, pending) => {
    const tool = action?.tool;
    if (!tool) return;
    if (tool === "create_trip" || tool === "update_trip") {
      const patch = action.patch || {};
      for (const field of TRIP_FIELDS) {
        if (patch[field] === undefined || patch[field] === null) continue;
        const value = patch[field];
        if (typeof value === "string" && !value.trim()) continue;
        art.trip[field] = value;
        if (pending) pendingFields.add(field);
        else pendingFields.delete(field);
      }
      if (Array.isArray(patch.travelers)) {
        art.travelers = patch.travelers.map((t) => clean(t)).filter(Boolean);
      }
      if (Array.isArray(patch.pets)) {
        art.pets = patch.pets
          .map((p) => ({
            name: clean(p?.name || p),
            arrangement: clean(p?.arrangement),
          }))
          .filter((p) => p.name);
      }
      if (tool === "create_trip") {
        if (pending) art.createdPending = true;
        else {
          art.created = true;
          art.createdPending = false;
        }
      }
      return;
    }
    const list = LIST_FOR_TOOL[tool];
    if (list) art[list].push(rowFrom(action, pending));
  };

  for (const action of applied) step(action, false);
  for (const action of proposed) step(action, true);

  art.pendingFields = [...pendingFields];
  // Counted the way the family would count it: things to approve, not columns.
  // A card that fills in four fields of one trip is one waiting change, and
  // saying "5 waiting" for it would make the number mean nothing.
  art.pendingCount =
    (art.pendingFields.length || art.createdPending ? 1 : 0) +
    art.itinerary.filter((r) => r.pending).length +
    art.packing.filter((r) => r.pending).length +
    art.tasks.filter((r) => r.pending).length +
    art.notes.filter((r) => r.pending).length;
  art.empty =
    Object.keys(art.trip).length === 0 &&
    !art.itinerary.length &&
    !art.packing.length &&
    !art.tasks.length &&
    !art.notes.length;
  return art;
}

/** Whether one of the trip columns is showing an unsaved value. */
export function isPendingField(art, field) {
  return Boolean(art?.pendingFields?.includes(field));
}

/**
 * The itinerary grouped by day, in date order, with undated items last.
 *
 * A flat list of eleven things is not an itinerary; a list of four days is. Items
 * with no date keep their own group at the end rather than being dropped, because
 * an undated item is usually one Aly has not finished placing and hiding it would
 * make her look like she had forgotten it.
 */
export function artifactDays(art) {
  const groups = new Map();
  for (const row of art?.itinerary || []) {
    const key = row.date || "";
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(row);
  }
  const dated = [...groups.keys()].filter(Boolean).sort();
  const order = groups.has("") ? [...dated, ""] : dated;
  return order.map((date) => ({
    date,
    items: groups.get(date),
    pending: groups.get(date).every((r) => r.pending),
  }));
}

/**
 * One line saying what the artifact is, for the strip when it is collapsed.
 *
 * Written so the collapsed state is still worth reading: a count of what is on
 * the trip, and the number of unsaved changes when there are any, because that
 * is the one number somebody needs before they decide to open it again.
 */
export function artifactSummaryLine(art) {
  if (!art || art.empty) return "";
  const bits = [];
  const counts = [
    [art.itinerary.length, "itinerary item"],
    [art.packing.length, "packing item"],
    [art.tasks.length, "task"],
    [art.notes.length, "note"],
  ];
  for (const [n, word] of counts) {
    if (n) bits.push(`${n} ${word}${n === 1 ? "" : "s"}`);
  }
  const body = bits.length ? bits.join(", ") : "nothing on it yet";
  if (!art.pendingCount) return body;
  return `${body} · ${art.pendingCount} not saved yet`;
}

/**
 * What the panel calls the thing, which depends on whether it exists.
 *
 * A trip nobody has approved yet must not be called a trip in the past tense.
 * The distinction is small and worth keeping: it is the difference between the
 * screen reporting and the screen promising.
 */
export function artifactTitle(art, { logged = false } = {}) {
  const name = clean(art?.trip?.name);
  if (name) return name;
  if (logged) return "The trip you are logging";
  return "The trip so far";
}
