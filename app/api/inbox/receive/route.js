import { NextResponse, after } from "next/server";
import { Buffer } from "node:buffer";
import { timingSafeEqual as cryptoTimingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/admin";
import { localPartFromAddress } from "@/lib/inbox/address";
import { parseInboxMessage } from "@/lib/inbox/parser";

// The 60-second ceiling matches the tasks/remind route: an inbound message
// with a couple of PDF attachments takes a few seconds to write to storage
// and this leaves headroom for the odd slow write.
export const maxDuration = 60;

/**
 * The door every family's forwarded booking confirmation walks through.
 *
 * Postmark catches the mail at trips.alyeska.app, POSTs a JSON payload here,
 * and this route:
 *
 *   1. Verifies the request came from Postmark by checking a shared secret
 *      the sender puts in the `x-postmark-webhook-secret` header, or as a
 *      `?secret=...` query parameter on the webhook URL for the case where
 *      the Postmark account's inbound stream does not expose the custom
 *      header field (some accounts have it, some don't; the query param
 *      works on every account). Postmark's inbound webhook does not sign
 *      the body, so a shared secret over TLS is the honest bar. The secret
 *      lives on Vercel; it is set either on the Postmark server's webhook
 *      URL as `?secret=...` or under Custom HTTP Headers if the account
 *      offers that.
 *
 *   2. Resolves the recipient local part (e.g. "fhc5h4" from
 *      "fhc5h4@trips.alyeska.app") to a family. An unknown local part 200s
 *      with a note in the body -- Postmark treats 4xx/5xx as retryable, and
 *      retrying a permanently unknown address for hours is worse than
 *      accepting and dropping.
 *
 *   3. Classifies the sender: `traveler` if their email is on a traveler
 *      row in this family, `forwarder` if it is on family_forwarders, and
 *      `unknown` otherwise. The classification is written once, at receive
 *      time, so the inbox screen does not have to recompute it on every
 *      render. Attribution is set alongside the classification for the two
 *      known cases; unknown senders are left null and the primary picks a
 *      person before filing.
 *
 *   4. Writes the message row and any attachments to Supabase Storage under
 *      the family's own namespace in the existing `documents` bucket.
 *
 * The parse into itinerary_items is a follow-up. This route only gets the
 * mail through the door and into a place the family can read.
 */
export async function POST(request) {
  const configuredSecret = process.env.POSTMARK_WEBHOOK_SECRET;
  if (!configuredSecret) {
    return NextResponse.json(
      {
        error:
          "POSTMARK_WEBHOOK_SECRET is not set on the server, so inbound mail is switched off.",
      },
      { status: 503 },
    );
  }

  const supabase = createAdminClient();
  if (!supabase) {
    return NextResponse.json(
      {
        error:
          "SUPABASE_SERVICE_ROLE_KEY is not set on the server. The inbox webhook has nobody signed in, so it cannot write without it.",
      },
      { status: 503 },
    );
  }

  // Header first, query param as fallback. Postmark accounts without a
  // custom-header field for inbound webhooks can put ?secret=... on the URL
  // instead; either presented value is compared in constant time against
  // the configured secret.
  const presented =
    request.headers.get("x-postmark-webhook-secret") ||
    new URL(request.url).searchParams.get("secret") ||
    "";
  if (!timingSafeEqual(presented, configuredSecret)) {
    // Do not narrate why. A well-shaped 401 is enough; anything else invites
    // probing. Postmark's UI shows the response body when a webhook fails,
    // so a plain "unauthorized" is also friendlier when the operator gets
    // the secret wrong the first time.
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let payload;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  // Postmark's inbound payload shape is documented at
  // https://postmarkapp.com/developer/webhooks/inbound-webhook -- the fields
  // we touch are stable across the API's life.
  const to = payload.OriginalRecipient || payload.To || "";
  const localPart = localPartFromAddress(to);
  if (!localPart) {
    // Not our domain, or the To header was unreadable. Do not retry.
    return NextResponse.json(
      { ok: true, ignored: "recipient not on inbox domain" },
      { status: 200 },
    );
  }

  const { data: family } = await supabase
    .from("families")
    .select("id")
    .eq("inbox_local_part", localPart)
    .maybeSingle();

  if (!family) {
    // Unknown local part. This is the shape of a message sent to a slug that
    // was never issued -- a typo, an old address after a slug rotation, or a
    // fishing attempt. 200 so Postmark drops the retry queue.
    return NextResponse.json(
      { ok: true, ignored: "no family for that address" },
      { status: 200 },
    );
  }

  const fromEmail = normalizeEmail(payload.FromFull?.Email || payload.From);
  if (!fromEmail) {
    return NextResponse.json(
      { error: "no sender address on payload" },
      { status: 400 },
    );
  }

  // Sender classification. Traveler match beats forwarder match; a family
  // that later removed a traveler but left an old forwarder record should
  // still see the message land, but the traveler check happens first so
  // the more direct link wins.
  const [travelerMatch, forwarderMatch] = await Promise.all([
    supabase
      .from("travelers")
      .select("id, email")
      .eq("family_id", family.id)
      .eq("is_person", true)
      .ilike("email", fromEmail)
      .maybeSingle(),
    supabase
      .from("family_forwarders")
      .select("id, traveler_id, email")
      .eq("family_id", family.id)
      .ilike("email", fromEmail)
      .maybeSingle(),
  ]);

  let classification = "unknown";
  let attributedTravelerId = null;
  if (travelerMatch.data) {
    classification = "traveler";
    attributedTravelerId = travelerMatch.data.id;
  } else if (forwarderMatch.data) {
    classification = "forwarder";
    attributedTravelerId = forwarderMatch.data.traveler_id;
  }

  // Postmark sends its own message id on `MessageID`. Writing it into a
  // partial-unique index lets a retried webhook land on the same row rather
  // than creating a duplicate; the unique_violation path returns 200 with
  // the existing id so Postmark stops retrying.
  const postmarkMessageId = payload.MessageID || null;

  if (postmarkMessageId) {
    const { data: existing } = await supabase
      .from("inbox_messages")
      .select("id")
      .eq("postmark_message_id", postmarkMessageId)
      .maybeSingle();
    if (existing) {
      return NextResponse.json(
        { ok: true, id: existing.id, duplicate: true },
        { status: 200 },
      );
    }
  }

  const { data: message, error: writeError } = await supabase
    .from("inbox_messages")
    .insert({
      family_id: family.id,
      postmark_message_id: postmarkMessageId,
      from_email: fromEmail,
      from_name: payload.FromFull?.Name || null,
      subject: (payload.Subject || "").slice(0, 500),
      text_body: payload.TextBody || null,
      html_body: payload.HtmlBody || null,
      classification,
      attributed_traveler_id: attributedTravelerId,
    })
    .select("id")
    .single();

  if (writeError || !message) {
    // Do return a 5xx here -- writing the message row failed for a reason
    // that might resolve on retry (a transient database blip), and Postmark
    // will try again for us.
    return NextResponse.json(
      { error: "could not write message", detail: writeError?.message },
      { status: 500 },
    );
  }

  // Attachments go to the documents bucket under the family's own tree, so
  // the same storage RLS the app already has for documents continues to
  // apply. Loop rather than Promise.all to avoid opening a hundred parallel
  // uploads if a mailer ever sends a message with an unusual attachment
  // count.
  const attachments = Array.isArray(payload.Attachments)
    ? payload.Attachments
    : [];

  for (const att of attachments) {
    if (!att?.Content || !att?.Name) continue;
    const size = Number(att.ContentLength || 0);
    if (size > MAX_ATTACHMENT_BYTES) continue;

    const bytes = Buffer.from(att.Content, "base64");
    const safeName = (att.Name || "attachment")
      .replace(/[^\w.\- ]+/g, "_")
      .slice(0, 80);
    const stamp = Date.now();
    const rand = Math.random().toString(36).slice(2, 8);
    const path = `${family.id}/inbox/${message.id}/${stamp}-${rand}-${safeName}`;

    const { error: uploadError } = await supabase.storage
      .from("documents")
      .upload(path, bytes, {
        contentType: att.ContentType || "application/octet-stream",
        upsert: false,
      });
    if (uploadError) continue;

    await supabase.from("inbox_attachments").insert({
      message_id: message.id,
      family_id: family.id,
      storage_path: path,
      mime_type: att.ContentType || null,
      size_bytes: size,
      original_filename: att.Name || null,
    });
  }

  // Fire the parser through after() so the response can return 200 to
  // Postmark immediately while the Gemini call still gets to finish inside
  // the same invocation. A naked fire-and-forget Promise here freezes on
  // Vercel the moment we return the response, which used to leave the row
  // stuck in parse_status='pending' for hours until a later request
  // happened to thaw the process. after() is the sanctioned path: the
  // response goes out on time, and the runtime is held open for the
  // callback within the same maxDuration budget.
  //
  // The unhandled-rejection guard is defensive: parseInboxMessage catches
  // its own errors, but a bug that let one slip through should not crash
  // the after() task and take the log line down with it.
  after(async () => {
    try {
      await parseInboxMessage({ messageId: message.id });
    } catch (err) {
      console.error("inbox parse failed", message.id, err);
    }
  });

  return NextResponse.json(
    {
      ok: true,
      id: message.id,
      classification,
      attributed_traveler_id: attributedTravelerId,
      attachments: attachments.length,
    },
    { status: 200 },
  );
}

// 25 MB matches Postmark's inbound limit; anything larger cannot have arrived
// through them anyway, so this is a defence against a garbled ContentLength
// rather than a hard product cap.
const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

function normalizeEmail(raw) {
  if (!raw) return "";
  const angle = String(raw).match(/<([^>]+)>/);
  const bare = (angle ? angle[1] : String(raw)).trim().toLowerCase();
  return bare.includes("@") ? bare : "";
}

// A constant-time string compare so a header that starts with the right
// letters cannot be told apart from a full match by timing. Node's
// crypto.timingSafeEqual works on same-length Buffers; the length check
// out front makes that safe.
function timingSafeEqual(a, b) {
  if (typeof a !== "string" || typeof b !== "string") return false;
  if (a.length !== b.length) return false;
  return cryptoTimingSafeEqual(Buffer.from(a), Buffer.from(b));
}
