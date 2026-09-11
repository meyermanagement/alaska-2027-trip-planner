/**
 * The beta invitation, in Aly's own voice.
 *
 * Built from the same parts as the morning reminder — the palette in
 * lib/email/palette.js, nested tables, inline styles, no webfonts and no SVG —
 * so somebody who ends up getting both sees one product rather than two. See
 * invite.js for why an inbox forces that discipline.
 *
 * What makes this one different is who is speaking. The other two messages are
 * the app talking about itself; this is Aly writing to somebody she is about to
 * work for, before she knows anything about them. So it is first person, it is
 * short, and it is honest about being early: a beta tester who is told they are
 * one of the first is being asked for something, and the ask is the point of the
 * message.
 *
 * The code is the one piece of it that has to survive being read on a cracked
 * phone in a hurry, so it gets its own panel, in mono, spaced, above the button
 * — and the button carries it in the link as well, so nobody has to type it at
 * all unless their client has eaten the query string.
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
 * @param {string} [input.name]   who is being invited, if we know
 * @param {string} input.email    where it is going
 * @param {string} input.code     their signup code
 * @param {string} input.siteUrl  origin of the deployment, no trailing slash
 * @param {string} [input.note]   a line from Mark, shown as his own aside
 */
export function betaInviteEmail({ name, email, code, siteUrl, note }) {
  const first = String(name || "").split(" ")[0] || "there";
  const openUrl = `${siteUrl}/login?code=${encodeURIComponent(code)}`;
  const subject = `${first}, you are one of the first people inside Alyeska`;

  const text = [
    `Hello ${first} — I am Aly.`,
    "",
    "I look after the boring half of traveling, so that the good half is the part you actually remember. The plan for each day, what to pack, what has to be booked before it sells out, where the confirmations went, who needs what. You are one of the first families I get to do that for, which is genuinely exciting and also means you will find the corners I have not finished.",
    "",
    "It is not only the busywork. It is the part that keeps you up: the flight that moved, the passport nobody checked, the day everybody assumed somebody else had booked, the four people who each half-remember a different version of the plan. I hold the whole thing in one place, keep the family reading the same plan, and say something before a date turns into a problem, so the trip stops living in your head.",
    "",
    `Your code: ${code}`,
    "",
    `Open it here: ${openUrl}`,
    "",
    "The code opens a household of your own. Sign in with Google or make a password, and I will ask a handful of questions about how you like to travel before I plan anything. Then tell me about a trip you are actually thinking about, real or half-formed, and watch what I do with it.",
    "",
    note ? `From Mark: ${note}` : null,
    note ? "" : null,
    "If something is wrong, slow or plainly annoying, say so. That is what this round is for.",
    "",
    "— Aly, at Alyeska",
  ]
    .filter((line) => line !== null)
    .join("\n");

  const noteBlock = note
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0; background:${TEAL_SOFT}; border-radius:12px;">
<tr>
<td style="padding:14px 16px;">
<div style="font-family:${SANS}; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:${INK_SOFT};">A line from Mark</div>
<div style="font-family:${SANS}; font-size:15px; line-height:1.55; color:${INK}; padding-top:5px;">${escapeHtml(note)}</div>
</td>
</tr>
</table>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background:${SAND}; color:${INK}; -webkit-font-smoothing:antialiased;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">Your code is ${escapeHtml(code)}, and it opens a household of your own.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SAND};">
<tr>
<td align="center" style="padding:32px 16px 48px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:544px; width:100%;">

<!-- wordmark: a 128px PNG rather than inline SVG, because Gmail and Outlook
     both strip SVG, with the word Alyeska as its alt text so the header still
     reads as itself with images turned off. -->
<tr>
<td align="center" style="padding:0 0 22px;">
<img src="${escapeHtml(siteUrl)}/alyeska-mark.png" width="42" height="42" alt="Alyeska Travel" style="display:block; margin:0 auto 9px; width:42px; height:42px; border:0; outline:none; text-decoration:none;">
<div style="font-family:${DISPLAY}; font-size:22px; line-height:1.05; font-weight:600; letter-spacing:-0.01em; color:${TEAL};">Alyeska</div>
<div style="font-family:${DISPLAY}; font-size:14px; line-height:1.1; font-weight:500; letter-spacing:0.02em; color:${TEAL}; padding-top:2px;">Travel</div>
</td>
</tr>

<!-- card -->
<tr>
<td style="background:${CARD}; border:1px solid ${SAND_DEEP}; border-radius:16px; padding:32px 28px;">

<div style="font-family:${SANS}; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${TEAL};">First families</div>

<h1 style="margin:8px 0 0; font-family:${DISPLAY}; font-size:26px; line-height:1.25; font-weight:600; letter-spacing:-0.012em; color:${INK};">Hello ${escapeHtml(first)}, I am Aly.</h1>

<p style="margin:14px 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK_SOFT};">
I look after the boring half of traveling, so the good half is the part you remember. The shape of each day, what to pack, what has to be booked before it goes, where the confirmations went, who needs what and when. You are one of the first families I get to do that for.
</p>

<p style="margin:12px 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK_SOFT};">
It is not only the busywork. It is the part that keeps you up at night: the flight that moved, the passport nobody checked, the day everybody assumed somebody else had booked. I hold the whole trip in one place, keep the family reading the same plan, and say something before a date turns into a problem, so it stops living in your head.
</p>

<p style="margin:12px 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK_SOFT};">
Which is exciting, and also means you will find the corners I have not finished yet. Both of those are the point.
</p>

<!-- the code, given its own panel because it is the one thing here somebody
     may have to read out or type by hand -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0; background:${SAND}; border:1px solid ${SAND_DEEP}; border-radius:12px;">
<tr>
<td align="center" style="padding:16px;">
<div style="font-family:${SANS}; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:${INK_SOFT};">Your code</div>
<div style="font-family:'SF Mono', Menlo, Consolas, monospace; font-size:22px; line-height:1.3; font-weight:700; letter-spacing:0.08em; color:${INK}; padding-top:6px;">${escapeHtml(code)}</div>
</td>
</tr>
</table>

<!-- button -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0;">
<tr>
<td align="center" bgcolor="${TEAL}" style="border-radius:999px;">
<a href="${escapeHtml(openUrl)}" style="display:inline-block; padding:13px 30px; font-family:${SANS}; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:999px;">Let me in</a>
</td>
</tr>
</table>

<p style="margin:18px 0 0; font-family:${SANS}; font-size:15px; line-height:1.6; color:${INK_SOFT};">
The code opens a household of your own. Sign in with Google or make a password, and I will ask a handful of questions about how you like to travel before I plan a thing. Then tell me about a trip you are actually thinking about &mdash; real, or still half an idea &mdash; and see what I make of it.
</p>

${noteBlock}

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0; border-top:1px solid ${SAND_DEEP};">
<tr>
<td style="padding:16px 0 0;">
<div style="font-family:${SANS}; font-size:15px; line-height:1.6; color:${INK};">If something is wrong, slow, or plainly annoying, say so. I would much rather hear it from you now than have you be polite about it.</div>
</td>
</tr>
</table>

</td>
</tr>

<!-- footer -->
<tr>
<td align="center" style="padding:20px 12px 0;">
<p style="margin:0; font-family:${SANS}; font-size:12px; line-height:1.6; color:${INK_SOFT};">
Sent to ${escapeHtml(email)} because you were invited to try Alyeska early. The code is yours alone and works once.<br>
<a href="${escapeHtml(siteUrl)}" style="color:${TEAL}; text-decoration:underline;">${escapeHtml(String(siteUrl).replace(/^https?:\/\//, ""))}</a>
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
