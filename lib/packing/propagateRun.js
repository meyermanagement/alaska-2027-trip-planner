// The database half of pushing templates onto upcoming trips.
//
// Kept apart from propagate.js so the planner stays pure and testable, and shared
// by the two ways in: the button on the templates page and Aly doing it when
// asked. Both plan with the same rows and apply with the same statements, so what
// the panel showed is what Aly does.

import { homeToday } from "@/lib/format";
import { planPropagation, SYNCED_FIELDS } from "./propagate";

// A trip in the past is not "upcoming" whatever its status says, and a finished
// or abandoned one is nobody's packing problem.
const CLOSED = ["complete", "cancelled", "canceled"];

/**
 * Everything the planner needs, narrowed to trips that have not started.
 *
 * Animals are left out in both directions. A pet's list is owned by the pets
 * module, which already knows not to put a deleted line back when the dog
 * rejoins a trip, and two systems writing the same rows is how that stops being
 * true.
 */
export async function loadPropagation({ supabase, familyId, today }) {
  const asOf = today || homeToday();

  const [templateRes, templateItemRes, tripRes] = await Promise.all([
    supabase
      .from("packing_templates")
      .select("id, name, is_base, pet_id")
      .eq("family_id", familyId)
      .order("is_base", { ascending: false }),
    supabase
      .from("packing_template_items")
      .select(
        "id, template_id, item, assignee, category, quantity, last_minute",
      )
      .order("sort_order", { ascending: true }),
    supabase
      .from("trips")
      .select("id, name, start_date, status")
      .eq("family_id", familyId)
      .gt("start_date", asOf)
      .order("start_date", { ascending: true }),
  ]);

  const templates = (templateRes.data || []).filter((t) => !t.pet_id);
  const ids = new Set(templates.map((t) => t.id));
  const templateItems = (templateItemRes.data || []).filter((r) =>
    ids.has(r.template_id),
  );
  const trips = (tripRes.data || []).filter(
    (t) => !CLOSED.includes(String(t.status || "").toLowerCase()),
  );

  const { data: tripItems } = trips.length
    ? await supabase
        .from("packing_items")
        .select(
          "id, trip_id, item, assignee, category, quantity, last_minute, is_packed, from_template, pet_id",
        )
        .in(
          "trip_id",
          trips.map((t) => t.id),
        )
        .is("stashed_at", null)
    : { data: [] };

  return {
    templates,
    templateItems,
    trips,
    tripItems: (tripItems || []).filter((r) => !r.pet_id),
    today: asOf,
  };
}

/** Plan without writing anything. */
export async function planFor({ supabase, familyId, today }) {
  const loaded = await loadPropagation({ supabase, familyId, today });
  return {
    ...planPropagation(loaded),
    today: loaded.today,
    considered: loaded.trips.length,
    loaded,
  };
}

/**
 * Do it.
 *
 * Each kind of change is its own statement and there is no transaction across
 * them, so a failure part way through is reported rather than hidden: the counts
 * that come back are what actually landed, and the errors name the trip.
 */
export async function applyPropagation({
  supabase,
  familyId,
  userId,
  today,
  plan,
}) {
  const made = plan || (await planFor({ supabase, familyId, today }));
  const loaded = made.loaded;
  const done = { adds: 0, updates: 0, removes: 0, errors: [] };

  for (const entry of made.trips) {
    if (entry.adds.length) {
      // Appended after what is already there, so a push never reshuffles a list
      // somebody has been reading down.
      const mine = (loaded?.tripItems || []).filter(
        (r) => r.trip_id === entry.trip_id,
      );
      let next = mine.length;
      const { error } = await supabase.from("packing_items").insert(
        entry.adds.map((a) => ({
          trip_id: entry.trip_id,
          item: a.item,
          assignee: a.assignee,
          // NOT NULL with a default, so an untidy template row still lands
          // somewhere findable rather than failing the whole insert.
          category: a.category || "General",
          quantity: a.quantity,
          last_minute: a.last_minute,
          from_template: true,
          sort_order: ++next,
          created_by: userId || null,
        })),
      );
      if (error) done.errors.push(`${entry.trip}: ${error.message}`);
      else done.adds += entry.adds.length;
    }

    for (const u of entry.updates) {
      const patch = {};
      if (userId) patch.updated_by = userId;
      for (const field of SYNCED_FIELDS)
        if (field in u.changes) patch[field] = u.changes[field];
      const { error } = await supabase
        .from("packing_items")
        .update(patch)
        .eq("id", u.id);
      if (error) done.errors.push(`${entry.trip}: ${error.message}`);
      else done.updates += 1;
    }

    if (entry.removes.length) {
      const { error } = await supabase
        .from("packing_items")
        .delete()
        .in(
          "id",
          entry.removes.map((r) => r.id),
        );
      if (error) done.errors.push(`${entry.trip}: ${error.message}`);
      else done.removes += entry.removes.length;
    }
  }

  return { applied: done, totals: made.totals };
}
