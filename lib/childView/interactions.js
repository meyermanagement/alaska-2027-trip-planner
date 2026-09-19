import { SKINS } from "@/lib/skins";

export const isId = value => typeof value === "string"
  && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
const exact = (body, keys) => body && typeof body === "object" && !Array.isArray(body)
  && Object.keys(body).length === keys.length && keys.every(key => Object.hasOwn(body, key));
export function validPacking(body) {
  return !!(exact(body, ["itemId", "packed"]) && isId(body.itemId) && typeof body.packed === "boolean");
}
export function validTheme(body) {
  return !!(exact(body, ["skin"]) && SKINS.some(skin => skin.id === body.skin));
}
// Never fetch a user-selected URL. Only our own generated trip-cover storage
// path can be read, and only after the view's current roster has been checked.
export function coverPath(value, base, familyId, tripId) {
  try {
    const url = new URL(value);
    const prefix = `/storage/v1/object/public/trip-covers/${familyId}/`;
    if (url.origin !== new URL(base).origin || url.username || url.password || url.search || url.hash
      || !url.pathname.startsWith(prefix)) return null;
    const file = url.pathname.slice(prefix.length);
    if (!new RegExp(`^${tripId}-[0-9]+\\.(png|jpg|jpeg|webp)$`).test(file)) return null;
    return `${familyId}/${file}`;
  } catch { return null; }
}
export function publicChildData(data) {
  if (!data?.enabled) return { enabled: false, trips: [] };
  return { ...data, trips: (data.trips || []).map(trip => ({
    ...trip, cover_image_url: trip.cover_image_url ? `/api/child/cover?tripId=${encodeURIComponent(trip.id)}` : null,
  })) };
}
