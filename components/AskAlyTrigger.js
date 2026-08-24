"use client";

import Link from "next/link";
import AlyeskaMark from "./AlyeskaMark";

export const ASK_ALY_EVENT = "ask-aly";

// Two modes:
//  - `href` set: we're on a screen with no trip loaded, so link through to a
//    trip page with ?ask=1, which opens the drawer on arrival.
//  - no `href`: a drawer is listening on this page, so just poke it.
export default function AskAlyTrigger({ href }) {
  const label = (
    <>
      <AlyeskaMark className="h-[1.15rem] w-[1.15rem] shrink-0" />
      <span>Ask Aly</span>
    </>
  );

  const styles =
    "inline-flex items-center gap-2 rounded-full bg-teal px-3.5 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c4e47] active:translate-y-px";

  if (href) {
    return (
      <Link href={href} className={styles}>
        {label}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(ASK_ALY_EVENT))}
      className={styles}
    >
      {label}
    </button>
  );
}
