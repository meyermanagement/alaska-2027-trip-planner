// Whose data an assistant call may read.
//
// The route reads through the service role, like the calendar feed, because the
// caller has no Supabase session. That bypasses row-level security, so this file
// re-states the rules the policies enforce and every tool is scoped through it:
//
//   - The account must have a current beta agreement and must not be a minor.
//   - Only households the account belongs to (family_members).
//   - A secondary traveler sees only non-draft trips they are on, and only their
//     own packing items -- the same rule as private.can_access_trip and
//     packing_secondary_read.
//   - Children are never returned: no minor travelers, and no packing items
//     assigned to one.
//
// A missing relationship produces no data, never a wider read.

import { consentGap, readConsent } from "@/lib/beta/consent";

export const REFUSALS = {
  "no-user": "This key is not tied to an account.",
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

export async function readerScope(admin, userId, today) {
  if (!userId) return { refused: "no-user" };

  const consent = await readConsent(admin, userId).catch(() => null);
  if (consentGap(consent) !== null) return { refused: "consent" };

  const minor = await admin.rpc("account_is_minor", { account_id: userId });
  if (minor.error || minor.data !== false) return { refused: "minor" };

  const members = await admin
    .from("family_members")
    .select("family_id")
    .eq("user_id", userId);
  if (members.error) return { refused: "unavailable" };
  const familyIds = [...new Set((members.data || []).map((m) => m.family_id))];
  if (!familyIds.length) return { refused: "no-household" };

  const people = await admin
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

  return { userId, today, families, travelers: rows };
}

export function familyOf(scope, familyId) {
  return scope.families.find((f) => f.familyId === familyId) || null;
}

const TRIP_COLUMNS = "id, family_id, name, destination, start_date, end_date, status";

// Every trip this account may see, in date order.
export async function visibleTrips(admin, scope, columns = TRIP_COLUMNS) {
  const { data, error } = await admin
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
    const links = await admin
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
