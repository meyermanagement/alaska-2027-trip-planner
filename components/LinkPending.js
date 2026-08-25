"use client";

import { useLinkStatus } from "next/link";

/**
 * Feedback for the half second between pressing a link and the next screen
 * arriving. `useLinkStatus` only works inside a `<Link>`, so these are meant to
 * be dropped in as children of one.
 *
 * A skeleton screen answers "is it coming?", but only after the navigation has
 * begun. These answer "did my press land?", which is the question you actually
 * ask while nothing has moved yet.
 */

/** A quiet ring turning at whatever size the icon it replaces was. */
export function Spinner({ className = "h-4 w-4" }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={`animate-spin ${className}`}
      fill="none"
      aria-hidden="true"
    >
      <circle
        cx="10"
        cy="10"
        r="7.5"
        stroke="currentColor"
        strokeWidth="1.7"
        opacity="0.25"
      />
      <path
        d="M17.5 10A7.5 7.5 0 0 0 10 2.5"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

/**
 * Shows the spinner in place of whatever it wraps while the surrounding link
 * is still loading — used for the menu, where the icon is the obvious place to
 * put it and swapping keeps the row from changing width.
 */
export function PendingSwap({ children, className = "h-4 w-4" }) {
  const { pending } = useLinkStatus();
  return pending ? <Spinner className={className} /> : children;
}

/**
 * A spinner that takes up no room at all until its link is loading — for text
 * links, where there is no icon to swap out.
 */
export function PendingSpark({ className = "h-3.5 w-3.5" }) {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return <Spinner className={className} />;
}

/**
 * Lays a pale veil and a spinner over a card while the card's link is
 * loading, so a pressed trip visibly commits instead of sitting there.
 */
export function PendingVeil() {
  const { pending } = useLinkStatus();
  if (!pending) return null;
  return (
    <span className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-sand/55 backdrop-blur-[1px]">
      <Spinner className="h-6 w-6 text-teal" />
      <span className="sr-only">Opening</span>
    </span>
  );
}
