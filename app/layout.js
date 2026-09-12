import { Fraunces, Geist } from "next/font/google";
import "./globals.css";
import BootVeil from "@/components/BootVeil";
import ServiceWorkerBoot from "@/components/ServiceWorkerBoot";
import UsageTrail from "@/components/UsageTrail";
import FeedbackSheet from "@/components/FeedbackSheet";
import FaultWatch from "@/components/FaultWatch";
import ReportButton from "@/components/ReportButton";
import {
  BAND_COOKIE,
  BOOT_COOKIE,
  DEFAULT_SKIN,
  SKINS,
  SKIN_COOKIE,
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
  // One line, because metadata descriptions have to be one string -- browser
  // tabs, link previews and search snippets do not honor paragraph breaks.
  // The login screen splits promise from pledge across two <p>s; here the
  // two halves are strung together as six short sentences so the rhythm
  // survives being read on one line.
  description:
    "Travel, Personalized. Contextualized. Simplified. No ads. No commissions. Just the memories that matter.",
};

export const viewport = {
  width: "device-width",
  initialScale: 1,
  // No themeColor here, deliberately, and it must not come back.
  //
  // The color of the phone's own bar is not a constant in this app: it follows
  // the skin, and it follows the band about the trip in progress. Both of those
  // are settled by the script below, and the only way to make mobile Safari
  // notice a new one is to take the tag out of the head and put a fresh one in --
  // an attribute change is read while the document is parsed and never again.
  //
  // Declaring the tag here made the framework the owner of that node. Pulling it
  // out from under React worked exactly once: the next client navigation, which is
  // the next time React touched the head, threw on a node that was no longer
  // where it had left it -- and the screen either sat there or the whole app
  // reloaded. So the tag is the app's own from the first frame: created by the
  // script, replaced by the script, and never rendered.
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
// Which opening this load gets. The full one -- compass, wordmark, tagline --
// is an arrival, and it was playing on every document load, which on a day of
// testing is several times an hour. So it runs once per browser session and
// every load after it gets the short one: a compass crossing a map, held only
// as long as the page needs. Decided here because the veil is in the first
// frame of HTML and cannot wait for hydration to learn which one it is.
var opened=/(?:^|; )${BOOT_COOKIE}=1/.test(document.cookie);
d.dataset.boot=opened?"quick":"full";
if(!opened)document.cookie="${BOOT_COOKIE}=1;path=/;samesite=lax";
d.style.colorScheme=bars[id][1]?"dark":"light";
var paint=function(){var t=document.querySelectorAll('meta[name="theme-color"]');
// Nothing rendered one, so this is where the tag comes from. Made here in the
// head, while the document is still being parsed, which is the only moment
// Safari reads it.
if(!t.length){if(!document.head)return false;var f=document.createElement("meta");
f.setAttribute("name","theme-color");f.setAttribute("content",bar);
document.head.appendChild(f);return true;}
for(var i=0;i<t.length;i++)t[i].setAttribute("content",bar);
return true;};
// Normally the head exists by now and this is done on the spot. The fallback is
// for the one case that cannot be: a build that inlines this script somewhere the
// head has not been opened yet.
if(!paint())document.addEventListener("DOMContentLoaded",paint);
}catch(e){}})()`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-skin={DEFAULT_SKIN}
      data-boot="full"
      className={`${displayFace.variable} ${sansFace.variable}`}
      /* The script below rewrites both of these attributes before React ever
         runs, which is the whole point of it -- and React, finding the document
         it is hydrating already changed, warned that it would not patch them up.
         It should not: the script is right and the server could not have known
         either value. Rendering the defaults here and suppressing the check says
         so, and means the no-script case still has a skin and an opening. */
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: applySkin }} />
      </head>
      <body>
        {/* First in the body, so it is in the first frame of HTML the browser
            gets and there is no blank moment before it. It hides itself once
            the app underneath has painted -- see components/BootVeil.js. */}
        <BootVeil />
        <ServiceWorkerBoot />
        {/* Records which screen a signed-in person is on and how long it held
            them. Writes nothing for a visitor who is not signed in. */}
        <UsageTrail />
        {/* Asleep until the report button wakes it. Mounted here so a report can
            be written from any screen without leaving it. */}
        <FeedbackSheet />
        {/* The button that wakes it, for beta testers only: small, bottom
            center, and on the onboarding screens as well as the rest. */}
        <ReportButton />
        {/* The reports nobody writes: an uncaught error, a promise nobody
            answered, or one of this app's own calls coming back broken. Recorded
            once each per visit, on the same desk as the written reports. */}
        <FaultWatch />
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
