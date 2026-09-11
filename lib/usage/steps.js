/**
 * What counts as a step of the first run, and in what order.
 *
 * Two things read this. The route that records a page view names the step a path
 * belongs to, so the raw rows arrive already tied to the walkthrough rather than
 * being pattern-matched months later against paths that have since been renamed.
 * And the beta desk reads the same order to draw the funnel, so the screen and
 * the recording can never disagree about what step four is.
 *
 * Order is the real content of this file. A funnel is only honest if the steps
 * are genuinely sequential, so this is the owner's path through a brand-new
 * household and nothing else: meet Aly, say who is in the family, answer the
 * interview, see what the answers changed, then build the first trip. Screens a
 * person can reach later by choice are not steps and are left out — a visit to
 * Wallet in week two is not progress through onboarding, and counting it as one
 * would make the last step look better attended than it is.
 *
 * `match` is deliberately explicit rather than a prefix sweep. /interview and
 * /interview/proof are different steps, and /trips is not /trips/new.
 */

/** @type {{key: string, label: string, blurb: string, match: (path: string) => boolean}[]} */
export const ONBOARDING_STEPS = [
  {
    key: "signed-in",
    label: "Signed in",
    blurb: "Spent the code and landed inside the app.",
    match: (path) => path === "/auth/land" || path === "/join",
  },
  {
    key: "meet-aly",
    label: "Met Aly",
    blurb: "The introduction, before anything is asked.",
    match: (path) => path === "/welcome/meet-aly",
  },
  {
    key: "welcome",
    label: "Household form",
    blurb: "Home, the people in the family, the animals.",
    match: (path) => path === "/welcome",
  },
  {
    key: "interview",
    label: "Interview",
    blurb: "The questions Aly asks about how they travel.",
    match: (path) => path === "/interview",
  },
  {
    key: "proof",
    label: "What it changed",
    blurb: "The answers turned into a day, a list and tips.",
    match: (path) => path.startsWith("/interview/proof"),
  },
  {
    key: "first-trip",
    label: "First trip",
    blurb: "The trip builder, opened.",
    match: (path) => path === "/trips/new",
  },
  {
    key: "living-in-it",
    label: "A trip of their own",
    blurb: "A trip screen, which only exists once they made one.",
    match: (path) =>
      /^\/trips\/[^/]+$/.test(path) &&
      path !== "/trips/new" &&
      path !== "/trips",
  },
];

/**
 * Which step, if any, a path belongs to. Query strings are not part of the
 * question: /about-you?first=1 is the same screen as /about-you.
 *
 * @param {string} path
 * @returns {string | null}
 */
export function stepForPath(path) {
  const clean =
    String(path || "")
      .split("?")[0]
      .replace(/\/+$/, "") || "/";
  const found = ONBOARDING_STEPS.find((step) => step.match(clean));
  return found ? found.key : null;
}

/** The step keys in order, for anything that needs to compare two of them. */
export const STEP_ORDER = ONBOARDING_STEPS.map((step) => step.key);

/** @param {string | null | undefined} key */
export function stepLabel(key) {
  const found = ONBOARDING_STEPS.find((step) => step.key === key);
  return found ? found.label : key || "";
}
