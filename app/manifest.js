/**
 * The manifest is what makes iOS Safari treat the site as an installed app.
 *
 * That matters here for one specific reason: an installed PWA on iOS is exempt
 * from the seven-day eviction that would otherwise wipe the offline document
 * cache for anyone who hadn't opened the site in a week. On Android and
 * desktop, the manifest is what enables Add to Home Screen at all.
 *
 * Colors follow the Field Journal skin: it is the light default, and the
 * background/theme values only affect the splash screen and status bar on
 * first launch -- the app switches skins on its own once it boots.
 */
export default function manifest() {
  return {
    name: "Alyeska",
    short_name: "Alyeska",
    description:
      "Shared itineraries, packing lists and pre-departure tasks for the family — with Aly along for the trip.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#F7F6F2",
    theme_color: "#F7F6F2",
    icons: [
      {
        src: "/alyeska-mark.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/alyeska-mark.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
    ],
  };
}
