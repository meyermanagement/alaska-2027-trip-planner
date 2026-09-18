// A fare alert that arrived by email, read and filtered down to what is ours.
//
// The paste route next door reads one fare out of one piece of text a person
// chose to hand over. This reads mail nobody chose: a Thrifty Traveler send has
// eight fares in it, seven of which leave from airports this household has never
// flown out of, to places nobody here wants to go. Saving all eight would turn the
// bucket list into a deals blog, which is the one thing the schema comment for
// flight_deals says this feature is not.
//
// So the pipeline is: read every fare in the mail, then keep only the fares that
// match something the family has already written down. Matching means two things
// at once. It has to leave from one of their own airports -- the home airports
// table exists precisely so a fare out of Newark can be dismissed without a
// conversation -- and it has to be about a place they have either put on the
// bucket list or already built a trip for. A fare that matches only one of the two
// is dropped, and the message says why in words, because "I read your Thrifty
// Traveler email and none of the eight fares were for you" is a useful thing to be
// able to read and an empty screen is not.
//
// Everything a fare claims still goes through checkCandidate, unchanged, for the
// same reason as a paste: a model reading a newsletter will happily attach the
// $348 headline to the wrong route. And the verdict -- under the ceiling, in the
// right months, enough seats, clashes with the horse show -- is still computed
// when the card is read, never stored here. This file's whole job is deciding
// which fares are worth having a row at all.

import { createAdminClient } from "@/lib/supabase/admin";
import { generate as callModel } from "@/lib/agent/llm";
import { checkCandidate, hardParse } from "@/lib/deals/parse";
import { originCheck, somedayFor, tripFor } from "@/lib/deals/verdict";
import { creditFor } from "@/lib/deals/senders";
import { newsletterFares, fareReadInput } from "@/lib/deals/newsletter";

const SYSTEM =
  "You read fare alert emails and return JSON. You never invent a number, a date, an airline or an airport that is not in the text you were given. A field you cannot prove is left out. You return the JSON object and nothing else.";

// Enough for a long newsletter and short of the point where the answer stops
// being one JSON object the model can hold in its head.
const MAX_FARES = 64;

/**
 * The instruction, asking for every fare rather than the best one.
 *
 * The proven facts go in exactly as they do for a paste, but they cover the whole
 * email here: the prices list is every price in the send, so the model choosing
 * among them can still only choose numbers that are written down. What it cannot
 * do from that list alone is keep them straight, which is what the one-object-per-
 * fare shape and the "do not mix two routes" instruction are for.
 */
export function manyBrief(text, hard, source, airports = []) {
  return [
    `Read this fare alert email and return JSON: {"fares": [ ... ]}, one object per distinct fare offered in it, at most ${MAX_FARES}. No prose, no markdown fence.`,
    airports.length
      ? `ONLY extract fares departing from these household airports: ${airports.map((a) => a.code).join(", ")}. Filter origins BEFORE applying the limit. These codes must be departures, not connections or destinations. Read the entire email, including later departure-city sections.`
      : "",
    "",
    "Fields on each fare: origin (3-letter airport code), destination (the city or country as written), destination_code (3-letter code, only if one is written), price (one number, per person, no currency symbol), cabin (economy|premium|business|first), airline, book_by (YYYY-MM-DD), travel_start (YYYY-MM-DD), travel_end (YYYY-MM-DD), travel_months (array of month numbers 1-12 the fare can be flown in), deadline_said (the sentence saying how long the fare will last, copied word for word), seats (integer), notes (one short line, only what the text says).",
    "",
    "Rules. Use only what is written. One object per route: do not put the price of one fare on the origin of another, and do not merge two cities into one fare. Skip anything that is not a fare -- a newsletter is full of headlines, adverts and a footer. Leave a field out entirely rather than guessing it; a missing date is fine and a wrong one is not. Do not convert a month name into a date unless the day is written too; put the months in travel_months instead, which is exactly what it is for -- an alert that says availability runs October to February should come back with those five months on it. Copy deadline_said word for word from the email or leave it out; do not write your own version of it. Do not round a price. Do not name an airline the text does not name. If the email offers no fares at all, return an empty list.",
    "",
    `Prices written in this email: ${hard.prices.length ? hard.prices.map((p) => `$${p}`).join(", ") : "none"}. Every price you return must be one of these.`,
    `Airport codes written in this email: ${hard.codes.length ? hard.codes.join(", ") : "none"}. Every code you return must be one of these.`,
    `Dates written in this email: ${hard.dates.length ? hard.dates.join(", ") : "none"}. Every date you return must be one of these.`,
    `Months named in this email: ${hard.months?.length ? hard.months.join(", ") : "none"}. Every month you return must be one of these.`,
    source?.name ? `Where it came from: ${source.name}.` : "",
    "",
    "The email:",
    fareReadInput(text, airports).slice(0, 24000),
  ]
    .filter((line) => line !== "")
    .join("\n");
}

/** The list of fares out of whatever the model wrapped it in. */
export function faresFrom(text) {
  const said = String(text || "").trim();
  const fenced = said.match(/```(?:json)?\s*([\s\S]*?)```/);
  const body = fenced ? fenced[1] : said;
  const start = body.search(/[[{]/);
  if (start < 0) return [];
  const end = Math.max(body.lastIndexOf("}"), body.lastIndexOf("]"));
  if (end <= start) return [];
  let parsed;
  try {
    parsed = JSON.parse(body.slice(start, end + 1));
  } catch {
    return [];
  }
  const list = Array.isArray(parsed) ? parsed : parsed?.fares;
  if (!Array.isArray(list)) return [];
  return list
    .filter((row) => row && typeof row === "object")
    .slice(0, MAX_FARES);
}

/**
 * Whether this fare is about this household, and which of their lines it answers.
 *
 * Both halves have to hold. The origin test is the cheap one and does most of the
 * work: a newsletter's fares leave from thirty airports and three of them are
 * theirs. The destination test is the one that decides whether a fare is worth a
 * row at all -- an open bucket-list line, or a trip that already exists.
 *
 * When the family has recorded no home airports at all, the origin test cannot
 * mean anything, so it is skipped rather than used to reject everything. That is
 * the honest reading of an empty table: not "they fly from nowhere" but "nobody
 * has said yet".
 */
export function matchHousehold(
  row,
  { airports = [], someday = [], trips = [] },
) {
  const origin = originCheck(row, airports);
  if (airports.length && origin.verdict !== "ours") {
    return {
      ok: false,
      why: `it leaves from ${row.origin}, which is not an airport you fly from`,
    };
  }
  const place = somedayFor(row, someday.filter((place) => place.watch !== false));
  const trip = tripFor(row, trips);
  if (!place && !trip) {
    return {
      ok: false,
      why: `nothing on your bucket list or in your trips is about ${row.destination}`,
    };
  }
  return {
    ok: true,
    someday_id: place?.id || null,
    // Named for the message, not stored: trip_id on a fare means somebody took it
    // onto that trip, and nobody has decided that yet.
    trip: trip?.name || null,
    place: place?.place || null,
  };
}

/**
 * Read a forwarded fare alert and save the fares that are ours.
 *
 * Called from the inbox parser with the text it already assembled, so the mail is
 * read once. Returns a sentence-worth of outcome for the message row: how many
 * were saved, and, when none were, the reason the last fare was turned down --
 * which is nearly always the same reason as the others and is more use than
 * "nothing matched".
 */
export async function readForwardedFares({
  messageId,
  familyId,
  text,
  from,
  // When the mail arrived, which is the only honest clock to measure a sender's
  // "this will last about a day" against.
  receivedAt = null,
  // The household member whose permission covers this read. Forwarded mail
  // arrives on a webhook with no session, and the model door refuses a call
  // that cannot name somebody -- so the caller, which has just asked the
  // household whether this is allowed, hands the answer down rather than
  // leaving the door to guess.
  consentFor = null,
}) {
  const admin = createAdminClient();
  if (!admin) return { saved: 0, why: "no admin client" };

  const source = { name: creditFor(from?.email, from?.name), url: null };
  const hard = hardParse(text);
  if (!hard.prices.length)
    return { saved: 0, why: "there was no price anywhere in that email" };

  const [{ data: airports }, { data: someday }, { data: trips }] =
    await Promise.all([
      admin
        .from("home_airports")
        .select("id, code, drive_minutes, is_primary")
        .eq("family_id", familyId),
      admin
        .from("someday_places")
        .select("id, place, region, status, months, fare_ceiling, watch")
        .eq("family_id", familyId),
      admin
        .from("trips")
        .select("id, name, destination, status, start_date, end_date")
        .eq("family_id", familyId),
    ]);

  const world = {
    airports: airports || [],
    // A bucket-list line with the watch switched off is a place they still want
    // and do not want mail about, and forwarded fares are exactly the mail it was
    // switched off to stop.
    someday: (someday || []).filter((row) => row.watch !== false),
    trips: trips || [],
  };
  // Nothing to match against means nothing can match, and spending a model call
  // to discover that would be spending it on every send until the family writes
  // a bucket list.
  if (!world.someday.length && !world.trips.length)
    return {
      saved: 0,
      why: "there is nothing on your bucket list or in your trips yet to match a fare against",
    };

  // Structured route lists can be read exactly, without asking a model to
  // summarize the first ten lines of a hundred-route newsletter.
  const table = newsletterFares(text, world.airports);
  let candidates = table.fares;
  if (!table.complete) {
    let answer;
    const input = fareReadInput(text, world.airports);
    try {
      answer = await callModel({
        feature: "deals.forwarded",
        system: SYSTEM,
        messages: [{
          role: "user",
          text: manyBrief(input, hardParse(input), source, world.airports),
        }],
        temperature: 0,
        thinking: "low",
        deadline: Date.now() + 40000,
        consentFor,
      });
    } catch (error) {
      console.error("forwarded fares: model call failed", messageId, error);
      throw error;
    }
    // Exact route/price pairs win over model readings of the same route.
    const exact = new Set(candidates.map((row) => `${row.origin}|${row.destination_code}`));
    candidates = [...candidates, ...faresFrom(answer?.text).filter(
      (row) => !exact.has(`${row.origin}|${row.destination_code}`),
    )];
  }

  if (!candidates.length)
    return { saved: 0, why: table.complete
      ? "none of the listed fares leave from an airport you fly from"
      : "I could not find a fare in that email" };

  // Fares already on the list, so a newsletter that repeats last week's fare does
  // not put it on the bucket list twice. Compared on the three things that make a
  // fare the same fare rather than on an id nobody has.
  const { data: already } = await admin
    .from("flight_deals")
    .select("origin, destination, price")
    .eq("family_id", familyId)
    .in("status", ["open", "dismissed", "taken"]);
  const seen = new Set(
    (already || []).map(
      (row) =>
        `${row.origin}|${String(row.destination || "").toLowerCase()}|${Number(row.price)}`,
    ),
  );

  const rows = [];
  let lastWhy = "";
  for (const candidate of candidates) {
    const checked = checkCandidate(candidate, {
      text,
      hard,
      source,
      receivedAt,
    });
    if (!checked.ok) {
      lastWhy = checked.why;
      continue;
    }
    const match = matchHousehold(checked.row, world);
    if (!match.ok) {
      lastWhy = match.why;
      continue;
    }
    const key = `${checked.row.origin}|${checked.row.destination.toLowerCase()}|${checked.row.price}`;
    if (seen.has(key)) {
      lastWhy = `you already have the ${checked.row.origin} fare to ${checked.row.destination}`;
      continue;
    }
    seen.add(key);
    rows.push({
      ...checked.row,
      someday_id: match.someday_id,
      family_id: familyId,
      message_id: messageId,
    });
  }

  if (!rows.length)
    return { saved: 0, why: lastWhy || "none of those were for you" };

  const { error } = await admin.from("flight_deals").insert(rows);
  if (error) {
    console.error("forwarded fares: insert failed", messageId, error);
    throw new Error(error.message);
  }

  return { saved: rows.length, why: "" };
}
