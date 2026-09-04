"use client";

import Link from "next/link";

export const ASK_ALY_EVENT = "ask-aly";

// A speech bubble: the button starts a conversation rather than opening help,
// so a bubble fits it better than a question mark. Drawn to match the app's
// other line icons.
export function BubbleIcon({ className = "-ml-0.5 h-4 w-4 shrink-0" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M17.2 9.4c0 3.1-3.2 5.6-7.2 5.6-.7 0-1.4-.1-2.1-.2l-3.5 1.7 1.1-2.8C4 12.6 2.8 11.1 2.8 9.4c0-3.1 3.2-5.6 7.2-5.6s7.2 2.5 7.2 5.6Z" />
    </svg>
  );
}

// Two modes:
//  - `href` set: we're on a screen with no trip loaded, so link through to a
//    trip page with ?ask=1, which opens the drawer on arrival.
//  - no `href`: a drawer is listening on this page, so just poke it.
export default function AskAlyTrigger({ href, round = false }) {
  const label = "Ask Aly";

  // Two shapes, one control. Inline in a page it is still a labelled pill. On
  // the floating pair of controls at the bottom of every screen it is a disc
  // the size of the menu beside it, carrying the bubble alone: the words were
  // the only reason that corner needed a bar behind it to sit on.
  const styles = round
    ? "inline-flex h-14 w-14 items-center justify-center rounded-full bg-teal text-on-accent shadow-[var(--disc-shadow)] ring-1 ring-[var(--disc-edge)] transition hover:bg-[color-mix(in_srgb,var(--color-teal)_86%,var(--color-ink))] active:translate-y-px"
    : "inline-flex items-center gap-1.5 rounded-full bg-teal px-4 py-2 text-sm font-semibold text-on-accent shadow-sm transition hover:bg-[color-mix(in_srgb,var(--color-teal)_86%,var(--color-ink))] active:translate-y-px";

  const inner = round ? (
    <BubbleIcon className="h-8 w-8 shrink-0" />
  ) : (
    <>
      <BubbleIcon />
      {label}
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className={styles}
        aria-label={round ? label : undefined}
      >
        {inner}
      </Link>
    );
  }

  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new CustomEvent(ASK_ALY_EVENT))}
      className={styles}
      aria-label={round ? label : undefined}
    >
      {inner}
    </button>
  );
}
