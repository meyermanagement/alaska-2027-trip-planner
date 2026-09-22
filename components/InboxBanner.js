"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * A quiet band that says "there is mail waiting to be filed."
 *
 * Deliberately softer than the passport warning above it: filing a forwarded
 * confirmation is one tap of work rather than a trip-ending problem, so this
 * uses the same page skin as the tip strip and a teal accent rather than
 * rose. It sits below the passport band so a real emergency stays the loudest
 * thing on the screen.
 *
 * No dismiss button. The band answers itself: file the messages on /inbox and
 * the count on the next render is zero, and the band goes away by itself.
 * A dismiss button would only let it be hidden while the messages were still
 * sitting there.
 *
 * Not drawn when the person is already on /inbox -- announcing an unread count
 * on top of the page that is the unread list is decoration. Client component
 * so it can read the pathname; the count itself is passed down from TopBar,
 * which is the one place in the app that already reads every screen's header.
 */
export default function InboxBanner({ count = 0, needsTrip = 0 }) {
  const pathname = usePathname() || "";
  if (!count || count <= 0) return null;
  if (pathname.startsWith("/inbox")) return null;

  const noun = count === 1 ? "message" : "messages";
  // A booking for dates none of their trips covers is a different errand from
  // filing, so it gets said rather than folded into a count. "Waiting to be
  // filed" is wrong about it twice: there is nothing to file it onto yet, and
  // the work is a decision rather than a tap.
  const stranded = Math.min(Math.max(needsTrip, 0), count);
  const strandedNoun = stranded === 1 ? "booking is" : "bookings are";

  return (
    <section
      aria-label="Inbox"
      className="no-print border-b border-teal/25 bg-teal/8 text-ink"
    >
      <div className="mx-auto flex max-w-5xl items-center gap-3 px-5 py-2.5">
        {/* Same envelope shape as the Inbox row in the menu, drawn inline so
            the banner is not a hostage to any icon module. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-6 w-6 shrink-0 text-teal"
        >
          <rect x="3" y="5" width="18" height="14" rx="2.5" />
          <path d="M3.5 7.5l8.5 6 8.5-6" />
        </svg>
        <p className="min-w-0 flex-1 text-sm leading-relaxed">
          {stranded > 0 ? (
            <>
              <span className="font-semibold">
                {stranded} {strandedNoun}
              </span>{" "}
              <span className="text-ink-soft">
                for a trip you do not have yet.
              </span>{" "}
              {stranded < count ? (
                <span className="text-ink-soft">
                  {count - stranded} {count - stranded === 1 ? "other" : "others"}{" "}
                  waiting to be filed.{" "}
                </span>
              ) : null}
            </>
          ) : (
            <>
              <span className="font-semibold">
                {count} {noun}
              </span>{" "}
              <span className="text-ink-soft">waiting to be filed.</span>{" "}
            </>
          )}
          <Link
            href="/inbox"
            className="whitespace-nowrap font-semibold text-teal underline decoration-teal/40 underline-offset-2 hover:decoration-teal"
          >
            Open the inbox
          </Link>
        </p>
      </div>
    </section>
  );
}
