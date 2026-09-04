/**
 * The sign-in email, built to look like the app it is inviting you into.
 *
 * Email clients are a decade behind browsers, so this is deliberately old
 * fashioned: nested tables, inline styles, no webfonts, no SVG. The palette and
 * the serif-over-sans pairing come from lib/email/palette.js, which is the same
 * skin a new account wears on the web, so the message and the site read as one
 * thing. Gmail strips <style> blocks in some views and Outlook ignores most of
 * CSS, and every rule here survives both.
 */

import { DISPLAY, MAIL, SANS } from "@/lib/email/palette";

const { INK, INK_SOFT, SAND, SAND_DEEP, CARD, TEAL, TEAL_SOFT } = MAIL;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {object} input
 * @param {string} input.name        who is being invited
 * @param {string} input.email       the address that will be their way in
 * @param {string} input.familyName  e.g. "Meyer Family"
 * @param {string} input.inviterName who added them
 * @param {string} input.siteUrl     origin of the deployment, no trailing slash
 * @param {string[]} [input.tripNames] a few trips, to show what they are joining
 */
export function inviteEmail({
  name,
  email,
  familyName,
  inviterName,
  siteUrl,
  tripNames = [],
}) {
  const first = String(name || "").split(" ")[0] || "there";
  const signInUrl = `${siteUrl}/login`;
  const subject = `${inviterName} added you to the ${familyName} travel planner`;

  const tripLine = tripNames.length
    ? tripNames.slice(0, 4).join(" · ")
    : "Your family's trips are waiting inside.";

  const text = [
    `${inviterName} added you to the ${familyName} travel planner on Alyeska.`,
    "",
    tripNames.length ? `Trips in there right now: ${tripLine}` : tripLine,
    "",
    `Sign in here: ${signInUrl}`,
    `Use "Continue with Google" and pick ${email} — that address is what links you to the family, so there is no code or password to set up.`,
    "",
    "Once you are in you can edit the itineraries, check things off the packing lists, and add anything that is missing. Changes are saved under your name so everyone can see who added what.",
    "",
    "— Alyeska",
  ].join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background:${SAND}; color:${INK}; -webkit-font-smoothing:antialiased;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">Sign in with ${escapeHtml(email)} — no code or password needed.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SAND};">
<tr>
<td align="center" style="padding:32px 16px 48px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:544px; width:100%;">

<!-- wordmark -->
<tr>
<td align="center" style="padding:0 0 22px;">
<img src="${escapeHtml(siteUrl)}/alyeska-mark.png" width="42" height="42" alt="Alyeska" style="display:block; margin:0 auto 9px; width:42px; height:42px; border:0; outline:none; text-decoration:none;">
<span style="font-family:${DISPLAY}; font-size:22px; font-weight:600; letter-spacing:-0.01em; color:${TEAL};">Alyeska</span>
<div style="font-family:${SANS}; font-size:11px; font-weight:600; letter-spacing:0.09em; text-transform:uppercase; color:${INK_SOFT}; padding-top:5px;">${escapeHtml(familyName)} travel planner</div>
</td>
</tr>

<!-- card -->
<tr>
<td style="background:${CARD}; border:1px solid ${SAND_DEEP}; border-radius:16px; padding:32px 28px;">

<h1 style="margin:0; font-family:${DISPLAY}; font-size:26px; line-height:1.25; font-weight:600; letter-spacing:-0.012em; color:${INK};">You&rsquo;re in, ${escapeHtml(first)}.</h1>

<p style="margin:14px 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK_SOFT};">
${escapeHtml(inviterName)} added you to the ${escapeHtml(familyName)} travel planner. It holds the itineraries, packing lists, and pre-trip checklists for every trip we have coming up &mdash; and you can change any of it.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0; background:${TEAL_SOFT}; border-radius:12px;">
<tr>
<td style="padding:14px 16px;">
<div style="font-family:${SANS}; font-size:11px; font-weight:600; letter-spacing:0.09em; text-transform:uppercase; color:${TEAL};">${tripNames.length ? "Trips inside" : "What&rsquo;s inside"}</div>
<div style="font-family:${SANS}; font-size:14px; line-height:1.55; color:${INK}; padding-top:5px;">${escapeHtml(tripLine)}</div>
</td>
</tr>
</table>

<!-- button -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:26px 0 0;">
<tr>
<td align="center" bgcolor="${TEAL}" style="border-radius:999px;">
<a href="${escapeHtml(signInUrl)}" style="display:inline-block; padding:13px 30px; font-family:${SANS}; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:999px;">Open the planner</a>
</td>
</tr>
</table>

<p style="margin:20px 0 0; font-family:${SANS}; font-size:14px; line-height:1.6; color:${INK_SOFT};">
Choose <strong style="color:${INK};">Continue with Google</strong> and pick <strong style="color:${INK};">${escapeHtml(email)}</strong>. That address is what links you to the family, so there is no invite code to type and no password to make up.
</p>

<div style="height:1px; background:${SAND_DEEP}; margin:24px 0;"></div>

<p style="margin:0; font-family:${SANS}; font-size:14px; line-height:1.6; color:${INK_SOFT};">
Everything you edit is saved under your name, so we can all see who added what. If you would rather not have an account, just ignore this &mdash; nothing happens until you sign in.
</p>

</td>
</tr>

<!-- footer -->
<tr>
<td align="center" style="padding:20px 12px 0;">
<p style="margin:0; font-family:${SANS}; font-size:12px; line-height:1.6; color:${INK_SOFT};">
Sent to ${escapeHtml(email)} because ${escapeHtml(inviterName)} added you to the ${escapeHtml(familyName)} planner.<br>
<a href="${escapeHtml(siteUrl)}" style="color:${TEAL}; text-decoration:underline;">${escapeHtml(siteUrl.replace(/^https?:\/\//, ""))}</a>
</p>
</td>
</tr>

</table>
</td>
</tr>
</table>
</body>
</html>`;

  return { subject, html, text };
}
