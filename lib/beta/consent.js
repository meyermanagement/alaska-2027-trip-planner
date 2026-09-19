import { AGREEMENT_VERSION, PRIVACY_VERSION } from "@/lib/beta/agreement";
import { accountAge } from "@/lib/beta/accountAge";

/**
 * Whether a signed-in person has agreed to the beta terms, and what to do about
 * it when they have not.
 *
 * The screens themselves are at /welcome/beta. This file is the part that makes
 * them unskippable, and it is asked in three places for three different reasons:
 *
 *   - lib/auth/landing.js, so both sign-in doors send a tester to the gate
 *     before the walkthrough rather than after it.
 *   - middleware.js, so typing a URL, following a bookmark, or coming back to a
 *     tab does not walk around the gate.
 *   - lib/agent/llm.js, so a tester who said no to AI processing does not have
 *     text sent to a third-party model by a background job they never saw.
 *
 * The first two are routing. The third is the one that matters: consent is only
 * worth something if declining actually stops the thing being consented to, and
 * a redirect cannot stop a cron job.
 */

// Where the gate lives.
export const CONSENT_PATH = "/welcome/beta";

// Middleware runs on every navigation and every prefetch, so it does not get to
// ask the database each time. Same shape as the access-level cookie above it: a
// hint, cached for ten minutes, that decides what to draw and refuses nothing.
// Nothing is granted on the strength of it -- the page checks for itself, and
// the model layer checks for itself -- so the worst a stale one costs is one
// navigation reaching a screen that immediately redirects.
export const CONSENT_COOKIE = "alyeska_consent";
export const CONSENT_COOKIE_MAX_AGE = 600;

// The value the cookie carries for an account this beta does not apply to.
//
// Without it the gate loops: middleware sees no consent row and sends them to
// the screens, the screens find they are not a tester and send them to /trips,
// and middleware sees no consent row again. Deciding it in middleware instead
// would mean the service-role lookup isTesterAccount does running on every
// navigation of every session, to answer a question that is false for almost
// nobody. So the screen answers it once and leaves this note.
export const CONSENT_NOT_IN_BETA = "not-in-beta";

// What middleware will accept as "no need to stop this request": consent under
// the agreement now in force, or an account the agreement does not cover.
// Anything else -- including a cookie naming last month's version -- is stale by
// construction, which is what lets a reissued agreement reopen the gate for
// everybody without waiting for a cookie to expire.
export function consentCookieSatisfies(value, agreementVersion) {
  return value === agreementVersion || value === CONSENT_NOT_IN_BETA;
}

// Paths the gate must never close, or a tester who declines is locked into a
// screen with no way out of it. Signing out, reading the agreement, reaching
// support, and the route that records the answer all have to stay open.
export const CONSENT_OPEN_PREFIXES = [
  "/child",
  "/api/child",
  "/login",
  "/auth",
  "/welcome/beta",
  "/welcome/parent",
  "/family/child-access",
  "/api/family/child-access",
  "/api/beta/consent",
  "/api/beta/not-in-beta",
  // Leaving has to be reachable from behind the gate. Somebody who reads the
  // agreement, declines it, and wants their account gone cannot be made to agree
  // to something first in order to delete it, so the route stays open and the
  // decline screen offers it.
  "/api/account/delete",
  // The two documents the gate itself links to. Behind the gate they would be
  // unreachable from the screen that asks you to read them.
  "/privacy",
  "/beta-terms",
  "/pledge",
  "/contact",
  "/join",
  "/_next",
  "/manifest",
];

/**
 * Is this a path the gate leaves alone?
 */
export function consentOpenPath(pathname) {
  return CONSENT_OPEN_PREFIXES.some(
    (p) =>
      pathname === p || pathname.startsWith(`${p}/`) || pathname === `${p}`,
  );
}

/**
 * This person's consent row, read with their own session so the database's own
 * policies decide what comes back.
 */
export async function readConsent(supabase, userId, { strict = false } = {}) {
  if (!userId) return null;
  const { data, error } = await supabase
    .from("beta_consents")
    .select(
      "user_id, agreement_version, privacy_version, app_build, age_confirmed, data_acknowledged, ai_processing, ai_provider, ai_decided_at, features, sharing_acknowledged, diagnostics, accepted_at, withdrawn_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
  if (error && strict) throw new Error("Consent lookup unavailable");
  return data || null;
}

/**
 * Why this row does not cover the person, or null when it does.
 *
 * Separated from a plain boolean because the screens open differently for each
 * answer: somebody who has never agreed gets the full introduction, and somebody
 * whose agreement went out of date gets told what changed rather than being made
 * to sit through it again as though they were new.
 */
export function consentGap(row) {
  if (!row) return "none";
  if (row.withdrawn_at) return "withdrawn";
  if (!row.age_confirmed || !row.data_acknowledged) return "none";
  if (row.agreement_version !== AGREEMENT_VERSION) return "agreement";
  if (row.privacy_version !== PRIVACY_VERSION) return "privacy";
  return null;
}

/**
 * The straight question, for callers that only want a yes or no.
 */
export function consentIsCurrent(row) {
  return consentGap(row) === null;
}

/**
 * May this person's text be sent to a third-party model?
 *
 * Two ways to be no: they have not agreed to the beta terms at all, or they
 * agreed and declined the AI screen. Both are supported states of a working
 * account, which is what makes the AI screen a choice.
 */
export async function aiAllowed(supabase, userId) {
  const age = await accountAge(supabase, userId);
  // Parent setup/verification is not an AI authorization. A separately reviewed
  // child-chat release must introduce its own scoped model path.
  if (age.unavailable || age.minor) return false;
  const row = await readConsent(supabase, userId);
  if (!consentIsCurrent(row)) return false;
  return Boolean(row.ai_processing);
}

/**
 * May this person's text be sent for one *particular* optional feature?
 *
 * The gate collects two separate answers and the code used to read only the
 * first. Blanket AI permission covers a question about a trip: a sentence the
 * person typed, plus the trip it is about. It does not cover posting the
 * photograph of a passport, or a certificate naming everybody insured, to the
 * same provider -- that is what the optional feature is for, and the screen tells
 * them what happens if they leave it off.
 *
 * Both are required, in that order. Turning Aly off has to stop the document
 * reader too, or "turning Aly off stops the sending" is not true.
 */
export async function featureAllowed(supabase, userId, feature) {
  const row = await readConsent(supabase, userId);
  if (!consentIsCurrent(row)) return false;
  if (!row.ai_processing) return false;
  const features =
    row.features && typeof row.features === "object" ? row.features : {};
  return features[feature] === true;
}

/**
 * The same question, with the reason attached.
 *
 * `featureAllowed` answers false three ways -- no current agreement, Aly off,
 * that one feature off -- and a screen that cannot tell them apart tells the
 * person the wrong thing to do. The document reader did exactly that: with
 * "Read fields from documents" on and Aly off, the refusal said to turn on the
 * permission that was already on. Found capturing evidence item 5.
 *
 * Reasons: "no-consent", "ai-off", "feature-off".
 */
export async function featureDecision(supabase, userId, feature) {
  const row = await readConsent(supabase, userId);
  if (!consentIsCurrent(row)) return { allowed: false, reason: "no-consent" };
  if (!row.ai_processing) return { allowed: false, reason: "ai-off" };
  const features =
    row.features && typeof row.features === "object" ? row.features : {};
  if (features[feature] !== true) {
    return { allowed: false, reason: "feature-off" };
  }
  return { allowed: true, reason: null };
}

/**
 * Is one optional feature switched on for this person, as a plain permission?
 *
 * Deliberately not `featureAllowed`. That helper requires blanket AI permission
 * first, which is right for the two features that send something to a model and
 * wrong for the three that do not: reminders, the device's location, and a
 * calendar subscription are promises about this app's own behavior, and someone
 * who has turned Aly off has not thereby asked to stop being reminded about a
 * check-in. Tying every switch to the AI switch would have made the gate a lie in
 * the other direction.
 *
 * A withdrawn or out-of-date agreement still stops everything, because at that
 * point there is no permission of any kind to read.
 */
export async function optionalFeatureOn(supabase, userId, feature) {
  if (!supabase || !userId || !feature) return false;
  const row = await readConsent(supabase, userId);
  if (!consentIsCurrent(row)) return false;
  const features =
    row.features && typeof row.features === "object" ? row.features : {};
  return features[feature] === true;
}

/**
 * The same question with the reason attached, so a refusal can name the switch to
 * turn on rather than telling somebody to fix something that is not broken.
 *
 * Reasons: "no-consent", "feature-off".
 */
export async function optionalFeatureDecision(supabase, userId, feature) {
  if (!supabase || !userId || !feature) {
    return { allowed: false, reason: "no-consent" };
  }
  const row = await readConsent(supabase, userId);
  if (!consentIsCurrent(row)) return { allowed: false, reason: "no-consent" };
  const features =
    row.features && typeof row.features === "object" ? row.features : {};
  if (features[feature] !== true) {
    return { allowed: false, reason: "feature-off" };
  }
  return { allowed: true, reason: null };
}

/**
 * Has this person left beta diagnostics on?
 *
 * Its own column rather than an entry in `features`, because it is asked in the
 * required half of the gate and then offered back as a switch in Settings. The
 * promise attached to it -- "can be turned off below and in Settings" -- is the
 * one this answers, and until now nothing read it.
 */
export async function diagnosticsAllowed(supabase, userId) {
  if (!supabase || !userId) return false;
  const row = await readConsent(supabase, userId);
  if (!consentIsCurrent(row)) return false;
  return row.diagnostics === true;
}

/**
 * One optional feature, asked about a household rather than a person.
 *
 * For the things a household owns and a stranger reads: the calendar
 * subscription URL, which has no session behind it and keeps working for years
 * unless something checks. Same people-picking rule as `householdAiAllowed` and
 * the same direction of failure -- one member switching the feature off stops the
 * shared thing -- but without requiring AI permission, which a calendar feed
 * never needed.
 */
export async function householdFeatureOn(
  supabase,
  { familyId, feature } = {},
) {
  if (!supabase || !familyId || !feature) {
    return { allowed: false, reason: "no household was named" };
  }

  const { data: members } = await supabase
    .from("family_members")
    .select("user_id, role")
    .eq("family_id", familyId);
  const rows = Array.isArray(members) ? members : [];
  const owners = rows.filter((m) => m.role === "owner" && m.user_id);
  const pool = owners.length ? owners : rows.filter((m) => m.user_id);
  const userIds = pool.map((m) => m.user_id);
  if (!userIds.length) {
    return { allowed: false, reason: "this household has no members" };
  }

  const { data: consents } = await supabase
    .from("beta_consents")
    .select(
      "user_id, agreement_version, privacy_version, age_confirmed, data_acknowledged, ai_processing, features, withdrawn_at",
    )
    .in("user_id", userIds);

  const list = Array.isArray(consents) ? consents : [];
  if (!list.length) {
    return { allowed: false, reason: "nobody in this household has agreed" };
  }
  for (const row of list) {
    if (!consentIsCurrent(row)) {
      return { allowed: false, reason: "an agreement is out of date" };
    }
    const features =
      row.features && typeof row.features === "object" ? row.features : {};
    if (features[feature] !== true) {
      return { allowed: false, reason: `feature-off:${feature}` };
    }
  }
  return { allowed: true, reason: null };
}

/**
 * May this household's forwarded mail -- or anything else the household owns
 * rather than one person -- be sent to a third-party model?
 *
 * The reason this exists is a defect, and it is worth naming. `aiAllowed` above
 * is a door, and four modules that hold the provider key were not walking
 * through it: the forwarded-mail parser sent an email body to Gemini forty-nine
 * seconds after a tester turned Aly off, because nothing on that path ever asked.
 * A background parse has no session to ask about, so the question has to be
 * asked about a *household*, which is what this answers.
 *
 * Who speaks for the household, in order:
 *
 *   1. The traveler the message was attributed to, if that traveler is a person
 *      with an account. Their own mail is their own decision.
 *   2. Otherwise the household's owners.
 *   3. Otherwise every member, because a household can exist without an owner
 *      row -- the first real family in production has three members and no
 *      owner, and an owner-only rule would have stopped their mail dead.
 *
 * Every consent row found among those people has to allow it. One member
 * turning Aly off stops the household's shared inbox, which is the direction to
 * fail in: household mail is not attributable to one person, and "turning Aly
 * off stops the sending everywhere" is a sentence we publish. A household where
 * nobody has agreed at all sends nothing.
 */
export async function householdAiAllowed(
  supabase,
  { familyId, travelerId = null, feature = null } = {},
) {
  if (!supabase) return { allowed: false, reason: "no database client" };
  if (!familyId) {
    return {
      allowed: false,
      reason: "no household was named for this request",
    };
  }

  let userIds = [];

  if (travelerId) {
    const { data: traveler } = await supabase
      .from("travelers")
      .select("user_id")
      .eq("id", travelerId)
      .eq("family_id", familyId)
      .maybeSingle();
    if (traveler?.user_id) userIds = [traveler.user_id];
  }

  if (!userIds.length) {
    const { data: members } = await supabase
      .from("family_members")
      .select("user_id, role")
      .eq("family_id", familyId);
    const rows = Array.isArray(members) ? members : [];
    const owners = rows.filter((m) => m.role === "owner" && m.user_id);
    const pool = owners.length ? owners : rows.filter((m) => m.user_id);
    userIds = pool.map((m) => m.user_id);
  }

  if (!userIds.length) {
    return { allowed: false, reason: "this household has no members" };
  }

  const { data: rows } = await supabase
    .from("beta_consents")
    .select(
      "user_id, agreement_version, privacy_version, age_confirmed, data_acknowledged, ai_processing, features, withdrawn_at",
    )
    .in("user_id", userIds);

  const consents = Array.isArray(rows) ? rows : [];
  if (!consents.length) {
    return {
      allowed: false,
      reason: "nobody in this household has agreed to the beta terms",
      userIds,
    };
  }

  for (const row of consents) {
    if (!consentIsCurrent(row)) {
      return {
        allowed: false,
        reason: "a household member's agreement is out of date or withdrawn",
        userIds,
      };
    }
    if (!row.ai_processing) {
      return { allowed: false, reason: "ai-off", userIds };
    }
    if (feature) {
      const features =
        row.features && typeof row.features === "object" ? row.features : {};
      if (features[feature] !== true) {
        return { allowed: false, reason: `feature-off:${feature}`, userIds };
      }
    }
  }

  return { allowed: true, reason: null, userIds };
}
