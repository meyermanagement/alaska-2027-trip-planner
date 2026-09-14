import { AGREEMENT_VERSION, PRIVACY_VERSION } from "@/lib/beta/agreement";

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
  "/login",
  "/auth",
  "/welcome/beta",
  "/api/beta/consent",
  "/api/beta/not-in-beta",
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
export async function readConsent(supabase, userId) {
  if (!userId) return null;
  const { data } = await supabase
    .from("beta_consents")
    .select(
      "user_id, agreement_version, privacy_version, app_build, age_confirmed, data_acknowledged, ai_processing, ai_provider, ai_decided_at, features, sharing_acknowledged, diagnostics, accepted_at, withdrawn_at",
    )
    .eq("user_id", userId)
    .maybeSingle();
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
  const row = await readConsent(supabase, userId);
  if (!consentIsCurrent(row)) return false;
  return Boolean(row.ai_processing);
}
