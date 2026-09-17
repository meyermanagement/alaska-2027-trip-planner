# The marks that cannot follow the skin

Everywhere inside the app the compass is drawn by `components/AlyeskaMark.js`,
which reads the skin's own accents at render time. Five places cannot do that,
because they are files rather than components: the favicon, the two home-screen
icons, the iOS touch icon, and the mark at the head of every email. Those are
painted once, in the colors of the skin they can never leave.

The sources live here so the colors are recoverable, and each one is the exact
markup that produced its shipped file:

| Source                  | Ships as                                                                               | Colors   |
| ----------------------- | -------------------------------------------------------------------------------------- | -------- |
| `favicon.svg`           | `public/alyeska-tab-<hash>.svg`, `public/alyeska-tab-<hash>.ico`, `public/favicon.ico` | Midnight |
| `app-icon.svg`          | `public/alyeska-icon.png`                                                              | Midnight |
| `app-icon-maskable.svg` | `public/alyeska-icon-maskable.png`                                                     | Midnight |
| `apple-touch-icon.svg`  | `public/alyeska-touch.png`                                                             | Midnight |
| `email-mark.svg`        | `public/alyeska-mark.png`                                                              | Daybreak |

The two tab files carry the first six characters of their own SHA-256 in the
filename, currently `80b12e` and `02a365`. That is deliberate and load-bearing:
Safari files an icon under its address in a database it reads before the network,
so rewriting the bytes behind a name it already knows changes nothing it will
look at, on any page it has already filed. Redraw the favicon and you must
rehash, rename both files and change the two `icons` lines in `app/layout.js`.
`public/favicon.ico` keeps its conventional name on purpose, for anything that
guesses rather than reads the tags.

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

## Why the tab files are not called favicon

Safari keeps a favicon database keyed on the icon's own address, and reads it
before it touches the network. `/favicon.ico` and `/icon.svg` are addresses it
has held an answer for since the first time the site was opened, so rewriting
the bytes behind them changes nothing it will look at -- it goes on serving what
it filed, separately per page, so one screen shows one mark and the screen next
to it another. Closing the tab does not clear it and neither does quitting
Safari.

So the tab files are named for the app and declared in `app/layout.js` under
`metadata.icons`, rather than dropped into `app/` under the framework's
conventional names. If the mark changes again, rename these files again.
Rewriting them in place will look like it worked everywhere except the browsers
that already know them, which includes yours.

`public/favicon.ico` stays, holding the same drawing, for anything that ignores
the declared links and guesses.
