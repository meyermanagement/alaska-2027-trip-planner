import { isPastTrip } from "@/lib/format";
import { homeTrips } from "@/lib/now/home";
import { nextAhead } from "@/lib/now/ahead";
import { BASIC_SELECT } from "@/lib/trips/basics";
import { canSeeTrip, visibleTripIds } from "@/lib/trips/visibility";
import { unreadFares as readUnreadFares } from "@/lib/deals/unread";

/**
 * The open tasks on the given trips, dated first and soonest of those, then in
 * list order -- the order the hero cards used to ask the database for. Worked
 * out from the open tasks already in hand instead of reading them a second time.
 * `rows` must arrive in sort_order, which is how the first round reads them.
 */
export function heroTasksFrom(rows, tripIds) {
  const wanted = new Set(tripIds);
  return (rows || [])
    .filter((row) => wanted.has(row.trip_id))
    .map((row, index) => ({ row, index }))
    .sort((a, b) => {
      const x = a.row.due_date;
      const y = b.row.due_date;
      if (x && y && x !== y) return x < y ? -1 : 1;
      if (x && !y) return -1;
      if (!x && y) return 1;
      return a.index - b.index;
    })
    .map(({ row }) => ({
      id: row.id,
      trip_id: row.trip_id,
      title: row.title,
      due_date: row.due_date,
      is_done: row.is_done,
    }));
}

/**
 * Everything the Now screen reads, in two rounds after the access check.
 *
 * It used to be about ten: the memberships (twice), the fares on their own, the
 * tasks, the roster for the task trips, the trips, the hero details, the roster
 * again, the long-range reads and the contradiction reads -- each waiting for
 * the one before although most of them only needed the household. Round one is
 * everything that needs only the household. Round two is everything that needs
 * to know which trips are on the screen. Nothing is read that was not read
 * before, and the long-range reads still happen only at those ranges.
 */
export async function loadNow(
  supabase,
  { user, access, today, unreadFares = readUnreadFares },
) {
  const secondary = Boolean(access?.can?.isSecondary);
  const familyId = access?.familyId || null;
  const familyIds = access?.familyIds?.length
    ? access.familyIds
    : familyId
      ? [familyId]
      : [];

  const [
    fareRows,
    { data: rows },
    { data: travelers },
    { data: runs },
    { count: waiting },
    { data: tripRows },
    allowedTripIds,
  ] = await Promise.all([
    familyId && !secondary ? unreadFares(supabase, user.id, familyId) : [],
    supabase
      .from("predeparture_tasks")
      .select(
        "id, title, detail, assignee, due_date, timing, priority, is_done, trip_id, trips(id, name, slug, public_id, start_date, end_date, status, family_id)",
      )
      .eq("is_done", false)
      .order("sort_order", { ascending: true }),
    supabase
      .from("travelers")
      .select(
        "id, name, is_person, family_id, sort_order, email, wants_reminders",
      )
      .in("family_id", familyIds)
      .order("sort_order", { ascending: true }),
    secondary
      ? Promise.resolve({ data: [] })
      : supabase
          .from("reminder_runs")
          .select("ran_for, ran_at, source, considered, sent, failed, error")
          .order("ran_at", { ascending: false })
          .limit(6),
    // Only the number. The list of what arrived lives on the Inbox screen.
    secondary
      ? Promise.resolve({ count: 0 })
      : supabase
          .from("inbox_messages")
          .select("id", { count: "exact", head: true })
          .in("family_id", familyIds)
          .eq("status", "pending"),
    // Read from the trips table rather than from the trips that happen to have
    // an outstanding task: a trip whose list is finished is still the trip you
    // are on.
    familyId
      ? supabase
          .from("trips")
          .select(
            `id, name, slug, public_id, cover_emoji, status, cover_image_url, cover_image_alt, cover_image_status, lat, lon, family_id, ${BASIC_SELECT}`,
          )
          .eq("family_id", familyId)
          .order("start_date", { ascending: true })
      : Promise.resolve({ data: [] }),
    visibleTripIds(supabase, access),
  ]);

  const tasks = (rows || [])
    .filter((row) => row.trips && !isPastTrip(row.trips))
    .map(({ trips, ...task }) => ({ ...task, trip: trips }));
  const taskTrips = [
    ...new Map(tasks.map((task) => [task.trip.id, task.trip])).values(),
  ];

  const visible = (tripRows || []).filter((trip) =>
    canSeeTrip(trip, access, allowedTripIds),
  );
  const { current, soon } = homeTrips(visible, today);
  const ahead = current.length || soon.length ? null : nextAhead(visible, today);
  const emptyHanded = !current.length && !soon.length && !ahead;
  const heroIds = [
    ...current,
    ...soon.map((one) => one.trip),
    ...(ahead ? [ahead.trip] : []),
  ].map((trip) => trip.id);
  const upcoming = taskTrips.filter((trip) => !isPastTrip(trip, today));
  const upcomingIds = upcoming.map((trip) => trip.id);
  const currentIds = current.map((trip) => trip.id);
  const longRange = !secondary && (Boolean(ahead) || emptyHanded);
  const readLongRange = longRange && Boolean(familyId);

  // One roster read for both the task trips and the hero trips, and one
  // itinerary read for both today's plan and the contradiction check.
  const rosterIds = [...new Set([...taskTrips.map((t) => t.id), ...heroIds])];
  const itineraryIds = [...new Set([...upcomingIds, ...currentIds])];
  const none = Promise.resolve({ data: [] });

  const [
    { data: roster },
    { data: packingRows },
    { data: itinerary },
    { data: pets },
    { data: petLinks },
    { data: placeRows },
    { data: dealRows },
    { data: offerRows },
  ] = await Promise.all([
    rosterIds.length
      ? supabase
          .from("trip_travelers")
          .select("trip_id, traveler_id")
          .in("trip_id", rosterIds)
      : none,
    heroIds.length
      ? supabase
          .from("packing_items")
          .select("trip_id, is_packed")
          .in("trip_id", heroIds)
          .is("stashed_at", null)
      : none,
    itineraryIds.length
      ? supabase
          .from("itinerary_items")
          .select("*")
          .in("trip_id", itineraryIds)
          .order("item_date", { ascending: true })
          .order("sort_order", { ascending: true })
      : none,
    upcomingIds.length
      ? supabase
          .from("pets")
          .select(
            "id, name, species, color, weight_lb, travel_style, family_id, is_service_animal, rabies_expiration, health_certificate_expiration",
          )
          .in("family_id", familyIds)
      : none,
    upcomingIds.length
      ? supabase
          .from("trip_pets")
          .select("trip_id, pet_id, arrangement")
          .in("trip_id", upcomingIds)
      : none,
    // The long-range reads, only at those ranges: a family leaving tomorrow
    // should not pay for a query about next spring.
    readLongRange
      ? supabase
          .from("someday_places")
          .select("id, place, why, months, status, priority")
          .eq("family_id", familyId)
      : none,
    readLongRange
      ? supabase
          .from("flight_deals")
          .select(
            "id, destination, destination_code, price, price_basis, currency, award_pricing, book_by, book_by_inferred, source_name, status",
          )
          .eq("family_id", familyId)
          .eq("status", "open")
      : none,
    readLongRange
      ? supabase
          .from("card_offers")
          .select("id, issuer, card_name, bonus_text, offer_ends_on, status")
          .eq("family_id", familyId)
          .eq("status", "open")
      : none,
  ]);

  const currentSet = new Set(currentIds);
  const upcomingSet = new Set(upcomingIds);

  return {
    secondary,
    familyIds,
    fareRows,
    tasks,
    taskTrips,
    travelers: travelers || [],
    runs: runs || [],
    waiting: waiting || 0,
    visible,
    current,
    soon,
    ahead,
    emptyHanded,
    longRange,
    upcoming,
    roster: roster || [],
    packingRows: packingRows || [],
    heroTasks: heroTasksFrom(rows, heroIds),
    planRows: (itinerary || []).filter((row) => currentSet.has(row.trip_id)),
    itinerary: (itinerary || []).filter((row) => upcomingSet.has(row.trip_id)),
    pets: pets || [],
    petLinks: petLinks || [],
    placeRows: placeRows || [],
    dealRows: dealRows || [],
    offerRows: offerRows || [],
  };
}
