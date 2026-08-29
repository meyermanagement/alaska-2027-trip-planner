// Primary and secondary travelers.
//
// A primary traveler runs the trip. A secondary traveler is a minor or a friend
// tagging along: they see the itinerary, they see and check off the packing items
// assigned to them, they see and finish their own pre-departure tasks, and they
// can ask Aly questions. Nothing else.
//
// The database enforces all of this itself, in 20260828_access_levels.sql, and
// that is the layer that actually holds -- the app talks to Postgres with the
// signed-in person's own token, so a check that exists only in React is a
// suggestion. What lives here is the second and third jobs:
//
//   * telling the pages and API routes who is asking, so a refusal can be a
//     sentence rather than a silently empty screen, and
//   * deciding what to put in front of somebody, because a button that fails
//     when pressed is worse than a button that was never drawn.
//
// A blocked write is worth understanding: row-level security does not raise on a
// forbidden UPDATE or DELETE, it filters the row away, so the statement succeeds
// and changes nothing. Postgres will therefore never tell a secondary traveler
// they were refused. That is exactly why the checks below have to run before the
// write, not instead of it.

export const PRIMARY = "primary";
export const SECONDARY = "secondary";

export const LEVELS = [
  {
    id: PRIMARY,
    label: "Primary traveler",
    blurb: "Can plan and change everything.",
  },
  {
    id: SECONDARY,
    label: "Secondary traveler",
    blurb:
      "Sees the itinerary, checks off their own packing, finishes their own tasks, and can ask Aly questions.",
  },
];

export function levelLabel(level) {
  return LEVELS.find((l) => l.id === level)?.label || "Primary traveler";
}

/** What somebody at this level is allowed to do, for drawing the screens. */
export function permissions(level) {
  const secondary = level === SECONDARY;
  return {
    isSecondary: secondary,
    // Reading
    seeItinerary: true,
    seeAllPacking: !secondary,
    seeAllTasks: !secondary,
    seeDocuments: !secondary,
    seeWallet: !secondary,
    seeTemplates: !secondary,
    seeReviews: !secondary,
    seeAllTrips: !secondary,
    // Writing
    editTrips: !secondary,
    editItinerary: !secondary,
    editPacking: !secondary,
    editTasks: !secondary,
    editPeople: !secondary,
    editPets: !secondary,
    editPreferences: !secondary,
    editTemplates: !secondary,
    editWallet: !secondary,
    editNotes: !secondary,
    invitePeople: !secondary,
    setAccessLevels: !secondary,
    // The two things a secondary traveler may change
    checkOffOwnPacking: true,
    completeOwnTasks: true,
    // Aly
    askAly: true,
    letAlyChangeThings: !secondary,
  };
}

/**
 * Who is asking, and what they may do.
 *
 * Deliberately fails open when somebody is a member of the household but has no
 * traveler row of their own: they are treated as primary. Family membership is
 * the perimeter and none of this widens it -- you cannot get a family_members row
 * without the household's invite code. Access level is a distinction drawn
 * inside a household that already trusts you, so an unclaimed seat must not
 * become a lockout. The same choice is made in the database function
 * is_secondary_traveler, and the two have to agree.
 */
export async function resolveAccess(supabase, user) {
  if (!user) return null;

  const { data: memberships } = await supabase
    .from("family_members")
    .select("family_id, families(id, name, invite_code)")
    .eq("user_id", user.id);

  if (!memberships || memberships.length === 0) return null;

  const family = memberships[0].families;
  const familyId = memberships[0].family_id;

  const { data: rows } = await supabase
    .from("travelers")
    .select("id, name, access_level, is_person")
    .eq("family_id", familyId)
    .eq("user_id", user.id)
    .eq("is_person", true)
    .order("sort_order");

  const traveler = rows?.[0] || null;
  const level = traveler?.access_level === SECONDARY ? SECONDARY : PRIMARY;

  return {
    user,
    family,
    familyId,
    traveler,
    travelerId: traveler?.id || null,
    // Assignment is by name on both packing items and tasks in this schema, so
    // "mine" is a name comparison. Kept here so no caller has to remember that.
    travelerName: traveler?.name || null,
    level,
    can: permissions(level),
  };
}

/**
 * The trips a secondary traveler is on. A friend tagging along on one week has
 * no business reading the plans for a different one, and the database agrees --
 * this is only so the app can say so rather than show an empty list.
 */
export async function tripIdsFor(supabase, travelerId) {
  if (!travelerId) return null;
  const { data } = await supabase
    .from("trip_travelers")
    .select("trip_id")
    .eq("traveler_id", travelerId);
  return (data || []).map((r) => r.trip_id);
}

/**
 * The traveler ids on a trip, read off a row that fetched its roster inline as
 * `trip_travelers (travelers (id, ...))`. Empty when the roster was not asked
 * for, which callers have to tell apart from a roster that is genuinely empty.
 */
export function rosterIds(trip) {
  return (trip?.trip_travelers || [])
    .map((row) => row.travelers?.id)
    .filter(Boolean);
}

/**
 * Is this person on this trip.
 *
 * Fails open twice, both deliberately, and both for the same reason: this decides
 * whether to *show* something, and a thing that silently fails to appear is the
 * worst kind of bug to have, because nobody can tell it apart from the app
 * working.
 *
 * No traveler id means a household member whose seat has not been claimed yet.
 * They are treated as on the trip, which is the same call resolveAccess and the
 * database function is_secondary_traveler both make -- family membership is the
 * perimeter, and an unclaimed seat must not become a lockout.
 *
 * An empty roster means nobody has been added to the trip yet, which is a gap in
 * the record and not a statement that nobody is going. Hiding on an empty roster
 * would mean a family that has not filled one in sees nothing at all, and would
 * have no way to work out why.
 */
export function isOnTrip(trip, travelerId) {
  if (!trip) return false;
  if (!travelerId) return true;
  const ids = rosterIds(trip);
  if (ids.length === 0) return true;
  return ids.includes(travelerId);
}

/** A refusal a person can read, for the API routes. */
export const REFUSAL =
  "You are on this trip as a secondary traveler, so you can check off your own packing items and finish your own tasks. Ask somebody who is a primary traveler to make other changes.";

/**
 * Guard for an API route. Returns null when the write may proceed, or a reason
 * to refuse it. `need` is the permission key being exercised.
 */
export function refuse(access, need) {
  if (!access) return "Sign in first.";
  if (access.can[need]) return null;
  return REFUSAL;
}
