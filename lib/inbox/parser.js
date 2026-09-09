// Read a forwarded booking confirmation and hand back the itinerary rows it
// implies. The webhook writes the message and its attachments first; this
// runs immediately after as fire-and-forget from the same request, so by the
// time the primary opens /inbox each card already knows "3 flights, 2 hotel
// nights" instead of "unread mail from Delta".
//
// Design choices worth defending:
//
//  - Gemini rather than per-sender regex. Delta's confirmation email today
//    looks nothing like the one they sent six months ago, and every airline
//    solves the same problem differently. A model with a tight response
//    schema is the fastest way to cover the long tail without shipping a new
//    template every week. Regex would be cheaper per message, but the
//    engineering cost of keeping thirty templates alive is more than the
//    Gemini bill for a family forwarding a few dozen mails a trip.
//
//  - Text-only first. The body of a booking email almost always carries
//    enough to reconstruct the itinerary; the PDF is the receipt. Text is
//    cheap, quick, and the schema stops the model wandering. A later commit
//    will add attachment-text extraction (pdf-parse) and, for image-only
//    PDFs, a Gemini vision fallback. This file exposes the seam for it: the
//    prompt already talks about a "second pass" and the parsed_items row
//    carries a `source` column.
//
//  - Written to a staging table, not straight to itinerary_items. A
//    garbled confirmation planting a wrong flight number into the trip
//    overnight is worse than a small approve-list appearing on the /inbox
//    card. See supabase/migrations/20260908_inbox_parsed_items.sql for the
//    rationale.
//
//  - Attribution: the sender's traveler (already classified by the webhook
//    at receive time) is the default, and the model is asked to match
//    passenger names against the family's travelers as a suggestion. The
//    primary picks on approval; the model does not get the last word.
//
// This file does not throw for expected failures. It writes parse_status =
// 'failed' with a short reason and returns. The caller (the webhook) treats
// this as a fire-and-forget and does not surface the error to Postmark --
// the mail already landed and can be re-parsed later from the /inbox card.

import { createAdminClient } from "@/lib/supabase/admin";

const BASE = "https://generativelanguage.googleapis.com/v1beta/models";

// Same ladder shape lib/documents/extract.js uses: 3.1-pro-preview first for
// the careful pass, 3.6-flash as the honest fallback when Pro is busy.
// Overridable via env so a later model becomes the workhorse without a code
// change, matching the pattern the document extractor already established.
const DEFAULT_MODELS = ["gemini-3.1-pro-preview", "gemini-3.6-flash"];
const RETRYABLE = new Set([500, 502, 503, 504]);

// A hard cap on how much of the email we send. A three-page HTML flight
// confirmation is ~40k characters; the model does not need the marketing
// footer to find the flight number. Trimming before the call keeps the
// prompt cost predictable and stops a rogue mail bomb from spending real
// money by accident.
const MAX_BODY_CHARS = 32_000;

function modelList() {
  const env = (process.env.GEMINI_TEXT_MODELS || "")
    .split(",")
    .map((m) => m.trim())
    .filter(Boolean);
  return env.length ? env : DEFAULT_MODELS;
}

// The prompt. Kept explicit about what to return and what to skip; the
// schema below pins the shape but the words here decide the taste. Two
// things worth calling out:
//
//  - The model is told to return an empty items array rather than invent
//    something when the mail is not a booking confirmation. Marketing
//    emails and password resets get forwarded by accident all the time.
//
//  - Passenger names come back as a separate list rather than tagged onto
//    each item, because a family flight confirmation lists everyone once
//    and we do not want the model to guess which passenger belongs to
//    which leg.
const PROMPT = `You are reading one forwarded travel booking confirmation email.

The email may be a flight itinerary, a hotel confirmation, a car rental agreement, a cruise booking, a tour or excursion voucher, a rail ticket, a theme-park reservation, a restaurant booking, or anything similar. It may also be marketing, a password reset, a receipt for something that has already happened, or a personal note that was forwarded by mistake — in which case return an empty items array and set kind to "not_booking".

Return the fields below exactly. Do not guess. If a field is not clearly stated in the email, return an empty string (or null for dates/times/numbers) for it rather than inferring.

Top-level fields:
- kind: one of "booking" (the email is a real booking confirmation with at least one item), "receipt" (a paid receipt for something already happened; return an empty items array), "not_booking" (marketing, password reset, forwarded chat, anything else non-itinerary; empty items array)
- passenger_names: an array of full names as printed in the email of everyone the booking is for. Empty if the email does not list travellers.
- items: an array of one row per bookable thing. For a multi-leg flight itinerary, one row per leg. For a multi-night hotel stay, one row with item_date = check-in and end_date = check-out. Empty if kind is not "booking".

Each item:
- category: one of "flight", "lodging", "cruise", "excursion", "dining", "transport", "activity", "note"
- title: a short human sentence for the trip screen. e.g. "Delta 1425 STL → SEA", "Hilton Anchorage — 2 nights", "Enterprise pickup at ANC"
- location: the airport code + city, the property + city, the pickup city, whatever the primary needs to see. Leave empty if the email does not say.
- item_date: YYYY-MM-DD of when the thing happens (departure date for a flight, check-in for a hotel, pickup for a rental). Null if not stated.
- end_date: YYYY-MM-DD of when the thing ends, only for multi-day items (hotel check-out, rental drop-off, cruise disembarkation). Null for single-day items.
- start_time: HH:MM in 24-hour local time at the origin. Null if the email does not state a time.
- confirmation_number: the booking / reservation / PNR / record locator, as printed. Empty string if not shown.
- notes: one or two short lines only if there is something the primary genuinely needs (seat assignment on a flight, room type on a hotel, fare rules that matter). Empty string otherwise. Do not restate the title.
- confidence: "high" if every field above came from clearly labelled text in the email; "medium" if you had to interpret one thing; "low" if the email is a poor forward, garbled, or you are guessing more than reading.

If a confirmation has both flight legs and a seat-assignment sub-list, return the legs — not the seats. If a hotel email mentions a shuttle, return the hotel — not a separate transport row for the shuttle. If a rental agreement has both pickup and drop-off at different airports, return one "transport" row for the whole rental and put the drop-off in notes.`;

const RESPONSE_SCHEMA = {
  type: "object",
  properties: {
    kind: {
      type: "string",
      enum: ["booking", "receipt", "not_booking"],
    },
    passenger_names: {
      type: "array",
      items: { type: "string" },
    },
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          category: {
            type: "string",
            enum: [
              "flight",
              "lodging",
              "cruise",
              "excursion",
              "dining",
              "transport",
              "activity",
              "note",
            ],
          },
          title: { type: "string" },
          location: { type: "string" },
          item_date: { type: "string" },
          end_date: { type: "string" },
          start_time: { type: "string" },
          confirmation_number: { type: "string" },
          notes: { type: "string" },
          confidence: { type: "string", enum: ["high", "medium", "low"] },
        },
        required: [
          "category",
          "title",
          "location",
          "item_date",
          "end_date",
          "start_time",
          "confirmation_number",
          "notes",
          "confidence",
        ],
      },
    },
  },
  required: ["kind", "passenger_names", "items"],
};

async function askOnce({ model, key, text, signal }) {
  const res = await fetch(`${BASE}/${model}:generateContent?key=${key}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      contents: [
        {
          role: "user",
          parts: [{ text: PROMPT }, { text: `\n\n---\n\n${text}` }],
        },
      ],
      generationConfig: {
        temperature: 0,
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
      },
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
  const answer = json?.candidates?.[0]?.content?.parts
    ?.map((p) => p?.text || "")
    .join("")
    .trim();
  if (!answer) {
    const err = new Error(`${model}: empty answer`);
    err.status = 422;
    throw err;
  }

  try {
    return JSON.parse(answer);
  } catch {
    const err = new Error(`${model}: not JSON`);
    err.status = 422;
    throw err;
  }
}

/**
 * Turn one inbox_messages row into inbox_parsed_items rows. Called
 * fire-and-forget from the webhook; the return value is only useful in
 * tests.
 *
 * Never throws for expected failures -- writes parse_status='failed' with
 * a short reason and returns. Only genuinely unexpected exceptions
 * (missing env var, database down) escape.
 */
export async function parseInboxMessage({ messageId, signal } = {}) {
  if (!messageId) return { ok: false, reason: "no message id" };

  const supabase = createAdminClient();
  if (!supabase) return { ok: false, reason: "no admin client" };

  const { data: message, error: readError } = await supabase
    .from("inbox_messages")
    .select(
      "id, family_id, from_email, subject, text_body, html_body, classification, attributed_traveler_id, parse_status, received_at",
    )
    .eq("id", messageId)
    .maybeSingle();

  if (readError || !message) {
    return { ok: false, reason: "message not found" };
  }

  // Idempotency: a Postmark retry, a manual re-parse, or a duplicate fire
  // must not spend a second Gemini call or double the parsed rows.
  //
  // A `running` row is normally a live sibling call; refusing to re-enter is
  // the right guard. But a row that has been in `running` for longer than a
  // real parse can take almost always means the previous invocation was
  // frozen by the serverless runtime before it could write a terminal state,
  // and blocking forever means the family never gets that mail parsed. Two
  // minutes is comfortably longer than any legitimate Gemini call on the
  // sizes we send, so a `running` row older than that is treated as
  // recoverable and re-parsed. `succeeded` is always terminal.
  if (message.parse_status === "succeeded") {
    return { ok: false, reason: "already succeeded" };
  }
  if (message.parse_status === "running") {
    const receivedAt = message.received_at ? new Date(message.received_at) : null;
    const stuckMs = receivedAt ? Date.now() - receivedAt.getTime() : 0;
    if (stuckMs < 2 * 60 * 1000) {
      return { ok: false, reason: "already running" };
    }
  }

  await supabase
    .from("inbox_messages")
    .update({ parse_status: "running", parse_error: null })
    .eq("id", messageId);

  const text = buildPromptText(message);
  if (!text) {
    await supabase
      .from("inbox_messages")
      .update({
        parse_status: "skipped",
        parse_error: "empty body",
        parsed_at: new Date().toISOString(),
      })
      .eq("id", messageId);
    return { ok: true, skipped: true };
  }

  const key = process.env.GEMINI_API_KEY;
  if (!key) {
    await supabase
      .from("inbox_messages")
      .update({
        parse_status: "failed",
        parse_error: "GEMINI_API_KEY is not set",
        parsed_at: new Date().toISOString(),
      })
      .eq("id", messageId);
    return { ok: false, reason: "no key" };
  }

  let parsed = null;
  let usedModel = null;
  let last = null;
  outer: for (const model of modelList()) {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        parsed = await askOnce({ model, key, text, signal });
        usedModel = model;
        break outer;
      } catch (err) {
        last = err;
        if (signal?.aborted) throw err;
        if (!RETRYABLE.has(err.status) || attempt === 1) break;
      }
    }
  }

  if (!parsed) {
    await supabase
      .from("inbox_messages")
      .update({
        parse_status: "failed",
        parse_error: (last?.message || "no model answered").slice(0, 300),
        parsed_at: new Date().toISOString(),
      })
      .eq("id", messageId);
    return { ok: false, reason: "no model answered" };
  }

  // Not a booking -> mark skipped so /inbox knows the extractor looked and
  // decided there was nothing to stage. The message itself remains for the
  // primary to file, forward on, or throw out.
  if (parsed.kind !== "booking" || !Array.isArray(parsed.items) || parsed.items.length === 0) {
    await supabase
      .from("inbox_messages")
      .update({
        parse_status: "skipped",
        parse_error: parsed.kind === "booking" ? "no items" : parsed.kind,
        parse_model: usedModel,
        parsed_at: new Date().toISOString(),
      })
      .eq("id", messageId);
    return { ok: true, skipped: true, kind: parsed.kind };
  }

  const travelers = await loadTravelers(supabase, message.family_id);
  const staged = parsed.items
    .map((raw, index) => normalizeItem(raw, index))
    .filter(Boolean)
    .map((item) => ({
      message_id: message.id,
      family_id: message.family_id,
      ...item,
      attributed_traveler_id: attributeItem({
        passengerNames: parsed.passenger_names || [],
        travelers,
        senderTravelerId: message.attributed_traveler_id,
      }),
      source: "body",
    }));

  if (staged.length > 0) {
    const { error: insertError } = await supabase
      .from("inbox_parsed_items")
      .insert(staged);
    if (insertError) {
      await supabase
        .from("inbox_messages")
        .update({
          parse_status: "failed",
          parse_error: `insert: ${insertError.message}`.slice(0, 300),
          parse_model: usedModel,
          parsed_at: new Date().toISOString(),
        })
        .eq("id", messageId);
      return { ok: false, reason: "insert failed" };
    }
  }

  await supabase
    .from("inbox_messages")
    .update({
      parse_status: staged.length ? "succeeded" : "skipped",
      parse_error: staged.length ? null : "no items after normalization",
      parse_model: usedModel,
      parsed_at: new Date().toISOString(),
    })
    .eq("id", messageId);

  // With the parse succeeded and the items staged, see if the message can be
  // filed onto a trip without a person in the loop. The matcher decides; if
  // it says no, the message stays pending on /inbox and this call is a no-op.
  // Imported lazily so the parser module does not pull the admin-client
  // helper on every import (the parser is loaded by test tooling too).
  let autoFile = null;
  if (staged.length > 0) {
    try {
      const mod = await import("@/lib/inbox/autoFile");
      autoFile = await mod.autoFileMessage({
        messageId,
        familyId: message.family_id,
      });
    } catch (err) {
      // The message is already parsed and staged; failing to auto-file just
      // leaves it as a pending card on /inbox, which is the safe default.
      console.error("inbox auto-file failed", messageId, err);
    }
  }

  return { ok: true, items: staged.length, autoFile };
}

// Build the text the model reads. Prefer text_body; fall back to a cleaned
// html_body. Include the subject as the first line because the sender name
// and route often live only in the subject line of a forwarded mail.
export function buildPromptText(message) {
  const parts = [];
  if (message.subject) parts.push(`Subject: ${message.subject}`);
  if (message.from_email) parts.push(`From: ${message.from_email}`);

  const body = message.text_body || stripHtml(message.html_body || "");
  if (!body) return null;

  parts.push("");
  parts.push(body.slice(0, MAX_BODY_CHARS));
  return parts.join("\n");
}

// Minimal HTML → text. Not a full parser; the goal is to hand the model
// something readable without pulling in a dependency. Strips scripts and
// styles first because their content is never useful and often long.
function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function loadTravelers(supabase, familyId) {
  const { data, error } = await supabase
    .from("travelers")
    .select("id, name, is_person")
    .eq("family_id", familyId);
  if (error || !Array.isArray(data)) return [];
  return data.filter((t) => t.is_person !== false);
}

// Attribution: pick the traveler whose name best matches one of the
// passenger names the model returned. Fall back to the sender's traveler
// (set by the webhook at receive time) so a self-forward that omits
// passenger names is still attributed. Null if we cannot decide -- the
// primary picks on approval.
export function attributeItem({ passengerNames, travelers, senderTravelerId }) {
  if (Array.isArray(passengerNames) && passengerNames.length && travelers.length) {
    const norm = (s) =>
      String(s || "")
        .toLowerCase()
        .replace(/[^a-z\s]/g, " ")
        .replace(/\s+/g, " ")
        .trim();
    const names = passengerNames.map(norm).filter(Boolean);
    for (const t of travelers) {
      const tn = norm(t.name);
      if (!tn) continue;
      if (names.some((n) => n === tn)) return t.id;
    }
    for (const t of travelers) {
      const tn = norm(t.name);
      if (!tn) continue;
      const first = tn.split(" ")[0];
      if (!first) continue;
      if (names.some((n) => n.split(" ")[0] === first)) return t.id;
    }
  }
  return senderTravelerId || null;
}

export function normalizeItem(raw, index) {
  if (!raw || typeof raw !== "object") return null;
  const category = pickEnum(raw.category, [
    "flight",
    "lodging",
    "cruise",
    "excursion",
    "dining",
    "transport",
    "activity",
    "note",
  ]);
  const title = cleanText(raw.title, 200);
  if (!category || !title) return null;

  const item_date = cleanDate(raw.item_date);
  const end_date = cleanDate(raw.end_date);
  return {
    category,
    title,
    location: cleanText(raw.location, 200) || null,
    item_date: item_date || null,
    // A parser that returns end_date < item_date breaks the itinerary_items
    // constraint on approval; drop it here rather than later.
    end_date: end_date && item_date && end_date >= item_date ? end_date : null,
    start_time: cleanTime(raw.start_time),
    confirmation_number: cleanText(raw.confirmation_number, 100) || null,
    notes: cleanText(raw.notes, 500) || null,
    confidence: pickEnum(raw.confidence, ["high", "medium", "low"]) || "low",
    sort_order: index,
  };
}

function pickEnum(value, allowed) {
  const v = typeof value === "string" ? value.trim().toLowerCase() : "";
  return allowed.includes(v) ? v : "";
}

function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.trim().replace(/\s+/g, " ").slice(0, max);
}

function cleanDate(value) {
  if (typeof value !== "string") return "";
  const m = value.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return "";
  const year = Number(m[1]);
  const month = Number(m[2]);
  const day = Number(m[3]);
  if (year < 2020 || year > 2100) return "";
  if (month < 1 || month > 12) return "";
  if (day < 1 || day > 31) return "";
  return `${m[1]}-${m[2]}-${m[3]}`;
}

function cleanTime(value) {
  if (typeof value !== "string") return null;
  const m = value.trim().match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (h < 0 || h > 23) return null;
  if (min < 0 || min > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(min).padStart(2, "0")}:00`;
}
