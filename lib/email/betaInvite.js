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
 *
 * The opening paragraph deliberately shares no examples with the Meet Aly screen,
 * which is the next thing these people read. Both make the same argument, so the
 * temptation is to make it the same way twice -- Alaska in August, thirty thousand
 * points instead of three hundred and forty dollars, the forecast and the passport
 * date. Read back to back that stops sounding like Aly and starts sounding like a
 * template: the second telling teaches nothing and quietly cheapens the first. So
 * the email works from different moments -- a June week, a ceiling, an inhaler,
 * half past five with everybody hungry -- and leaves the screen its own.
 *
 * The closing block names the report flag, because it is an icon with no label
 * sitting in a corner: a tester who is not told what it is will not find it, and
 * an unfound button collects nothing. It shows the flag as well as naming it --
 * describing a corner asks somebody to go looking, while a picture of the mark
 * lets them recognize it the moment they see it.
 *
 * The body is the long version on purpose. It was cut once into five marked
 * lines, which was shorter and read like a brochure; this is the one place Aly
 * speaks to somebody before she knows anything about them, and the paragraphs
 * are what makes it sound like somebody talking rather than a feature list.
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
    "There is a version of this where you keep fourteen tabs open for three evenings, and a version where you tell me you have a free week in June and who is coming, and I hand back days you can argue with instead of a blank page. Give me a ceiling and I plan under it, then say out loud which night is costing you the most when the total starts to drift. Your airline, hotel and card programs sit in one place, so a room can be paid out of points you had forgotten and a credit gets used before the year runs out on it.",
    "",
    "I know one of you cannot start at six and somebody needs an inhaler, so the suitcase list is written before you think of it and the day is paced for the slowest walker. I read the small print of a border, and the date inside a document, while there is still time to do something about either. And when you are standing on a street at half past five with everybody hungry, I answer that, rather than handing you a search box. You are one of the first families I get to do any of this for.",
    "",
    `Your code: ${code}`,
    "",
    `Open it here: ${openUrl}`,
    "",
    "The code opens a household of your own. Sign in with Google or make a password, and I will ask a handful of questions about how you like to travel before I plan anything. Then tell me about a trip you are actually thinking about, real or half-formed, and watch what I do with it.",
    "",
    note ? `From Mark: ${note}` : null,
    note ? "" : null,
    "If something is wrong, slow or plainly annoying, say so. That is what this round is for. There is a small flag, a solid rose one, in the bottom left corner of every screen, and it is only there for you: tap it, tell me what happened, and add a screenshot if you have one.",
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
There is a version of this where you keep fourteen tabs open for three evenings, and a version where you tell me you have a free week in June and who is coming, and I hand back days you can argue with instead of a blank page. Give me a ceiling and I plan under it, then say out loud which night is costing you the most when the total starts to drift. Your airline, hotel and card programs sit in one place, so a room can be paid out of points you had forgotten and a credit gets used before the year runs out on it.
</p>

<p style="margin:12px 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK_SOFT};">
I know one of you cannot start at six and somebody needs an inhaler, so the suitcase list is written before you think of it and the day is paced for the slowest walker. I read the small print of a border, and the date inside a document, while there is still time to do something about either. And when you are standing on a street at half past five with everybody hungry, I answer that, rather than handing you a search box. You are one of the first families I get to do any of this for.
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
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 0;">
<tr>
<td width="40" valign="top" style="padding:2px 12px 0 0;">
<!-- The flag itself, drawn at three times the size and shown at twenty-eight
     points: the button it points at is an icon with no label in the corner of
     the screen, and a picture of the thing beats another sentence about a
     corner. A PNG in public rather than the inline SVG the app draws, for the
     same reason the wordmark is a PNG -- Gmail and Outlook both strip SVG --
     with alt text that names it for anybody whose client blocks images. -->
<img src="${escapeHtml(siteUrl)}/report-flag.png" width="28" height="28" alt="The report flag" style="display:block; width:28px; height:28px; border:0; outline:none; text-decoration:none;">
</td>
<td valign="top" style="font-family:${SANS}; font-size:15px; line-height:1.6; color:${INK_SOFT};">This is what to look for, in the bottom left corner of every screen, and it is only there for the first families. Tap it, tell me what happened, and add a screenshot if you have one &mdash; it comes straight to us with the page you were on.</td>
</tr>
</table>
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
