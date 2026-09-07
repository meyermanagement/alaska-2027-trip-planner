import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { whoIs } from "@/lib/supabase/who";
import { sendEmail } from "@/lib/email/send";

export const runtime = "nodejs";
export const maxDuration = 20;

// Where every contact-us message lands. Not a value the client picks; the
// server names its own inbox, and the form only chooses what to write in the
// message and where a reply should be sent.
const CONTACT_TO = "meyermanagement@gmail.com";

/**
 * POST /api/contact
 *
 * Body: { subject, message, replyTo? }
 *
 * Sends the message as a real email to CONTACT_TO with the caller's chosen
 * reply-to (or their sign-in address) set as Reply-To, so the owner can hit
 * reply and the reply goes to the person who wrote in.
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

  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json(
      { ok: false, error: "That message was empty." },
      { status: 400 },
    );
  }

  const subject = String(body.subject || "")
    .trim()
    .slice(0, 200);
  const message = String(body.message || "")
    .trim()
    .slice(0, 4000);
  const requested = String(body.replyTo || "")
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

  const composed = compose({
    subject,
    message,
    fromEmail: user.email || "",
    replyTo,
  });

  const result = await sendEmail({
    to: CONTACT_TO,
    subject: composed.subject,
    html: composed.html,
    text: composed.text,
    ...(replyTo ? { replyTo } : {}),
  });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error || "That could not be sent." },
      { status: 502 },
    );
  }

  return NextResponse.json({ ok: true });
}

// A short subject prefix so replies in the owner's inbox stay grouped and
// easy to spot, and the sender's address in the body so it is readable even
// if the mail client hides Reply-To.
function compose({ subject, message, fromEmail, replyTo }) {
  const prefixed = `[Alyeska contact] ${subject}`;
  const bodyText = [
    `From: ${fromEmail || "(no signed-in email)"}`,
    replyTo && replyTo !== fromEmail ? `Reply to: ${replyTo}` : null,
    "",
    message,
  ]
    .filter((line) => line !== null)
    .join("\n");

  const htmlSafeMessage = escapeHtml(message).replace(/\n/g, "<br>");
  const htmlSafeFrom = escapeHtml(fromEmail || "(no signed-in email)");
  const htmlSafeReplyTo =
    replyTo && replyTo !== fromEmail ? escapeHtml(replyTo) : null;

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
