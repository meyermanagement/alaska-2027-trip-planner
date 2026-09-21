// One phone, one row.
//
// A push subscription is identified by its endpoint, and the endpoint is not
// stable: Apple and Google rotate it, and an iPhone that is reinstalled or has
// its permission granted again hands over a brand new one. Upserting on the
// endpoint therefore does not prevent duplicates -- it only prevents duplicates
// of the *same* endpoint. Six rows for one iPhone is what that looks like in
// practice, and every arrival is then signed and sent six times.
//
// So the browser now keeps its own identifier and sends it along. That is the
// only thing in this file that can say "this is the same phone as before" with
// confidence. The user agent cannot: two iPhones of the same model on the same
// iOS version are the same string, and retiring on the label alone would
// silence somebody's second phone.
//
// The label is still used for one narrow case -- rows written before this
// identifier existed. They cannot be matched any other way, and leaving them is
// what keeps the fan-out alive after the fix ships. A row is only retired that
// way when the arriving subscription carries an identifier and the old row
// carries none, so two live phones can never take each other down: the second
// one to subscribe will have its own identifier, and the first will have one
// too as soon as it is next opened.

export const DEVICE_STORAGE_KEY = "alyeska.push.device";

/**
 * Rows this subscription replaces, as ids to delete.
 *
 * @param {Array<{id: string, user_id?: string, endpoint?: string, device_id?: string|null, label?: string|null}>} rows
 * @param {{userId: string, endpoint: string, deviceId?: string|null, label?: string|null}} arriving
 */
export function supersededSubscriptions(rows, { userId, endpoint, deviceId, label }) {
  if (!Array.isArray(rows) || !userId || !endpoint) return [];
  const device = String(deviceId || "").trim();
  const named = String(label || "").trim();
  return rows
    .filter((row) => row.user_id === userId)
    .filter((row) => row.endpoint !== endpoint)
    .filter((row) => {
      const rowDevice = String(row.device_id || "").trim();
      // The same phone, said so by the phone itself.
      if (device && rowDevice) return rowDevice === device;
      // A row from before identifiers existed, from a browser that describes
      // itself identically. Only ever retired by a subscription that has one.
      if (device && !rowDevice) return Boolean(named) && String(row.label || "").trim() === named;
      return false;
    })
    .map((row) => row.id)
    .filter(Boolean);
}

/** This browser's own identifier, created once and kept. Null when storage is unavailable. */
export function deviceIdentity(storage) {
  try {
    const store = storage || (typeof window === "undefined" ? null : window.localStorage);
    if (!store) return null;
    const held = store.getItem(DEVICE_STORAGE_KEY);
    if (held && held.trim()) return held.trim().slice(0, 64);
    const made = typeof crypto !== "undefined" && crypto.randomUUID
      ? crypto.randomUUID()
      : `d${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
    store.setItem(DEVICE_STORAGE_KEY, made);
    return made;
  } catch {
    // Private browsing, or storage the browser has decided to refuse. Going
    // without an identifier costs a possible duplicate row, never an alert.
    return null;
  }
}
