// What to ask for when a trip needs a picture.
//
// The Field Journal look wants a plate behind every trip, and the family has no
// photographs of places they have not been to yet. Buying one is worse than it
// sounds: a stock photograph of Alaska carries a licence, an attribution line,
// and somebody else's idea of what this trip looks like -- the same glacier
// every other travel app is using. So the app draws its own.
//
// Which puts the whole weight on the prompt. The picture has to survive being
// desaturated, dropped to half strength, masked out towards the bottom left
// and covered by a scrim -- so anything the prompt allows that depends on
// fine detail or on the bottom third of the frame is wasted, and anything busy
// turns to mud.
//
// Hence the rules below, and they are rules rather than suggestions because a
// picture that comes back wrong costs forty seconds and a second press:
//
//   Soft editorial airbrush, no photorealism. Gradients survive the treatment
//     better than flat two-tone plates do, and they age better on the card.
//   Nothing in the lower left. That is where the mask fades and the trip's
//     name sits.
//   No text of any kind. Generated lettering is unreliable and the card
//     already says where the trip is.
//   No people and no faces. A stranger on a family's own trip card is worse
//     than an empty landscape.
//   One clear silhouette. A card is read at 300px on a phone.
//
// This file is pure, so the wording can be checked without spending a request.

/**
 * The subject, worked out from what the trip already knows.
 *
 * Destination first, because it is the one field written to be a place. The
 * trip's name is the fallback, and it is a decent one -- families name a trip
 * after where it goes -- but it carries a year that must come off, or the model
 * is asked to draw "2027".
 */
export function coverSubject(trip = {}) {
  const dest = String(trip.destination || "").trim();
  if (dest) return dest;
  return (
    String(trip.name || "")
      .replace(/\b(19|20)\d{2}\b/g, "")
      .replace(/\s{2,}/g, " ")
      .trim() || "a journey"
  );
}

/**
 * The season, so a trip is not drawn in the wrong light.
 *
 * Northern hemisphere assumption, stated rather than hidden: this family's trips
 * are Alaska, Disney, Curacao, Iowa and Portugal, all north of the equator. A
 * southern destination gets the opposite season, which is a real fault and a
 * cheap one to fix the day it matters.
 */
export function coverSeason(startDate) {
  const m = Number(String(startDate || "").slice(5, 7));
  if (!m) return "";
  if (m <= 2 || m === 12) return "winter";
  if (m <= 5) return "spring";
  if (m <= 8) return "summer";
  return "autumn";
}

/**
 * The palette hint for a destination, so an editorial cover of Alaska comes
 * back cool and an editorial cover of Curacao comes back warm.
 *
 * Palette should follow the place. Alaska wants the greys and blues of a north
 * coast; the Caribbean wants turquoise, coral and cream; a European city wants
 * ochre and terracotta and slate. If we asked for the same warm terracotta on
 * every trip we would be back where we started -- ten different places all
 * looking like siblings on the shelf.
 *
 * A very small dictionary of substrings, matched case-insensitively against the
 * destination string. The default palette is a warm neutral, which is what an
 * editorial travel magazine would fall back to too. If the family adds a trip
 * whose region is not in the table, the default is fine -- and adding a hint is
 * a one-line change here rather than a call to the model.
 */
export function coverPalette(subject = "") {
  const s = String(subject).toLowerCase();

  // Northern coasts and cold places -- greys, blues, spruce.
  if (
    /alaska|iceland|norway|greenland|patagonia|antarctic|siberia|newfoundland|labrador|yukon/.test(
      s,
    )
  ) {
    return "cool northern palette: pale slate blue, deep ocean, fog grey, spruce green, warm ivory as the only warm note";
  }

  // Tropical -- turquoise, coral, sand.
  if (
    /caribbean|curacao|curaçao|jamaica|barbados|bahamas|cuba|puerto rico|dominican|aruba|hawaii|maui|tahiti|fiji|maldives|seychelles|bermuda|caymans|virgin islands|st\. |saint /.test(
      s,
    )
  ) {
    return "tropical palette: turquoise water, coral pink, warm sand, soft cream, a single deep teal accent";
  }

  // Mediterranean / iberian -- warm ochre, terracotta, chalky white, teal sea.
  if (
    /portugal|lisbon|porto|spain|barcelona|madrid|seville|italy|rome|florence|venice|amalfi|sicily|greece|athens|santorini|croatia|dubrovnik|malta|morocco|tunisia/.test(
      s,
    )
  ) {
    return "mediterranean palette: warm ochre, terracotta, chalky white, muted olive, a soft teal for water and sky";
  }

  // Central / northern Europe -- softer greens, dove greys, warm stone.
  if (
    /france|paris|london|england|britain|scotland|ireland|germany|berlin|munich|austria|vienna|switzerland|belgium|netherlands|amsterdam|denmark|copenhagen|prague|budapest/.test(
      s,
    )
  ) {
    return "cool european palette: dove grey, warm stone, soft sage, muted plum, cream highlights";
  }

  // Japan / east Asia -- ink black, warm rice paper, cherry, faded indigo.
  if (
    /japan|tokyo|kyoto|osaka|okinawa|china|beijing|shanghai|korea|seoul|vietnam|thailand|bali|indonesia|singapore|malaysia|taiwan|hong kong/.test(
      s,
    )
  ) {
    return "east-asian palette: soft ink grey, warm rice paper, faded indigo, a single dusty rose accent";
  }

  // Southwest US / desert -- terracotta, sage, sky blue, sandstone.
  if (
    /arizona|utah|nevada|new mexico|santa fe|sedona|moab|grand canyon|zion|joshua tree|mojave|sahara|sonoran|namibia|petra|jordan/.test(
      s,
    )
  ) {
    return "desert palette: sandstone terracotta, sage green, dusty sky blue, cream, deep sunset orange as a single warm accent";
  }

  // Florida / Gulf theme parks -- soft coral, cream, warm gold, pale teal.
  if (/florida|disney|orlando|miami|tampa|key west|gulf coast/.test(s)) {
    return "warm coastal palette: soft coral, warm gold, pale teal sky, cream, a single deeper terracotta accent";
  }

  // Midwest and Great Plains -- prairie greens, warm ochre, big sky.
  if (
    /iowa|nebraska|kansas|dakota|minnesota|wisconsin|indiana|illinois|missouri|kentucky|ohio|michigan|great plains|midwest/.test(
      s,
    )
  ) {
    return "prairie palette: warm ochre, sage green, wheat gold, big-sky blue, cream";
  }

  // Mountain west -- cool greens, granite grey, alpine blue, evergreen.
  if (
    /colorado|wyoming|montana|idaho|banff|jasper|whistler|rockies|yellowstone|glacier|tetons|aspen|telluride|alps|dolomites/.test(
      s,
    )
  ) {
    return "alpine palette: granite grey, deep evergreen, cold sky blue, snow white, a single warm cabin brown";
  }

  // Default -- what a travel magazine would print if nothing else was known.
  return "warm editorial palette: terracotta, cream ivory, soft teal, muted sage, a single deep brown accent";
}

/**
 * The whole instruction, as one paragraph.
 *
 * @param {object} trip   name, destination, start_date
 * @param {string} extra  the family's own words, when they asked for another go
 */
export function coverPrompt(trip = {}, extra = "") {
  const subject = coverSubject(trip);
  const season = coverSeason(trip.start_date);
  const palette = coverPalette(subject);
  const note = String(extra || "").trim();

  return [
    `A wide editorial travel illustration of ${subject}${season ? `, in ${season}` : ""}.`,
    "Soft airbrushed style, like a modern high-end travel magazine cover. Smooth gradients, gentle atmosphere, hand-painted feel rather than crisp vector shapes.",
    "One clear, recognizable landform, coastline or landmark of this place anchors the composition in the upper right of the frame.",
    `Palette: ${palette}. Muted and low-contrast, nothing saturated or neon.`,
    "Keep the lower-left third of the image open, quiet and uncluttered. Sky, water, mist or empty ground there, not detail.",
    "No text, letters, numbers, logos or signage of any kind.",
    "No people, no faces, no vehicles in the foreground.",
    "Calm and spacious, not busy. No photorealism, no 3D render, no heavy grain or texture, no frame or border.",
    note ? `Also: ${note}.` : "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * What the picture shows, in words.
 *
 * Written from the same facts rather than from the picture, which is a real
 * limitation and worth naming: this describes what was asked for, not what came
 * back. It is still better than an empty alt attribute, and better than the file
 * name, which is what a screen reader would otherwise be handed.
 */
export function coverAlt(trip = {}) {
  const subject = coverSubject(trip);
  const season = coverSeason(trip.start_date);
  return `An illustration of ${subject}${season ? ` in ${season}` : ""}, drawn for this trip.`;
}
