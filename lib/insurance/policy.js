/**
 * Travel insurance, as the app understands it.
 *
 * A policy belongs to the family and is joined to the trips it covers, so the
 * questions this module answers are mostly about the join: does this policy
 * actually reach this trip's dates, is anybody on the trip not named on it,
 * and what does the plan say it pays for.
 *
 * Everyday health insurance is out of scope. What lives here is the policy
 * bought for a journey -- cancellation, medical while away, evacuation home,
 * lost bags, delays.
 */

import { readMoney } from "@/lib/budget/budget";

/** The kinds of policy the app tells apart, and what to call each one. */
export const POLICY_KINDS = [
  {
    value: "trip",
    label: "This trip",
    hint: "Bought for one journey.",
  },
  {
    value: "annual",
    label: "Annual plan",
    hint: "Covers every trip inside the plan year.",
  },
];

export function kindLabel(kind) {
  return POLICY_KINDS.find((k) => k.value === kind)?.label || "This trip";
}

/**
 * The perils the app offers as chips. Anything an insurer names that is not on
 * this list goes in the notes field rather than growing the list, because the
 * list is here to make two policies comparable and a list of forty is not.
 */
export const COVERS = [
  { value: "cancellation", label: "Trip cancellation" },
  { value: "interruption", label: "Trip interruption" },
  { value: "medical", label: "Medical care" },
  { value: "evacuation", label: "Emergency evacuation" },
  { value: "baggage", label: "Baggage" },
  { value: "delay", label: "Travel delay" },
  { value: "rental_car", label: "Rental car" },
  { value: "adventure", label: "Adventure activities" },
];

export function coverLabel(value) {
  return COVERS.find((c) => c.value === value)?.label || value;
}

/** Only the values the app knows, in the order the chips are drawn. */
export function normalizeCovers(list) {
  const wanted = new Set(
    (Array.isArray(list) ? list : []).map((v) => String(v || "").trim()),
  );
  return COVERS.filter((c) => wanted.has(c.value)).map((c) => c.value);
}

/** A date-only string from either a date column or an ISO timestamp. */
function dayOf(value) {
  if (!value) return null;
  const text = String(value).slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : null;
}

/**
 * Whether the policy's window actually reaches across the trip.
 *
 * Three answers, and the third is the common one while a trip is still being
 * planned: `covered` when the window contains both ends of the trip, `gap`
 * when it demonstrably does not, and `unknown` when either side is missing a
 * date. A gap is worth saying out loud on the trip screen -- it is the failure
 * nobody notices until a claim is refused -- but an absent date is not a
 * warning, it is a blank.
 */
export function coverageAgainstTrip(policy, trip) {
  const from = dayOf(policy?.coverage_start);
  const to = dayOf(policy?.coverage_end);
  const start = dayOf(trip?.start_date);
  const end = dayOf(trip?.end_date);

  if (!start || !end || (!from && !to)) {
    return { status: "unknown", note: "" };
  }

  if (from && start < from) {
    return {
      status: "gap",
      note: `The trip starts before this policy does. Coverage begins ${from}.`,
    };
  }
  if (to && end > to) {
    return {
      status: "gap",
      note: `The trip runs past the end of this policy, which stops ${to}.`,
    };
  }
  return { status: "covered", note: "" };
}

/**
 * Travelers on the trip that the policy does not name.
 *
 * An empty insured list means nobody has said who is covered, which is not the
 * same as saying nobody is -- so that case returns an empty array rather than
 * flagging everybody as missing.
 */
export function travelersMissingFrom({ insuredIds = [], goingIds = [] }) {
  if (!insuredIds.length) return [];
  const insured = new Set(insuredIds);
  return goingIds.filter((id) => !insured.has(id));
}

/**
 * One line for a policy card: who wrote it, what the plan is called, and the
 * policy number, with the empty parts left out rather than rendered as blanks.
 */
export function policyLine(policy) {
  return [policy?.provider, policy?.plan_name, policy?.policy_number]
    .map((part) => String(part || "").trim())
    .filter(Boolean)
    .join(" · ");
}

/** The limits worth reading at a glance, already formatted. */
export function limitLines(policy) {
  const rows = [];
  const medical = readMoney(policy?.medical_limit);
  const evac = readMoney(policy?.evacuation_limit);
  const deductible = readMoney(policy?.deductible);
  if (medical !== null) rows.push({ label: "Medical", value: medical });
  if (evac !== null) rows.push({ label: "Evacuation", value: evac });
  if (deductible !== null)
    rows.push({ label: "Deductible", value: deductible });
  return rows;
}

/** Trim a policy shape down to the columns the table actually has. */
export function policyFields(draft) {
  return {
    kind: draft.kind === "annual" ? "annual" : "trip",
    provider: String(draft.provider || "").trim(),
    plan_name: String(draft.plan_name || "").trim() || null,
    policy_number: String(draft.policy_number || "").trim() || null,
    coverage_start: dayOf(draft.coverage_start),
    coverage_end: dayOf(draft.coverage_end),
    emergency_phone: String(draft.emergency_phone || "").trim() || null,
    claims_phone: String(draft.claims_phone || "").trim() || null,
    claims_url: String(draft.claims_url || "").trim() || null,
    covers: normalizeCovers(draft.covers),
    premium: readMoney(draft.premium),
    deductible: readMoney(draft.deductible),
    medical_limit: readMoney(draft.medical_limit),
    evacuation_limit: readMoney(draft.evacuation_limit),
    notes: String(draft.notes || "").trim() || null,
  };
}

/** What has to be filled in before a policy can be saved. */
export function refusePolicy(draft) {
  if (!String(draft?.provider || "").trim()) {
    return "Say who the policy is with before saving it.";
  }
  const from = dayOf(draft?.coverage_start);
  const to = dayOf(draft?.coverage_end);
  if (from && to && to < from) {
    return "Coverage cannot end before it starts.";
  }
  return null;
}
