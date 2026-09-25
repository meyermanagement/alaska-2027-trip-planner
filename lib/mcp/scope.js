// Whose data an assistant call may read.
//
// Step one read through the service role, because a developer key has no
// Supabase session behind it, and this file re-stated the rules row-level
// security already enforces. Step two's caller has a real session -- an OAuth
// access token naming a real signed-in person -- so the query client passed in
// here is that person's own client (lib/mcp/oauthClient.js), not the admin
// client, and the database's own policies do the scoping:
//
//   - private.is_minor_account() is a restrictive policy on every table, so a
//     minor's token reads nothing regardless of anything below.
//   - trips_secondary_read / private.can_access_trip already limit a secondary
//     traveler to non-draft trips they are on.
//   - packing_secondary_read already limits a secondary traveler's packing
//     reads to their own items.
//
// What RLS cannot express is why this project keeps this file instead of
// deleting it: the beta consent gate is application-level only (no policy
// reads beta_consents), and the MCP-specific redactions -- no health/dietary/
// mobility data, no confirmation numbers, no typed notes, no cross-household
// reads via a name match -- are product rules an assistant is held to that a
// person browsing their own app is not. Those checks stay explicit here.
//
// A missing relationship produces no data, never a wider read.

import { consentGap, readConsent } from "@/lib/beta/consent";

export const REFUSALS = {
  "no-user": "This token is not tied to an account.",
  consent: "This account has not accepted the current beta agreement.",
  minor: "Assistant access is not available for this account.",
  "no-household": "This account does not belong to a household yet.",
  unavailable: "The household could not be read just now.",
};

function isMinor(dob, today) {
  if (!dob) return false;
  const [y, m, d] = String(dob).slice(0, 10).split("-").map(Number);
  const [ty, tm, td] = today.split("-").map(Number);
  const age = ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
  return age < 18;
}

/**
 * Build the scope for one MCP call, reading through `client` -- the caller's
 * own per-user Supabase client, authenticated with their OAuth access token,
 * so every query below is already filtered by RLS before this file adds
 * anything of its own.
 *
 * `userId` is passed in rather than re-derived here because the route already
 * paid for token verification (lib/mcp/oauthToken.js) to get it; asking the
 * database "who am I" a second time would be the exact round trip
 * lib/supabase/who.js exists to avoid.
 */
export async function readerScope(client, userId, today) {
  if (!userId) return { refused: "no-user" };

  const consent = await readConsent(client, userId).catch(() => null);
  if (consentGap(consent) !== null) return { refused: "consent" };

  // RLS already refuses every table to a minor's own token, but the route
  // needs to say *why* a call returned nothing rather than let every tool
  // fail with the same generic "unavailable" -- so this checks the same
  // function RLS calls, not a second opinion about who counts as a minor.
  const minor = await client.rpc("account_is_minor", { account_id: userId });
  if (minor.error || minor.data !== false) return { refused: "minor" };

  const members = await client
    .from("family_members")
    .select("family_id")
    .eq("user_id", userId);
  if (members.error) return { refused: "unavailable" };
  const familyIds = [...new Set((members.data || []).map((m) => m.family_id))];
  if (!familyIds.length) return { refused: "no-household" };

  const people = await client
    .from("travelers")
    .select("id, family_id, name, user_id, is_person, access_level, date_of_birth")
    .in("family_id", familyIds);
  if (people.error) return { refused: "unavailable" };
  const rows = people.data || [];

  const families = familyIds.map((familyId) => {
    const own = rows.filter((t) => t.family_id === familyId && t.user_id === userId);
    const self = own.find((t) => t.is_person) || null;
    return {
      familyId,
      secondary: own.some((t) => t.is_person && t.access_level === "secondary"),
      travelerIds: own.map((t) => t.id),
      travelerName: self?.name || null,
      minorNames: new Set(
        rows
          .filter((t) => t.family_id === familyId && t.is_person && isMinor(t.date_of_birth, today))
          .map((t) => t.name),
      ),
      minorIds: new Set(
        rows
          .filter((t) => t.family_id === familyId && t.is_person && isMinor(t.date_of_birth, today))
          .map((t) => t.id),
      ),
    };
  });

  return { userId, today, client, families, travelers: rows };
}

export function familyOf(scope, familyId) {
  return scope.families.find((f) => f.familyId === familyId) || null;
}

const TRIP_COLUMNS = "id, family_id, name, destination, start_date, end_date, status";

// Every trip this account may see, in date order. `scope.client` already
// carries RLS, so this is no longer doing the secondary-traveler filtering
// itself for correctness -- trips_secondary_read does that at the database --
// but the app-level filter stays as a second, independent statement of the
// same rule, matching this file's stance that scoping is stated twice on
// purpose rather than trusted to one layer alone.
export async function visibleTrips(client, scope, columns = TRIP_COLUMNS) {
  const { data, error } = await client
    .from("trips")
    .select(columns)
    .in("family_id", scope.families.map((f) => f.familyId))
    .order("start_date", { ascending: true, nullsFirst: false });
  if (error) throw new Error("trips unavailable");
  const trips = data || [];

  const secondaryFamilies = scope.families.filter((f) => f.secondary);
  if (!secondaryFamilies.length) return trips;

  const ownIds = secondaryFamilies.flatMap((f) => f.travelerIds);
  let onTrips = new Set();
  if (ownIds.length) {
    const links = await client
      .from("trip_travelers")
      .select("trip_id, traveler_id")
      .in("traveler_id", ownIds);
    if (links.error) throw new Error("trips unavailable");
    onTrips = new Set((links.data || []).map((l) => l.trip_id));
  }
  return trips.filter((t) => {
    const fam = familyOf(scope, t.family_id);
    if (!fam?.secondary) return true;
    return t.status !== "draft" && onTrips.has(t.id);
  });
}
