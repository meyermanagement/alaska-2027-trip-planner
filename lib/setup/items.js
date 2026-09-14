/**
 * The four things worth doing after the interview, and where in the app each
 * one is actually done.
 *
 * Kept apart from both the checklist screen that describes them and the loader
 * that works out which are outstanding, because the menu marks rows by href
 * and the checklist writes rows by key: one map, so a row can never be marked
 * in the menu and missing from the screen it came from.
 *
 * The order is the order the checklist reads them in.
 */
export const SETUP_ITEM_HREF = {
  others: "/family",
  wallet: "/wallet",
  forwarding: "/inbox",
  past: "/trips?view=past",
};

/** Where the menu row points: the screen that explains all four. */
export const SETUP_HREF = "/welcome/next-steps";
