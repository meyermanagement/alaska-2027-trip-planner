"use client";

import { useLinkStatus } from "next/link";
import { useEffect } from "react";

/**
 * Feedback for the half second between pressing a link and the next screen
 * arriving. `useLinkStatus` only works inside a `<Link>`, so these are meant to
 * be dropped in as children of one.
 *
 * A skeleton screen answers "is it coming?", but only after the navigation has
 * begun. These answer "did my press land?", which is the question you actually
 * ask while nothing has moved yet.
 */

/**
 * How long a press is allowed to sit there before we stop believing in it.
 *
 * A soft navigation can fail without saying so. The router asks the server for
 * the next screen, and if that answer never comes back in a form it can use --
 * a redirect issued on the request itself, a response that is not the payload
 * it expected, a connection that quietly dies -- there is no error and no
 * screen. The spinner simply turns forever, and the only way out anybody finds
 * is to press the same thing again, which lands as a fresh full page load: the
 * whole app reloading, splash screen and all, for what should have been a tab.
 *
 * So the press gets a deadline. If the screen has not begun to arrive by then,
 * we ask the browser for the address outright, which is the thing the second
 * press would have done anyway -- one press instead of two, and a reload nobody
 * had to guess their way into.
 *
 * The number is a judgement about the worst honest wait, not the average one.
 * Hotel wifi on a phone can take two seconds to hand over a screen, and cutting
 * a working navigation short costs a reload and any typing in it.
 *
 * It was three and a half seconds, chosen while a redirect in the middleware was
 * swallowing presses outright and nothing else was going to rescue them. That
 * redirect is gone, so a press that has not landed yet is now almost always a
 * slow screen rather than a lost one -- and at three and a half seconds this was
 * firing on the slow ones, which is why changing screens kept reloading the whole
 * app, splash screen and all. Eight seconds is past the point where anybody still
 * believes the press worked, and well past any screen this app has been seen to
 * take. The rescue is for a press that will never land, not for one that is late.
 *
 * Two things make this safe against firing on a healthy press. The deadline is
 * cleared when the link stops pending, and it is also cleared when the link
 * unmounts -- and arriving anywhere unmounts it, because the skeleton that
 * replaces the screen brings its own copy of the menu. A navigation that works
 * takes its timer with it.
 */
const STUCK_MS = 8000;

function useStuckRescue(pending, href) {
  useEffect(() => {
    if (!pending || !href) return undefined;
    const timer = setTimeout(() => {
      window.location.href = href;
    }, STUCK_MS);
    return () => clearTimeout(timer);
  }, [pending, href]);
}

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
export function PendingSwap({ children, className = "h-4 w-4", href = null }) {
  const { pending } = useLinkStatus();
  useStuckRescue(pending, href);
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
export function PendingVeil({ href = null }) {
  const { pending } = useLinkStatus();
  useStuckRescue(pending, href);
  if (!pending) return null;
  return (
    <span className="absolute inset-0 z-10 flex items-center justify-center rounded-[inherit] bg-sand/55 backdrop-blur-[1px]">
      <Spinner className="h-6 w-6 text-teal" />
      <span className="sr-only">Opening</span>
    </span>
  );
}
