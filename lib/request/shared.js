import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { resolveAccess } from "@/lib/travelers/access";
import { unreadFares } from "@/lib/deals/unread";
import { todayISO } from "@/lib/reminders";
import { loadMenu } from "@/lib/menu/load";

// One answer per request to the questions every screen and the menu bar both ask.
//
// React's cache() lives for a single server render, so a screen and the menu
// above it that both call these get the same promise: the access check, the
// unread fares and the menu's reads happen once, not once each. A screen that
// starts the menu early -- see preloadMenu -- lets the menu's reads run beside
// its own instead of after them.

export const requestClient = cache(() => createClient());

export const requestWho = cache(async () => whoIs(await requestClient()));

export const requestAccess = cache(async () => {
  const who = await requestWho();
  if (!who) return null;
  return resolveAccess(await requestClient(), who);
});

export const requestUnreadFares = cache(async (userId, familyId) =>
  unreadFares(await requestClient(), userId, familyId),
);

export const requestMenu = cache(async () => {
  const supabase = await requestClient();
  const who = await requestWho();
  return loadMenu(supabase, {
    who,
    access: requestAccess(),
    today: todayISO(),
    unreadFares: (_client, userId, familyId) =>
      requestUnreadFares(userId, familyId),
  });
});

/** Start the menu's reads now; TopBar picks up the same promise when it renders. */
export function preloadMenu() {
  requestMenu().catch(() => {});
}
