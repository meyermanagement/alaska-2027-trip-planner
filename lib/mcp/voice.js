// The voice surface: what Alyeska answers when the assistant is a speaker in a
// room (Alexa+) rather than a chat on one person's screen.
//
// Two things change. A speaker answers everyone in earshot, children and
// guests included, so anything a family would not want read aloud is held
// back: budgets and spending, Wallet balances and cards, fares and fare
// ceilings, card offers, insurance, and document and pet-record expiration
// dates. And a speaker has no screen to confirm a change on, so the surface
// is read-only: no write tool is listed, and a call to one is refused.
//
// This sits on top of every rule the full surface already applies (RLS, the
// minor and health filters, never returning document, member, policy or
// microchip numbers). It only ever removes.

export const VOICE_TOOLS = new Set([
  "list_trips",
  "get_trip",
  "get_travelers",
  "get_itinerary_day",
  "get_day_pack",
  "get_packing_status",
  "get_reminders",
  "get_house_tasks",
  "get_deadlines",
  "get_trip_essentials",
  "get_pro_tips",
  "get_nearby_tips",
  "get_preferences",
  "get_prior_reviews",
  "get_pets",
  "get_bucket_list",
  "get_trip_log",
]);

export const VOICE_INSTRUCTIONS =
  "Read-only access to one household's saved travel in Alyeska, for answers spoken aloud: trips, one itinerary day at a time with booking advice, packing and day packs, reminders, house tasks, booking windows, trip essentials, pro tips, preferences, pets, bucket list, favorite moments and past reviews. Answer in a sentence or two a person can take in by ear: lead with the answer, say times the way people say them, and offer more rather than reading a whole list. Anyone in the room can hear the answer, so this connection does not share budgets, spending, Wallet balances or cards, fares, insurance, or passport, license or pet-record dates. When someone asks for those, or asks to change, check off or add anything, say it can be done in the Alyeska app. Health and allergy details, typed notes, and confirmation, ID, member, policy and microchip numbers are never shared. A parent also hears their children's packing and day pack items; nothing else about a child is shared.";

export const VOICE_REFUSAL =
  "That isn't available by voice. It can be seen or changed in the Alyeska app.";

export function isVoiceTool(name) {
  return VOICE_TOOLS.has(name);
}

export function voiceTools(tools) {
  return tools.filter((t) => VOICE_TOOLS.has(t.name));
}

const MONEY_TOPIC = /money|budget|spend|cost|price|points|reward|card/i;
const PET_DATES = ["rabies_expires", "health_certificate_expires", "coggins_expires"];

// A tool's result with what a room should not hear taken out. The summary is
// rebuilt wherever it named something removed, because the summary is what
// gets spoken.
export function voiceResult(name, result) {
  if (!result || typeof result !== "object") return result;
  if (name === "get_deadlines") {
    const deadlines = (result.deadlines || []).filter((d) => d.kind === "booking window");
    const trip = result.trip?.name;
    return {
      ...result,
      deadlines,
      summary: deadlines.length
        ? `${deadlines.length} booking window${deadlines.length === 1 ? "" : "s"} coming up: ${deadlines
            .map((d) => `${d.what}${d.trip ? ` for ${d.trip}` : ""} opens ${d.date}`)
            .join("; ")}.`
        : `No booking windows coming up${trip ? ` for ${trip}` : ""}.`,
    };
  }
  if (name === "get_preferences") {
    const preferences = (result.preferences || []).filter(
      (p) => !(p.topics || []).some((t) => MONEY_TOPIC.test(String(t))),
    );
    if (preferences.length === (result.preferences || []).length) return result;
    return {
      ...result,
      preferences,
      summary: preferences.length
        ? `${preferences.length} preference${preferences.length === 1 ? "" : "s"}${result.trip ? ` for ${result.trip.name}` : ""}: ${preferences.map((p) => p.preference).join(" | ")}`
        : "No preferences to share by voice.",
    };
  }
  if (name === "get_pets") {
    return {
      ...result,
      pets: (result.pets || []).map((p) => {
        const out = { ...p };
        for (const k of PET_DATES) delete out[k];
        return out;
      }),
    };
  }
  if (name === "get_bucket_list") {
    return {
      ...result,
      places: (result.places || []).map(({ fare_ceiling: _f, watching_fares: _w, ...p }) => p),
    };
  }
  return result;
}
