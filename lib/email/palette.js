/**
 * The colors the app's emails are painted with, in one place.
 *
 * Both templates used to declare their own copy of the same six or eight hex
 * values, which was fine while there was one skin and became a small lie the
 * moment there were five: the app went pale and cool and the emails kept
 * arriving in cream and spruce, so a sign-in message no longer looked like the
 * thing it was signing you into.
 *
 * An email cannot follow the reader's chosen skin. There is no custom property
 * support worth relying on in an inbox, no way to know at send time which of the
 * recipients will open it in which client, and a message that has already been
 * delivered cannot change its mind when somebody switches skin a week later. So
 * the app has one email skin, named here, and it is the same one a new account
 * gets on the web — which means for anyone who has not gone looking in Settings,
 * and that is nearly everyone, the message and the site match.
 *
 * The values are read off the `html[data-skin]` block in globals.css by hand
 * rather than at build time, because an inbox needs literal hex in a style
 * attribute and there is no stylesheet to resolve a var() against. Keep them in
 * step with that block; there is no test that can notice they have drifted.
 */

import { skinById } from "@/lib/skins";

/** Which skin the app's mail wears. See above for why it is not the reader's. */
export const EMAIL_SKIN = "daybreak";

/**
 * Daybreak Aurora, flattened for an inbox.
 *
 * Two departures from the stylesheet, both forced. The page's ground is a
 * gradient wash over #e3edef and an email has to be one flat color, so `SAND` is
 * the solid underneath it. And `--line` is a translucent ink, which cannot be
 * used on a border in Outlook, so `SAND_DEEP` stands in — it is what that alpha
 * resolves to over this ground anyway.
 */
const DAYBREAK = {
  INK: "#10262b",
  INK_SOFT: "#4e6670",
  INK_FAINT: "#80959c",
  SAND: "#e3edef",
  SAND_DEEP: "#d7e5e7",
  CARD: "#fbfdfd",
  TEAL: "#0a7a6b",
  TEAL_SOFT: "#d8ebe7",
  ROSE: "#ae3a6b",
  AMBER: "#a5601a",
  ON_ACCENT: "#ffffff",
};

export const MAIL = DAYBREAK;

/** What the message can say about the look it is wearing, if it wants to. */
export const EMAIL_SKIN_NAME = skinById(EMAIL_SKIN).name;

// Fraunces and Geist will not load in an inbox. These are the same fallback
// stacks the site declares, so the shapes stay close to the real thing.
export const DISPLAY = "'Iowan Old Style', Georgia, 'Times New Roman', serif";
export const SANS =
  "-apple-system, BlinkMacSystemFont, 'Segoe UI', Helvetica, Arial, sans-serif";
