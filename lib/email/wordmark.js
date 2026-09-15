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
 * 544px card; set side by side, the mark and the type align without either
 * being resized to suit the other.
 *
 * The tagline belongs to the name, not to the header, so it sits in the same
 * cell as the wordmark, on the caption line beside Travel, rather than centered
 * beneath the whole lockup. Three words about what the product does read as a
 * subtitle to the name when they hang off it and as a stray sentence when they
 * float under both the mark and the name. That gives the type column three
 * lines against the mark's one square, which is why the mark is 54px rather
 * than 46: at 46 it read as an ornament beside a paragraph.
 *
 * The name is the app's wordmark rather than its name set as a heading:
 * letterspaced capitals over a 38-pixel hairline, the same lockup the loading
 * screens, the sign-in screen and the desktop menu carry. Travel stays, on the
 * one line under the rule, ahead of the tagline and divided from it by a middot
 * in the rule's own color: the rule closes the name off, and what the company is
 * and what it does then read as one caption rather than two stacked lines. It is
 * mixed case rather than the small capitals it used to be, because capitals under
 * letterspaced capitals read as a second wordmark competing with the first.
 * The rule is a one-pixel div with a zero font size and a non-breaking
 * space in it, because an empty div collapses in Outlook and a border on a table
 * cell is the other way of doing this and the harder one to keep at one pixel.
 * Its color is a literal hex rather than the palette's pale teal: the app draws
 * this rule as the word's own ink at 40 percent, an inbox has no opacity worth
 * relying on, and the palette's lightest teal against the card is a difference
 * of three or four values -- a rule nobody can see is a rule that is not there.
 *
 * Two details are inbox concessions rather than design choices. The mark is a
 * PNG served from the deployment, because Gmail and Outlook both strip inline
 * SVG, and its alt text is the brand name so the header still reads as itself
 * in the images-off state most inboxes start in. And the name is written in
 * capitals in the markup instead of being cased by `text-transform`, because a
 * client that drops the property would otherwise render a mixed-case word with
 * small-caps letterspacing still on it -- the one failure that looks like a
 * mistake rather than a fallback.
 *
 * The mark is a png with the needle in Daybreak's teal, glacier and plum and its
 * north graduation in amber -- the same aurora fill the app draws, frozen,
 * because a file in an inbox cannot follow a skin. Its graduations are set half
 * again as strong as the app's, which is what it takes for them to survive being
 * shown at this size. Regenerating it means re-rendering logo/email-mark.svg; see
 * logo/README.md, and note that messages already sent keep the mark they were
 * sent with.
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
  const captionBlock = `
<div style="font-family:${SANS}; font-size:13px; line-height:1.35; font-weight:500; letter-spacing:-0.005em; color:${INK_SOFT}; padding-top:6px;"><span style="font-weight:600;">Travel</span>${
    tagline
      ? `<span style="color:#9bc9c3;">&nbsp;&middot;&nbsp;</span>${escapeHtml(tagline)}`
      : ""
  }</div>`;

  return `<tr>
<td align="center" style="padding:0 0 22px;">
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
<tr>
<td valign="middle" style="padding:0 13px 0 0;">
<img src="${escapeHtml(siteUrl)}/alyeska-mark.png" width="54" height="54" alt="Alyeska Travel" style="display:block; width:54px; height:54px; border:0; outline:none; text-decoration:none;">
</td>
<td valign="middle" align="left">
<div style="font-family:${DISPLAY}; font-size:21px; line-height:1; font-weight:600; letter-spacing:0.26em; color:${TEAL};">ALYESKA</div>
<div style="width:38px; height:1px; line-height:1px; font-size:0; background:#9bc9c3; margin-top:6px;">&nbsp;</div>${captionBlock}
</td>
</tr>
</table>
</td>
</tr>`;
}

/** The line every message carries under the lockup. */
export const HOUSE_TAGLINE = "Personalized. Contextualized. Simplified.";
