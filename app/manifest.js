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
 * The icons are the needle in Midnight Aurora's four accents on a tile in that
 * skin's plate color, with the sixteen graduations run out to the edges of the
 * tile rather than standing around a circle inside it. Each mark follows its
 * own bearing until it reaches the boundary of the square, so the four on the
 * diagonals sit further out than the cardinals do. This is the one place the
 * mark cannot follow the skin, because a file on a home screen is painted
 * once. The tiles are square-cornered on purpose -- every launcher masks the
 * square itself, and rounding it here too leaves a dark fringe outside the
 * mask. Two of them, because a launcher does two different things with an icon
 * -- one shown as given, and one maskable copy with the whole instrument
 * scaled until the far tip of a diagonal mark lands at radius 12.3 of the
 * 32-unit box, so nothing that means anything crosses the circle a launcher
 * may crop to. The browser tab and the iOS touch icon are the same drawing at
 * their own sizes, so every file the app ships agrees with the tab.
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
