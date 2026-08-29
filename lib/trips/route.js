// Where a trip lives on the web.
//
// A trip's URL used to be its slug, and its slug was made out of its name. Two
// things were wrong with that. Renaming a trip through Aly regenerated the slug,
// so every link already sitting in a calendar subscription or a reminder email
// died the moment somebody fixed a typo in the trip's name; renaming it through
// Edit details left the slug alone, so the name and the URL quietly drifted
// apart. And a slug on its own does not say which trip it means once there is
// more than one household — (family_id, slug) is unique, not slug, so two
// families can both own alaska-2027, and a lookup on the slug alone comes back
// with two rows and shows a Not Found page for a trip that is right there.
//
// So the URL now carries both: a readable part that exists purely so a link
// looks like something, and a six-character key that never changes and is
// unique across every household. Only the key is used to find the trip. The
// readable part is decoration, which is exactly why renaming is now free.
//
//   /trips/alaska-2027-2453wb
//           ^ decoration  ^ the actual identity

// A key is a digit followed by 5 to 11 more characters from an alphabet with no
// 0/1/i/l/o/u in it — nothing that can be misread off a screen or over the phone.
// The database enforces the same shape, which is what makes it safe to decide
// whether a trailing URL segment is a key just by looking at it.
//
// Two deliberate choices here, and both are about not having to change this line
// later. It always starts with a digit, so a key can never be mistaken for the
// tail of a slug — a trip called "Canada" produces a six-letter tail that would
// otherwise have looked exactly like a key. And the length is a range rather
// than a number, so the database can hand out longer keys as the table grows
// without a single link, redirect or parser needing to change: 6 characters
// holds 194 million trips, 7 holds 5.8 billion, 12 holds more than there will
// ever be. Keys already issued keep the length they were born with, and stay
// valid forever, because nothing here cares how long they are.
export const TRIP_KEY_RE = /^[23456789][23456789abcdefghjkmnpqrstvwxyz]{5,11}$/;

// The readable half is allowed to be missing or wrong. That is the point.
export function tripRef(trip) {
  if (!trip) return "";
  const key = trip.public_id || "";
  const readable = trip.slug || "";
  if (!key) return readable; // a trip read through a select that did not ask for the key
  if (!readable) return key;
  return `${readable}-${key}`;
}

export function tripPath(trip, tab) {
  const ref = tripRef(trip);
  if (!ref) return "/trips";
  return tab ? `/trips/${ref}?tab=${tab}` : `/trips/${ref}`;
}

// Split a URL segment into the key we look the trip up by and the readable part
// we only use to decide whether to correct the address bar.
//
// A tail that is not a key is not a problem: it falls through to the slug lookup,
// which is how the links already sitting in calendar subscriptions keep working.
export function parseTripRef(param) {
  // Stray dashes at either end come from hand-edited and hand-typed URLs. They
  // should not be the difference between finding a trip and a Not Found page.
  const raw =
    typeof param === "string"
      ? param
          .trim()
          .toLowerCase()
          .replace(/^-+|-+$/g, "")
      : "";
  if (!raw) return { key: "", readable: "", raw: "" };
  const cut = raw.lastIndexOf("-");
  if (cut > 0) {
    const tail = raw.slice(cut + 1);
    if (TRIP_KEY_RE.test(tail)) {
      return { key: tail, readable: raw.slice(0, cut), raw };
    }
  }
  // A bare key, from a link that never had a readable part.
  if (TRIP_KEY_RE.test(raw)) return { key: raw, readable: "", raw };
  // Everything else is an old-style slug link, still out there in calendars.
  return { key: "", readable: raw, raw };
}

// True when the address bar is not showing this trip's one canonical address and
// is worth correcting — after a rename, for an old link that carries no key at
// all, and for anything typed in shouting capitals or with a stray dash on the
// end. Compared against the raw parameter rather than the tidied one on purpose:
// the tidying is what lets a scruffy link resolve, and the redirect is what stops
// two spellings of the same trip living side by side in people's history.
export function needsCanonical(trip, param) {
  if (!trip?.public_id) return false;
  return String(param ?? "") !== tripRef(trip);
}

export function slugifyTripName(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

// The slug is only unique within a household, so a free one has to be looked for
// within that household. The old version of this searched every trip the caller
// could see, which under one family was the same thing and under two would have
// stepped around names it had no reason to avoid. The New Trip button did not
// look at all, so a second trip with the same name in one household showed the
// user the raw text of a Postgres constraint violation.
export function pickFreeSlug(base, taken) {
  const used = new Set(taken || []);
  const root = base || "trip";
  if (!used.has(root)) return root;
  for (let n = 2; n < 200; n++) {
    const candidate = `${root}-${n}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export async function freeTripSlug(supabase, familyId, base, excludeId) {
  let query = supabase.from("trips").select("id, slug");
  if (familyId) query = query.eq("family_id", familyId);
  const { data } = await query;
  const taken = (data || [])
    .filter((t) => t.id !== excludeId)
    .map((t) => t.slug)
    .filter(Boolean);
  return pickFreeSlug(slugifyTripName(base), taken);
}
