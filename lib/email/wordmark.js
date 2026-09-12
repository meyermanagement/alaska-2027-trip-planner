/**
 * The header lockup every Alyeska email wears, in one place.
 *
 * All three messages -- the beta invitation, the sign-in note and the morning
 * reminder -- opened with the same fifteen lines of table markup copied three
 * times. That survived while the lockup was a stack of centered divs and stopped
 * being tenable the moment it became a horizontal arrangement with its own
 * nested table: three copies of a two-cell table is three chances for one of
 * them to drift a pixel, and a brand mark that is nearly the same in three
 * places is worse than one that is plainly different.
 *
 * The lockup is the mark beside the name rather than above it. Stacked, the
 * image and the two words made a narrow column that pinched inward over a
 * 544px card; set side by side, the 46px mark and the two lines of type are
 * within a couple of pixels of the same height, so they align without either
 * being resized to suit the other.
 *
 * Two details are inbox concessions rather than design choices. The mark is a
 * PNG served from the deployment, because Gmail and Outlook both strip inline
 * SVG, and its alt text is the brand name so the header still reads as itself
 * in the images-off state most inboxes start in. And "TRAVEL" is written in
 * capitals in the markup instead of being cased by `text-transform`, because a
 * client that drops the property would otherwise render a mixed-case word with
 * small-caps letterspacing still on it -- the one failure that looks like a
 * mistake rather than a fallback.
 */

import { DISPLAY, MAIL, SANS } from "@/lib/email/palette";

const { INK_SOFT, TEAL } = MAIL;

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The wordmark row, ready to drop into an email's outer 544px table.
 *
 * @param {object} input
 * @param {string} input.siteUrl   origin of the deployment, no trailing slash
 * @param {string} [input.tagline] the line under the lockup, if the message wants one
 * @returns {string} a single `<tr>` of HTML
 */
export function wordmarkRow({ siteUrl, tagline }) {
  const taglineBlock = tagline
    ? `
<div style="font-family:${SANS}; font-size:12px; font-weight:500; letter-spacing:-0.005em; color:${INK_SOFT}; padding-top:10px;">${escapeHtml(tagline)}</div>`
    : "";

  return `<tr>
<td align="center" style="padding:0 0 22px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
<tr>
<td valign="middle" style="padding:0 12px 0 0;">
<img src="${escapeHtml(siteUrl)}/alyeska-mark.png" width="46" height="46" alt="Alyeska Travel" style="display:block; width:46px; height:46px; border:0; outline:none; text-decoration:none;">
</td>
<td valign="middle" align="left">
<div style="font-family:${DISPLAY}; font-size:25px; line-height:1; font-weight:600; letter-spacing:-0.012em; color:${TEAL};">Alyeska</div>
<div style="font-family:${SANS}; font-size:10px; line-height:1.1; font-weight:700; letter-spacing:0.19em; color:${TEAL}; padding-top:5px;">TRAVEL</div>
</td>
</tr>
</table>${taglineBlock}
</td>
</tr>`;
}

/** The line every message carries under the lockup. */
export const HOUSE_TAGLINE = "Personalized. Contextualized. Simplified.";
