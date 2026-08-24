"use client";

import Link from "next/link";

export const ASK_ALY_EVENT = "ask-aly";

// Two modes:
//  - `href` set: we're on a screen with no trip loaded, so link through to a
//    trip page with ?ask=1, which opens the drawer on arrival.
//  - no `href`: a drawer is listening on this page, so just poke it.
export default function AskAlyTrigger({ href }) {
  const label = "Ask Aly";

  const styles =
    "inline-flex items-center rounded-full bg-teal px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c4e47] active:translate-y-px";

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
