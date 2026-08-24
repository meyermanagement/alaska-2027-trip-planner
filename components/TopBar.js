import Link from "next/link";
import AlyeskaMark from "./AlyeskaMark";
import AskAlyTrigger from "./AskAlyTrigger";
import NavTabs from "./NavTabs";

// Pass nothing and the button opens the Ask Aly drawer on the current screen,
// which is what every signed-in screen does. `askHref` is kept for any screen
// that has no drawer mounted and needs to link somewhere instead.
export default function TopBar({ askHref, showAsk = true }) {
  return (
    <header className="no-print sticky top-0 z-20 border-b border-sand-deep/70 bg-sand/85 backdrop-blur">
      <div className="mx-auto max-w-5xl px-5 pt-3">
        <div className="flex items-center justify-between gap-3 pb-2.5">
          <Link href="/trips" className="flex items-center gap-2.5 text-ink">
            <AlyeskaMark className="h-7 w-7 shrink-0" />
            <span className="font-display text-lg font-semibold tracking-[0.03em]">
              Alyeska
            </span>
          </Link>
          {showAsk && <AskAlyTrigger href={askHref} />}
        </div>
        <NavTabs />
      </div>
    </header>
  );
}
