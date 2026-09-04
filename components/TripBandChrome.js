"use client";

import { useEffect } from "react";
import { BAND_COOKIE, paintChrome } from "@/lib/skins";

/**
 * Keeps the phone's own bar the same color as the band about the trip in
 * progress, for as long as that band is up.
 *
 * The band is solid accent welded to the top edge of the page. Above it is a
 * strip the app does not draw -- the status bar, and the ground either side of
 * the Dynamic Island -- which the phone paints from the theme color, and which
 * was the page's cream ground. So there was a seam: a pale strip, then the band,
 * with the two reading as separate objects. It was worst part way through a fast
 * scroll, when Safari's own bars are in motion and the strip is at its tallest,
 * and it closed up at the top of the page, which is why it looked like the band
 * had come loose rather than like a color that was simply wrong.
 *
 * Two halves, because one browser cannot do it alone:
 *
 * - The cookie is the half that works on an iPhone. Mobile Safari settles the
 *   theme color while it parses the document and never revisits that tag, so the
 *   color has to be known in the head -- before the app has run, let alone
 *   fetched a trip. The blocking script in app/layout.js reads this cookie and
 *   paints accordingly, which is what makes a hard reload mid-trip come up right
 *   on the first frame.
 * - Repainting the tag is the half that works everywhere else, and it is what
 *   covers the moment the band first appears, or goes, without a page load:
 *   Chrome and Firefox follow a change to the head's child list.
 *
 * The cookie is dated to the end of the trip rather than left to the session, so
 * a phone that is closed on the last day and opened a week later does not come
 * back to an accent bar over a page with no band on it. Clearing it on unmount
 * covers the ordinary case; the expiry covers the tab that was never reopened.
 *
 * Renders nothing. It is mounted by the band itself, so it cannot be up when the
 * band is not.
 */
export default function TripBandChrome({ endDate }) {
  useEffect(() => {
    // Midnight after the last day of the trip, in the traveler's own timezone,
    // which is the moment the band stops being true. A trip with no end date
    // gets a day, which is short enough to be self-correcting and long enough to
    // survive a night in a hotel with the phone on charge.
    const ends = expiryFor(endDate);
    write(`${BAND_COOKIE}=1; Path=/; Max-Age=${ends}; SameSite=Lax`);
    paintChrome(document.documentElement.dataset.skin);
    return () => {
      write(`${BAND_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`);
      paintChrome(document.documentElement.dataset.skin);
    };
  }, [endDate]);

  return null;
}

const DAY = 60 * 60 * 24;

function expiryFor(endDate) {
  if (!endDate) return DAY;
  // Built from the parts rather than parsed, because `new Date("2027-06-14")` is
  // read as UTC midnight and would end the band a few hours early for anybody
  // west of Greenwich -- including, always, at home.
  const [y, m, d] = String(endDate).split("-").map(Number);
  if (!y || !m || !d) return DAY;
  const after = new Date(y, m - 1, d + 1).getTime();
  const left = Math.round((after - Date.now()) / 1000);
  // A date already gone means the band should not be up at all, and something
  // upstream is wrong; an hour is enough to not fight it and short enough to
  // heal itself.
  return left > 60 ? left : 3600;
}

function write(value) {
  try {
    document.cookie = value;
  } catch {
    // A browser refusing cookies keeps the seam and nothing else.
  }
}
