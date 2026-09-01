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
import { coverAlt, coverPrompt, coverSubject } from "./prompt";
import { destinationUrl, pointFrom } from "@/lib/places/photon";

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
  };
}

/** Down the ladder, with one retry per model for the transient failures. */
async function askGemini(prompt, { signal } = {}) {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set");

  let last = null;
  for (const model of imageModelList()) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return { ...(await askOnce(model, prompt, key, signal)), model };
      } catch (err) {
        last = err;
        if (signal?.aborted) throw err;
        // Quota is per model, so a 429 means go to the next name rather than
        // wait here. Anything not on the retryable list will not improve on a
        // second identical request either.
        if (!RETRYABLE.has(err.status) || attempt === 1) break;
      }
    }
  }
  throw last || new Error("no image model answered");
}

/**
 * Where the trip is, found once and kept.
 *
 * Best effort on purpose: a trip whose destination does not geocode still gets
 * its picture, and simply has no contour drawing behind it. Failing the whole
 * cover over a missing coastline would be the wrong trade.
 */
async function locateTrip(admin, trip) {
  if (Number.isFinite(trip.lat) && Number.isFinite(trip.lon)) return trip;
  const whole = String(trip.destination || coverSubject(trip)).trim();
  if (!whole) return trip;

  // A destination is written for people, not for a geocoder: "Vancouver, Inside
  // Passage, Denali, Anchorage & Girdwood" is five places and no coordinate, and
  // asked whole it returns nothing. So the whole string is tried first -- because
  // "Springfield, IL" needs its state -- and then each place named in it, in
  // order, until one is recognized. One point is all a backdrop needs, and the
  // first place named is the one the trip is thought of as starting from.
  const tries = [whole];
  for (const part of whole.split(/,|&|\band\b/)) {
    const one = part.trim();
    if (one && one !== whole) tries.push(one);
  }

  let found = null;
  let query = whole;
  try {
    for (const attempt of tries.slice(0, 6)) {
      const res = await fetch(destinationUrl(attempt), {
        signal: AbortSignal.timeout(6000),
      });
      if (!res.ok) continue;
      const hit = pointFrom(await res.json(), attempt);
      if (hit) {
        found = hit;
        query = attempt;
        break;
      }
    }
    if (!found) return trip;
    await admin
      .from("trips")
      .update({
        lat: found.lat,
        lon: found.lon,
        geo_query: query,
        geo_at: new Date().toISOString(),
      })
      .eq("id", trip.id);
    return { ...trip, lat: found.lat, lon: found.lon };
  } catch {
    return trip;
  }
}

/**
 * Draw a cover for one trip and save it.
 *
 * @param {string} tripId
 * @param {object} o  { extra } -- the family's words when asking for another go
 * @returns {Promise<{ok: boolean, url?: string, model?: string, error?: string}>}
 */
export async function generateTripCover(tripId, { extra = "" } = {}) {
  const admin = createAdminClient();

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
    const picture = await askGemini(prompt);

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
