import Link from "next/link";
import AlyeskaMark from "./AlyeskaMark";
import AskAlyTrigger from "./AskAlyTrigger";

// `askHref` is for screens with no trip loaded (the trips list): the button
// links through to a trip and opens the assistant there. On a trip page pass
// nothing and the button opens the drawer in place.
export default function TopBar({ askHref, showAsk = true }) {
  return (
    <header className="no-print sticky top-0 z-20 border-b border-sand-deep/70 bg-sand/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-3 px-5 py-3">
        <Link href="/trips" className="flex items-center gap-2.5 text-ink">
          <AlyeskaMark className="h-7 w-7 shrink-0" />
          <span className="font-display text-lg font-semibold tracking-[0.03em]">
            Alyeska
          </span>
        </Link>
        {showAsk && <AskAlyTrigger href={askHref} />}
      </div>
    </header>
  );
}
