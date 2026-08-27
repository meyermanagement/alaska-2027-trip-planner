import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { countNeedingAttention, todayISO } from "@/lib/reminders";
import { loadHeaderNotices } from "@/lib/tips/load";
import AlyeskaMark from "./AlyeskaMark";
import AskAlyTrigger from "./AskAlyTrigger";
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
  const [{ data: rows }, notices] = await Promise.all([
    supabase
      .from("predeparture_tasks")
      .select("due_date, timing, priority, trips(start_date, end_date, status)")
      .eq("is_done", false),
    loadHeaderNotices(supabase, today),
  ]);
  const attention = countNeedingAttention(rows || [], today);

  // The menu is a sibling of the header, not a child: the header blurs what is
  // behind it, and a blurred element becomes the frame its fixed children are
  // positioned against, which would nail the menu to the top of the screen
  // instead of the bottom of the window.
  return (
    <>
      <header className="no-print sticky top-0 z-20 border-b border-[var(--line)] bg-sand/80 backdrop-blur-md">
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
      <NavTabs attention={attention} />
      <PassportWarning warnings={notices.warnings} />
      <TipStrip tips={notices.urgent} today={today} />
    </>
  );
}
