"use client";

import Link from "next/link";

export const ASK_ALY_EVENT = "ask-aly";

// A question mark, drawn to match the app's other line icons.
function QuestionIcon() {
  return (
    <svg
      viewBox="0 0 20 20"
      className="-ml-0.5 h-4 w-4 shrink-0"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="10" cy="10" r="7.6" />
      <path d="M7.9 7.7a2.2 2.2 0 1 1 3.5 1.8c-.8.6-1.4 1-1.4 1.9" />
      <path d="M10 14.3h.01" />
    </svg>
  );
}

// Two modes:
//  - `href` set: we're on a screen with no trip loaded, so link through to a
//    trip page with ?ask=1, which opens the drawer on arrival.
//  - no `href`: a drawer is listening on this page, so just poke it.
export default function AskAlyTrigger({ href }) {
  const label = "Ask Aly";

  const styles =
    "inline-flex items-center gap-1.5 rounded-full bg-teal px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-[#0c4e47] active:translate-y-px";

  if (href) {
    return (
      <Link href={href} className={styles}>
        <QuestionIcon />
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
      <QuestionIcon />
      {label}
    </button>
  );
}
