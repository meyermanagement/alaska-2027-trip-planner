/**
 * The beta invitation, in Aly's own voice.
 *
 * Keep HTML and plain text in step. Preserve Aly's original conversational
 * introduction and two opening paragraphs; tighten the setup and feedback
 * instructions around them. Shared branding and feedback images are unchanged.
 * Table layout, inline styles and PNG images are deliberate
 * email-client fallbacks. Rendering this template never sends an invitation.
 */
import { DISPLAY, MAIL, SANS } from "@/lib/email/palette";
import { HOUSE_TAGLINE, wordmarkRow } from "@/lib/email/wordmark";
import { ALY_PAYOFF, alyDescriptorList } from "@/lib/aly/descriptors";

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
 * @param {string} [input.name] who is being invited, if known
 * @param {string} input.email recipient address
 * @param {string} input.code single-use signup code
 * @param {string} input.siteUrl deployment origin, no trailing slash
 * @param {string} [input.note] optional personal note from Mark
 */
export function betaInviteEmail({ name, email, code, siteUrl, note }) {
  const first = String(name || "").trim().split(/\s+/)[0] || "there";
  const openUrl = `${siteUrl}/login?code=${encodeURIComponent(code)}`;
  const subject = "You’re invited to try Alyeska";
  const preview = "Bring a trip idea. We’ll take it from there.";
  const introduction = `${alyDescriptorList()}… let’s just say ${ALY_PAYOFF}`;
  const opening = "You don’t need to have a trip figured out before we talk. I’ll get to know who’s traveling, what you enjoy, and what you want to spend, then help you choose where to go and build a day-by-day itinerary around you. Together, we can compare options, adjust the plan, and find ways to bring costs down without giving up what matters most. I’ll also help you make better use of your airline miles, hotel points, and credit card benefits.";
  const onTrip = "My help doesn’t stop when the itinerary is ready. I’ll help you work out what each person needs to pack, what needs doing before departure, and which travel requirements or document dates need attention. While you’re traveling, I’ll use what you’ve shared about your interests, needs, and schedule to recommend places and help you rethink the day. You won’t have to explain the whole trip every time you ask a question.";
  const reassurance = "Wherever you end up, I’ve got your back.";
  const welcome = "You’re one of the first families trying this with me, and I’m glad you’re here.";
  const feedback = "Some corners aren’t finished yet. If something is wrong, slow, or plainly annoying, say so. I would much rather hear it from you now than have you be polite about it.";
  const report = "Look for the rose report flag near the bottom left. Tap it, tell me what happened, and add a screenshot if helpful. It comes straight to us with the page you were on.";
  const survey = "Once we’ve had a chance to plan a little together, I’d love to know what you think. You’ll find the Beta survey in the menu under More. It saves as you go, so answer a little now and come back whenever you have more to say.";
  const support = "Trouble getting started? Reply to this email. We’ll help you get in.";
  const terms = "Beta testing is free. Account holders must be 18 or older; parents can include children as travelers. This invitation code works once and creates your own household.";

  const text = [
    `Hi ${first}, I’m Aly.`, "", introduction, "", opening, "", onTrip, "", reassurance, "",
    `Want to see me in action first? See how it works: ${siteUrl}`, "",
    welcome, "",
    note ? `From Mark: ${note}` : null, note ? "" : null,
    `Start exploring: ${openUrl}`, "", `Your invitation code: ${code}`, "",
    "Tell me how it goes", "", feedback, "", report, "", survey, "",
    support, "", terms, "",
    `Sent to ${email} because you were invited to try Alyeska early.`,
    siteUrl,
  ].filter((line) => line !== null).join("\n");

  const paragraph = (copy, margin = 12) =>
    `<p style="margin:${margin}px 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK_SOFT};">${escapeHtml(copy)}</p>`;
  const heading = (copy) =>
    `<h2 style="margin:24px 0 0; font-family:${DISPLAY}; font-size:19px; line-height:1.3; font-weight:600; color:${INK};">${escapeHtml(copy)}</h2>`;
  const noteBlock = note
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:20px 0 0; background:${TEAL_SOFT}; border-radius:12px;">
<tr><td style="padding:14px 16px;">
<div style="font-family:${SANS}; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:${INK_SOFT};">A line from Mark</div>
<div style="font-family:${SANS}; font-size:15px; line-height:1.55; color:${INK}; padding-top:5px;">${escapeHtml(note)}</div>
</td></tr></table>`
    : "";

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background:${SAND}; color:${INK}; -webkit-font-smoothing:antialiased;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0; mso-hide:all;">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SAND};">
<tr><td align="center" style="padding:32px 16px 48px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:544px; width:100%;">
${wordmarkRow({ siteUrl, tagline: HOUSE_TAGLINE })}
<tr><td style="background:${CARD}; border:1px solid ${SAND_DEEP}; border-radius:16px; padding:32px 28px;">
<div style="font-family:${SANS}; font-size:11px; font-weight:700; letter-spacing:0.08em; text-transform:uppercase; color:${TEAL};">First families</div>
<h1 style="margin:8px 0 0; font-family:${DISPLAY}; font-size:26px; line-height:1.25; font-weight:600; letter-spacing:-0.012em; color:${INK};">Hi ${escapeHtml(first)}, I’m Aly.</h1>
<p style="margin:14px 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK_SOFT};">${escapeHtml(alyDescriptorList())}… let’s just say <strong style="font-weight:700; color:${INK};">${escapeHtml(ALY_PAYOFF)}</strong></p>
${paragraph(opening)}
${paragraph(onTrip)}
<p style="margin:12px 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK};"><strong style="font-weight:700;">${escapeHtml(reassurance)}</strong></p>
<p style="margin:20px 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK_SOFT};">Want to see me in action first?<br><a href="${escapeHtml(siteUrl)}" style="display:inline-block; padding:6px 0; color:${TEAL}; font-size:18px; font-weight:700; text-decoration:underline;">See how it works.</a></p>
${paragraph(welcome)}
${noteBlock}

<!-- One primary action after Aly's original conversational introduction. -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0;">
<tr><td align="center" bgcolor="${TEAL}" style="border-radius:999px;">
<a href="${escapeHtml(openUrl)}" style="display:inline-block; padding:13px 30px; font-family:${SANS}; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:999px;">Start exploring</a>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:16px 0 0; background:${SAND}; border:1px solid ${SAND_DEEP}; border-radius:12px;">
<tr><td align="center" style="padding:14px 12px;">
<div style="font-family:${SANS}; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:${INK_SOFT};">Your invitation code</div>
<div style="font-family:'SF Mono', Menlo, Consolas, monospace; font-size:22px; line-height:1.3; font-weight:700; letter-spacing:0.08em; color:${INK}; padding-top:6px; overflow-wrap:anywhere;">${escapeHtml(code)}</div>
</td></tr></table>
${heading("Tell me how it goes")}
${paragraph(feedback)}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:14px 0 0;">
<tr>
<td width="40" valign="top" style="padding:2px 12px 0 0;">
<img src="${escapeHtml(siteUrl)}/report-flag.png" width="28" height="28" alt="The rose report flag" style="display:block; width:28px; height:28px; border:0; outline:none; text-decoration:none;">
</td>
<td valign="top" style="font-family:${SANS}; font-size:15px; line-height:1.6; color:${INK_SOFT};">${escapeHtml(report)}</td>
</tr></table>
${paragraph(survey, 18)}
<!-- Preserve the existing menu reference, displayed more compactly. -->
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:12px 0 0;">
<tr><td align="center">
<img src="${escapeHtml(siteUrl)}/beta-survey-menu.png" width="300" alt="Open More in the menu and choose Beta survey, highlighted in teal" style="display:block; width:100%; max-width:300px; height:auto; border:1px solid ${SAND_DEEP}; outline:none; text-decoration:none; border-radius:8px;">
</td></tr></table>
${paragraph(support, 20)}
</td></tr>
<tr><td align="center" style="padding:20px 12px 0;">
<p style="margin:0; font-family:${SANS}; font-size:12px; line-height:1.6; color:${INK_SOFT};">${escapeHtml(terms)}</p>
<p style="margin:10px 0 0; font-family:${SANS}; font-size:12px; line-height:1.6; color:${INK_SOFT};">Sent to ${escapeHtml(email)} because you were invited to try Alyeska early.<br>
<a href="${escapeHtml(siteUrl)}" style="color:${TEAL}; text-decoration:underline;">${escapeHtml(String(siteUrl).replace(/^https?:\/\//, ""))}</a></p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
  return { subject, html, text };
}
