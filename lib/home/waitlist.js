// The waitlist on the front door: what a submission may contain, and how often
// one address may send it.
//
// The list exists for two things only -- inviting families into the beta and
// recruiting organizers for the Alyeska Groups pilot and the nonprofit program
// (decided September 23, 2026). Nothing here collects more than that needs: a name to address the invitation
// to, an address to send it to, and the two answers that sort families from
// organizers.

export const WAITLIST_SOURCE = "home";
export const WAITLIST_EMAIL_MAX = 254;
export const WAITLIST_NAME_MAX = 80;
// 6 means six or more.
export const WAITLIST_SIZES = [1, 2, 3, 4, 5, 6];

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Trimmed, inner runs of spaces collapsed, and nothing that is not printable.
function cleanName(value) {
  if (typeof value !== "string") return "";
  return value.replace(/[\u0000-\u001f\u007f]/g, "").replace(/\s+/g, " ").trim();
}

const YES = new Set([true, "true", "on", "1", 1, "yes"]);

// A bot fills every field it can find, including one no person ever sees.
export const WAITLIST_HONEYPOT = "website";

export function waitlistEntry(input = {}) {
  if (String(input[WAITLIST_HONEYPOT] ?? "").trim()) return { ok: true, spam: true };
  const first = cleanName(input.first_name);
  if (!first) return { ok: false, field: "first_name", error: "Add your first name." };
  if (first.length > WAITLIST_NAME_MAX) return { ok: false, field: "first_name", error: "That first name is too long." };
  const last = cleanName(input.last_name);
  if (!last) return { ok: false, field: "last_name", error: "Add your last name." };
  if (last.length > WAITLIST_NAME_MAX) return { ok: false, field: "last_name", error: "That last name is too long." };
  const raw = typeof input.email === "string" ? input.email.trim().toLowerCase() : "";
  if (!raw || raw.length > WAITLIST_EMAIL_MAX || !EMAIL.test(raw)) {
    return { ok: false, field: "email", error: "That email address doesn't look right." };
  }
  let size = input.household_size;
  if (size === "" || size === undefined || size === null) size = null;
  else {
    size = String(size).trim() === "6+" ? 6 : Number(size);
    if (!WAITLIST_SIZES.includes(size)) {
      return { ok: false, field: "household_size", error: "Choose a number of travelers from the list." };
    }
  }
  return {
    ok: true,
    row: {
      first_name: first,
      last_name: last,
      email: raw,
      household_size: size,
      organizer: YES.has(input.organizer),
      source: WAITLIST_SOURCE,
    },
  };
}

// A per-instance throttle. Serverless instances do not share memory, so this
// slows a single noisy client rather than guaranteeing a global limit; the
// unique email and the honeypot carry the rest.
export function makeThrottle({ limit = 5, windowMs = 10 * 60 * 1000 } = {}) {
  const hits = new Map();
  return function allow(key, now = Date.now()) {
    const recent = (hits.get(key) || []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) { hits.set(key, recent); return false; }
    recent.push(now);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [k, times] of hits) if (!times.some((t) => now - t < windowMs)) hits.delete(k);
    }
    return true;
  };
}
