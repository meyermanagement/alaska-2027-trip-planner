import { syncPackingForPet } from "@/lib/pets/packing";
import { isComing } from "@/lib/pets/pets";
import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  validateAction,
  pendingTripNames,
  FAMILY_TABLES,
  EDIT_TOOLS,
  REVIEW_TOOLS,
} from "@/lib/agent/tools";
import { appendMessage, ensureConversation } from "@/lib/agent/thread";
import { WIPE_TOOLS } from "@/lib/agent/groups";
import { copiedTemplateItems } from "@/lib/packing/copy";
import { tidyStranded } from "@/lib/packing/roster";
import { sendTravelerInvite, siteOrigin } from "@/lib/email/sendInvite";
import { REFUSAL, SECONDARY, resolveAccess } from "@/lib/travelers/access";
import { tripPath, tripRef, freeTripSlug } from "@/lib/trips/route";

export const runtime = "nodejs";
// Writing eighty rows one at a time can outlast the default budget, and a
// timeout here reads to the family as a network error.
export const maxDuration = 60;

// Where the result of each change is actually visible. A confirmation that does
// not say "and here it is" leaves the family to go and find it, which is the
// difference between being told something was saved and being shown it.
// Trip-scoped tools name a tab on the trip screen; the rest name a whole screen.
const LANDING_TAB = {
  add_itinerary_item: "itinerary",
  update_itinerary_item: "itinerary",
  delete_itinerary_item: "itinerary",
  add_packing_item: "packing",
  update_packing_item: "packing",
  delete_packing_item: "packing",
  start_packing_list: "packing",
  clear_packing_list: "packing",
  tidy_packing_list: "packing",
  add_task: "tasks",
  update_task: "tasks",
  delete_task: "tasks",
  add_note: "notes",
  update_note: "notes",
  delete_note: "notes",
};

const TAB_WORDS = {
  itinerary: "itinerary",
  packing: "packing list",
  tasks: "tasks",
  notes: "notes",
};

const LANDING_PATH = {
  add_pet: ["/family", "the Family tab"],
  update_pet: ["/family", "the Family tab"],
  delete_pet: ["/family", "the Family tab"],
  add_preference: ["/family", "the Family tab"],
  update_preference: ["/family", "the Family tab"],
  delete_preference: ["/family", "the Family tab"],
  set_person_details: ["/family", "the Family tab"],
  set_person_email: ["/family", "the Family tab"],
  add_rewards_program: ["/wallet", "the Wallet"],
  update_rewards_program: ["/wallet", "the Wallet"],
  delete_rewards_program: ["/wallet", "the Wallet"],
  create_template: ["/packing", "the packing templates"],
  add_template_item: ["/packing", "the packing templates"],
  update_template_item: ["/packing", "the packing templates"],
  delete_template_item: ["/packing", "the packing templates"],
  update_review: ["/preferences", "the reviews"],
};

// Three is enough to cover a trip, its itinerary and its packing list without
// turning the receipt into a menu.
const MAX_LINKS = 3;

// High enough that a whole pasted itinerary or a full family packing list goes
// in one card, low enough that a runaway model cannot rewrite the trip.
const MAX_ACTIONS = 80;

// The only changes a secondary traveler may make, and only to their own row.
const SECONDARY_WRITES = {
  update_packing_item: "is_packed",
  update_task: "is_done",
  set_person_details: "about_me",
};

function secondaryRefusal(access, action) {
  if (access?.level !== SECONDARY) return null;

  const flag = SECONDARY_WRITES[action.tool];
  if (!flag) return REFUSAL;

  // Describing yourself is the one thing on a person that the person owns, so a
  // secondary may write it -- but on their own row and nowhere else. Ownership
  // has to be checked here rather than left to the database, because the people
  // list a secondary can read includes the whole family: "put down that Mark
  // loves hiking" resolves perfectly well to Mark, and the database would then
  // filter the write away without raising, which is how somebody gets told a
  // change was saved when it was not.
  if (action.tool === "set_person_details") {
    const mine = access?.travelerId || null;
    if (!mine || action.patch?.traveler_id !== mine) {
      return "You can tell me what you are like on a trip, but only about yourself — a primary traveler can write that for somebody else.";
    }
  }

  // Only the flag itself, and nothing else about the row.
  const patch = action.patch || {};
  const touched = Object.keys(patch).filter(
    (k) =>
      k !== flag &&
      patch[k] !== undefined &&
      // Which person the change is about is not a change to them.
      !(action.tool === "set_person_details" && k === "traveler_id"),
  );
  if (touched.length) {
    if (action.tool === "set_person_details") {
      return "You can tell me what you are like on a trip, but the rest of your details are for a primary traveler to change.";
    }
    return action.tool === "update_task"
      ? "You can finish your own tasks, but not change what they say."
      : "You can check your own things off the list, but not change them.";
  }

  // Ownership needs no check here. The lookups this route builds above run under
  // the asking person's own read policy, so for a secondary traveler the packing
  // and task maps contain only rows assigned to them -- validateAction resolving
  // "check off the sunscreen" simply cannot land on somebody else's sunscreen,
  // and an id for a row they cannot see fails to resolve. Re-querying it here
  // would ask the same policy the same question twice.
  return null;
}

export async function POST(request) {
  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }

  const tripId = payload?.tripId || null;
  const incoming = Array.isArray(payload?.actions) ? payload.actions : [];
  if (incoming.length === 0) {
    return NextResponse.json({ error: "Bad request." }, { status: 400 });
  }
  if (incoming.length > MAX_ACTIONS) {
    return NextResponse.json(
      {
        error: `That is ${incoming.length} changes at once, and ${MAX_ACTIONS} is the limit. Send it in a couple of smaller pieces.`,
      },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Please sign in again." },
      { status: 401 },
    );
  }

  // The family this user writes into. RLS enforces it too; we need the id.
  const access = await resolveAccess(supabase, user);
  const familyId = access?.familyId;
  if (!familyId) {
    return NextResponse.json(
      { error: "No family group found." },
      { status: 403 },
    );
  }

  if (tripId) {
    const { data: trip } = await supabase
      .from("trips")
      .select("id")
      .eq("id", tripId)
      .maybeSingle();
    if (!trip) {
      return NextResponse.json({ error: "Trip not found." }, { status: 404 });
    }
  }

  // Re-derive which ids the user may touch, across every trip the family has.
  // The client is never trusted. RLS keeps all of this inside the family.
  const [
    itin,
    pack,
    task,
    notes,
    travelers,
    trips,
    prefs,
    templates,
    templateItems,
    pets,
    lessons,
    rewards,
  ] = await Promise.all([
    supabase.from("itinerary_items").select("id, title, trip_id"),
    supabase
      .from("packing_items")
      .select("id, item, trip_id")
      .is("stashed_at", null),
    supabase.from("predeparture_tasks").select("id, title, trip_id"),
    supabase.from("trip_notes").select("id, title, body, trip_id"),
    supabase.from("travelers").select("id, name").order("sort_order"),
    supabase.from("trips").select("id, name, slug, public_id"),
    supabase.from("travel_preferences").select("id, body"),
    supabase.from("packing_templates").select("id, name, is_base"),
    supabase.from("packing_template_items").select("id, item, template_id"),
    // The family's animals, their lessons and their loyalty numbers. These are
    // read here for the same reason as everything above: this route revalidates
    // from scratch, and a table it does not load is a table Aly can never touch.
    // Leaving pets out meant every card that put an animal on a trip came back
    // as "I have no pets on file for this family" while the animal sat in the
    // database, and the trip the card was really about was lost with it.
    supabase.from("pets").select("id, name"),
    supabase.from("lessons").select("id, subject"),
    supabase.from("rewards_programs").select("id, brand"),
  ]);

  // Which trip each row sits in, so an edit lands on the right trip even when
  // the user is looking at a different one.
  const rowTrip = new Map();
  for (const rows of [itin.data, pack.data, task.data, notes.data]) {
    for (const r of rows || []) rowTrip.set(r.id, r.trip_id);
  }

  const known = {
    itinerary_items: new Map((itin.data || []).map((r) => [r.id, r.title])),
    packing_items: new Map((pack.data || []).map((r) => [r.id, r.item])),
    predeparture_tasks: new Map((task.data || []).map((r) => [r.id, r.title])),
    trip_notes: new Map(
      (notes.data || []).map((r) => [
        r.id,
        (r.title || r.body || "").slice(0, 60),
      ]),
    ),
    trips: new Map((trips.data || []).map((r) => [r.id, r.name])),
    // Not part of validation: carried alongside it so the receipt can build a
    // link without a second read of the table.
  };
  const tripRefs = new Map(
    (trips.data || []).map((r) => [
      r.id,
      { slug: r.slug, public_id: r.public_id, name: r.name },
    ]),
  );
  Object.assign(known, {
    travel_preferences: new Map(
      (prefs.data || []).map((r) => [r.id, (r.body || "").slice(0, 60)]),
    ),
    packing_templates: new Map(
      (templates.data || []).map((r) => [
        r.id,
        { name: r.name, is_base: Boolean(r.is_base) },
      ]),
    ),
    packing_template_items: new Map(
      (templateItems.data || []).map((r) => [
        r.id,
        { item: r.item, template_id: r.template_id },
      ]),
    ),
    pets: new Map((pets.data || []).map((r) => [r.id, r.name])),
    lessons: new Map(
      (lessons.data || []).map((r) => [r.id, (r.subject || "").slice(0, 60)]),
    ),
    rewards_programs: new Map(
      (rewards.data || []).map((r) => [r.id, (r.brand || "").slice(0, 60)]),
    ),
    rowTrip,
  });
  const travelerNames = Array.from(
    new Set([...(travelers.data || []).map((t) => t.name), "Shared"]),
  );
  const travelerIds = new Map(
    (travelers.data || [])
      .filter((t) => t.id && t.name)
      .map((t) => [t.name, t.id]),
  );

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const results = [];
  // Trips created in this batch, so the client can navigate to a new one.
  let createdSlug = null;
  let createdTripId = null;
  // A new trip whose packing list is currently just the family base template.
  // Generating a real one takes a model call, and making the family wait for it
  // behind the Apply button would be the wrong trade — so the trip is saved with
  // the template and the client asks for the better list straight afterwards.
  let packingTripId = null;
  // Deleting the trip pulls the ground out from under whoever asked: the page
  // they are standing on no longer exists. The client has to be told so it can
  // move them, rather than refreshing into a 404.
  const deletedTripIds = [];
  // { href, label } per change that worked, in the order they were applied.
  const landed = [];

  // A trip has to exist before anything can go inside it, so new trips are
  // written first no matter what order they arrived in. Emptying a list comes
  // next, so a replacement list written in the same batch survives the wipe.
  // Everything else keeps the order the family approved it in.
  const rank = (a) =>
    a?.tool === "create_trip" || a?.tool === "create_template"
      ? 0
      : WIPE_TOOLS.has(a?.tool)
        ? 1
        : 2;
  const ordered = incoming
    .map((a, i) => ({ a, i }))
    .sort((x, y) => rank(x.a) - rank(y.a) || x.i - y.i)
    .map(({ a }) => a);
  // Names of trips this batch is about to create, so their contents validate
  // against a trip that does not have an id yet.
  const pendingTrips = pendingTripNames(ordered);

  for (const raw of ordered) {
    // Revalidate from scratch rather than trusting the client's patch.
    const { action, error } = validateAction(
      { name: raw?.tool, args: { ...(raw?.patch || {}), id: raw?.id } },
      { travelerNames, travelerIds, known, focusTripId: tripId, pendingTrips },
    );

    if (!action) {
      results.push({ ok: false, summary: raw?.summary || "Change", error });
      continue;
    }

    // A secondary traveler reaches this route at all only through a narrowed
    // toolset, so anything arriving here that is not their own check-off did not
    // come from a screen they were shown. Checked again anyway, because the
    // client sends this list and the client is not the authority. The database
    // would refuse the write too, but silently: row-level security filters a
    // forbidden UPDATE away rather than raising, so without this the family would
    // be told the change was saved when nothing happened.
    const refusal = secondaryRefusal(access, action);
    if (refusal) {
      results.push({ ok: false, summary: action.summary, error: refusal });
      continue;
    }

    // Its trip was approved in a different chunk that has not been applied yet.
    if (action.needsTrip) {
      results.push({
        ok: false,
        summary: action.summary,
        error: `Approve the new trip “${action.needsTrip}” first, then this will save into it.`,
      });
      continue;
    }

    const { tool, table, id, patch = {} } = action;
    let dbError = null;
    // Copying is worth counting out loud: "start a Disney list from this trip"
    // is a fair thing to ask and a terrible thing to guess at.
    let extra = "";

    try {
      if (table === "trips") {
        const outcome = await writeTrip({
          supabase,
          tool,
          id,
          patch,
          familyId,
        });
        dbError = outcome.error;
        if (outcome.slug) createdSlug = outcome.slug;
        if (!outcome.error && tool === "create_trip" && outcome.id) {
          tripRefs.set(outcome.id, {
            slug: outcome.slug,
            public_id: outcome.public_id,
            name: patch.name,
          });
          createdTripId = outcome.id;
        }
        if (!outcome.error && tool === "delete_trip" && id) {
          deletedTripIds.push(id);
          known.trips.delete(id);
        }
        // The trip now exists, so the rows that named it can resolve to its id.
        if (!outcome.error && tool === "create_trip" && outcome.id) {
          known.trips.set(outcome.id, patch.name);
          const at = pendingTrips.indexOf(patch.name);
          if (at >= 0) pendingTrips.splice(at, 1);
        }
      } else if (tool === "create_template") {
        const outcome = await writeTemplate({ supabase, patch, familyId });
        dbError = outcome.error;
        if (outcome.id) {
          // Anything else in this batch that named the new list can now find it.
          known.packing_templates.set(outcome.id, {
            name: patch.name,
            is_base: false,
          });
        }
        if (!outcome.error) {
          extra = outcome.copied
            ? ` — ${outcome.copied} item${outcome.copied === 1 ? "" : "s"} copied${
                outcome.skipped
                  ? `, ${outcome.skipped} left off because the base list already covers them`
                  : ""
              }`
            : " — empty for now";
        }
      } else if (tool === "start_packing_list") {
        const outcome = await fillPackingFromBase({
          supabase,
          tripId: patch.trip_id,
          familyId,
        });
        dbError = outcome.error;
        if (!outcome.error) {
          // The smarter pass runs from the panel once this is saved, so what is
          // reported here is the floor rather than the finished list.
          packingTripId = patch.trip_id;
          extra = outcome.copied
            ? ` — ${outcome.copied} item${outcome.copied === 1 ? "" : "s"} from your base list to start with`
            : " — nothing on your base list to start from";
        }
      } else if (tool === "tidy_packing_list") {
        // Worked out here rather than promised in the summary: the roster is read
        // at the moment this runs, so what comes off the list is what is actually
        // stranded now.
        const [{ data: roster }, { data: family }] = await Promise.all([
          supabase
            .from("trip_travelers")
            .select("travelers (name)")
            .eq("trip_id", patch.trip_id),
          supabase.from("travelers").select("name").eq("family_id", familyId),
        ]);
        const outcome = await tidyStranded({
          supabase,
          tripId: patch.trip_id,
          goingNames: (roster || [])
            .map((row) => row?.travelers?.name)
            .filter(Boolean),
          familyNames: (family || []).map((row) => row?.name).filter(Boolean),
        });
        dbError = outcome.error ? { message: outcome.error } : null;
        if (!outcome.error && outcome.message) extra = ` — ${outcome.message}`;
        // Deliberately NOT setting packingTripId: that asks the model to work out
        // a fuller list, which is the opposite of what was just asked for and
        // would put some of the removed lines straight back.
      } else if (tool === "clear_packing_list") {
        // One statement instead of forty deletes.
        const { error: e } = await supabase
          .from(table)
          .delete()
          .eq("trip_id", patch.trip_id);
        dbError = e;
      } else if (tool === "set_person_email") {
        const { error: e } = await supabase
          .from("travelers")
          .update({ email: patch.email })
          .eq("id", patch.traveler_id);
        // The unique index is doing real work here: an address decides whose
        // name a change lands under, so two people cannot share one.
        dbError =
          e && /travelers_family_email/.test(e.message || "")
            ? {
                message:
                  "Someone else in the family already uses that email address.",
              }
            : e;
      } else if (tool === "set_person_details") {
        // traveler_id is the key, not a column, and only the groups the user
        // actually mentioned are in the patch — so an unmentioned column keeps
        // whatever the Family tab already holds.
        const { traveler_id: personId, ...columns } = patch;
        const { error: e } = await supabase
          .from("travelers")
          .update(columns)
          .eq("id", personId);
        dbError = e;
      } else if (tool === "invite_person") {
        const outcome = await sendTravelerInvite({
          supabase,
          travelerId: patch.traveler_id,
          inviterId: user.id,
          inviterEmail: user.email,
          origin: siteOrigin(request),
        });
        dbError = outcome.ok ? null : { message: outcome.error };
        if (outcome.ok)
          extra = outcome.test
            ? ` — test copy sent to ${outcome.to}`
            : ` — sent to ${outcome.to}`;
      } else if (tool === "set_pet_trip") {
        // One row per pet per trip is the decision itself, so recording a new
        // arrangement replaces the old one rather than adding a second answer.
        const { trip_id: petTripId, pet_id: petRowId, ...rest } = patch;
        if (patch.arrangement === undefined) {
          const { error: e } = await supabase
            .from("trip_pets")
            .delete()
            .eq("trip_id", petTripId)
            .eq("pet_id", petRowId);
          dbError = e;
        } else {
          const { error: e } = await supabase
            .from("trip_pets")
            .upsert(
              { trip_id: petTripId, pet_id: petRowId, ...rest },
              { onConflict: "trip_id,pet_id" },
            );
          dbError = e;
        }
        // The packing list follows the decision, the same way it follows a
        // person joining or leaving a trip.
        if (!dbError) {
          const { data: petRow } = await supabase
            .from("pets")
            // The id and the family are not optional here: the sync keys a
            // pet's packing lines on `pet_id`, and it has to be able to find or
            // make that pet's template. Selecting only the descriptive fields
            // meant this whole branch quietly did nothing when Aly ran it.
            .select("id, family_id, name, species, travel_style, medications")
            .eq("id", petRowId)
            .maybeSingle();
          if (petRow) {
            const outcome = await syncPackingForPet({
              supabase,
              tripId: petTripId,
              familyId: petRow.family_id,
              pet: petRow,
              arrangement: patch.arrangement ?? null,
            });
            if (outcome.message) extra = ` — ${outcome.message}`;
          }
        }
      } else if (FAMILY_TABLES.has(table)) {
        // Family-wide rows: keyed by id only, with RLS keeping them in family.
        if (tool.startsWith("delete_")) {
          const { error: e } = await supabase.from(table).delete().eq("id", id);
          dbError = e;
        } else if (tool.startsWith("update_") || EDIT_TOOLS.has(tool)) {
          const { error: e } = await supabase
            .from(table)
            .update({ ...patch, updated_at: new Date().toISOString() })
            .eq("id", id);
          dbError = e;
        } else {
          const { error: e } = await supabase.from(table).insert({
            ...patch,
            family_id: familyId,
            // Who pressed the card. On her own notes this is the only record of
            // the fact that a person read it before it was kept.
            ...(table === "lessons" ? { created_by: user.id } : {}),
          });
          dbError = e;
        }
      } else if (REVIEW_TOOLS.has(tool)) {
        // Rating and review only, on one itinerary item.
        const query = supabase
          .from("itinerary_items")
          .update({
            ...(patch.rating !== undefined ? { rating: patch.rating } : {}),
            ...(patch.review !== undefined ? { review: patch.review } : {}),
          })
          .eq("id", id);
        const { error: e } = await query;
        dbError = e;
      } else if (tool.startsWith("delete_")) {
        const { error: e } = await supabase.from(table).delete().eq("id", id);
        dbError = e;
      } else if (tool.startsWith("update_")) {
        const row = { ...patch };
        if (table === "packing_items" && row.is_packed !== undefined) {
          row.packed_by = row.is_packed ? user.id : null;
          row.packed_at = row.is_packed ? new Date().toISOString() : null;
        }
        if (table === "predeparture_tasks" && row.is_done !== undefined) {
          row.done_by = row.is_done ? user.id : null;
          row.done_at = row.is_done ? new Date().toISOString() : null;
        }
        const { error: e } = await supabase
          .from(table)
          .update(row)
          .eq("id", id);
        dbError = e;
      } else {
        // validateAction put the resolved trip on the patch.
        const row = { ...patch };
        if (table === "trip_notes") {
          row.author_id = user.id;
          row.author_name = profile?.display_name || null;
        }
        const { error: e } = await supabase.from(table).insert(row);
        dbError = e;
      }
    } catch (err) {
      dbError = { message: err?.message || "Unexpected error." };
    }

    if (!dbError) {
      const spot = landingFor({
        tool,
        action,
        tripRefs,
        rowTrip,
        focusTripId: tripId,
        createdTripId,
      });
      if (spot) landed.push(spot);
    }

    results.push(
      dbError
        ? { ok: false, summary: action.summary, error: dbError.message }
        : { ok: true, summary: `${action.summary}${extra}` },
    );
  }

  const applied = results.filter((r) => r.ok).length;

  // The receipt is part of the conversation, not just a toast. Writing it here
  // means the transcript — and Aly, on the next turn — knows what was actually
  // saved rather than only what was proposed.
  const receipt = describeOutcome(applied, results);
  // It belongs to the conversation the changes were proposed in, so an id the
  // client did not send, or one belonging to someone else, gets a conversation of
  // its own rather than dropping the receipt on the floor.
  //
  // It also cannot be filed against a trip that no longer exists.
  // chat_messages.trip_id cascades on delete, so the insert is rejected by the
  // foreign key and the confirmation vanishes without a word — which is why
  // deleting a trip appeared to do nothing at all before failing.
  const receiptTripId =
    tripId && deletedTripIds.includes(tripId) ? null : tripId;
  const { id: conversationId } = await ensureConversation(supabase, user.id, {
    conversationId:
      typeof payload?.conversationId === "string"
        ? payload.conversationId
        : null,
    tripId: receiptTripId,
  });
  await appendMessage(supabase, {
    userId: user.id,
    conversationId,
    tripId: receiptTripId,
    role: "assistant",
    body: receipt,
    kind: "receipt",
  });

  return NextResponse.json({
    applied,
    results,
    createdSlug,
    links: pickLinks(landed, deletedTripIds, tripRefs),
    packingTripId,
    deletedTripIds,
    receipt,
    conversationId,
  });
}

// Which screen a single change is visible on. Trip-scoped tools resolve their
// trip three ways, in order of how trustworthy each one is: the trip the
// validated patch names, the trip the edited row already sits in, then the trip
// the panel is open on.
function landingFor({
  tool,
  action,
  tripRefs,
  rowTrip,
  focusTripId,
  createdTripId,
}) {
  const flat = LANDING_PATH[tool];
  if (flat) return { href: flat[0], label: `Open ${flat[1]}` };

  if (tool === "delete_trip") return { href: "/trips", label: "Open Trips" };

  const patch = action?.patch || {};
  const tripId =
    tool === "create_trip"
      ? createdTripId
      : patch.trip_id ||
        (action?.id ? rowTrip.get(action.id) : null) ||
        focusTripId;
  const trip = tripId ? tripRefs.get(tripId) : null;
  if (!tripRef(trip)) return null;

  const tab = LANDING_TAB[tool];
  if (!tab) return { href: tripPath(trip), label: `Open ${trip.name}` };
  return {
    href: tripPath(trip, tab),
    label: `Open the ${TAB_WORDS[tab]}`,
  };
}

// One link per destination, newest trip first, and never a link to a trip this
// same batch deleted — that is a promise straight to a 404.
function pickLinks(landed, deletedTripIds, tripRefs) {
  const dead = new Set(
    deletedTripIds
      .map((id) => tripRefs.get(id))
      .map((trip) => tripRef(trip))
      .filter(Boolean)
      .map((ref) => `/trips/${ref}`),
  );
  const seen = new Set();
  const out = [];
  for (const spot of landed) {
    if (out.length >= MAX_LINKS) break;
    if (seen.has(spot.href)) continue;
    if ([...dead].some((base) => spot.href.startsWith(base))) continue;
    seen.add(spot.href);
    out.push(spot);
  }
  return out;
}

// Plain language, and specific about what failed.
function describeOutcome(applied, results) {
  const failed = results.filter((r) => !r.ok);
  const head =
    applied > 0
      ? `Saved ${applied} change${applied === 1 ? "" : "s"}.`
      : "Nothing was saved.";
  if (!failed.length) return head;
  const detail = failed.map((f) => f.error || f.summary).join("; ");
  return `${head} ${failed.length} failed: ${detail}`;
}

// Create, rename or delete a whole trip. Deleting cascades to the itinerary,
// packing list, tasks and notes at the database level.
// A packing template, and whatever it was asked to start from. The copy
// reads the source here rather than trusting anything the model sent, so what
// lands on the new list is what is actually on the old one.
async function writeTemplate({ supabase, patch, familyId }) {
  const {
    copy_from_template_id: fromList,
    copy_from_trip_id: fromTrip,
    copy_categories: categories,
    ...row
  } = patch;

  const { data, error } = await supabase
    .from("packing_templates")
    .insert({ ...row, family_id: familyId })
    .select("id")
    .single();
  if (error || !data?.id) {
    return { error: error || { message: "Could not start that list." } };
  }
  const id = data.id;
  if (!fromList && !fromTrip) return { id, copied: 0 };

  const columns = "category, item, assignee, quantity, sort_order, last_minute";
  const { data: source, error: readError } = fromTrip
    ? await supabase
        .from("packing_items")
        .select(columns)
        .eq("trip_id", fromTrip)
        .is("stashed_at", null)
        .order("category")
        .order("sort_order")
    : await supabase
        .from("packing_template_items")
        .select(columns)
        .eq("template_id", fromList)
        .order("category")
        .order("sort_order");

  // A copy was asked for, so coming back with nothing is a failure, not a quiet
  // success. Reporting "saved" over an empty list is how this went unnoticed
  // once already.
  if (readError) {
    return rollback(supabase, id, {
      message: `I could not read the list to copy from, so I did not start “${row.name}”: ${readError.message}`,
    });
  }

  // Copying a trip's list brings the base list along with it, because that is
  // what the trip was built from. An add-on list has to hold only the extras.
  // Copying from another packing template is left alone: that is deliberate
  // reorganizing, and an add-on's contents are already additional.
  let excludeItems = null;
  if (fromTrip) {
    const { data: base } = await supabase
      .from("packing_templates")
      .select("id")
      .eq("family_id", familyId)
      .eq("is_base", true)
      .maybeSingle();
    if (base?.id) {
      const { data: baseItems } = await supabase
        .from("packing_template_items")
        .select("item")
        .eq("template_id", base.id);
      excludeItems = (baseItems || []).map((r) => r.item);
    }
  }

  // The family's travelers, so a copied row assigned to two people, or to somebody
  // who left, lands on "Shared" instead of being carried onto every future trip.
  const { data: family } = await supabase
    .from("travelers")
    .select("name")
    .eq("family_id", familyId);
  const travelerNames = (family || []).map((t) => t.name).filter(Boolean);

  const { items, skipped } = copiedTemplateItems(source, {
    templateId: id,
    categories,
    excludeItems,
    travelerNames,
  });
  if (!items.length) {
    return rollback(supabase, id, {
      message: skipped
        ? `Everything on that list is already on the base list, so “${row.name}” would have added nothing and I did not start it.`
        : `I found nothing to copy, so I did not start “${row.name}”${
            Array.isArray(categories) && categories.length
              ? `. Check that ${categories.join(" and ")} is spelled the way it appears on the list`
              : ""
          }.`,
    });
  }

  const { error: itemsError } = await supabase
    .from("packing_template_items")
    .insert(items);
  if (itemsError) {
    return rollback(supabase, id, {
      message: `I could not copy the items in, so I did not start “${row.name}”: ${itemsError.message}`,
    });
  }
  return { id, copied: items.length, skipped };
}

// An empty list left behind by a half-finished copy is worse than no list: the
// name is taken, so asking again is refused as a duplicate, and there is no way
// to remove it from the chat. Either the list arrives with its contents or it
// does not arrive.
async function rollback(supabase, id, error) {
  await supabase.from("packing_templates").delete().eq("id", id);
  return { copied: 0, error };
}

async function writeTrip({ supabase, tool, id, patch, familyId }) {
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
    const { error } = await supabase.from("trips").update(row).eq("id", id);
    return { error };
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
    .select("id, name")
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

// Copying the base list onto a trip. This used to happen inside trip creation,
// where an 87-item list appeared as an invisible side effect of approving a
// trip; it is now something the family says yes to on its own. What lands here
// is only the floor — the smarter pass that reads the destination and the time
// of year runs afterwards, from the panel.
async function fillPackingFromBase({ supabase, tripId, familyId }) {
  const { count } = await supabase
    .from("packing_items")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", tripId)
    .is("stashed_at", null);
  if (count) {
    return {
      error: {
        message:
          "That trip already has a packing list, so I left it alone rather than doubling it up.",
      },
    };
  }

  const { data: tpl } = await supabase
    .from("packing_templates")
    .select("id")
    .eq("family_id", familyId)
    .eq("is_base", true)
    .maybeSingle();
  if (!tpl) return { error: null, copied: 0 };

  const { data: items } = await supabase
    .from("packing_template_items")
    .select("category, item, assignee, quantity, sort_order")
    .eq("template_id", tpl.id);
  if (!items?.length) return { error: null, copied: 0 };

  // Who is going is read from the trip's own roster rather than passed in, so
  // this is right whoever asked for it and whenever they asked. Packing for
  // someone who stayed home is noise; shared items belong to the trip rather
  // than to a person, so they are kept either way.
  const { data: rows } = await supabase
    .from("trip_travelers")
    .select("travelers(name)")
    .eq("trip_id", tripId);
  const going = (rows || []).map((r) => r.travelers?.name).filter(Boolean);
  const wanted = going.length
    ? items.filter((i) => {
        const who = String(i.assignee || "").trim();
        return !who || who === "Shared" || going.includes(who);
      })
    : items;
  if (!wanted.length) return { error: null, copied: 0 };

  const { error } = await supabase
    .from("packing_items")
    .insert(wanted.map((i) => ({ ...i, trip_id: tripId })));
  if (error) return { error, copied: 0 };

  // The animals on this trip get their own lines too, from each one's own
  // template. This runs after the insert above on purpose: syncPackingForPet
  // will not start a list from nothing, so there has to be a list first. Every
  // line it writes is owned by a person or Shared and merely tagged with the
  // pet — the dog is not answerable for its own luggage.
  let pets = 0;
  const { data: onTrip } = await supabase
    .from("trip_pets")
    .select(
      "arrangement, pets (id, family_id, name, species, travel_style, medications)",
    )
    .eq("trip_id", tripId);
  for (const link of onTrip || []) {
    if (!link.pets || !isComing(link.arrangement)) continue;
    const outcome = await syncPackingForPet({
      supabase,
      tripId,
      familyId,
      pet: link.pets,
      arrangement: link.arrangement,
    });
    pets += outcome.added || 0;
  }
  return { error: null, copied: wanted.length + pets };
}
