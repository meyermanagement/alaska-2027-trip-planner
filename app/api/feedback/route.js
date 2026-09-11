import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { whoIs } from "@/lib/supabase/who";
import { sendEmail } from "@/lib/email/send";
import { stepLabel } from "@/lib/usage/steps";
import {
  ACCEPTED_SHOT_TYPES,
  FEEDBACK_KIND_IDS,
  MAX_BODY_CHARS,
  MAX_SHOTS,
  MAX_SHOT_BYTES,
  MAX_TOTAL_SHOT_BYTES,
  MIN_BODY_CHARS,
  SHOT_BUCKET,
  humanBytes,
  kindLabel,
} from "@/lib/feedback/shared";

export const runtime = "nodejs";
export const maxDuration = 30;

// Where a report lands as mail. The server names its own inbox; the sheet only
// decides what is written in it.
const DESK_TO = "meyermanagement@gmail.com";

// How much of what somebody had been doing goes on the report. Six screens is
// enough to see the road into a bug and short enough to read at a glance.
const TRAIL_ROWS = 6;

/**
 * POST /api/feedback
 *
 * Multipart, from the in-app sheet:
 *   kind      "problem" | "idea"
 *   body      what happened, required
 *   path      the screen they were on
 *   tripId    the trip that screen belongs to, when it has one
 *   skin      which look they are wearing
 *   viewport  the size of the window, as text
 *   shots     0..MAX_SHOTS images
 *
 * Three things happen, in this order, and the first is the one that must not
 * fail: the row is written so the report exists even if the mail or the picture
 * upload does not. Pictures go to a private bucket, read back on the desk
 * through short-lived signed links, so a screenshot of somebody's passport page
 * is not sitting on a public URL. The mail is last and its failure is not the
 * caller's problem -- it is reported back as sent, because it was recorded.
 *
 * The trail, the browser, and which build this was are not asked for. The route
 * reads them from the request and from what the app already records, because a
 * person writing a bug report should not have to be a bug reporter.
 */
export async function POST(request) {
  const supabase = await createClient();
  const user = await whoIs(supabase);
  if (!user) {
    return NextResponse.json(
      { ok: false, error: "Sign in first." },
      { status: 401 },
    );
  }

  const form = await request.formData().catch(() => null);
  if (!form) {
    return NextResponse.json(
      { ok: false, error: "That report was empty." },
      { status: 400 },
    );
  }

  const askedKind = String(form.get("kind") || "").trim();
  const kind = FEEDBACK_KIND_IDS.includes(askedKind) ? askedKind : "problem";
  const body = String(form.get("body") || "")
    .trim()
    .slice(0, MAX_BODY_CHARS);
  if (body.length < MIN_BODY_CHARS) {
    return NextResponse.json(
      { ok: false, error: "Write a little more." },
      { status: 400 },
    );
  }

  const path = String(form.get("path") || "")
    .trim()
    .slice(0, 300);
  const tripId = uuidOrNull(form.get("tripId"));
  const skin = String(form.get("skin") || "")
    .trim()
    .slice(0, 40);
  const viewport = String(form.get("viewport") || "")
    .trim()
    .slice(0, 60);
  const userAgent = String(request.headers.get("user-agent") || "").slice(
    0,
    400,
  );
  const build = (
    process.env.VERCEL_GIT_COMMIT_SHA ||
    process.env.NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA ||
    ""
  ).slice(0, 12);

  const files = form
    .getAll("shots")
    .filter(
      (entry) => typeof entry === "object" && entry && "arrayBuffer" in entry,
    );
  const checked = await readShots(files);
  if (!checked.ok) {
    return NextResponse.json(
      { ok: false, error: checked.error },
      { status: 400 },
    );
  }

  const admin = createAdminClient();
  const trail = await recentTrail(admin, user.id);

  // The row first, with no pictures on it yet. If the upload below falls over,
  // the report is still on the desk saying what went wrong.
  const { data: row, error: writeError } = await supabase
    .from("feedback")
    .insert({
      user_id: user.id,
      email: user.email || null,
      kind,
      body,
      path: path || null,
      trip_id: tripId,
      skin: skin || null,
      viewport: viewport || null,
      user_agent: userAgent || null,
      build: build || null,
      trail,
    })
    .select("id")
    .single();

  if (writeError || !row?.id) {
    return NextResponse.json(
      { ok: false, error: "That could not be saved. Try once more." },
      { status: 502 },
    );
  }

  const stored = admin
    ? await putShots(admin, user.id, row.id, checked.shots)
    : [];
  if (stored.length) {
    await supabase.from("feedback").update({ shots: stored }).eq("id", row.id);
  }

  const composed = compose({
    kind,
    body,
    path,
    skin,
    viewport,
    build,
    userAgent,
    trail,
    email: user.email || "",
    shotCount: checked.shots.length,
  });

  // Attached as well as stored, so the report is readable in the inbox without
  // opening the desk at all.
  await sendEmail({
    to: DESK_TO,
    subject: composed.subject,
    html: composed.html,
    text: composed.text,
    ...(user.email ? { replyTo: user.email } : {}),
    ...(checked.shots.length
      ? {
          attachments: checked.shots.map((shot, n) => ({
            filename: shot.filename || `screenshot-${n + 1}.jpg`,
            contentType: shot.contentType,
            data: shot.bytes,
          })),
        }
      : {}),
  });

  return NextResponse.json({ ok: true });
}

// Turn the uploaded files into byte records, refusing anything outside the caps
// the sheet already enforces so a hand-written request cannot get around them.
async function readShots(files) {
  if (!files.length) return { ok: true, shots: [] };
  if (files.length > MAX_SHOTS) {
    return { ok: false, error: `Up to ${MAX_SHOTS} pictures per report.` };
  }
  const shots = [];
  let total = 0;
  for (const file of files) {
    const size = Number(file.size) || 0;
    if (size <= 0) continue;
    if (size > MAX_SHOT_BYTES) {
      return {
        ok: false,
        error: `Pictures have to be ${humanBytes(MAX_SHOT_BYTES)} or smaller.`,
      };
    }
    const contentType = String(file.type || "").toLowerCase();
    if (!ACCEPTED_SHOT_TYPES.includes(contentType)) {
      return { ok: false, error: "Pictures have to be images." };
    }
    total += size;
    if (total > MAX_TOTAL_SHOT_BYTES) {
      return {
        ok: false,
        error: `Pictures together have to be under ${humanBytes(MAX_TOTAL_SHOT_BYTES)}.`,
      };
    }
    shots.push({
      filename: safeName(file.name, contentType, shots.length + 1),
      contentType,
      bytes: Buffer.from(await file.arrayBuffer()),
    });
  }
  return { ok: true, shots };
}

// Into a private bucket, under the account and the report, so a stored picture
// can always be traced back to the row that explains it. Returns the object
// paths that landed; a failed upload is left out rather than failing the report.
async function putShots(admin, userId, reportId, shots) {
  const landed = [];
  for (let n = 0; n < shots.length; n += 1) {
    const shot = shots[n];
    const key = `${userId}/${reportId}/${n + 1}-${shot.filename}`;
    const { error } = await admin.storage
      .from(SHOT_BUCKET)
      .upload(key, shot.bytes, {
        contentType: shot.contentType,
        upsert: true,
      });
    if (!error) landed.push(key);
  }
  return landed;
}

// The screens somebody was on before they pressed the button, newest first,
// read from what the app already records rather than asked for.
async function recentTrail(admin, userId) {
  if (!admin) return [];
  const { data } = await admin
    .from("usage_events")
    .select("kind, path, step, ms, at")
    .eq("user_id", userId)
    .order("at", { ascending: false })
    .limit(TRAIL_ROWS);
  if (!Array.isArray(data)) return [];
  return data.map((one) => ({
    at: one.at,
    what:
      one.kind === "step" ? stepLabel(one.step) || one.step : one.path || "",
    ms: Number(one.ms) || 0,
  }));
}

function compose({
  kind,
  body,
  path,
  skin,
  viewport,
  build,
  userAgent,
  trail,
  email,
  shotCount,
}) {
  const heading = kindLabel(kind);
  const facts = [
    ["From", email || "(no address)"],
    ["Screen", path || "(not recorded)"],
    ["Look", skin || "(default)"],
    ["Window", viewport || "(not recorded)"],
    ["Build", build || "(local)"],
    ["Browser", userAgent || "(not recorded)"],
  ];
  const trailLines = trail.length
    ? trail.map((one) => `  ${one.what} (${Math.round(one.ms / 1000)}s)`)
    : ["  (nothing recorded yet)"];

  const text = [
    heading,
    "",
    body,
    "",
    ...facts.map(([label, value]) => `${label}: ${value}`),
    shotCount ? `Pictures: ${shotCount} attached` : "Pictures: none",
    "",
    "Before this:",
    ...trailLines,
  ].join("\n");

  const html = `<!doctype html>
<html>
<body style="margin:0; padding:24px; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif; color:#241f18; background:#fdfaf0;">
  <div style="max-width:600px; margin:0 auto;">
    <p style="margin:0 0 4px 0; font-size:12px; color:#665e4d;">${escapeHtml(heading)}</p>
    <p style="margin:0 0 16px 0; font-size:15px; line-height:1.55; white-space:pre-wrap;">${escapeHtml(body).replace(/\n/g, "<br>")}</p>
    <hr style="border:none; border-top:1px solid #e6dcc6; margin:16px 0;">
    ${facts
      .map(
        ([label, value]) =>
          `<p style="margin:0 0 6px 0; font-size:13px; color:#665e4d;">${escapeHtml(label)}: <span style="color:#241f18;">${escapeHtml(value)}</span></p>`,
      )
      .join("\n    ")}
    <p style="margin:12px 0 6px 0; font-size:13px; color:#665e4d;">Before this</p>
    <ol style="margin:0; padding-left:18px; font-size:13px; color:#241f18;">
      ${trail
        .map(
          (one) =>
            `<li style="margin:0 0 4px 0;">${escapeHtml(one.what)} <span style="color:#665e4d;">(${Math.round(one.ms / 1000)}s)</span></li>`,
        )
        .join("\n      ")}
    </ol>
  </div>
</body>
</html>`;

  return {
    subject: `[Alyeska beta] ${heading}: ${firstLine(body)}`,
    text,
    html,
  };
}

function firstLine(body) {
  const line = String(body).split(/\n/)[0].trim();
  return line.length > 70 ? `${line.slice(0, 67)}...` : line;
}

function uuidOrNull(value) {
  const text = String(value || "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    text,
  )
    ? text
    : null;
}

function safeName(rawName, contentType, index) {
  const name = String(rawName || "")
    .split(/[/\\]/)
    .pop()
    .trim()
    .replace(/[^A-Za-z0-9._-]/g, "-");
  if (name) return name.slice(0, 80);
  const ext = contentType === "image/png" ? ".png" : ".jpg";
  return `screenshot-${index}${ext}`;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
