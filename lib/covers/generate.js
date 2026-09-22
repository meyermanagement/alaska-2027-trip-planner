// Drawing a trip's cover, and keeping it.
//
// Four steps, none of which the browser does:
//
//   1. find the trip's point, if it does not have one yet, so the contour
//      drawing behind the picture has a real coastline to project
//   2. ask Gemini for an illustration
//   3. put the PNG in Storage under the trip's own id
//   4. write the URL, the alt text and the prompt back onto the trip
//
// Step one is here rather than in a geocoding job of its own because it is the
// same press: the family asks for a picture of a place, and the two things this
// app wants to know about a place are what it looks like and where it is.
//
// The ladder is the same idea as the text models in lib/agent/providers/gemini.js
// and for the same reason -- the flash models return 503 "high demand" often
// enough that a single-model call is a coin toss -- but it is a separate list,
// because the image models are separate models with separate quotas.

import { createAdminClient } from "@/lib/supabase/admin";
import { usageFrom } from "@/lib/agent/providers/gemini";
import { recordUsage } from "@/lib/agent/usage";
import { coverAlt, coverPrompt, coverSubject } from "./prompt";
import {
  destinationStops,
  destinationUrl,
  itineraryStops,
  pointFrom,
  tripPoint,
} from "@/lib/places/photon";
import { aiAllowed } from "@/lib/beta/consent";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Newest first. Nano Banana 2 draws the flat poster style this look wants more
// reliably than 2.5 does; 2.5 is kept because it is the one that has been
// generally available longest and is the honest fallback when the new one is
// busy. gemini-3-pro-image is deliberately absent: it is several times the cost
// for a picture that will be shown at half opacity behind a scrim, which is not
// a place where the extra fidelity survives. Put it in with GEMINI_IMAGE_MODELS
// if that judgement turns out to be wrong.
const DEFAULT_IMAGE_MODELS = [
  "gemini-3.1-flash-image",
  "gemini-2.5-flash-image",
];

export function imageModelList() {
  const env = (process.env.GEMINI_IMAGE_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return env.length ? env : DEFAULT_IMAGE_MODELS;
}

const RETRYABLE = new Set([500, 502, 503, 504]);

/**
 * One request to one model. Returns { mimeType, data } or throws.
 *
 * Ninety seconds, which is long for this app and right for this call: an image
 * generation is twenty to forty seconds on a good day, and a timeout that fires
 * at thirty would spend the request and throw the picture away.
 */
async function askOnce(model, prompt, key, signal) {
  const startedAt = Date.now();
  const res = await fetch(`${BASE}/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseModalities: ["IMAGE"] },
    }),
    signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    const err = new Error(`${model} ${res.status} ${body.slice(0, 300)}`);
    err.status = res.status;
    throw err;
  }

  const json = await res.json();
  const parts = json?.candidates?.[0]?.content?.parts || [];
  const image = parts.find((p) => p?.inlineData?.data);
  if (!image) {
    // A model that answers with words instead of a picture has usually refused,
    // and its sentence is the most useful thing in the log.
    const said = parts.find((p) => p?.text)?.text || "no image in the answer";
    const err = new Error(`${model}: ${String(said).slice(0, 300)}`);
    err.status = 422;
    throw err;
  }
  return {
    mimeType: image.inlineData.mimeType || "image/png",
    data: image.inlineData.data,
    // What the picture cost, so a cover can be compared with an answer. Image
    // output is counted in tokens like everything else, and a cover is the only
    // spend in this app that happens without anybody pressing anything.
    usage: {
      model,
      status: res.status,
      ok: true,
      ms: Date.now() - startedAt,
      ...usageFrom(json?.usageMetadata),
    },
  };
}

/** Down the ladder, with one retry per model for the transient failures. */
async function askGemini(prompt, { signal } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  let last = null;
  // Every model that was actually paid, in the order they were asked. A cover
  // that arrives on the third try cost three calls, and only this says so.
  const spend = [];
  let asked = 0;
  for (const model of imageModelList()) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const answer = await askOnce(model, prompt, key, signal);
        if (answer.usage) spend.push({ ...answer.usage, attempt: asked });
        asked += 1;
        return { ...answer, model, spend };
      } catch (err) {
        asked += 1;
        last = err;
        if (signal?.aborted) throw err;
        // Quota is per model, so a 429 means go to the next name rather than
        // wait here. Anything not on the retryable list will not improve on a
        // second identical request either.
        if (!RETRYABLE.has(err.status) || attempt === 1) break;
      }
    }
  }
  const nothing = last || new Error("no image model answered");
  nothing.spend = spend;
  throw nothing;
}

/**
 * Where the trip is, found once and kept.
 *
 * Best effort on purpose: a trip whose destination does not geocode still gets
 * its picture, and simply has no contour drawing behind it. Failing the whole
 * cover over a missing coastline would be the wrong trade.
 */
async function locateTrip(admin, trip, { force = false } = {}) {
  if (!force && Number.isFinite(trip.lat) && Number.isFinite(trip.lon))
    return trip;
  const whole = String(trip.destination || coverSubject(trip)).trim();
  if (!whole) return trip;

  // A destination is written for people, not for a geocoder. "Vancouver, Inside
  // Passage, Denali, Anchorage & Girdwood" is five places and no coordinate, and
  // taking the first that is recognized -- which is what this used to do -- put
  // an Alaskan cruise-tour on Vancouver, because the embarkation port is the
  // thing you say first. So every place named is looked up and the trip's point
  // is the middle of them.
  //
  // A one-place destination gets a second source: the days. "New England" is a
  // region, and Photon answers it with the town of New England, North Dakota,
  // with the right name and every appearance of being right. The days of that
  // trip name Portland, Bar Harbor and Edgartown, and several real places
  // outweigh one wrong town without anything here having to know which regions
  // are regions.
  const stops = destinationStops(whole);
  const points = await lookupStops(stops);
  if (points.length < 3) {
    const { data: days } = await admin
      .from("itinerary_items")
      .select("location")
      .eq("trip_id", trip.id)
      .not("location", "is", null)
      .limit(40);
    const named = itineraryStops((days || []).map((d) => d.location));
    if (named.length) points.push(...(await lookupStops(named)));
  }

  const found = tripPoint(points);
  if (!found) return trip;
  try {
    await admin
      .from("trips")
      .update({
        lat: found.lat,
        lon: found.lon,
        // What was actually believed, which is one of the places named and not
        // the whole string, so a wrong point can be read off the row.
        geo_query: found.name || whole,
        geo_at: new Date().toISOString(),
      })
      .eq("id", trip.id);
  } catch {
    // A point that cannot be saved is still a point worth drawing with.
  }
  return { ...trip, lat: found.lat, lon: found.lon };
}

/**
 * Each of these places, as far as Photon recognizes them. An answer about
 * somewhere else -- "Inside Passage" in Brazil, "Lake Bled" in North Carolina --
 * is dropped by pointFrom rather than believed.
 */
async function lookupStops(stops = []) {
  const points = [];
  for (const stop of stops.slice(0, 8)) {
    try {
      const res = await fetch(destinationUrl(stop), {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const hit = pointFrom(await res.json(), stop);
      if (hit) points.push(hit);
    } catch {
      // One place that cannot be reached should not cost the others.
    }
  }
  return points;
}

/**
 * Find a trip's point again, from scratch.
 *
 * Wanted whenever the destination changes: the point was worked out from the old
 * words, and a trip that moved from Maine to Lisbon should not keep drawing
 * Maine's coastline behind it. Separate from drawing a cover because a family
 * that renames a place has not asked for a new picture.
 */
export async function relocateTrip(tripId) {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "This server cannot locate trips." };
  const { data: trip } = await admin
    .from("trips")
    .select("id, name, destination, lat, lon")
    .eq("id", tripId)
    .maybeSingle();
  if (!trip) return { ok: false, error: "no such trip" };
  const located = await locateTrip(admin, trip, { force: true });
  if (!Number.isFinite(located.lat) || !Number.isFinite(located.lon))
    return { ok: true, lat: null, lon: null };
  return { ok: true, lat: located.lat, lon: located.lon };
}

/**
 * Draw a cover for one trip and save it.
 *
 * @param {string} tripId
 * @param {object} o  { extra } -- the family's words when asking for another go
 * @returns {Promise<{ok: boolean, url?: string, model?: string, error?: string}>}
 */
export async function generateTripCover(
  tripId,
  { extra = "", supabase, userId } = {},
) {
  const admin = createAdminClient();

  // Drawing a cover sends the trip's name and where it goes to an image model,
  // which is a send like any other. The check is here, next to the key, rather
  // than in the route that happens to call it today.
  if (!supabase || !userId) {
    return {
      ok: false,
      refused: true,
      error: "No account named for this request.",
    };
  }
  if (!(await aiAllowed(supabase, userId))) {
    return {
      ok: false,
      refused: true,
      error:
        "Aly is off for this account, so no picture was drawn. Turn AI assistance on in Settings to have her draw one.",
    };
  }

  const { data: trip, error: readErr } = await admin
    .from("trips")
    .select("id, name, destination, start_date, lat, lon, family_id")
    .eq("id", tripId)
    .maybeSingle();
  if (readErr || !trip) return { ok: false, error: "no such trip" };

  const prompt = coverPrompt(trip, extra);
  await admin
    .from("trips")
    .update({ cover_image_status: "drawing", cover_image_prompt: prompt })
    .eq("id", tripId);

  try {
    const located = await locateTrip(admin, trip);
    let picture;
    try {
      picture = await askGemini(prompt);
    } catch (err) {
      await recordUsage(admin, {
        userId,
        feature: "cover.draw",
        calls: err?.spend || [],
      });
      throw err;
    }
    await recordUsage(admin, {
      userId,
      feature: "cover.draw",
      calls: picture.spend || [],
    });

    // Named for the trip and the minute, not for the trip alone. A cover drawn
    // again has to land on a new path: browsers and the CDN both cache a public
    // Storage URL, and overwriting one leaves the family looking at the old
    // picture and being told it is the new one.
    const stamp = Date.now();
    const ext = picture.mimeType.includes("jpeg") ? "jpg" : "png";
    const path = `${located.family_id || "trip"}/${tripId}-${stamp}.${ext}`;

    const { error: upErr } = await admin.storage
      .from("trip-covers")
      .upload(path, Buffer.from(picture.data, "base64"), {
        contentType: picture.mimeType,
        cacheControl: "31536000",
        upsert: false,
      });
    if (upErr) throw new Error(`storage: ${upErr.message}`);

    // A public URL, deliberately, and the reasoning lives in
    // supabase/migrations/20260916_trip_covers_public_by_decision.sql. Short
    // version: this is generated artwork, a signing round trip on every trip card
    // would cost the CDN cache and the offline copy, and the privacy policy says
    // plainly that these pictures sit at an unlisted address.
    //
    // The condition that comes with it: if a family is ever allowed to upload
    // their own photograph as a cover, this bucket has to become private and this
    // call has to become createSignedUrl. That is part of that work, not a
    // follow-up to it.
    const {
      data: { publicUrl },
    } = admin.storage.from("trip-covers").getPublicUrl(path);

    await admin
      .from("trips")
      .update({
        cover_image_url: publicUrl,
        cover_image_alt: coverAlt(trip),
        cover_image_status: "ready",
        cover_image_at: new Date().toISOString(),
      })
      .eq("id", tripId);

    return { ok: true, url: publicUrl, model: picture.model };
  } catch (err) {
    // Recorded on the row rather than only in the log, because the screen has to
    // be able to say "that did not work, try again" rather than spin forever.
    await admin
      .from("trips")
      .update({ cover_image_status: "failed" })
      .eq("id", tripId);
    return { ok: false, error: String(err?.message || err).slice(0, 300) };
  }
}
