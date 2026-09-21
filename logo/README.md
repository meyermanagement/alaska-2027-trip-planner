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
| `favicon.svg`           | `public/alyeska-tab-<hash>.svg`, `public/alyeska-tab-<hash>.ico`, `public/favicon.ico` | Aurora Sky |
| `app-icon.svg`          | `public/alyeska-icon.png`                                                              | Aurora Sky |
| `app-icon-maskable.svg` | `public/alyeska-icon-maskable.png`                                                     | Aurora Sky |
| `apple-touch-icon.svg`  | `public/alyeska-touch.png`                                                             | Aurora Sky |
| `email-mark.svg`        | `public/alyeska-mark.png`                                                              | Daybreak |

The two tab files carry the first six characters of the source's SHA-256 in the
filename, currently `8a783d` for both. That is deliberate and load-bearing:
Safari files an icon under its address in a database it reads before the network,
so rewriting the bytes behind a name it already knows changes nothing it will
look at, on any page it has already filed. Redraw the favicon and you must
rehash, rename both files and change the two `icons` lines in `app/layout.js`.
`public/favicon.ico` keeps its conventional name on purpose, for anything that
guesses rather than reads the tags.

## Aurora Sky: the same needle, on a plate

The four icon files draw the app's own compass, on a night plate that the in-app
mark does not need because the app is its own background. That plate is `#0b1322`
lit by two radial washes -- teal `#2fd4b5` from the upper left, violet `#8a6cf0`
from the lower right.

On it sits the needle from `components/AlyeskaMark.js`, painted the way the
sign-in screen paints it: teal `#3fdfbe` at north falling through glacier
`#7fb6e6` to plum `#c8a6ff` at the tails, with the west face tinted plum at 0.3
so it reads as a blade catching light rather than an arrowhead. Above it is one
graduation in amber `#efb35d`, the north mark.

One graduation, not the dial's sixteen. That is the whole lesson of the first
Aurora Sky attempt on 2026-09-18, which dropped the gradient, the west face and
the tick together and ended up a different mark from the one in the app: it is
the ring of sixteen that turned to noise at 60 and 16 pixels, not the color and
not north. Concept sources from that round are in the project file repo under
`design/icon-aurora-sky-2026-09-18/`.

Three things are measured rather than chosen, and moving them breaks something:

- The tiles are square-cornered, because every launcher masks the square itself.
  Their graduation sits out at radius 14.4, where the dial puts it.
- The maskable copy pulls the needle and the graduation in together, so nothing
  that matters lies outside radius 12.3 of the 32-unit box. A graduation left at
  the rim is cut to a stub by a circular mask.
- The tab keeps a heavier needle of its own and a wider graduation, 2.8 units
  against the tiles' 1.9. At 16 pixels the app's 2.5-unit counter scaled to
  two-thirds leaves arms under a pixel wide, and a 2.2-unit amber stroke covers
  one pixel and reads olive rather than amber.

The email mark is Daybreak and unchanged, because `lib/email/palette.js` sets
every message in that skin and the mark sits on its pale card with no tile.

The tab ships twice: as the SVG a modern browser reads, and as an `.ico` with
sixteen, thirty-two and forty-eight pixel frames, because some browsers ask for
that file by name and will keep showing whatever they cached there otherwise.
Each frame in that container is its own render at its own size -- Pillow's
`append_images` quietly redraws them all from the largest, and this needle
shrunk from 48 to 16 is a smudge, so `scripts/render-icons.py` packs the
container itself.

Run `python scripts/render-icons.py` after any change here. It re-renders every
PNG, rebuilds both `.ico` files and prints the new tab hash; renaming the tab
files and editing the two `icons` lines in `app/layout.js` is left to you on
purpose, so the rename shows up in the diff. Nothing generates these on deploy.

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
