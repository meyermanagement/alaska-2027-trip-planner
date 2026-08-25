"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PendingSwap } from "./LinkPending";

/**
 * The main menu, and on every screen size it lives at the bottom. On a phone
 * that puts it under your thumb rather than at the top of a page you have
 * scrolled away from; on a laptop it becomes a floating dock, centred, one
 * track with the destinations inside it so they read as alternatives to
 * each other rather than a row of unrelated buttons. The top of every screen is
 * left to the Alyeska mark and Ask Aly.
 *
 * Trips is home; Reminders cuts across all of them; the last three are for
 * looking things up.
 *
 * One exception, and it matters: while you are inside a single trip, the first
 * item stops pretending to be where you already are and becomes the way out —
 * an arrow and the words "All trips". Filling it in like a current page made it
 * look like a label rather than a door.
 */
const TABS = [
  { href: "/trips", label: "Trips", short: "Trips", Icon: SuitcaseIcon },
  {
    href: "/reminders",
    label: "Reminders",
    short: "Reminders",
    Icon: BellIcon,
    badge: true,
  },
  {
    href: "/rewards",
    label: "Rewards",
    short: "Rewards",
    Icon: RewardsIcon,
  },
  {
    href: "/reviews",
    label: "Preferences & Reviews",
    short: "Reviews",
    Icon: StarIcon,
  },
  { href: "/people", label: "People", short: "People", Icon: PeopleIcon },
];

export default function NavTabs({ attention = 0 }) {
  const pathname = usePathname() || "";
  const isActive = (href) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const countFor = (tab) => (tab.badge ? attention : 0);
  // Inside one trip, as opposed to the list of them.
  const insideTrip = /^\/trips\/[^/]+/.test(pathname);

  return (
    <nav
      aria-label="Main menu"
      className="no-print fixed inset-x-0 bottom-0 z-30 sm:w-max border-t border-[var(--line)] bg-sand/95 backdrop-blur-md sm:bottom-5 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:border-0 sm:bg-transparent sm:backdrop-blur-none"
      style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-2 pt-1.5 sm:w-auto sm:max-w-none sm:items-center sm:gap-1 sm:rounded-full sm:border sm:border-[var(--line)] sm:bg-white/90 sm:p-1.5 sm:pt-1.5 sm:shadow-[0_6px_24px_rgba(20,32,30,0.14)] sm:backdrop-blur-md">
        {TABS.map((tab) => {
          // The way back out of a trip, rather than a name for where you are.
          const isWayOut = tab.href === "/trips" && insideTrip;
          const active = isActive(tab.href) && !isWayOut;
          const count = countFor(tab);
          const Icon = isWayOut ? BackIcon : tab.Icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={active ? "page" : undefined}
              title={isWayOut ? "Back to all your trips" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-0.5 py-1.5 text-[0.55rem] font-semibold uppercase tracking-[0.02em] transition sm:flex-none sm:flex-row sm:gap-1.5 sm:rounded-full sm:px-3.5 sm:py-1.5 sm:text-[0.72rem] sm:tracking-[0.07em] ${
                active
                  ? "bg-teal/10 text-teal sm:bg-teal sm:text-white sm:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(20,32,30,0.16)]"
                  : isWayOut
                    ? "text-teal sm:border sm:border-teal/35 sm:bg-teal/5 sm:px-3 sm:text-teal sm:hover:border-teal sm:hover:bg-teal/10"
                    : "text-ink-soft sm:hover:bg-sand sm:hover:text-teal"
              }`}
            >
              <span className="relative sm:contents">
                <PendingSwap className="h-5 w-5 shrink-0 sm:h-4 sm:w-4">
                  <Icon className="h-5 w-5 shrink-0 sm:h-4 sm:w-4" />
                </PendingSwap>
                {count > 0 && (
                  <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-rose px-1 text-[0.55rem] font-bold leading-4 text-white sm:hidden">
                    {count}
                    <span className="sr-only"> needing attention</span>
                  </span>
                )}
              </span>
              <span className="sm:hidden">
                {isWayOut ? "All trips" : tab.short}
              </span>
              <span className="hidden sm:inline">
                {isWayOut ? "All trips" : tab.label}
              </span>
              {count > 0 && (
                <span
                  className={`hidden rounded-full px-1.5 py-px text-[0.62rem] font-bold leading-4 sm:ml-0.5 sm:inline ${
                    active ? "bg-white/20 text-white" : "bg-rose/15 text-rose"
                  }`}
                >
                  {count}
                  <span className="sr-only"> needing attention</span>
                </span>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

// Line icons drawn to match the Ask Aly bubble: one weight, round joins, no
// fills. They label the menu on a phone, where there is no room for the words.
function iconProps(className) {
  return {
    viewBox: "0 0 20 20",
    className,
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round",
    strokeLinejoin: "round",
    "aria-hidden": "true",
  };
}

function SuitcaseIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="2.8" y="6.2" width="14.4" height="10" rx="2.2" />
      <path d="M7.4 6.2V4.6c0-.6.5-1.1 1.1-1.1h3c.6 0 1.1.5 1.1 1.1v1.6M7.4 16.2v1M12.6 16.2v1" />
    </svg>
  );
}

// An arrow back into the stack of trips: this is a door, not a label.
function BackIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M16.5 10H4.6M9.2 5.4 4.2 10l5 4.6" />
    </svg>
  );
}

function BellIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M10 3.2c-2.3 0-4 1.8-4 4.1 0 3.4-1 4.4-1 4.4h10s-1-1-1-4.4c0-2.3-1.7-4.1-4-4.1Z" />
      <path d="M8.4 14.4a1.7 1.7 0 0 0 3.2 0" />
    </svg>
  );
}

// A card with a spark on it: what you pay with, and the points it throws off.
function RewardsIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="2.6" y="5.2" width="14.8" height="9.6" rx="2.1" />
      <path d="M2.6 8.4h14.8" />
      <path d="M12.9 10.4l.7 1.4 1.4.7-1.4.7-.7 1.4-.7-1.4-1.4-.7 1.4-.7.7-1.4Z" />
    </svg>
  );
}

function StarIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M10 3.3l2.1 4.2 4.6.7-3.3 3.2.8 4.6-4.2-2.2-4.2 2.2.8-4.6L3.3 8.2l4.6-.7L10 3.3Z" />
    </svg>
  );
}

function PeopleIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="7.8" cy="7.4" r="2.6" />
      <path d="M3 16.3c0-2.4 2.1-4.1 4.8-4.1s4.8 1.7 4.8 4.1" />
      <path d="M13.4 5.2a2.4 2.4 0 0 1 0 4.6M14.2 12.5c1.7.3 2.9 1.5 2.9 3.3" />
    </svg>
  );
}
