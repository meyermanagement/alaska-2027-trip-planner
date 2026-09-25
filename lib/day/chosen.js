import { homeToday } from "@/lib/format";

// The day chosen on each trip since the page loaded, so a tab switch (which
// unmounts the list) comes back to it. Kept in memory, not storage: a fresh
// visit still opens on the day being lived. `link` is the ?date= a visit arrived
// with, so a new link to a different day still wins.
export const CHOSEN = new Map();
// Also forgotten once the day at home has moved on, so a tab left open
// overnight opens on the new morning rather than on yesterday's choice.
export function chosenDay(tripId, keys, today = homeToday()) {
  const kept = CHOSEN.get(tripId);
  if (!kept?.day || kept.on !== today) return null;
  return (keys || []).includes(kept.day) ? kept.day : null;
}
export function rememberDay(tripId, day, today = homeToday()) {
  if (!tripId || !day) return;
  CHOSEN.set(tripId, { ...CHOSEN.get(tripId), day, on: today });
}
export function linkSeen(tripId, link) {
  if (!tripId) return;
  CHOSEN.set(tripId, { ...CHOSEN.get(tripId), link: link || null });
}
