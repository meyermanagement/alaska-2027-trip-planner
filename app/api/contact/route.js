import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { sendEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const maxDuration = 30;

// Where every contact-us message lands. Not a value the client picks; the
// server names its own inbox, and the form only chooses what to write in the
// message and where a reply should be sent.
const CONTACT_TO = "meyermanagement@gmail.com";

// A few sensible caps so a single form submission cannot fill the owner's
// inbox with a stack of 20 megabyte photos or a message the size of a book.
// The client enforces the same numbers so the user finds out at the file
// picker rather than at the send button.
const MAX_SCREENSHOTS = 4;
const MAX_SCREENSHOT_BYTES = 5 * 1024 * 1024; // 5 MB per file
const MAX_TOTAL_ATTACHMENT_BYTES = 15 * 1024 * 1024; // 15 MB across all files
const ALLOWED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/webp",
  "image/heic",
  "image/heif",
  "image/gif",
]);

/**
 * POST /api/contact
 *
 * Accepts multipart/form-data with:
 *   subject   text, required
 *   message   text, required (>= 4 chars after trim)
 *   replyTo   text, optional (defaults to the caller's sign-in email)
 *   screenshots  0..MAX_SCREENSHOTS File fields (image/* only)
 *
 * A plain JSON body still works for callers that do not need attachments,
 * so the endpoint stays useful outside the browser form too.
 *
 * Sends the composed message to CONTACT_TO through the app's existing email
 * transport (Resend or Gmail SMTP), with Reply-To set to the sender's chosen
 * address so a reply goes back to them.
 *
 * Refuses without a signed-in user, because otherwise anyone could rate-limit
 * the owner's inbox from an unauthenticated form.
 */
export async function POST(request) {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Sign in first, then write to us." },
      { status: 401 },
    );
  }

  const parsed = await readPayload(request);
  if (!parsed.ok) {
    return NextResponse.json(
      { ok: false, error: parsed.error },
      { status: 400 },
    );
  }

  const subject = String(parsed.fields.subject || "")
    .trim()
    .slice(0, 200);
  const message = String(parsed.fields.message || "")
    .trim()
    .slice(0, 4000);
  const requested = String(parsed.fields.replyTo || "")
    .trim()
    .slice(0, 320);
  const replyTo = isEmail(requested) ? requested : user.email || "";

  if (!subject) {
    return NextResponse.json(
      { ok: false, error: "Give it a subject." },
      { status: 400 },
    );
  }
  if (message.length < 4) {
    return NextResponse.json(
      { ok: false, error: "Write a little more." },
      { status: 400 },
    );
  }

  const validation = await validateScreenshots(parsed.screenshots);
  if (!validation.ok) {
    return NextResponse.json(
      { ok: false, error: validation.error },
      { status: 400 },
    );
  }

  const composed = compose({
    subject,
    message,
    fromEmail: user.email || "",
    replyTo,
    screenshotCount: validation.attachments.length,
  });

  const result = await sendEmail({
    to: CONTACT_TO,
    subject: composed.subject,
    html: composed.html,
    text: composed.text,
    ...(replyTo ? { replyTo } : {}),
    ...(validation.attachments.length
      ? { attachments: validation.attachments }
      : {}),
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error || "That could not be sent." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

// Parse either a multipart form (browser form with screenshots) or a plain
// JSON body (any other caller). Returns {ok, fields, screenshots} on success
// or {ok:false, error} on a body we cannot read.
async function readPayload(request) {
  const contentType = String(request.headers.get("content-type") || "");
  if (contentType.includes("application/json")) {
    const body = await request.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return { ok: false, error: "That message was empty." };
    }
    return { ok: true, fields: body, screenshots: [] };
  }
  if (
    contentType.includes("multipart/form-data") ||
    contentType.includes("application/x-www-form-urlencoded")
  ) {
    const form = await request.formData().catch(() => null);
    if (!form) return { ok: false, error: "That message was empty." };
    const fields = {
      subject: form.get("subject"),
      message: form.get("message"),
      replyTo: form.get("replyTo"),
    };
    const screenshots = form
      .getAll("screenshots")
      .filter(
        (entry) => typeof entry === "object" && entry && "arrayBuffer" in entry,
      );
    return { ok: true, fields, screenshots };
  }
  return { ok: false, error: "That message was empty." };
}

// Turn each File into a {filename, contentType, data:Buffer} record. Enforces
// per-file type, per-file size, total size, and count caps. Files with names
// or types we do not recognize get rejected rather than silently dropped, so
// the sender knows what did not make it.
async function validateScreenshots(files) {
  if (!files || !files.length) return { ok: true, attachments: [] };
  if (files.length > MAX_SCREENSHOTS) {
    return {
      ok: false,
      error: `Up to ${MAX_SCREENSHOTS} screenshots per message.`,
    };
  }
  const attachments = [];
  let total = 0;
  for (const file of files) {
    const size = Number(file.size) || 0;
    if (size <= 0) continue;
    if (size > MAX_SCREENSHOT_BYTES) {
      return {
        ok: false,
        error: `Screenshots have to be ${humanBytes(MAX_SCREENSHOT_BYTES)} or smaller.`,
      };
    }
    const contentType = String(file.type || "").toLowerCase();
    if (!ALLOWED_IMAGE_TYPES.has(contentType)) {
      return {
        ok: false,
        error: "Screenshots have to be images (PNG, JPEG, WebP, HEIC or GIF).",
      };
    }
    total += size;
    if (total > MAX_TOTAL_ATTACHMENT_BYTES) {
      return {
        ok: false,
        error: `Screenshots together have to be under ${humanBytes(MAX_TOTAL_ATTACHMENT_BYTES)}.`,
      };
    }
    const bytes = Buffer.from(await file.arrayBuffer());
    attachments.push({
      filename: safeFilename(file.name, contentType, attachments.length + 1),
      contentType,
      data: bytes,
    });
  }
  return { ok: true, attachments };
}

// A short subject prefix so replies in the owner's inbox stay grouped and
// easy to spot, and the sender's address in the body so it is readable even
// if the mail client hides Reply-To.
function compose({ subject, message, fromEmail, replyTo, screenshotCount }) {
  const prefixed = `[Alyeska contact] ${subject}`;
  const attachedLine =
    screenshotCount > 0
      ? `${screenshotCount} screenshot${screenshotCount === 1 ? "" : "s"} attached`
      : null;
  const bodyText = [
    `From: ${fromEmail || "(no signed-in email)"}`,
    replyTo && replyTo !== fromEmail ? `Reply to: ${replyTo}` : null,
    attachedLine,
    "",
    message,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const htmlSafeMessage = escapeHtml(message).replace(/\n/g, "<br>");
  const htmlSafeFrom = escapeHtml(fromEmail || "(no signed-in email)");
  const htmlSafeReplyTo =
    replyTo && replyTo !== fromEmail ? escapeHtml(replyTo) : null;
  const htmlSafeAttached = attachedLine ? escapeHtml(attachedLine) : null;

  const html = `<!doctype html>
<html>
<body style="margin:0; padding:24px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; color:#241f18; background:#fdfaf0;">
  <div style="max-width:600px; margin:0 auto;">
    <p style="margin:0 0 4px 0; font-size:12px; color:#665e4d;">From</p>
    <p style="margin:0 0 12px 0; font-size:14px;">${htmlSafeFrom}</p>
    ${
      htmlSafeReplyTo
        ? `<p style="margin:0 0 4px 0; font-size:12px; color:#665e4d;">Reply to</p>
    <p style="margin:0 0 12px 0; font-size:14px;">${htmlSafeReplyTo}</p>`
        : ""
    }
    ${
      htmlSafeAttached
        ? `<p style="margin:0 0 12px 0; font-size:12px; color:#665e4d;">${htmlSafeAttached}</p>`
        : ""
    }
    <hr style="border:none; border-top:1px solid #e6dcc6; margin:16px 0;">
    <p style="margin:0; font-size:15px; line-height:1.55; white-space:pre-wrap;">${htmlSafeMessage}</p>
  </div>
</body>
</html>`;

  return { subject: prefixed, text: bodyText, html };
}

function isEmail(value) {
  if (!value) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Some browsers upload files as "image.jpg" and some as "" -- if there is no
// usable name, invent one from the mime type so the recipient sees "screenshot-1.png"
// rather than a blank filename. Also strips path segments a browser should not
// send but sometimes does.
function safeFilename(rawName, contentType, index) {
  const name = String(rawName || "")
    .split(/[/\\]/)
    .pop()
    .trim();
  if (name) return name.slice(0, 120);
  const ext = extensionFor(contentType);
  return `screenshot-${index}${ext}`;
}

function extensionFor(contentType) {
  switch (contentType) {
    case "image/png":
      return ".png";
    case "image/jpeg":
    case "image/jpg":
      return ".jpg";
    case "image/webp":
      return ".webp";
    case "image/heic":
      return ".heic";
    case "image/heif":
      return ".heif";
    case "image/gif":
      return ".gif";
    default:
      return "";
  }
}

function humanBytes(bytes) {
  const mb = bytes / (1024 * 1024);
  return `${mb % 1 === 0 ? mb.toFixed(0) : mb.toFixed(1)} MB`;
}
