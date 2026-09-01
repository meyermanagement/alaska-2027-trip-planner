// What to ask for when a trip needs a picture.
//
// The Field Journal look wants a plate behind every trip, and the family has no
// photographs of places they have not been to yet. Buying one is worse than it
// sounds: a stock photograph of Alaska carries a licence, an attribution line,
// and somebody else's idea of what this trip looks like -- the same glacier
// every other travel app is using. So the app draws its own.
//
// Which puts the whole weight on the prompt. The picture has to survive being
// desaturated to two tones, dropped to half strength, masked out towards the
// bottom left and covered by a scrim -- so anything the prompt allows that
// depends on colour, on fine detail, or on the bottom third of the frame is
// wasted, and anything busy turns to mud.
//
// Hence the rules below, and they are rules rather than suggestions because a
// picture that comes back wrong costs forty seconds and a second press:
//
//   Wide, flat shapes, no photorealism. Detail disappears at half opacity.
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
 * The whole instruction, as one paragraph.
 *
 * @param {object} trip   name, destination, start_date
 * @param {string} extra  the family's own words, when they asked for another go
 */
export function coverPrompt(trip = {}, extra = "") {
  const subject = coverSubject(trip);
  const season = coverSeason(trip.start_date);
  const note = String(extra || "").trim();

  return [
    `A wide landscape illustration of ${subject}${season ? `, in ${season}` : ""}.`,
    "Flat vector-style shapes with clean silhouettes and simple layered depth, like a mid-century national-park poster or a printed travel plate.",
    "One clear, recognizable landmark or landform of this place fills the upper right of the frame.",
    "Warm, muted, low-contrast palette: sand, cream, deep spruce green, warm brown.",
    "Keep the lower-left third of the image open, quiet and uncluttered.",
    "No text, letters, numbers, logos or signage of any kind.",
    "No people, no faces, no vehicles in the foreground.",
    "Calm and spacious, not busy. No photorealism, no 3D render, no heavy texture, no frame or border.",
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
