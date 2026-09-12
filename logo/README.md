# The marks that cannot follow the skin

Everywhere inside the app the compass is drawn by `components/AlyeskaMark.js`,
which reads the skin's own accents at render time. Five places cannot do that,
because they are files rather than components: the favicon, the two home-screen
icons, the iOS touch icon, and the mark at the head of every email. Those are
painted once, in the colors of the skin they can never leave.

The sources live here so the colors are recoverable, and each one is the exact
markup that produced its shipped file:

| Source                  | Ships as                           | Colors        |
| ----------------------- | ---------------------------------- | ------------- |
| `favicon.svg`           | `app/icon.svg`                     | Field Journal |
| `app-icon.svg`          | `public/alyeska-icon.png`          | Field Journal |
| `app-icon-maskable.svg` | `public/alyeska-icon-maskable.png` | Field Journal |
| `apple-touch-icon.svg`  | `app/apple-icon.png`               | Field Journal |
| `email-mark.svg`        | `public/alyeska-mark.png`          | Daybreak      |

The needle is teal at north falling through glacier to plum at the tails, with
the north graduation in amber, which is the same aurora fill the app draws on
the menu dial, the sign-in screen, the opening screen and Aly's panel header.
Field Journal is the light default skin, so the tiles are sand with a hairline
edge; the email mark is Daybreak, because `lib/email/palette.js` sets every
message in that skin and the mark sits on its pale card with no tile at all.

The PNGs are these files rasterized at their declared size, transparent where
the source has no tile. Any renderer that honors `linearGradient` and
`stroke-linecap` will do it -- there is no build step and nothing generates
them on deploy, so if a color changes here, the PNGs have to be re-rendered and
committed by hand. Emails already sent keep the mark they were sent with.
