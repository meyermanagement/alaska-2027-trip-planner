import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { countNeedingAttention, todayISO } from "@/lib/reminders";
import { loadHeaderNotices } from "@/lib/tips/load";
import { isOnTrip, resolveAccess } from "@/lib/travelers/access";
import CurrentTripBanner from "./CurrentTripBanner";
import NavTabs from "./NavTabs";
import PassportWarning from "./PassportWarning";
import TipStrip from "./TipStrip";

// Pass nothing and the button opens the Ask Aly drawer on the current screen,
// which is what every signed-in screen does. `askHref` is kept for any screen
// that has no drawer mounted and needs to link somewhere instead.
export default async function TopBar({ askHref, showAsk = true }) {
  // The menu carries the one number worth interrupting someone for: how many
  // open tasks are late or urgent. It is read here, once, for every screen.
  const supabase = await createClient();
  const today = todayISO();
  // Read here rather than on each screen, because a passport warning that appears
  // on Trips and not on Packing is worse than no warning: it teaches you that the
  // band is decorative. One read, one answer, every screen.
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const [{ data: rows }, notices, access] = await Promise.all([
    supabase
      .from("predeparture_tasks")
      .select("due_date, timing, priority, trips(start_date, end_date, status)")
      .eq("is_done", false),
    loadHeaderNotices(supabase, today),
    // Which menu items to draw. Read here with everything else rather than on
    // each screen, so the menu cannot differ from one page to the next.
    resolveAccess(supabase, user),
  ]);
  const attention = countNeedingAttention(rows || [], today);

  // A secondary traveler has no read access to travel documents -- probed as Veda,
  // traveler_documents returns nothing at all -- so the passport check sees an
  // empty shelf and concludes nobody has one, which is how Veda came to be warned
  // about passports she is not allowed to look at. That band goes.
  //
  // The urgent tips stay. They were dropped alongside the passports on the same
  // sentence, and the sentence was only true of the passports: tips are readable
  // by a secondary, they are advice rather than an errand, and "the shuttle takes
  // cash only" is worth as much to the person getting on the shuttle as to the
  // person who booked it. The buttons inside a tip card are gated separately.
  const secondary = Boolean(access?.can.isSecondary);
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

  // There is no top bar most of the year.
  //
  // It used to carry two things: the app's name, and the Ask Aly button. Both
  // have gone -- Ask Aly to the bottom right corner where a thumb lands, and the
  // name into the compass on the menu pill beside it -- and a bar holding nothing
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
      {current && (
        <header className="no-print sticky top-0 z-20">
          <CurrentTripBanner trip={current} today={today} />
        </header>
      )}
      <NavTabs
        attention={attention}
        level={access?.level}
        askHref={askHref}
        showAsk={showAsk}
      />
      <PassportWarning warnings={warnings} />
      <TipStrip tips={urgent} today={today} />
    </>
  );
}
