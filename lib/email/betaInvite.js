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
 * The two main paragraphs explain the work before giving examples: first planning
 * and budgeting around the travelers, then preparation and help during the trip.
 * Personalization stays explicit without narrow scenes that a first-time reader
 * has to interpret to understand what Aly actually does.
 *
 * The closing block names the report flag, because it is an icon with no label
 * sitting in a corner: a tester who is not told what it is will not find it, and
 * an unfound button collects nothing. It shows the flag as well as naming it --
 * describing a corner asks somebody to go looking, while a picture of the mark
 * lets them recognize it the moment they see it.
 *
 * The body stays conversational rather than becoming a feature list. The main
 * copy combines the approved first paragraph from Option A with the second from
 * Option B; the issue-reporting instructions and flag image remain unchanged.
 */

import { DISPLAY, MAIL, SANS } from "@/lib/email/palette";
import { HOUSE_TAGLINE, wordmarkRow } from "@/lib/email/wordmark";

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
    `Hi ${first}, I’m Aly.`,
    "",
    "Assistant, advisor, concierge, planner… let’s just say Wherever you’re headed, I’ve got your back.",
    "",
    "You don’t need to have a trip figured out before we talk. I’ll get to know who’s traveling, what you enjoy, and what you want to spend, then help you choose where to go and build a day-by-day itinerary around you. Together, we can compare options, adjust the plan, and find ways to bring costs down without giving up what matters most. I’ll also help you make better use of your airline miles, hotel points, and credit card benefits.",
    "",
    "My help doesn’t stop when the itinerary is ready. I’ll help you work out what each person needs to pack, what needs doing before departure, and which travel requirements or document dates need attention. While you’re traveling, I’ll use what you’ve shared about your interests, needs, and schedule to recommend places and help you rethink the day. You won’t have to explain the whole trip every time you ask a question.",
    "",
    "Wherever you end up, I’ve got your back.",
    "",
    "You’re one of the first families trying this with me, and I’m glad you’re here. Some corners aren’t finished yet, so your experience will help us see what needs attention.",
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

<!-- the lockup, from lib/email/wordmark.js, so all three messages open the
     same way, tagline included: it is the one line that says what the app is
     for, and an invitation is the message most likely to be read by somebody
     who has never heard of it. -->
${wordmarkRow({ siteUrl, tagline: HOUSE_TAGLINE })}

<!-- card -->
<tr>
<td style="background:${CARD}; border:1px solid ${SAND_DEEP}; border-radius:16px; padding:32px 28px;">

<div style="font-family:${SANS}; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${TEAL};">First families</div>

<h1 style="margin:8px 0 0; font-family:${DISPLAY}; font-size:26px; line-height:1.25; font-weight:600; letter-spacing:-0.012em; color:${INK};">Hi ${escapeHtml(first)}, I’m Aly.</h1>

<p style="margin:14px 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK_SOFT};">
Assistant, advisor, concierge, planner… let’s just say <strong style="font-weight:700; color:${INK};">Wherever you’re headed, I’ve got your back.</strong>
</p>

<p style="margin:12px 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK_SOFT};">
You don’t need to have a trip figured out before we talk. I’ll get to know who’s traveling, what you enjoy, and what you want to spend, then help you choose where to go and build a day-by-day itinerary around you. Together, we can compare options, adjust the plan, and find ways to bring costs down without giving up what matters most. I’ll also help you make better use of your airline miles, hotel points, and credit card benefits.
</p>

<p style="margin:12px 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK_SOFT};">
My help doesn’t stop when the itinerary is ready. I’ll help you work out what each person needs to pack, what needs doing before departure, and which travel requirements or document dates need attention. While you’re traveling, I’ll use what you’ve shared about your interests, needs, and schedule to recommend places and help you rethink the day. You won’t have to explain the whole trip every time you ask a question.
</p>

<p style="margin:12px 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK};">
<strong style="font-weight:700;">Wherever you end up, I’ve got your back.</strong>
</p>

<p style="margin:12px 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK_SOFT};">
You’re one of the first families trying this with me, and I’m glad you’re here. Some corners aren’t finished yet, so your experience will help us see what needs attention.
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
