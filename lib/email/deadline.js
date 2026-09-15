/**
 * The deadline email: the same warning as the notification, for a household that
 * has not turned notifications on.
 *
 * Built from the same parts as the morning reminder -- same palette, same nested
 * tables, no webfonts -- but it has a different job. The morning email is a list
 * of work; this is one or two things running out, and the subject line has to say
 * which and by when, because on a phone the subject line is the whole message.
 *
 * It exists at all because push is the better channel and is also the one that can
 * silently not be there: an iPhone will not offer permission until the site has
 * been added to the Home Screen, and nobody should miss a fare because of that. So
 * a family with no subscribed browser gets this instead, and a family with one
 * does not get both.
 */

import { DISPLAY, MAIL, SANS } from "@/lib/email/palette";
import { HOUSE_TAGLINE, wordmarkRow } from "@/lib/email/wordmark";

const { INK, INK_SOFT, SAND, SAND_DEEP, CARD, TEAL, TEAL_SOFT, ROSE, AMBER } =
  MAIL;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function stageWords(alert) {
  if (alert.daysLeft === 0) return "Today";
  if (alert.daysLeft === 1) return "Tomorrow";
  return `${alert.daysLeft} days left`;
}

/**
 * @param {object} input
 * @param {string} input.name    who is being written to
 * @param {string} input.email   where it is going
 * @param {string} input.siteUrl origin of the deployment, no trailing slash
 * @param {Array}  input.alerts  from lib/watch/deadlines.js
 */
export function deadlineEmail({ name, email, siteUrl, alerts = [] }) {
  const first = String(name || "").split(" ")[0] || "there";
  const soonest = alerts[0];
  const subject =
    alerts.length === 1
      ? `${soonest.daysLeft === 0 ? "Today is the last day" : stageWords(soonest)}: ${soonest.title}`
      : `${alerts.length} things are running out, soonest ${soonest.daysLeft === 0 ? "today" : stageWords(soonest).toLowerCase()}`;

  const buttonUrl = `${siteUrl}${alerts.length === 1 ? soonest.path : "/someday"}`;

  const text = [
    `${first} — ${alerts.length === 1 ? "this one has a date on it" : "these have dates on them"}.`,
    "",
    ...alerts.map((a) => `• ${stageWords(a)} — ${a.title}\n  ${a.body}`),
    "",
    `Open the app: ${buttonUrl}`,
    "",
    "Nothing here was found by us. Every date came off something your family put in — a fare somebody forwarded, an offer somebody recorded.",
    "",
    "— Alyeska",
  ].join("\n");

  const rows = alerts
    .map((alert, i) => {
      const color =
        alert.daysLeft === 0 ? ROSE : alert.daysLeft === 1 ? AMBER : INK_SOFT;
      const divider =
        i === 0
          ? ""
          : `<tr><td style="padding:0;"><div style="height:1px; background:${SAND_DEEP};"></div></td></tr>`;
      return `${divider}
<tr>
<td style="padding:14px 0;">
<div><span style="font-family:${SANS}; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:${color};">${escapeHtml(stageWords(alert))}</span></div>
<div style="font-family:${SANS}; font-size:16px; line-height:1.45; font-weight:600; color:${INK}; padding-top:5px;">${escapeHtml(alert.title)}</div>
<div style="font-family:${SANS}; font-size:14px; line-height:1.55; color:${INK_SOFT}; padding-top:4px;">${escapeHtml(alert.body)}</div>
</td>
</tr>`;
    })
    .join("\n");

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background:${SAND}; color:${INK}; -webkit-font-smoothing:antialiased;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(alerts.map((a) => a.title).join(" · "))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SAND};">
<tr>
<td align="center" style="padding:32px 16px 48px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:544px; width:100%;">

${wordmarkRow({ siteUrl, tagline: HOUSE_TAGLINE })}

<tr>
<td style="background:${CARD}; border:1px solid ${SAND_DEEP}; border-radius:16px; padding:32px 28px;">

<h1 style="margin:0; font-family:${DISPLAY}; font-size:26px; line-height:1.25; font-weight:600; letter-spacing:-0.012em; color:${INK};">${escapeHtml(first)}, ${alerts.length === 1 ? "this one has a date on it" : "these have dates on them"}.</h1>

<p style="margin:14px 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK_SOFT};">
Sent now rather than in the morning because ${alerts.length === 1 ? "it" : "the first of them"} runs out ${soonest.daysLeft === 0 ? "today" : soonest.daysLeft === 1 ? "tomorrow" : `in ${soonest.daysLeft} days`}.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0; border-top:1px solid ${SAND_DEEP};">
${rows}
</table>

<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
<tr>
<td align="center" bgcolor="${TEAL}" style="border-radius:999px;">
<a href="${escapeHtml(buttonUrl)}" style="display:inline-block; padding:13px 30px; font-family:${SANS}; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:999px;">Open it in the app</a>
</td>
</tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0; background:${TEAL_SOFT}; border-radius:12px;">
<tr>
<td style="padding:14px 16px;">
<div style="font-family:${SANS}; font-size:14px; line-height:1.55; color:${INK};">Nothing here was found by us. Every date came off something your family put in &mdash; a fare somebody forwarded, an offer somebody recorded &mdash; so the price and the deadline are whoever's you got them from.</div>
</td>
</tr>
</table>

</td>
</tr>

<tr>
<td align="center" style="padding:20px 12px 0;">
<p style="margin:0; font-family:${SANS}; font-size:12px; line-height:1.6; color:${INK_SOFT};">
Sent to ${escapeHtml(email)} because nobody in the household has turned on notifications yet. Turn them on from the <a href="${escapeHtml(siteUrl)}/reminders" style="color:${TEAL}; text-decoration:underline;">Reminders screen</a> and these arrive on your phone instead.<br>
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
