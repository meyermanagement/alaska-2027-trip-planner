// Looking for pro tips, one model call at a time.
//
// A refresh is genuinely several questions: what are the facts about this place,
// is there anything to say about the trip, about what they are taking, about this
// particular booking. Asking all of them in one request would be the obvious
// design and it cannot work: this route is killed at sixty seconds and a single
// grounded answer is allowed forty-six of them.
//
// So the route does exactly one piece of work per call and says what the next
// piece would be. The screen that asked keeps calling until there is no next, and
// shows what has arrived so far in between. It also means a refresh that dies
// halfway leaves real tips behind rather than nothing.
//
// The app's own rules — lib/tips/rules.js — run on every call regardless, because
// they cost nothing and involve no model.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { todayISO } from "@/lib/reminders";
import {
  FACTS_STALE_DAYS,
  WINDOWS_VERSION,
  standingsKey,
  researchFacts,
  tipsForPlace,
  rulesTips,
} from "@/lib/tips/generate";
import { SCOPES, sameWindowTitle } from "@/lib/tips/tip";
import { taskFloorRows } from "@/lib/tasks/floor";
import { applyPackingFloor } from "@/lib/packing/floor";

export const runtime = "nodejs";
// Longer than the platform's default because a grounded look genuinely takes
// tens of seconds: the model reads the trip, runs its own searches, and thinks.
// The budget below is what the model gets of it; the rest pays for the reads
// before and the writes after. Not raised past 120, because the binding limit is
// not this number -- it is how long the browser on the other end will wait, and
// that is 110 seconds. See MODEL_BUDGET_MS.
export const maxDuration = 120;

// How much of that the model may have. The rest pays for the eight reads this
// route makes before it asks anything, the writes afterwards, and the cold start.
// A model call allowed to run right up to the platform ceiling is worse than one
// cut short: when the platform stops listening the browser is told only that the
// load failed, which is not something the app can explain or even see.
//
// This was 55 seconds, and 55 seconds was the whole problem. The real limit on
// this route is not the platform's 120 -- it is lib/tips/run.js, which stops
// waiting at 110 seconds because a browser abandons a silent request before very
// much longer, and a request the browser abandons keeps nothing, since the writes
// all happen at the end. So the window that actually exists is 110 seconds, and
// the model was being given half of it while the other half went unspent.
//
// Measured, on the real trips, on the model production uses: thirteen grounded
// tips calls came back in 7, 13, 15, 15, 22, 22, 29, 29, 29, 31, 38, 65 and 74
// seconds. Same trips, same prompt, nothing wrong with any of them -- grounded
// search has a very long tail, and the 74-second call had run the same three
// searches as the 29-second one. Against the old budget the grounded pass got
// about 33 seconds of that 55, so four of those thirteen lost their search and
// fell back to an unverified answer. Against 95 it gets about 67, which covers
// twelve of the thirteen and still answers inside what the browser will wait.
const MODEL_BUDGET_MS = 95000;
// Researching the destination gets the same, rather than less. It is a bigger
// question and it is only asked when the sheet is missing or a week old: measured
// against the real Disney trip it takes about forty seconds, and it hands back to
// the browser for a fresh request afterwards rather than trying to do the tips in
// what is left, so there is nothing for it to leave room for.
const FACTS_BUDGET_MS = 95000;

/** Everything except the working fields the rules pass alongside a tip. */
const columnsOnly = (tip) =>
  Object.fromEntries(
    Object.entries(tip).filter(([key]) => !key.startsWith("_")),
  );

const bad = (message, status = 400) =>
  NextResponse.json({ error: message }, { status });

/**
 * Whether a fact sheet is worth re-checking.
 *
 * Three reasons, and age is only the first. A sheet written before the windows
 * grew a loyalty level is the wrong shape however new it is, and a sheet
 * researched without a level this family now holds was answered for somebody
 * else. Both of those were true of the Disney sheet, which is how a Castaway Club
 * Silver family was shown the first-timer date.
 */
export function factsAreStale(facts, now = Date.now(), memberships = null) {
  if (!facts?.checked_at) return true;
  if ((facts.windows_version || 0) < WINDOWS_VERSION) return true;
  if (
    memberships &&
    String(facts.standings_key || "") !== standingsKey(memberships)
  )
    return true;
  const at = Date.parse(facts.checked_at);
  if (Number.isNaN(at)) return true;
  return now - at > FACTS_STALE_DAYS * 86400000;
}

/**
 * The app's own tips, written and filed.
 *
 * Pulled out of the route because it now runs in two places. A refresh that has
 * just researched a fact sheet should not have to wait for the next round trip
 * before the arithmetic on top of that sheet reaches the screen — the rules cost
 * nothing and ask no model, so the corrected date can be filed in the same call
 * that learned it. That also means a fact sheet the database refuses to keep
 * still produces the right tip today.
 */
async function writeHouseTips({
  supabase,
  trip,
  tripId,
  facts,
  packing,
  itinerary,
  today,
  memberships,
  travelers,
  scope,
  existing,
}) {
  const house = rulesTips({
    trip,
    facts,
    packing: packing || [],
    itinerary: itinerary || [],
    today,
    memberships: memberships || [],
    // The roaming, translation and equipment rules all read the people rather
    // than the trip, so they are useless without this.
    travelers: travelers || [],
  }).filter((tip) => tip.scope === scope);
  let housed = 0;
  if (house.length) {
    const fresh = house.filter(
      (tip) =>
        !(existing || []).some((row) => row.fingerprint === tip.fingerprint),
    );
    if (fresh.length) {
      const { data: inserted } = await supabase
        .from("pro_tips")
        .insert(fresh.map(columnsOnly))
        .select("id");
      housed = (inserted || []).length;
    }
    // A window whose date has changed produces a new tip rather than an edited
    // one, because the date is in the title. Retire the earlier ones for the same
    // window so the wrong date does not sit beside the right one. Cleared, not
    // deleted: the same state a waved-off tip ends in, so it cannot come back.
    const superseded = house
      .flatMap((tip) => {
        const window = tip._supersedes;
        if (!window) return [];
        return (existing || [])
          .filter(
            (row) =>
              row.scope === tip.scope &&
              row.status === "active" &&
              row.fingerprint !== tip.fingerprint &&
              sameWindowTitle(row.title, window) &&
              house.every((other) => other.fingerprint !== row.fingerprint),
          )
          .map((row) => row.fingerprint);
      })
      .filter(Boolean);
    if (superseded.length) {
      await supabase
        .from("pro_tips")
        .update({ status: "cleared", resolved_at: new Date().toISOString() })
        .eq("trip_id", tripId)
        .eq("status", "active")
        .in("fingerprint", [...new Set(superseded)]);
    }
  }

  return { house, housed };
}

/**
 * The mandatory packing items this trip is missing, filed.
 *
 * The generator applies the same floor when it builds a list, which covers every
 * list built from here on. It does nothing for the lists that already exist --
 * and those are the ones that matter, because the Disney and Alaska lists run to
 * ninety-two and a hundred and one items each and neither of them contains a
 * passport. Rebuilding them to fix that would throw away everything the family
 * has added by hand, which is a bad trade for one item.
 *
 * So the floor is also checked here, on the same press that looks for tips, and
 * only the gaps are appended. An existing list is never rewritten, reordered, or
 * pruned by this -- the only thing it can do is add a row that is not there.
 */
async function writeFloorItems({
  supabase,
  tripId,
  facts,
  itinerary,
  packing,
  travelers,
}) {
  const { added } = applyPackingFloor({
    items: packing || [],
    facts,
    itinerary: itinerary || [],
    going: travelers || [],
  });
  if (!added.length) return { filed: 0 };

  const highest = (packing || []).reduce(
    (max, row) => Math.max(max, Number(row?.sort_order) || 0),
    0,
  );
  const { error } = await supabase.from("packing_items").insert(
    added.map((item, i) => ({
      trip_id: tripId,
      category: item.category || null,
      item: item.item,
      assignee: item.assignee || "Shared",
      quantity: item.quantity || null,
      sort_order: highest + i + 1,
    })),
  );
  if (error) {
    console.log(
      `[tips/refresh] floor items NOT saved trip=${tripId}: ${error.message}`,
    );
    return { filed: 0 };
  }
  console.log(
    `[tips/refresh] floor items filed trip=${tripId} n=${added.length}`,
  );
  return { filed: added.length };
}

/**
 * The pre-departure tasks this trip is not allowed to be missing, filed.
 *
 * Runs beside the house tips and for the same reason: the fact sheet has just
 * been read or researched, the rules on top of it ask no model, and a trip that
 * crosses a border should not have to wait for somebody to think of the bank.
 *
 * Reads the tasks back rather than reusing the route's copy on purpose — the
 * route only loaded the unfinished ones, and a currency task somebody ticked off
 * last month is not a gap to fill again.
 */
async function writeFloorTasks({ supabase, trip, tripId, facts, itinerary }) {
  const { data: all, error: readError } = await supabase
    .from("predeparture_tasks")
    .select("title, detail, sort_order, is_done")
    .eq("trip_id", tripId);
  // Filing blind would mean duplicating whatever is already there, which is worse
  // than filing nothing.
  if (readError) return { filed: 0, fired: [] };

  const { rows, fired } = taskFloorRows({
    facts,
    itinerary: itinerary || [],
    tasks: all || [],
    trip: { ...trip, id: tripId },
  });
  if (!rows.length) return { filed: 0, fired };

  const { error } = await supabase.from("predeparture_tasks").insert(rows);
  if (error) {
    console.log(
      `[tips/refresh] floor tasks NOT saved trip=${tripId}: ${error.message}`,
    );
    return { filed: 0, fired };
  }
  console.log(
    `[tips/refresh] floor tasks filed trip=${tripId} rules=${fired.join(",") || "none"}`,
  );
  return { filed: rows.length, fired };
}

export async function POST(request) {
  // Everything below is measured against this: whatever the model is asked, it is
  // asked with a deadline that leaves the route time to answer in words.
  const startedAt = Date.now();
  let body;
  try {
    body = await request.json();
  } catch {
    return bad("Send a trip.");
  }
  const tripId = String(body?.tripId || "");
  const scope = SCOPES.includes(String(body?.scope))
    ? String(body.scope)
    : "trip";
  const itemId = body?.itemId ? String(body.itemId) : null;
  // Set by lib/tips/run.js when this exact look already ran out of time once, so
  // a search with a very long tail gets a second whole window instead of being
  // reported as a failure. Read here rather than trusted blindly: it is only ever
  // allowed to spare one extra request, and the second one reports its timeout
  // like any other.
  const retry = body?.retry === true;
  if (!tripId) return bad("Send a trip.");
  if (scope === "item" && !itemId) return bad("Send the itinerary item.");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return bad("Sign in first.", 401);

  // Row-level security does the permission work: a trip the visitor cannot reach
  // simply is not there.
  const { data: trip } = await supabase
    .from("trips")
    .select("*")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) return bad("That trip is not there.", 404);

  const today = todayISO();

  const [
    { data: itinerary },
    { data: tasks },
    { data: packing },
    { data: going },
    { data: preferences },
    { data: existing },
    { data: facts },
    { data: memberships },
  ] = await Promise.all([
    supabase
      .from("itinerary_items")
      .select("*")
      .eq("trip_id", tripId)
      .order("item_date", { ascending: true }),
    supabase
      .from("predeparture_tasks")
      .select("title, assignee, due_date, timing, is_done")
      .eq("trip_id", tripId)
      .eq("is_done", false),
    supabase
      .from("packing_items")
      .select("*")
      .eq("trip_id", tripId)
      .is("stashed_at", null),
    supabase
      .from("trip_travelers")
      .select(
        "travelers (id, name, is_person, date_of_birth, gender, phone_carrier, phone_device, mobility_aids, accessibility_notes, languages, about_me)",
      )
      .eq("trip_id", tripId),
    supabase
      .from("travel_preferences")
      .select("*")
      .eq("family_id", trip.family_id),
    supabase
      .from("pro_tips")
      .select("fingerprint, title, scope, itinerary_item_id, status")
      .eq("family_id", trip.family_id),
    supabase.from("trip_facts").select("*").eq("trip_id", tripId).maybeSingle(),
    // Loyalty standings, because a level changes when things can be booked. A
    // Castaway Club level opens shore excursions in an earlier wave than the
    // public one, and a window researched without it is not vague — it is late.
    supabase
      .from("rewards_programs")
      .select(
        "brand, program_name, kind, status_tier, perks, traveler_id, is_active",
      )
      .eq("family_id", trip.family_id),
  ]);

  const travelers = (going || []).map((row) => row.travelers).filter(Boolean);

  // The sheet the rest of this call works from. Reassigned rather than re-read
  // when it has just been researched, so the rules below run on today's answers
  // even if the database refused to keep them.
  let sheet = facts;

  // Step one, and only when the fact sheet is missing, a week old, older than the
  // shape the arithmetic needs, or researched without a level this family now
  // holds. Everything the app works out for itself sits on top of these answers —
  // the passport arithmetic, the voltage tip, and every booking window with a
  // date on it.
  if (factsAreStale(facts, Date.now(), memberships || [])) {
    let researched;
    try {
      researched = await researchFacts({
        trip,
        itinerary: itinerary || [],
        memberships: memberships || [],
        travelers,
        deadline: startedAt + FACTS_BUDGET_MS,
      });
    } catch (error) {
      return NextResponse.json(
        {
          error: error?.timedOut
            ? `${error.message} Checking the destination is the long one — it reads the whole itinerary and every rewards level and works out the booking windows. Press Look for tips again; the rest of the trip does not have to wait for it.`
            : error?.message || "Could not look that up.",
          step: "facts",
        },
        { status: error?.status || 502 },
      );
    }
    // Asked and answered, but not with a fact sheet. Said out loud rather than
    // returned as a quiet no-op: the screen would otherwise ask the same question
    // twice more and finish looking as though nothing was wrong, which is exactly
    // how a stale Disney date survived three refreshes.
    if (!researched.facts) {
      return NextResponse.json(
        {
          error: `${researched.model || "The model"} answered without a fact sheet, so the dates on this trip could not be re-checked. Try again in a moment.`,
          step: "facts",
        },
        { status: 502 },
      );
    }
    // One line in the platform's log per research pass. Not for the person using
    // the app — for the next time a refresh appears to do nothing, when the
    // question is whether the model was asked, how long it took, whether it
    // searched, and whether the answer was kept.
    console.log(
      `[tips/refresh] facts researched trip=${tripId} model=${researched.model || "none"} searched=${researched.searched} windows=${researched.facts.booking_windows.length} ms=${Date.now() - startedAt}`,
    );
    sheet = {
      ...researched.facts,
      sources: researched.sources,
      model: researched.model,
    };
    // The write is checked. An upsert that fails silently leaves the sheet at its
    // old version, which the next round reads as stale all over again: the same
    // question asked until the rounds run out, and no tip to show for it.
    // A sheet the model wrote without searching is used for this look and then
    // thrown away. It is good enough to hang tips on now, and not good enough to
    // stand as the family's verified answer for a week: the next press should get
    // a chance to go and check rather than reading back an unchecked guess.
    const { error: kept } = !researched.searched
      ? { error: null }
      : await supabase.from("trip_facts").upsert(
          {
            trip_id: tripId,
            family_id: trip.family_id,
            ...researched.facts,
            sources: researched.sources,
            model: researched.model,
            checked_at: new Date().toISOString(),
            windows_version: WINDOWS_VERSION,
            standings_key: standingsKey(memberships || []),
          },
          { onConflict: "trip_id" },
        );
    // Filed in the same call. The rules ask no model, so the corrected date
    // reaches the screen now rather than after another round trip — and it reaches
    // it even when the sheet itself could not be saved.
    if (kept)
      console.log(
        `[tips/refresh] facts NOT saved trip=${tripId}: ${kept.message}`,
      );
    await writeFloorTasks({
      supabase,
      trip,
      tripId,
      facts: sheet,
      itinerary: itinerary || [],
    });
    await writeFloorItems({
      supabase,
      tripId,
      facts: sheet,
      itinerary: itinerary || [],
      packing: packing || [],
      travelers,
    });
    const { housed: filed } = await writeHouseTips({
      supabase,
      trip,
      tripId,
      facts: sheet,
      packing: packing || [],
      itinerary: itinerary || [],
      today,
      memberships: memberships || [],
      travelers,
      scope,
      existing,
    });
    return NextResponse.json({
      step: "facts",
      facts: researched.facts,
      found: filed,
      // Not fatal, and not hidden either: the tips above are right, they will
      // just be worked out again next time.
      warning: kept
        ? `The tips are right, but this trip's fact sheet could not be saved: ${kept.message}`
        : undefined,
      next: { scope, itemId },
      done: false,
    });
  }

  await writeFloorTasks({
    supabase,
    trip,
    tripId,
    facts: sheet,
    itinerary: itinerary || [],
  });
  await writeFloorItems({
    supabase,
    tripId,
    facts: sheet,
    itinerary: itinerary || [],
    packing: packing || [],
    travelers,
  });

  const { house, housed } = await writeHouseTips({
    supabase,
    trip,
    tripId,
    facts: sheet,
    packing: packing || [],
    itinerary: itinerary || [],
    today,
    memberships: memberships || [],
    travelers,
    scope,
    existing,
  });

  // Reviews are read across every trip, not just this one, because what they
  // thought of a lodge in 2019 is the best evidence there is about 2027.
  const { data: reviews } = await supabase
    .from("itinerary_items")
    .select("title, location, category, rating, review, trips (name)")
    .not("rating", "is", null)
    .limit(60);

  const item =
    scope === "item"
      ? (itinerary || []).find((row) => row.id === itemId) || null
      : null;
  if (scope === "item" && !item)
    return bad("That itinerary item is not there.", 404);

  // What the model must not tell them: anything already written down, and any tip
  // already offered here — including the ones they have cleared, which is
  // what stops a waved-off tip coming back next week.
  const placeKey = (row) =>
    row.scope === scope &&
    (scope !== "item" || row.itinerary_item_id === itemId);
  const already = (existing || []).filter(placeKey).map((row) => row.title);
  const avoid = [
    ...(tasks || []).map((t) => t.title),
    ...(scope === "packing" ? (packing || []).map((p) => p.item) : []),
    ...already,
  ].filter(Boolean);

  let produced;
  try {
    produced = await tipsForPlace({
      deadline: startedAt + MODEL_BUDGET_MS,
      place: {
        family_id: trip.family_id,
        trip_id: tripId,
        itinerary_item_id: scope === "item" ? itemId : null,
        scope,
      },
      avoid,
      known: [
        ...(existing || []).map((row) => row.fingerprint),
        ...house.map((tip) => tip.fingerprint),
      ],
      scope,
      today,
      trip,
      item,
      itinerary: itinerary || [],
      tasks: tasks || [],
      packing: packing || [],
      travelers,
      preferences: preferences || [],
      memberships: memberships || [],
      reviews: (reviews || []).map((row) => ({
        ...row,
        tripName: row.trips?.name || null,
      })),
      already,
    });
  } catch (error) {
    // Ran long, on the first go, on something the app is allowed to ask again.
    //
    // Grounded search has a tail that no single budget covers: the same question
    // on the same trip has been measured at 7 seconds and at 74. Reporting the 74
    // as a failure was the wrong call twice over -- the family had waited the
    // longest and got the least, and the thing that went wrong was not something
    // they had done or could fix by waiting. So hand back instead. The browser
    // already knows how to carry on from a handoff, because that is how a
    // researched fact sheet reaches the screen, and a fresh request gets a fresh
    // 95 seconds rather than the remains of these. Anything the rules filed on
    // this pass is reported now so the count on screen keeps climbing.
    if (error?.timedOut && !retry) {
      return NextResponse.json({
        step: "slow",
        found: housed,
        next: { scope, itemId, retry: true },
        done: false,
      });
    }
    return NextResponse.json(
      {
        error: error?.timedOut
          ? `${error.message} This look asks the model to read the whole ${scope === "packing" ? "packing list" : "trip"} and go and check what it finds, and it has now run past a full request twice. Press Look for tips again — anything already found is saved.`
          : error?.message || "The assistant could not be reached.",
        step: scope,
        housed,
      },
      { status: error?.status || 502 },
    );
  }

  let added = 0;
  if (produced.tips.length) {
    const { data: inserted, error } = await supabase
      .from("pro_tips")
      .insert(produced.tips)
      .select("id");
    if (error) {
      return NextResponse.json(
        { error: "Found tips but could not save them.", step: scope },
        { status: 500 },
      );
    }
    added = (inserted || []).length;
  }

  return NextResponse.json({
    step: scope,
    done: true,
    added: added + housed,
    fromRules: housed,
    // Why nothing came back, when nothing came back. "Looked and found nothing"
    // and "found four and threw them all out" deserve different words on screen.
    considered: produced.tips.length + produced.dropped.length,
    dropped: produced.dropped,
    searched: produced.searched,
    model: produced.model,
  });
}
