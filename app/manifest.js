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
 *
 * The icons are pale tiles with the needle in that skin's four accents, which
 * is the one place the mark cannot follow the skin: a file on a home screen is
 * painted once. Two of them, because a launcher does two different things with
 * an icon -- one rounded tile for the platforms that show it as given, and one
 * edge-to-edge maskable copy with the instrument pulled in far enough to
 * survive being cropped to a circle. The old single file was declared at two
 * sizes it never was, so both are now the size they claim.
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
    background_color: "#F7F6F2",
    theme_color: "#F7F6F2",
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
