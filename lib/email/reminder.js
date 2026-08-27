/**
 * The morning reminder, built from the same parts as the sign-in email.
 *
 * Same palette, same nested tables, same no-webfonts discipline — see invite.js
 * for why. The difference is what it has to do: an invitation only has to be
 * inviting, while this has to be skimmable at 7am on a phone. So the tasks are a
 * list of rows rather than prose, anything late says so before it says anything
 * else, and the button goes to the trip the work belongs to when it all belongs
 * to one trip.
 */

import { formatShortDay } from "@/lib/format";

const INK = "#14201e";
const INK_SOFT = "#54625e";
const SAND = "#f7f5f0";
const SAND_DEEP = "#e7e1d5";
const TEAL = "#0f5f57";
const TEAL_SOFT = "#e7f0ed";
const ROSE = "#943952";
const AMBER = "#96601a";

const DISPLAY = "'Iowan Old Style', Georgia, 'Times New Roman', serif";
const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function plural(n, one, many) {
  return n === 1 ? one : many;
}

/**
 * The counts are the whole subject line's job, and late is the count that has to
 * survive being read in a notification: "2 overdue" first, always, because an
 * inbox only shows the first few words.
 */
function subjectFor(items, tripNames) {
  const late = items.filter((i) => i.late).length;
  const rest = items.length - late;
  const forTrip = tripNames.length === 1 ? ` for ${tripNames[0]}` : "";
  if (late > 0 && rest > 0) {
    return `${late} overdue and ${rest} due today${forTrip}`;
  }
  if (late > 0) {
    return `${late} ${plural(late, "thing", "things")} overdue${forTrip}`;
  }
  const thing = plural(rest, "thing", "things");
  if (tripNames.length === 1) {
    return `${rest} ${thing} to do today for ${tripNames[0]}`;
  }
  return `${rest} ${thing} to do today before we travel`;
}

/**
 * What the pill above a task says. Late leads with the word, then the day it was
 * meant to happen, because "overdue" is the news and the date is the detail.
 */
function flagText(item) {
  if (item.late) return `Overdue · was ${formatShortDay(item.date)}`;
  if (item.exact) return "Due today";
  return item.note || "Due about now";
}

/**
 * @param {object} input
 * @param {string} input.name    who is being reminded
 * @param {string} input.email   where it is going
 * @param {string} input.siteUrl origin of the deployment, no trailing slash
 * @param {string} input.familyName
 * @param {Array} input.items    {title, detail, tripName, tripSlug, priority, exact, note, date, late, assignee}
 */
export function reminderEmail({
  name,
  email,
  siteUrl,
  familyName,
  items = [],
}) {
  const first = String(name || "").split(" ")[0] || "there";
  const tripNames = [...new Set(items.map((i) => i.tripName).filter(Boolean))];
  const subject = subjectFor(items, tripNames);

  // One trip's worth of work should land you in that trip. Several should land
  // you on the one screen that holds all of it.
  const oneSlug = tripNames.length === 1 ? items[0]?.tripSlug : null;
  const buttonUrl = oneSlug
    ? `${siteUrl}/trips/${oneSlug}?tab=tasks`
    : `${siteUrl}/reminders`;
  const buttonLabel = oneSlug ? "Open the checklist" : "See everything due";

  const lateCount = items.filter((i) => i.late).length;

  const text = [
    `Morning ${first} — here is what is down to you today.`,
    "",
    ...items.map((item) => {
      const bits = [
        `• ${item.title}`,
        item.tripName ? `  ${item.tripName}` : null,
        `  ${flagText(item)}`,
        item.priority === "high" ? "  High priority" : null,
        item.detail ? `  ${item.detail}` : null,
      ].filter(Boolean);
      return bits.join("\n");
    }),
    "",
    `Tick things off here: ${buttonUrl}`,
    "",
    "You are getting this because your name is on these tasks. To stop them, open the People tab and turn reminders off on your own row.",
    "",
    "— Alyeska",
  ].join("\n");

  const rows = items
    .map((item, i) => {
      const flagColor = item.late ? ROSE : item.exact ? AMBER : INK_SOFT;
      const flag = `<span style="font-family:${SANS}; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:${flagColor};">${escapeHtml(flagText(item))}</span>`;
      const high =
        item.priority === "high"
          ? `<span style="font-family:${SANS}; font-size:11px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:${item.late ? INK_SOFT : ROSE};"> &middot; High priority</span>`
          : "";
      const detail = item.detail
        ? `<div style="font-family:${SANS}; font-size:14px; line-height:1.55; color:${INK_SOFT}; padding-top:4px;">${escapeHtml(item.detail)}</div>`
        : "";
      const trip =
        tripNames.length > 1 && item.tripName
          ? `<div style="font-family:${SANS}; font-size:12px; line-height:1.5; color:${INK_SOFT}; padding-top:5px;">${escapeHtml(item.tripName)}</div>`
          : "";
      const divider =
        i === 0
          ? ""
          : `<tr><td style="padding:0;"><div style="height:1px; background:${SAND_DEEP};"></div></td></tr>`;
      return `${divider}
<tr>
<td style="padding:14px 0;">
<div>${flag}${high}</div>
<div style="font-family:${SANS}; font-size:16px; line-height:1.45; font-weight:600; color:${INK}; padding-top:5px;">${escapeHtml(item.title)}</div>
${detail}${trip}
</td>
</tr>`;
    })
    .join("\n");

  // The opening line has to be honest about the shape of the list. Being told
  // "3 things today" when one of them was due last Tuesday is the kind of small
  // lie that teaches someone to stop reading.
  const forTrip =
    tripNames.length === 1 ? ` for ${escapeHtml(tripNames[0])}` : "";
  const restCount = items.length - lateCount;
  const lede =
    lateCount === 0
      ? `${items.length === 1 ? "One thing has your name on it" : `${items.length} things have your name on them`} today${forTrip}.`
      : restCount === 0
        ? `${lateCount === 1 ? "One thing with your name on it is" : `${lateCount} things with your name on them are`} past due${forTrip}.`
        : `${lateCount === 1 ? "One thing is" : `${lateCount} things are`} past due, and ${restCount === 1 ? "one more is" : `${restCount} more are`} due today${forTrip}.`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0; padding:0; background:${SAND}; color:${INK}; -webkit-font-smoothing:antialiased;">
<div style="display:none; max-height:0; overflow:hidden; opacity:0;">${escapeHtml(items.map((i) => i.title).join(" · "))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${SAND};">
<tr>
<td align="center" style="padding:32px 16px 48px;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:544px; width:100%;">

<!-- wordmark -->
<tr>
<td align="center" style="padding:0 0 22px;">
<span style="font-family:${DISPLAY}; font-size:22px; font-weight:600; letter-spacing:-0.01em; color:${TEAL};">Alyeska</span>
<div style="font-family:${SANS}; font-size:11px; font-weight:600; letter-spacing:0.09em; text-transform:uppercase; color:${INK_SOFT}; padding-top:5px;">${escapeHtml(familyName)} trip planner</div>
</td>
</tr>

<!-- card -->
<tr>
<td style="background:#ffffff; border:1px solid ${SAND_DEEP}; border-radius:16px; padding:32px 28px;">

<h1 style="margin:0; font-family:${DISPLAY}; font-size:26px; line-height:1.25; font-weight:600; letter-spacing:-0.012em; color:${INK};">Morning, ${escapeHtml(first)}.</h1>

<p style="margin:14px 0 0; font-family:${SANS}; font-size:16px; line-height:1.6; color:${INK_SOFT};">
${lede} Nothing here is a surprise &mdash; it is the same checklist that is in the app, just arriving on the day.
</p>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0; border-top:1px solid ${SAND_DEEP};">
${rows}
</table>

<!-- button -->
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 0;">
<tr>
<td align="center" bgcolor="${TEAL}" style="border-radius:999px;">
<a href="${escapeHtml(buttonUrl)}" style="display:inline-block; padding:13px 30px; font-family:${SANS}; font-size:15px; font-weight:600; color:#ffffff; text-decoration:none; border-radius:999px;">${buttonLabel}</a>
</td>
</tr>
</table>

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0; background:${TEAL_SOFT}; border-radius:12px;">
<tr>
<td style="padding:14px 16px;">
<div style="font-family:${SANS}; font-size:14px; line-height:1.55; color:${INK};">Ticking something off in the app is enough &mdash; there is nothing to reply to here, and anything you finish will not be mentioned again.${lateCount > 0 ? " Anything you leave will be, until it is done." : ""}</div>
</td>
</tr>
</table>

</td>
</tr>

<!-- footer -->
<tr>
<td align="center" style="padding:20px 12px 0;">
<p style="margin:0; font-family:${SANS}; font-size:12px; line-height:1.6; color:${INK_SOFT};">
Sent to ${escapeHtml(email)} because your name is on these tasks. To stop them, turn reminders off on your own row on the <a href="${escapeHtml(siteUrl)}/people" style="color:${TEAL}; text-decoration:underline;">People tab</a>.<br>
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
