/**
 * The manifest is what makes iOS Safari treat the site as an installed app.
 *
 * That matters here for one specific reason: an installed PWA on iOS is exempt
 * from the seven-day eviction that would otherwise wipe the offline document
 * cache for anyone who hadn't opened the site in a week. On Android and
 * desktop, the manifest is what enables Add to Home Screen at all.
 *
 * Colors follow Midnight Aurora, the skin the app opens in. The background and
 * theme values only affect the splash screen and status bar on first launch --
 * the app switches skins on its own once it boots -- but a white splash under a
 * dark icon is a seam you see every cold start, so they are the dark page.
 *
 * The icons are the sign-in dial: a slate disc with the sixteen graduations and
 * the needle in Midnight Aurora's four accents, on that skin's page rather than
 * on a tile. This is the one place the mark cannot follow the skin, because a
 * file on a home screen is painted once. Two of them, because a launcher does
 * two different things with an icon -- one shown as given, and one edge-to-edge
 * maskable copy with the instrument pulled in to radius 12.3 of the 32-unit box
 * so nothing that means anything crosses the circle a launcher may crop to.
 * They are drawn from the same tick paths and the same 0.72 needle scale as
 * components/AlyeskaMark.js, so the home screen and the sign-in screen are the
 * same instrument at two sizes.
 */
export default function manifest() {
  return {
    name: "Alyeska",
    short_name: "Alyeska",
    description:
      "Travel, Personalized. Contextualized. Simplified. No ads. No commissions. Just the memories that matter.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#070b11",
    theme_color: "#070b11",
    icons: [
      {
        src: "/alyeska-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/alyeska-icon-maskable.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
