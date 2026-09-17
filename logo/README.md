# The marks that cannot follow the skin

Everywhere inside the app the compass is drawn by `components/AlyeskaMark.js`,
which reads the skin's own accents at render time. Five places cannot do that,
because they are files rather than components: the favicon, the two home-screen
icons, the iOS touch icon, and the mark at the head of every email. Those are
painted once, in the colors of the skin they can never leave.

The sources live here so the colors are recoverable, and each one is the exact
markup that produced its shipped file:

| Source                  | Ships as                           | Colors   |
| ----------------------- | ---------------------------------- | -------- |
| `favicon.svg`           | `app/icon.svg`, `app/favicon.ico`  | Midnight |
| `app-icon.svg`          | `public/alyeska-icon.png`          | Midnight |
| `app-icon-maskable.svg` | `public/alyeska-icon-maskable.png` | Midnight |
| `apple-touch-icon.svg`  | `app/apple-icon.png`               | Midnight |
| `email-mark.svg`        | `public/alyeska-mark.png`          | Daybreak |

The needle is teal at north falling through glacier to plum at the tails, with
the north graduation in amber, which is the same aurora fill the app draws on
the menu dial, the sign-in screen, the opening screen and Aly's panel header.
Midnight Aurora is the skin the app opens in, so the tiles are its dark plate
with no hairline edge to draw; the email mark is Daybreak, because `lib/email/palette.js` sets every
message in that skin and the mark sits on its pale card with no tile at all.

All four are one drawing at four sizes: the needle on a square tile with the
sixteen graduations run out to the tile's own edges rather than standing around
a circle inside it. Each mark follows its bearing until it reaches the boundary
of the square, so the diagonals sit further out than the cardinals. The
maskable copy is the same drawing scaled until the far tip of a diagonal mark
lands at radius 12.3 of the 32-unit box, which is the circle a launcher may
crop to.

The tab ships twice: as the SVG a modern browser reads, and as an `.ico` with
sixteen, thirty-two and forty-eight pixel frames, because some browsers ask for
that file by name and will keep showing whatever they cached there otherwise.
`/tmp` scripts are not the build path -- these are rasterized by hand and
committed, so a color change here means re-rendering every PNG below.

The PNGs are these files rasterized at their declared size, transparent where
the source has no tile. Any renderer that honors `linearGradient` and
`stroke-linecap` will do it -- there is no build step and nothing generates
them on deploy, so if a color changes here, the PNGs have to be re-rendered and
committed by hand. Emails already sent keep the mark they were sent with.
