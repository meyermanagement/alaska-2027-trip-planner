import { Fraunces, Geist } from "next/font/google";
import "./globals.css";
import BootVeil from "@/components/BootVeil";
import {
  BAND_COOKIE,
  DEFAULT_SKIN,
  SKINS,
  SKIN_COOKIE,
  skinById,
} from "@/lib/skins";

// One editorial serif for names and headings, one quiet sans for everything
// else. Loaded properly rather than falling back to whatever the device has.
const displayFace = Fraunces({
  subsets: ["latin"],
  variable: "--font-display-face",
  display: "swap",
});

const sansFace = Geist({
  subsets: ["latin"],
  variable: "--font-sans-face",
  display: "swap",
});

export const metadata = {
  title: "Alyeska",
  description:
    "Shared itineraries, packing lists and pre-departure tasks for the family — with Aly along for the trip.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // The first frame's bar, before the script below has read the cookie. It is
  // the default skin's, because that is what the page is wearing until it has.
  themeColor: skinById(DEFAULT_SKIN).bar,
};

// The skin, put on <html> before the browser paints anything.
//
// It has to happen here, in a blocking script in the head, and not in a React
// effect: the skin decides the color of the page's own ground, so a person on
// Midnight Aurora who is told about it after hydration sees a flash of cream
// paper first. Reading cookies in this layout would do it without a script, but
// that opts every page in the app out of static rendering -- including the login
// page, which has no session to read -- for a value that is three strings long.
//
// The cookie is set by middleware.js from the person's profile, so it is already
// on the very first authed response: Set-Cookie is stored while the headers are
// processed, which is before this script in the body runs.
//
// Fails to the default rather than to nothing. If the cookie is missing, junk, or
// naming a skin this build does not have, the app is the app it has always been.
// The bar the phone paints above the page comes from the meta tag below rather
// than from the stylesheet, so it has to be set here too. Without it, choosing
// Midnight Aurora repainted the whole app and left a spruce band across the top
// of the phone.
const applySkin = `(function(){try{
var m=document.cookie.match(/(?:^|; )${SKIN_COOKIE}=([^;]*)/);
var s=m?decodeURIComponent(m[1]):"";
var bars=${JSON.stringify(
  Object.fromEntries(
    SKINS.map((skin) => [
      skin.id,
      [skin.bar, skin.dark, skin.band || skin.bar],
    ]),
  ),
)};
var id=bars[s]?s:"${DEFAULT_SKIN}";
// The band about the trip in progress is solid accent and sits against the top
// edge of the page, so while it is up the phone's own bar is painted the same
// color -- otherwise there is a cream strip between the Dynamic Island and the
// band, and the band reads as a panel that has come loose. Read here, in the
// head, because Safari settles the theme color while it parses the document.
var band=/(?:^|; )${BAND_COOKIE}=1/.test(document.cookie);
var bar=band?bars[id][2]:bars[id][0];
var d=document.documentElement;
d.dataset.skin=id;
d.style.colorScheme=bars[id][1]?"dark":"light";
var paint=function(){var t=document.querySelectorAll('meta[name="theme-color"]');
for(var i=0;i<t.length;i++)t[i].setAttribute("content",bar);
return t.length>0;};
// Whether the meta tag has been parsed yet depends on where the framework put
// it relative to this script, and that is not ours to decide. Painted now if it
// is there, and again once the head is finished if it is not.
if(!paint())document.addEventListener("DOMContentLoaded",paint);
}catch(e){}})()`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-skin={DEFAULT_SKIN}
      className={`${displayFace.variable} ${sansFace.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: applySkin }} />
      </head>
      <body>
        {/* First in the body, so it is in the first frame of HTML the browser
            gets and there is no blank moment before it. It hides itself once
            the app underneath has painted -- see components/BootVeil.js. */}
        <BootVeil />
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
