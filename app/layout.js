import { Fraunces, Geist } from "next/font/google";
import "./globals.css";
import BootVeil from "@/components/BootVeil";
import { DEFAULT_SKIN, SKINS, SKIN_COOKIE } from "@/lib/skins";

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
  themeColor: "#1b5a4c",
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
const applySkin = `(function(){try{
var m=document.cookie.match(/(?:^|; )${SKIN_COOKIE}=([^;]*)/);
var s=m?decodeURIComponent(m[1]):"";
var ok=${JSON.stringify(SKINS.map((skin) => skin.id))};
document.documentElement.dataset.skin=ok.indexOf(s)>-1?s:"${DEFAULT_SKIN}";
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
