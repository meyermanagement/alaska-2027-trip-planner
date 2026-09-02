// A photograph of the actual restaurant.
//
// There is no honest way to get one without asking a service that knows what
// buildings look like, so this asks Google Places - the same data behind the map
// link - and only when a key is configured for it. No key means no photo, and no
// stock photograph of somebody else's terrace standing in for the real thing.
//
// The key never reaches the browser: a photo is served through our own route,
// which is also why an expiring Google URL cannot break a saved conversation.

const SEARCH_URL = "https://places.googleapis.com/v1/places:searchText";
const FIELDS = [
  "places.id",
  "places.displayName",
  "places.formattedAddress",
  "places.rating",
  "places.userRatingCount",
  "places.websiteUri",
  "places.photos",
  // Needed to say how far away something is. Without it a distance would be a
  // distance to whatever the name happened to match.
  "places.location",
].join(",");

// Generous enough for a real answer, mean enough that a slow lookup cannot cost
// the family their reply. Photos are a nicety; the answer is not.
const LOOKUP_MS = 2500;

export function photosConfigured() {
  return Boolean(process.env.GOOGLE_PLACES_API_KEY);
}

/** One place, looked up by name. Returns null rather than throwing, always. */
export async function lookUpPlace(place, { signal, bias = null } = {}) {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (!key || !place?.name) return null;
  const query = [place.name, place.area].filter(Boolean).join(", ");
  try {
    const res = await fetch(SEARCH_URL, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "X-Goog-Api-Key": key,
        "X-Goog-FieldMask": FIELDS,
      },
      body: JSON.stringify({
        textQuery: query,
        maxResultCount: 1,
        // Where the family is standing, when they have said. Two restaurants
        // share a name often enough that this is the difference between the one
        // down the road and one in another country.
        ...(bias ? { locationBias: bias } : {}),
      }),
      signal,
    });
    if (!res.ok) return null;
    const json = await res.json();
    const found = json?.places?.[0];
    if (!found) return null;
    const photo = found.photos?.[0]?.name;
    return {
      address:
        typeof found.formattedAddress === "string"
          ? found.formattedAddress
          : null,
      rating: typeof found.rating === "number" ? found.rating : null,
      ratingCount:
        typeof found.userRatingCount === "number"
          ? found.userRatingCount
          : null,
      // Google's own record of the website beats anything the model remembered.
      website: typeof found.websiteUri === "string" ? found.websiteUri : null,
      // Not a URL: a name our own photo route knows how to fetch.
      photo: typeof photo === "string" && photo ? photo : null,
      lat:
        typeof found.location?.latitude === "number"
          ? found.location.latitude
          : null,
      lon:
        typeof found.location?.longitude === "number"
          ? found.location.longitude
          : null,
    };
  } catch {
    return null;
  }
}

/**
 * Fill in what can be found for a shortlist, all at once.
 *
 * Every failure is silent by design. A card with no photograph is still a good
 * card; a reply that never arrived because a photo service was down is not.
 */
export async function enrich(places, { bias = null } = {}) {
  if (!Array.isArray(places) || !places.length || !photosConfigured()) {
    return places || [];
  }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), LOOKUP_MS);
  try {
    const found = await Promise.all(
      // A listing and a rental car are not on the map. "Sunny 2BR walk to
      // Kaanapali" or "Jeep Wrangler" looked up against Google Places finds
      // some unrelated building or dealership and staples its photograph,
      // address and coordinates to the card, which is worse than a card with
      // no picture: it would be a wrong address on a confident-looking card.
      places.map((place) =>
        place?.via || place?.kind === "car"
          ? null
          : lookUpPlace(place, { signal: controller.signal, bias }),
      ),
    );
    return places.map((place, i) => {
      const extra = found[i];
      if (!extra) return place;
      return {
        ...place,
        photo: extra.photo || place.photo,
        website: extra.website || place.website,
        rating: extra.rating ?? place.rating,
        ratingCount: extra.ratingCount ?? null,
        address: extra.address || null,
        lat: extra.lat,
        lon: extra.lon,
      };
    });
  } catch {
    return places;
  } finally {
    clearTimeout(timer);
  }
}
