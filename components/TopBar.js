import Link from "next/link";
import { todayISO } from "@/lib/reminders";
import { isOnTrip } from "@/lib/travelers/access";
import { requestMenu } from "@/lib/request/shared";
import CurrentTripBanner from "./CurrentTripBanner";
import HeaderUpdates from "./HeaderUpdates";
import NavTabs from "./NavTabs";
import PassportWarning from "./PassportWarning";
import FareArrivalSync from "./FareArrivalSync";

// Pass nothing and the button opens the Ask Aly drawer on the current screen,
// which is what every signed-in screen does. `askHref` is kept for any screen
// that has no drawer mounted and needs to link somewhere instead.
export default async function TopBar({ askHref, showAsk = true }) {
  // The menu carries the one number worth interrupting someone for: how many
  // open tasks are late or urgent. It is read here, once, for every screen --
  // and a passport warning that appeared on Trips and not on Packing would be
  // worse than no warning, so the same read feeds the bands on every screen.
  //
  // The reads themselves live in lib/menu/load.js and are shared per request:
  // a screen that calls preloadMenu() has them running beside its own reads,
  // and the access check is the same one the screen already made.
  const today = todayISO();
  const {
    access,
    secondary,
    notices,
    fareCount,
    attention,
    inboxCount,
    inboxNeedsTrip,
    setup,
    tripCounts,
  } = await requestMenu();

  // A secondary traveler has no read access to travel documents, so the passport
  // check would see an empty shelf and warn them about passports they are not
  // allowed to look at. That band goes. The urgent tips stay: they are advice,
  // readable by a secondary, and the buttons inside a tip card are gated
  // separately.
  const warnings = secondary ? [] : notices.warnings;
  const urgent = notices.urgent;

  // The band about the trip in progress goes only to the people on it.
  //
  // It first went to the whole household, on the argument that somebody at home
  // would want one tap to what the travellers are doing today. That was the wrong
  // way round. This band is not a status feed about other people -- it is what
  // replaces the app's own name at the top of every screen for the length of a
  // trip, on the grounds that today's plan matters more than anything else while
  // you are living it. That is only true if you are the one living it. For anybody
  // staying home it is a permanent banner about somewhere they are not, sitting
  // above the header on every screen for a fortnight, and the trip is still one
  // tap away on Trips as it always was.
  //
  // Checked here rather than in the loader so the roster read stays inside the one
  // trips query the header already makes, and so this runs alongside working out
  // who is asking rather than after it.
  const current = isOnTrip(notices.current, access?.travelerId)
    ? notices.current
    : null;

  // The trip the menu opens with. Same roster test, wider question: the band is
  // only ever about a trip in progress, while the menu shows whichever trip the
  // family is pointed at -- the one they are on, or failing that the next one
  // they are going on. It is the first thing in the sheet because on the days it
  // exists it is where most presses of that menu were heading anyway.
  const menuTrip = isOnTrip(notices.upcoming, access?.travelerId)
    ? notices.upcoming
    : null;

  // There is no top bar most of the year.
  //
  // It used to carry two things: the app's name, and the Ask Aly button. Both
  // have gone -- Ask Aly to the bottom right corner where a thumb lands, and the
  // compass to the disc in the corner opposite it -- and a bar holding nothing
  // is just fifty pixels of every screen spent on a hairline. So the header is
  // now only ever the band about the trip you are living, and it appears on the
  // days that band has something to say: from the morning you leave to the
  // evening you are back, for the people actually on the trip. Every other day
  // the page starts at the top of the screen.
  //
  // The menu is a sibling of the header, not a child: the header blurs what is
  // behind it, and a blurred element becomes the frame its fixed children are
  // positioned against, which would nail the menu to the top of the screen
  // instead of the bottom of the window.
  return (
    <>
      {!secondary && <FareArrivalSync count={fareCount} />}
      {current && (
        <header className="no-print sticky top-0 z-20">
          <CurrentTripBanner trip={current} today={today} />
        </header>
      )}
      <NavTabs
        attention={attention}
        drafts={tripCounts.drafts}
        planned={tripCounts.planned}
        logged={tripCounts.logged}
        level={access?.level}
        askHref={askHref}
        showAsk={showAsk}
        trip={menuTrip}
        today={today}
        setup={setup}
      />
      <PassportWarning warnings={warnings} />
      {/* Under the passport band on purpose. A passport that will not last the
          trip is a trip-ending problem and belongs at the top; unfiled mail is
          one tap of work and should not shout over it. The banner hides itself
          when the person is already on /inbox. */}
      <HeaderUpdates inboxCount={inboxCount} inboxNeedsTrip={inboxNeedsTrip} fareCount={fareCount} tips={urgent} today={today} readOnly={secondary} />
    </>
  );
}
