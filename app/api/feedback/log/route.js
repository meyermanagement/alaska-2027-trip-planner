import { createHash } from "node:crypto";

import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { sendEmail } from "@/lib/email/send";
import { MAIL, SANS } from "@/lib/email/palette";
import {
  FAULT_KIND,
  FAULT_SOURCES,
  MAX_FAULT_MESSAGE_CHARS,
  MAX_FAULT_STACK_CHARS,
  faultSourceLabel,
  looksLikeNoise,
} from "@/lib/feedback/shared";

export const runtime = "nodejs";

const DESK_TO = "meyermanagement@gmail.com";

/**
 * POST /api/feedback/log
 *
 * A fault the app noticed about itself, from FaultWatch. JSON, and never
 * anything a person typed:
 *   source    script | promise | call | chunk
 *   message   what the browser said went wrong
 *   path, tripId, skin, viewport
 *   detail    { stack, at, call, status, method }
 *
 * The same table as a written report, because the two want reading together:
 * the tester who says a screen "just spins" and the five hundred that made it
 * spin are the same bug, and splitting them across two lists means noticing that
 * twice.
 *
 * A fault is counted, not repeated. The same fault from the same person becomes
 * one row with a count and a last-seen, so a screen that throws on every visit
 * does not bury a screen that threw once. The mail goes out on the first
 * sighting only -- the first time anybody has hit it -- because an inbox that
 * receives every occurrence of a known bug is an inbox that stops being read.
 *
 * Nothing is written for somebody who is not signed in. It answers with a plain
 * accepted either way: the watcher has nothing useful to do with a refusal, and
 * an app arguing with its own error log is worse than one that quietly drops it.
 */
export async function POST(request) {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) return NextResponse.json({ ok: true, kept: false });

  const sent = await request.json().catch(() => null);
  if (!sent) return NextResponse.json({ ok: true, kept: false });

  const source = Object.keys(FAULT_SOURCES).includes(String(sent.source))
    ? String(sent.source)
    : "script";
  const message = String(sent.message || "")
    .trim()
    .slice(0, MAX_FAULT_MESSAGE_CHARS);
  if (!message || looksLikeNoise(message)) {
    return NextResponse.json({ ok: true, kept: false });
  }

  const path = String(sent.path || "")
    .trim()
    .slice(0, 300);
  const skin = String(sent.skin || "")
    .trim()
    .slice(0, 40);
  const viewport = String(sent.viewport || "")
    .trim()
    .slice(0, 60);
  const tripId = uuidOrNull(sent.tripId);
  const userAgent = String(request.headers.get("user-agent") || "").slice(
    0,
    400,
  );
  const build = (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    ""
  ).slice(0, 12);

  const detail = {
    source,
    stack: String(sent.detail?.stack || "").slice(0, MAX_FAULT_STACK_CHARS),
    at: String(sent.detail?.at || "").slice(0, 300) || null,
    call: String(sent.detail?.call || "").slice(0, 200) || null,
    status: Number(sent.detail?.status) || null,
    method: String(sent.detail?.method || "").slice(0, 10) || null,
  };

  // What makes two faults the same one: where it was noticed, what it said, and
  // which call it was about. Deliberately not the screen -- a chunk that will
  // not load is the same fault wherever somebody was standing when it did not.
  const fingerprint = createHash("sha1")
    .update(`${source}|${message}|${detail.call || ""}`)
    .digest("hex")
    .slice(0, 16);

  const now = new Date().toISOString();
  const admin = createAdminClient();

  // Has anybody seen this one before? Asked before the write, so the answer is
  // not the row this request is about to make.
  let firstEver = true;
  if (admin) {
    const { data: known } = await admin
      .from("feedback")
      .select("id")
      .eq("fingerprint", fingerprint)
      .limit(1);
    firstEver = !(known && known.length);
  }

  const mine = admin
    ? await admin
        .from("feedback")
        .select("id, seen_count")
        .eq("user_id", user.id)
        .eq("fingerprint", fingerprint)
        .maybeSingle()
    : { data: null };

  if (admin && mine.data?.id) {
    await admin
      .from("feedback")
      .update({
        seen_count: (mine.data.seen_count || 1) + 1,
        last_at: now,
        path: path || null,
        trip_id: tripId,
        detail,
      })
      .eq("id", mine.data.id);
  } else {
    // Written through the person's own session where possible, so the row is
    // theirs and the insert-your-own policy is the thing allowing it.
    const row = {
      user_id: user.id,
      email: user.email || null,
      kind: FAULT_KIND,
      body: message,
      path: path || null,
      trip_id: tripId,
      skin: skin || null,
      viewport: viewport || null,
      user_agent: userAgent || null,
      build: build || null,
      trail: [],
      fingerprint,
      seen_count: 1,
      last_at: now,
      detail,
    };
    const { error } = await supabase.from("feedback").insert(row);
    if (error) return NextResponse.json({ ok: true, kept: false });
  }

  if (firstEver) {
    const composed = compose({
      source,
      message,
      path,
      skin,
      viewport,
      build,
      userAgent,
      detail,
      email: user.email || "",
    });
    await sendEmail({
      to: DESK_TO,
      subject: composed.subject,
      html: composed.html,
      text: composed.text,
    }).catch(() => {});
  }

  return NextResponse.json({ ok: true, kept: true });
}

function uuidOrNull(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    text,
  )
    ? text
    : null;
}

/**
 * The first sighting, written as mail. Short on purpose: the desk holds the
 * count, the stack and everything else, and this only has to be enough to know
 * whether to go and look.
 */
function compose({
  source,
  message,
  path,
  skin,
  viewport,
  build,
  userAgent,
  detail,
  email,
}) {
  const facts = [
    ["Where", path || "not recorded"],
    ["Who", email || "no address"],
    ["Look", skin || "not recorded"],
    ["Window", viewport || "not recorded"],
    ["Build", build || "not recorded"],
    ["Browser", userAgent || "not recorded"],
  ];
  if (detail.at) facts.push(["Thrown at", detail.at]);
  if (detail.call) {
    facts.push(["Call", `${detail.method || "GET"} ${detail.call}`]);
  }

  const subject = `[Alyeska fault] ${faultSourceLabel(source)}: ${message.slice(0, 90)}`;
  const text = [
    `${faultSourceLabel(source)}`,
    "",
    message,
    "",
    ...facts.map(([name, value]) => `${name}: ${value}`),
    "",
    detail.stack || "",
    "",
    "First time anybody has hit this one. Later ones are counted on the desk instead.",
  ].join("\n");

  const html = `<!doctype html><html><body style="margin:0;padding:24px;background:${MAIL.SAND};color:${MAIL.INK};font-family:${SANS}">
  <div style="max-width:560px;margin:0 auto;background:${MAIL.CARD};border:1px solid ${MAIL.SAND_DEEP};border-radius:16px;padding:22px">
    <p style="margin:0;font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:${MAIL.INK_SOFT}">${escapeHtml(faultSourceLabel(source))}</p>
    <p style="margin:8px 0 0;font-size:17px;font-weight:600;line-height:1.4">${escapeHtml(message)}</p>
    <table style="margin-top:16px;border-collapse:collapse;font-size:13px;color:${MAIL.INK_SOFT}">
      ${facts
        .map(
          ([name, value]) =>
            `<tr><td style="padding:3px 12px 3px 0;white-space:nowrap">${escapeHtml(name)}</td><td style="padding:3px 0;color:${MAIL.INK};word-break:break-word">${escapeHtml(value)}</td></tr>`,
        )
        .join("")}
    </table>
    ${
      detail.stack
        ? `<pre style="margin:16px 0 0;padding:12px;background:${MAIL.SAND};border:1px solid ${MAIL.SAND_DEEP};border-radius:10px;font-size:12px;line-height:1.5;white-space:pre-wrap;word-break:break-word;color:${MAIL.INK_SOFT}">${escapeHtml(detail.stack)}</pre>`
        : ""
    }
    <p style="margin:16px 0 0;font-size:12px;color:${MAIL.INK_SOFT}">First time anybody has hit this one. Later sightings are counted on the beta desk instead of mailed.</p>
  </div>
</body></html>`;

  return { subject, text, html };
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
