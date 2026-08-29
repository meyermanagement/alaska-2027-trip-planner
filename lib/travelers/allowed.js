import { SECONDARY } from "./access";

/**
 * What a secondary traveler may actually write, and how we know.
 *
 * This exists because the screen and the database were disagreeing in both
 * directions, and both directions are bugs:
 *
 * - a control hidden from someone the database would have allowed, which is how a
 *   secondary traveler opened the current day and found no dress code, no
 *   departure time and nothing to say why
 * - a control shown to someone the database refuses, which in Postgres is not an
 *   error but a write that matches no rows: the spinner runs, a grounded search
 *   spends real money, and nothing is saved
 *
 * So every entry below was measured against the live policies as Veda, not read
 * off the schema and not inferred from the shape of the feature. The `policy`
 * field names the row-level security policy that decided it, or says plainly that
 * nothing in the database objects and the restriction is ours.
 *
 * If a policy is added or dropped, this table is what has to move with it.
 */
export const SECONDARY_WRITES = {
  // Advice about items that already exist. item_insights carries one
  // family-membership policy and no secondary clause, so this genuinely lands.
  dayInsights: { allowed: true, policy: null },

  // pro_tips carries pro_tips_no_secondary_insert, _update and _delete. Reading
  // them is fine; producing or dismissing one is not.
  tripTips: { allowed: false, policy: "pro_tips_no_secondary_insert" },
  dismissTip: { allowed: false, policy: "pro_tips_no_secondary_delete" },

  // The plan itself. This is the line Mark drew.
  itinerary: { allowed: false, policy: "itinerary_secondary_insert" },
  notes: { allowed: false, policy: "notes_secondary_insert" },

  // Their own two boxes, which is what a secondary account is for. Aly's toolset
  // is narrowed to these as well; see lib/agent/toolset.js.
  ownPacking: { allowed: true, policy: null },
  ownTasks: { allowed: true, policy: null },

  // A review is a family opinion of a place, not a note about themselves.
  review: { allowed: false, policy: null },
};

/**
 * Whether this level may perform one of the writes above.
 *
 * A primary may do all of them. An unknown level is treated as primary, because
 * that is how every existing caller already behaves and a level that failed to
 * resolve must not quietly downgrade somebody mid-trip.
 */
export function mayWrite(level, action) {
  if (level !== SECONDARY) return true;
  const rule = SECONDARY_WRITES[action];
  // An action nobody has measured is refused rather than guessed. A wrong "no"
  // is a missing button; a wrong "yes" is a write the user never sees land.
  if (!rule) return false;
  return rule.allowed === true;
}

/** Why an action is refused, for a comment or a message. Null when it is allowed. */
export function refusedBecause(level, action) {
  if (mayWrite(level, action)) return null;
  return SECONDARY_WRITES[action]?.policy || null;
}
