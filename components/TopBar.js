import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { countNeedingAttention, todayISO } from "@/lib/reminders";
import { loadHeaderNotices } from "@/lib/tips/load";
import { isOnTrip, resolveAccess } from "@/lib/travelers/access";
import AlyeskaMark from "./AlyeskaMark";
import AskAlyTrigger from "./AskAlyTrigger";
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

  // The menu is a sibling of the header, not a child: the header blurs what is
  // behind it, and a blurred element becomes the frame its fixed children are
  // positioned against, which would nail the menu to the top of the screen
  // instead of the bottom of the window.
  return (
    <>
      <header className="no-print sticky top-0 z-20 border-b border-[var(--line)] bg-sand/80 backdrop-blur-md">
        {/* Above the logo, and inside the sticky header so it stays reachable
            through any scroll on any screen. Nothing at all on the days the
            family is not travelling, which is almost every day. */}
        <CurrentTripBanner trip={current} today={today} />
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
          <Link href="/trips" className="flex items-center gap-2.5 text-ink">
            <AlyeskaMark className="h-7 w-7 shrink-0" />
            <span className="font-display text-[1.1rem] font-semibold tracking-[0.005em]">
              Alyeska
            </span>
          </Link>
          {showAsk && <AskAlyTrigger href={askHref} />}
        </div>
      </header>
      <NavTabs attention={attention} level={access?.level} />
      <PassportWarning warnings={warnings} />
      <TipStrip tips={urgent} today={today} />
    </>
  );
}
