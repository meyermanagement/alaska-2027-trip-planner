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
 * The icons are Aurora Sky: the app's hollow needle in ivory on a night plate
 * lit by a teal wash from the upper left and a violet one from the lower right.
 * This is deliberately not the drawing the app makes for itself. Inside the app
 * the compass carries an amber north tick and sixteen graduations that follow
 * the skin; at home-screen and tab sizes those turned to noise, so the icon
 * files -- and only the icon files -- use the simpler picture. logo/README.md
 * holds the sources and the reasoning. This is the one place the mark cannot
 * follow the skin, because a file on a home screen is painted once. The tiles
 * are square-cornered on purpose -- every launcher masks the square itself, and
 * rounding it here too leaves a dark fringe outside the mask. Two of them,
 * because a launcher does two different things with an icon -- one shown as
 * given, and one maskable copy with the needle scaled until its far tails sit
 * inside radius 12.3 of the 32-unit box, the circle a launcher may crop to. The
 * browser tab and the iOS touch icon are the same picture at their own sizes.
 */
export default function manifest() {
  return {
    name: "Alyeska",
    short_name: "Alyeska",
    description:
      "Travel · Personalized. Contextualized. Simplified. No ads. No commissions. Just the memories that matter.",
    // The one documented way a tap inside an installed iOS app lands in Safari
    // instead is a navigation judged out of scope. With no scope declared, the
    // scope is inferred from start_url, and an inference is a thing that can be
    // read differently by a launcher than by us. Both are stated, so every path
    // on the site is in scope by declaration rather than by default.
    id: "/",
    scope: "/",
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
