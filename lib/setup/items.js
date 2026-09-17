/**
 * The five things worth doing after the interview, and where in the app each
 * one is actually done.
 *
 * Kept apart from both the checklist screen that describes them and the loader
 * that works out which are outstanding, because the menu marks rows by href
 * and the checklist writes rows by key: one map, so a row can never be marked
 * in the menu and missing from the screen it came from.
 *
 * The order is the order the checklist reads them in, and installing is first
 * on purpose. It is the only row that changes what the app is able to do at
 * all: until the site is on the Home Screen an iPhone will not let Safari even
 * offer notifications, so every warning the app has -- a fare that has to be
 * bought today, a task that is due today -- can only reach that family by
 * email until this one is done.
 */
export const SETUP_ITEM_HREF = {
  install: "/now",
  others: "/family",
  wallet: "/wallet",
  forwarding: "/inbox",
  past: "/trips?view=past",
};

/** Where the menu row points: the screen that explains all five. */
export const SETUP_HREF = "/welcome/next-steps";
