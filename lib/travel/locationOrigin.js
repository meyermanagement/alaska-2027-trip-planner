import { LOCATION_TTL } from "@/lib/tips/location";

// Routing needs a tighter point than regional research. Refuse city-scale
// accuracy, and retain a rounded point only in this request / page memory.
export function routingFix(raw, enabled, now = Date.now()) {
  if (!enabled || raw?.source !== "device") return null;
  const { latitude, longitude, accuracy, timestamp } = raw;
  if (![latitude, longitude, accuracy, timestamp].every(Number.isFinite) ||
      Math.abs(latitude) > 90 || Math.abs(longitude) > 180 ||
      accuracy < 0 || accuracy > 1000 || timestamp > now + 30000 ||
      now - timestamp >= LOCATION_TTL) return null;
  return {
    lat: Math.round(latitude * 10000) / 10000,
    lon: Math.round(longitude * 10000) / 10000,
    accuracy: Math.max(20, Math.round(accuracy)), timestamp, source: "device",
  };
}

export function journeyOrigin({ here, isToday, itemId, nextId, previous, home }) {
  if (here && isToday && itemId === nextId)
    return { point: here, fromHere: true, originLabel: "From your current location" };
  return { point: previous || home || null, fromHere: false,
    originLabel: previous ? "From the previous planned stop" : "From home" };
}
