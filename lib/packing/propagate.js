// Pushing template changes onto the trips that have not happened yet.
//
// A trip's packing list is a copy taken when the trip was built, not a live view
// of the template. That is usually right -- what you decide about Alaska should
// not rewrite itself when you tidy the base list. But when you have just fixed
// something on a template, "and do that everywhere it still matters" is a real
// thing to want, and doing it by hand across five trips is how it stops getting
// done.
//
// So this is a deliberate push rather than a sync. Nothing here runs on its own.
// It plans first, in full, and the plan is what gets shown before anything is
// written.
//
// Three rules keep it from being dangerous:
//
//   1. Only lines that came off a template are ever removed. That is what the
//      from_template column is for. Anything typed by hand, invented by the
//      model, or filed by the tips pass is left alone forever -- without that,
//      a removal pass would offer to delete most of the Alaska list.
//   2. Removal needs the line to be gone from EVERY template, not just from the
//      one being pushed. Otherwise a line living on both the base list and an
//      add-on would be removed by whichever push saw it missing.
//   3. Additions are scoped. The base list is the one every trip starts from, so
//      its new lines go everywhere. An add-on only goes to trips already using
//      it, because "Snorkel and mask" has no business on the horse show.

const clean = (value) => String(value ?? "").trim();

/** Who a line belongs to, with the column's own default applied. */
export const owner = (row) => clean(row?.assignee) || "Shared";

/**
 * The identity of a packing line: its name, and whose it is.
 *
 * Case and inner whitespace are ignored, because "Rain Jacket" and "rain jacket"
 * are one item and nobody should have to know which they typed. The owner is
 * part of the identity, so Mark's toothbrush and Veda's toothbrush are two
 * things -- which also means moving a line to somebody else on the template
 * reads as one removal and one addition rather than a silent change of hands.
 */
export function itemKey(row) {
  const name = clean(row?.item).replace(/\s+/g, " ").toLowerCase();
  if (!name) return "";
  return `${name}|${owner(row).toLowerCase()}`;
}

/** The fields a push is allowed to change on a line that already exists. */
export const SYNCED_FIELDS = ["category", "quantity", "last_minute"];

const normalized = (field, value) => {
  if (field === "last_minute") return !!value;
  const text = clean(value);
  return text || null;
};

/**
 * How much of an add-on a trip has to be carrying before the app treats the trip
 * as using it.
 *
 * An add-on is not the base list: "Snorkel and mask" has no business turning up
 * on the horse show because both lists happen to mention sunscreen. Measured
 * against the family's real data, the genuine matches are unambiguous and the
 * coincidences are not close to them -- Disney Parks is 83% present on the Disney
 * trip, Caribbean is 100% present on Curaçao, Alaska Cruise is 100% present on
 * Alaska, while the accidental overlaps sit at 43% and 52%. Seven in ten has
 * daylight on both sides of it.
 *
 * This is now the fallback rather than the rule. A trip that says which add-ons
 * it uses is believed, because a trip stating what it is beats a guess read off
 * what it happens to be carrying -- and the guess has a real failure the link
 * removes. The percentages above were measured on 22- and 23-line add-ons, where
 * seven in ten means something; on the four-line Cruise Add-ons list three
 * coincidences are a match, which today scores 100% against the Disney resort
 * trip and 50% against the actual Alaska cruise. Inference stays for trips that
 * have never been asked, so nothing that worked before stops working.
 */
export const ADDON_SHARE = 0.7;
export const ADDON_MIN = 3;

/**
 * An empty field on a template is silence, not an instruction.
 *
 * The base list leaves most quantities blank while the trips that grew out of it
 * have real numbers on them. Treating blank as an answer would wipe 55 quantities
 * off one trip on the first push, which is not what anybody means by "apply my
 * template changes". So a blank template field is skipped and the trip keeps what
 * it has. The cost is that you cannot clear a quantity from the template, which
 * is the cheaper mistake by a wide margin.
 *
 * A checkbox is different: false is a real answer there, and unticking
 * "cannot be packed ahead" has to be able to travel.
 */
function opinionated(field, value) {
  if (field === "last_minute") return true;
  return clean(value) !== "";
}

/**
 * What a push would do, trip by trip. Pure: give it rows, get back a plan.
 *
 * @param templates      [{ id, name, is_base }]
 * @param templateItems  [{ template_id, item, assignee, category, quantity, last_minute }]
 * @param trips          [{ id, name, start_date, status }] already narrowed to
 *                       the ones in scope by date
 * @param tripItems      [{ id, trip_id, item, assignee, category, quantity,
 *                       last_minute, is_packed, from_template }]
 * @returns {{ trips: Array, totals: { adds, removes, updates, trips } }}
 */
export function planPropagation({
  templates = [],
  templateItems = [],
  trips = [],
  tripItems = [],
  // [{ trip_id, template_id }] -- which add-ons each trip says it uses. A trip
  // absent from this list has not been asked and is inferred as before.
  tripTemplates = [],
} = {}) {
  const chosenByTrip = new Map();
  for (const row of tripTemplates) {
    if (!row?.trip_id || !row?.template_id) continue;
    if (!chosenByTrip.has(row.trip_id))
      chosenByTrip.set(row.trip_id, new Set());
    chosenByTrip.get(row.trip_id).add(row.template_id);
  }
  const base = templates.find((t) => t?.is_base) || null;
  const byTemplate = new Map();
  for (const t of templates) byTemplate.set(t.id, { ...t, keys: new Map() });

  // Every key that exists on any template at all. Rule 2 above.
  const anywhere = new Set();
  for (const row of templateItems) {
    const k = itemKey(row);
    if (!k) continue;
    anywhere.add(k);
    const holder = byTemplate.get(row.template_id);
    if (holder && !holder.keys.has(k)) holder.keys.set(k, row);
  }

  // A push with nothing to push is not a push. Without this, a family with no
  // templates -- or a query that came back empty because something upstream failed
  // -- would produce a plan that deletes every template-derived line on every
  // upcoming trip, which is the single worst thing this file could do.
  if (!anywhere.size) {
    return {
      trips: [],
      totals: { adds: 0, removes: 0, updates: 0, trips: 0 },
      base,
    };
  }

  const itemsByTrip = new Map();
  for (const row of tripItems) {
    if (!itemsByTrip.has(row.trip_id)) itemsByTrip.set(row.trip_id, []);
    itemsByTrip.get(row.trip_id).push(row);
  }

  const out = [];
  const totals = { adds: 0, removes: 0, updates: 0, trips: 0 };

  for (const trip of trips) {
    const mine = itemsByTrip.get(trip.id) || [];
    const mineByKey = new Map();
    for (const row of mine) {
      const k = itemKey(row);
      // A trip carrying the same line twice is a bug we have seen; the first one
      // wins here and the duplicate is left for the trip screen to show.
      if (k && !mineByKey.has(k)) mineByKey.set(k, row);
    }

    // Which templates this trip counts as using. The base list always. For the
    // add-ons: what the trip says, if it has been asked, and otherwise the old
    // guess from what it is already carrying.
    // Asked is a fact about the trip, not about whether any rows came back: a
    // trip that deliberately uses no add-ons has been asked and answered "none",
    // and handing it back to the guess would put them straight back.
    const asked = !!trip.templates_chosen_at;
    const chosen = asked ? chosenByTrip.get(trip.id) || new Set() : null;
    const inScope = [];
    for (const t of byTemplate.values()) {
      if (t.is_base) {
        inScope.push(t);
        continue;
      }
      const size = t.keys.size;
      if (!size) continue;
      if (chosen) {
        // Asked and answered. An add-on the trip did not choose is out even if
        // every one of its lines happens to be present, which is the case the
        // inference got wrong.
        if (chosen.has(t.id)) inScope.push(t);
        continue;
      }
      let hits = 0;
      for (const k of t.keys.keys()) if (mineByKey.has(k)) hits += 1;
      if (hits >= ADDON_MIN && hits / size >= ADDON_SHARE) inScope.push(t);
    }

    const adds = [];
    const updates = [];
    const removes = [];
    const seen = new Set();

    for (const t of inScope) {
      for (const [k, row] of t.keys) {
        if (seen.has(k)) continue;
        seen.add(k);
        const existing = mineByKey.get(k);
        if (!existing) {
          adds.push({
            // A proposed add has no row id yet, so it needs a name the server can
            // recognize when it replans. The trip plus the item key is enough: a
            // trip cannot be told to add the same item for the same person twice,
            // because `seen` above stops the second template proposing it.
            key: `a|${trip.id}|${k}`,
            template: t.name,
            item: clean(row.item),
            assignee: owner(row),
            category: clean(row.category) || null,
            quantity: clean(row.quantity) || null,
            last_minute: !!row.last_minute,
          });
          continue;
        }
        if (existing.pet_id) continue;
        const changes = {};
        for (const field of SYNCED_FIELDS) {
          if (!opinionated(field, row[field])) continue;
          const want = normalized(field, row[field]);
          const have = normalized(field, existing[field]);
          if (want !== have) changes[field] = want;
        }
        if (Object.keys(changes).length)
          updates.push({
            key: `u|${existing.id}`,
            id: existing.id,
            item: clean(existing.item),
            assignee: owner(existing),
            template: t.name,
            changes,
            was: Object.fromEntries(
              Object.keys(changes).map((f) => [f, normalized(f, existing[f])]),
            ),
          });
      }
    }

    for (const row of mine) {
      if (!row.from_template) continue;
      // An animal's line is not this module's to delete. The horse's feed, hay,
      // water buckets and muck fork come off a pet template, which a family push
      // deliberately never reads -- so every one of them looks like a line no
      // template holds, and the button that pushes template edits to trips would
      // have quietly emptied the horse's half of the list. lib/pets/packing.js
      // owns these rows and syncs them from whether the animal is coming.
      if (row.pet_id) continue;
      const k = itemKey(row);
      if (!k || anywhere.has(k)) continue;
      removes.push({
        key: `r|${row.id}`,
        id: row.id,
        item: clean(row.item),
        assignee: owner(row),
        category: clean(row.category) || null,
        is_packed: !!row.is_packed,
      });
    }

    if (adds.length || updates.length || removes.length) {
      totals.trips += 1;
      totals.adds += adds.length;
      totals.updates += updates.length;
      totals.removes += removes.length;
      out.push({
        trip_id: trip.id,
        trip: clean(trip.name),
        start_date: trip.start_date || null,
        status: clean(trip.status) || null,
        using: inScope.map((t) => t.name),
        adds,
        updates,
        removes,
      });
    }
  }

  return { trips: out, totals, base: base ? base.name : null };
}
