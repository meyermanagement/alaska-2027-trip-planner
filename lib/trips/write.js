// Writing a trip: create, update and delete, with the roster, the house
// tasks, the pets, the cover queue and the history of the seven basics.
//
// Moved here unchanged from app/api/chat/apply/route.js so that the assistant
// connection's create_trip and update_trip write a trip exactly the way an
// approved Ask Aly card does, instead of a second copy drifting from it.

import { pushHouseTasks } from "@/lib/tasks/house";
import { coverQueuePatch } from "@/lib/covers/queue";
import { freeTripSlug } from "@/lib/trips/route";
import { BASIC_IDS, basicColumn } from "@/lib/trips/basics";

export async function writeTrip({ supabase, tool, id, patch, familyId, userId }) {
  if (tool === "delete_trip") {
    const { error } = await supabase.from("trips").delete().eq("id", id);
    return { error };
  }

  if (tool === "update_trip") {
    const row = { ...patch };
    // A rename no longer moves the trip: the URL is found by the permanent key,
    // and the readable half is corrected by a redirect when somebody follows an
    // old link. So this is now cosmetic, which is exactly what it should be.
    if (row.name)
      row.slug = await freeTripSlug(supabase, familyId, row.name, id);

    // What the seven said before this change, read before the write rather than
    // after it, because after it there is nothing left to read. Only the seven:
    // a rename or a new emoji is not one of the things a trip is made of.
    // Keyed by the answer rather than the column, because the budget is stored
    // under a different name and its history should still read as "budget".
    const touched = BASIC_IDS.filter((b) => {
      const col = basicColumn(b);
      return b !== "where" && col && row[col] !== undefined;
    });
    // The status is read in the same breath, and only when it is being changed,
    // because Aly moving a draft into Upcoming is the third of the three ways a
    // trip stops being a draft -- and it is the one where nobody is necessarily
    // looking at the trip afterwards. See lib/covers/queue.js.
    const columns = touched.map((b) => basicColumn(b));
    if (row.status !== undefined)
      columns.push("status", "cover_image_url", "cover_image_status");
    let before = null;
    if (columns.length) {
      const { data } = await supabase
        .from("trips")
        .select(columns.join(", "))
        .eq("id", id)
        .maybeSingle();
      before = data || null;
    }
    Object.assign(row, coverQueuePatch(before, row) || {});

    const { error } = await supabase.from("trips").update(row).eq("id", id);
    if (error) return { error };

    // The old answer, kept. A text column remembers only its latest value, and
    // "one apartment in Lisbon, we do not want to move" is worth reading back
    // after two hotels in two regions have overtaken it -- it says something
    // true about the family that the hotels do not.
    //
    // Written after the update and never allowed to fail the change: a history
    // row that could break a trip edit would be a worse feature than no history.
    if (before) {
      const rows = touched
        .filter((b) => {
          const col = basicColumn(b);
          return String(before[col] ?? "") !== String(row[col] ?? "");
        })
        .map((b) => {
          const col = basicColumn(b);
          return {
            trip_id: id,
            basic: b,
            previous_value:
              before[col] === null || before[col] === undefined
                ? null
                : String(before[col]),
            new_value:
              row[col] === null || row[col] === undefined
                ? null
                : String(row[col]),
            changed_by: userId || null,
          };
        });
      if (rows.length) await supabase.from("trip_basic_history").insert(rows);
    }

    // A draft becoming a real trip is the third door into the house list. It got
    // nothing at creation, on purpose -- a draft has no settled start date, so
    // "a week before" measures back from nothing -- and this is the moment it
    // acquires one. The same push, so the same skipping rules and the same
    // refusal to write a second copy of anything already there.
    if (before?.status === "draft" && row.status && row.status !== "draft") {
      try {
        const [{ data: trip }, { data: roster }, { data: people }] =
          await Promise.all([
            supabase
              .from("trips")
              .select("id, status, start_date")
              .eq("id", id)
              .maybeSingle(),
            supabase
              .from("trip_travelers")
              .select("travelers (name, is_person)")
              .eq("trip_id", id),
            supabase
              .from("travelers")
              .select("name, is_person")
              .eq("family_id", familyId),
          ]);
        if (trip) {
          await pushHouseTasks({
            supabase,
            familyId,
            trip,
            going: (roster || [])
              .map((r) => r.travelers)
              .filter((t) => t?.is_person)
              .map((t) => t.name),
            household: (people || [])
              .filter((p) => p.is_person)
              .map((p) => p.name),
            userId,
          });
        }
      } catch {
        // Best effort, same as at creation.
      }
    }
    return { error: null };
  }

  // create_trip
  const row = { ...patch };
  // Not a column on a trip: it exists to trim the packing list to the people
  // who are actually going, so it is read here and never written.
  const going = Array.isArray(row.travelers) ? row.travelers : null;
  delete row.travelers;
  // Same again for the animals: ids, already checked against the family's own
  // pets, carried on the patch because a pet on a trip is a trip_pets row rather
  // than a column. set_pet_trip cannot do this job at creation time — it needs a
  // trip_id, and the trip does not exist until three lines below.
  const petPlans = Array.isArray(row.pets) ? row.pets : null;
  delete row.pets;
  delete row.pet_names;

  row.family_id = familyId;
  row.slug = await freeTripSlug(supabase, familyId, row.name, null);

  const { data: trip, error } = await supabase
    .from("trips")
    .insert(row)
    .select("id, slug, public_id")
    .single();
  if (error) return { error };

  // Who is on a trip is real trip data, not just a hint for the packing list:
  // the Trips page shows it, and the packing list the app works out afterwards
  // reads it. Every seeded trip has one and every trip Aly made had nobody on
  // it, which is why this is written here rather than left to the family.
  const { data: people } = await supabase
    .from("travelers")
    .select("id, name, is_person")
    .eq("family_id", familyId);
  // "Shared" is a traveler row so that things can be assigned to nobody in
  // particular. It is not a person and never belongs on a roster.
  const roster = (people || []).filter(
    (p) => p.name !== "Shared" && (!going || going.includes(p.name)),
  );
  if (roster.length) {
    await supabase
      .from("trip_travelers")
      .insert(roster.map((p) => ({ trip_id: trip.id, traveler_id: p.id })));
  }

  // The household's departure list lands here, unasked.
  //
  // This is deliberately the opposite of how the packing list works four
  // paragraphs down, and the difference is size. A base packing list is 87 items
  // and appearing without being asked for is how it used to feel like a side
  // effect of approving a trip. The house list is a handful of lines the family
  // does on every single departure, and the entire value of writing it down once
  // is never having to remember to attach it. Of the nine trips on the board when
  // this was built, four had no travel-day or night-before task at all.
  //
  // Best effort. A trip that arrives without the bins on it is still the trip
  // they asked for, and the button on the Packing page can put them there.
  try {
    await pushHouseTasks({
      supabase,
      familyId,
      trip: { id: trip.id, status: row.status, start_date: row.start_date },
      // The roster as it was just written, not as it was asked for -- so the
      // empty-house rule reads the same names the trip actually carries.
      going: roster.map((p) => p.name),
      household: (people || []).filter((p) => p.is_person).map((p) => p.name),
      userId,
    });
  } catch {
    // Nothing to say. The list is available on the Packing page either way.
  }

  // The animals go on last, once the trip has an id. Their packing lines are
  // deliberately NOT written here: a new trip has no packing list at all until
  // the family approves start_packing_list, and syncPackingForPet refuses to
  // invent one. fillPackingFromBase picks the animals up when the list is built,
  // so the dog's things arrive with everyone else's rather than as five orphan
  // lines on an otherwise empty list. A pet that fails here does not undo the
  // trip: a trip with the dog missing is still the trip they asked for.
  if (petPlans?.length) {
    // Households with several animals rarely bring all of them, and the ones
    // staying behind are written down too: a cat with no row at all is
    // indistinguishable from a cat nobody has thought about yet, and the whole
    // point of asking was to settle it. Only the traveling ones reach the
    // packing list, which fillPackingFromBase works out for itself by reading
    // the arrangement back off these rows.
    const { data: petRows } = await supabase
      .from("pets")
      .select("id, family_id")
      .eq("family_id", familyId)
      .in(
        "id",
        petPlans.map((x) => x.pet_id),
      );
    const mine = new Set((petRows || []).map((p) => p.id));
    const rows = petPlans
      .filter((plan) => mine.has(plan.pet_id))
      .map((plan) => ({
        trip_id: trip.id,
        pet_id: plan.pet_id,
        arrangement: plan.arrangement || "coming",
        arrangement_notes: plan.arrangement_notes || null,
      }));
    if (rows.length) {
      await supabase
        .from("trip_pets")
        .upsert(rows, { onConflict: "trip_id,pet_id" });
    }
  }

  return {
    error: null,
    slug: trip.slug,
    public_id: trip.public_id,
    id: trip.id,
  };
}
