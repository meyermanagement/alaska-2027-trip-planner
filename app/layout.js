import { Geist } from "next/font/google";
import "./globals.css";
import BootVeil from "@/components/BootVeil";
import AppServices from "@/components/AppServices";
import {
  ARRIVE_COOKIE,
  BAND_COOKIE,
  DEFAULT_SKIN,
  SKINS,
  SKIN_COOKIE,
} from "@/lib/skins";
import { DEFAULT_TEXT_SIZE, TEXT_COOKIE, TEXT_SIZES } from "@/lib/textsize";

// One typeface, at several weights and sizes. It was two -- Fraunces for names
// and headings over Geist for everything else -- and the editorial serif went
// when the wordmark did: the name is now letterspaced capitals over a hairline,
// which reads as a mark in the sans and as a book title in the serif, and once
// the name was in the sans a serif heading under it belonged to a different
// design. The display role survives as a variable, so a heading is still
// declared as a heading and the app can be given a second face again in one
// line.
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
  // The icons are declared here rather than dropped into app/ as icon.svg and
  // favicon.ico, and they are named for the app rather than for the convention.
  //
  // Safari keeps a favicon database keyed on the icon's own address, and it is
  // read before anything on the network is. /favicon.ico and /icon.svg are
  // addresses it has held an answer for since the first time this site was ever
  // opened, so replacing the bytes behind them changes nothing it will look at:
  // it goes on serving whatever it filed, per page, which is why one screen can
  // show one mark and the screen next to it another. Closing the tab does not
  // clear it, and neither does closing Safari.
  //
  // So the address carries a stamp of what is inside it. Change the drawing and
  // the stamp changes, which makes it an address no browser has ever asked for,
  // which is the only thing Safari's database cannot answer from memory. This is
  // not a query string -- Safari files an icon under the whole URL but several
  // launchers and crawlers drop the query before storing it, and that is the
  // failure this is meant to end.
  //
  // The rule when the mark changes: run the icon script, take the first six
  // characters of the new file's hash, rename the file to match and change the
  // two lines below. Rewriting the bytes in place will look like it worked
  // everywhere except the browsers that already know the address.
  //
  // public/favicon.ico stays where it is, holding the same drawing, because a
  // browser that ignores all of this and guesses at /favicon.ico should still
  // get the right answer.
  icons: {
    icon: [
      { url: "/alyeska-tab-dee9cd.svg", type: "image/svg+xml", sizes: "any" },
      { url: "/alyeska-tab-645b99.ico", type: "image/x-icon", sizes: "48x48" },
    ],
    shortcut: "/alyeska-tab-645b99.ico",
    apple: { url: "/alyeska-touch.png", sizes: "180x180", type: "image/png" },
  },
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
// How many crossings the short opening has to choose from. The routes themselves
// live in components/BootVeil.js and their keyframes in app/globals.css; this is
// the one number the head script needs, and adding a fourth crossing means
// changing it here as well as there.
const ROUTE_COUNT = 3;

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
// Which opening this load gets. The full one -- the compass swinging on to
// north, the wordmark, the tagline -- is an arrival, and an arrival is signing
// in. It used to be given to the first document load in a browser session
// instead, which is a different thing: a refresh could earn it, a new tab could
// earn it, and signing in on a browser that had already opened the app missed it
// entirely. So the sign-in doors set a cookie on their redirect and this spends
// it -- full opening, cookie gone in the same breath, and every load after it
// gets the short one: a compass crossing a map, held only as long as the page
// needs. Decided here because the veil is in the first frame of HTML and cannot
// wait for hydration to learn which one it is.
var arrived=/(?:^|; )${ARRIVE_COOKIE}=1/.test(document.cookie);
d.dataset.boot=arrived?"full":"quick";
if(arrived)document.cookie="${ARRIVE_COOKIE}=;path=/;max-age=0;samesite=lax";
// And which crossing the short one flies. There are ${ROUTE_COUNT} of them, drawn from
// the same rules, and one is drawn at random per document load: the endless
// route means a single crossing could run all day, but somebody who opens the
// app four times before lunch would be carried over the same piece of coast
// four times. Picked here rather than in a component for the same reason the
// skin is -- the veil is in the first frame of HTML, and a route chosen after
// hydration would swap the map under a compass already travelling it.
d.dataset.route=String(1+Math.floor(Math.random()*${ROUTE_COUNT}));
// How big the words are, read here for the same reason the skin is: the type
// scale is on <html>, so a size settled after hydration means every word in the
// app resizing under the reader a moment after it arrived.
var sizes=${JSON.stringify(TEXT_SIZES.map((size) => size.id))};
var tm=document.cookie.match(/(?:^|; )${TEXT_COOKIE}=([^;]*)/);
var ts=tm?decodeURIComponent(tm[1]):"";
d.dataset.text=sizes.indexOf(ts)>-1?ts:"${DEFAULT_TEXT_SIZE}";
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

// Pins the opening onto the veil, the instant the veil exists.
//
// Which of the two openings shows was decided by html[data-boot] alone, and that
// attribute is shared: the server renders it "full", the head script corrects it
// to "quick", and any later render of the root element hands React the server's
// value back. A load correctly showing the map could therefore have the compass
// switched on underneath it -- the crossing, then the arrival, on a load that
// asked for one of them. That is the flash.
//
// So the choice is copied onto the element that is showing it, and the
// stylesheet prefers what it finds there. This runs from the body, immediately
// after the veil markup, which is the first moment the element exists and still
// before the first paint -- doing it when the component mounts was too late,
// because hydration is exactly when the re-render that resets the attribute
// happens.
//
// The same decision is also written on the window, which is the only place in
// this document that no re-render can reach. Attributes on <html> belong to
// React, and so does the veil element itself: anything that makes the client
// throw away the server's HTML and render the tree again -- a hydration
// mismatch, and on a desktop browser a page-modifying extension is enough to
// cause one -- puts data-mode back to the "full" the server sent and remounts
// the veil into it. The reported order comes from exactly that: the crossing for
// a moment, then the arrival. A plain object on the window survives it, because
// nothing renders the window.
//
// And then it holds it there, from outside React, for as long as the veil is up.
// The component puts back anything taken from it too, but that guard is itself a
// React effect: it is disconnected when the veil unmounts and reinstalled when
// the replacement mounts, and the gap between those two is exactly the moment
// the arrival gets on screen. This observer is plain script written before the
// first paint, so there is no moment it is not watching. It stops the first time
// it sees the veil has lifted, and gives up after twelve seconds regardless.
//
// It also writes down the moment the opening actually started, which is the one
// number components/BootVeil.js cannot work out for itself. Both openings are
// CSS keyframes on markup that is in the first frame of HTML, so they begin when
// the browser first paints the veil -- and the hold that decides when to lift
// used to be measured from performance.now(), which counts from the navigation.
// Everything the document spent getting to that first paint was therefore
// subtracted from the animation somebody watched: on a sign-in that took a
// second to paint, the tagline's third word never arrived and the needle's
// settle was clipped with it. A frame callback from here is the closest honest
// anchor -- it runs immediately before the paint that starts the keyframes, and
// it is on the window, which is the one place in this document no re-render can
// reach.
const pinBoot = `(function(){try{
var d=document.documentElement;
var mode=d.dataset.boot==="quick"?"quick":"full",route=d.dataset.route||"1";
var pin={mode:mode,route:route,painted:null};
window.__alyBoot=pin;
if(typeof requestAnimationFrame==="function")
requestAnimationFrame(function(){if(pin.painted===null)pin.painted=performance.now();});
var mo=null;
var fix=function(){
if(d.dataset.booted){if(mo)mo.disconnect();return;}
if(d.dataset.boot!==pin.mode)d.dataset.boot=pin.mode;
if(d.dataset.route!==pin.route)d.dataset.route=pin.route;
var v=document.getElementById("boot-veil");
if(v){if(v.dataset.mode!==pin.mode)v.dataset.mode=pin.mode;
if(v.dataset.route!==pin.route)v.dataset.route=pin.route;}};
fix();
if(typeof MutationObserver==="function"){
mo=new MutationObserver(fix);
mo.observe(d,{attributes:true,subtree:true,
attributeFilter:["data-boot","data-booted","data-route","data-mode"]});
// The veil is a direct child of the body, so a replacement element that React
// has just built is caught here -- and it is built with the attributes the
// server sent, which is the whole reason this exists.
if(document.body)mo.observe(document.body,{childList:true});
setTimeout(function(){if(mo)mo.disconnect();},12000);}
}catch(e){}})()`;

export default function RootLayout({ children }) {
  return (
    <html
      lang="en"
      data-skin={DEFAULT_SKIN}
      data-boot="full"
      data-route="1"
      data-text={DEFAULT_TEXT_SIZE}
      className={sansFace.variable}
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
        <script dangerouslySetInnerHTML={{ __html: pinBoot }} />
        {/* Adult-only services are omitted from the minor review surface. */}
        <AppServices />
        <div className="app-shell">{children}</div>
      </body>
    </html>
  );
}
