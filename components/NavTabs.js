"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { PendingSwap } from "./LinkPending";
import useSoftKeyboard from "./useSoftKeyboard";

/**
 * The main menu, and on every screen size it lives at the bottom. On a phone
 * that puts it under your thumb rather than at the top of a page you have
 * scrolled away from; on a laptop it becomes a floating dock, centred, one
 * track with the destinations inside it so they read as alternatives to
 * each other rather than a row of unrelated buttons. The top of every screen is
 * left to the Alyeska mark and Ask Aly.
 *
 * Trips is home; Reminders and Packing templates cut across all of them; the last
 * three are for looking things up.
 *
 * Half of these screens hold more than their name admits — Reviews is also
 * where the family's standing travel preferences live, and what used to be
 * called Rewards is really the record of every program the family belongs to —
 * so the broad noun leads and a second, quieter line carries what is inside.
 * The first line stays short so the dock is no wider than it was when the words
 * were crammed onto one line. On a phone there is no room for two lines at a
 * legible size, so the short label stands alone there and the page's own
 * subtitle does the explaining once you arrive.
 *
 * The dock needs about nine hundred pixels to lay six destinations out in a
 * row, so the switch between the two layouts happens at lg rather than sm. Any
 * earlier and a tablet held in portrait gets a pill wider than the screen,
 * clipped at both ends.
 *
 * One exception, and it matters: while you are inside a single trip, the first
 * item stops pretending to be where you already are and becomes the way out —
 * an arrow and the words "All trips". Filling it in like a current page made it
 * look like a label rather than a door. Those two words are wider than a sixth of
 * a phone at the size the other labels use, so this one label alone steps down
 * until it fits on one line — the alternatives were shortening it to "Back",
 * which read as a browser control rather than a place, or letting it wrap and
 * making the whole bar taller than the five items beside it.
 *
 * While you are typing on a phone the menu gets out of the way. Left alone, iOS
 * lifts anything pinned to the bottom of the screen up on top of the keyboard as
 * soon as you scroll, so the menu ends up sitting in the middle of the page over
 * the form you are filling in. It slides back as soon as the keyboard closes.
 */
const TABS = [
  {
    href: "/trips",
    label: "Trips",
    short: "Trips",
    sub: "Itineraries & plans",
    Icon: SuitcaseIcon,
  },
  {
    href: "/reminders",
    label: "Reminders",
    short: "Reminders",
    sub: "Pre-travel checklist",
    Icon: BellIcon,
    badge: true,
  },
  {
    href: "/packing",
    label: "Packing",
    short: "Packing",
    sub: "Packing templates",
    Icon: ShirtIcon,
  },
  {
    href: "/rewards",
    label: "Travel programs",
    short: "Programs",
    sub: "Points, miles & cards",
    Icon: RewardsIcon,
  },
  {
    href: "/reviews",
    label: "Reviews",
    short: "Reviews",
    sub: "Travel preferences",
    Icon: StarIcon,
  },
  {
    href: "/people",
    label: "People",
    short: "People",
    sub: "Travelers & ages",
    Icon: PeopleIcon,
  },
];

export default function NavTabs({ attention = 0 }) {
  const pathname = usePathname() || "";
  const keyboardOpen = useSoftKeyboard();
  const isActive = (href) =>
    pathname === href || pathname.startsWith(`${href}/`);
  const countFor = (tab) => (tab.badge ? attention : 0);
  // Inside one trip, as opposed to the list of them.
  const insideTrip = /^\/trips\/[^/]+/.test(pathname);

  return (
    <nav
      aria-label="Main menu"
      aria-hidden={keyboardOpen ? "true" : undefined}
      className={`no-print fixed inset-x-0 bottom-0 z-30 lg:w-max border-t border-[var(--line)] bg-sand/95 backdrop-blur-md transition-transform duration-200 lg:bottom-5 lg:left-1/2 lg:right-auto lg:-translate-x-1/2 lg:border-0 lg:bg-transparent lg:backdrop-blur-none ${
        // Out of reach as well as out of sight, so a tap meant for the field
        // underneath cannot land on a menu item on the way down.
        keyboardOpen ? "translate-y-full pointer-events-none" : ""
      }`}
      style={{ paddingBottom: "max(0.35rem, env(safe-area-inset-bottom))" }}
    >
      <div className="mx-auto flex max-w-lg items-stretch justify-around px-0.5 pt-1.5 min-[375px]:px-2 lg:w-auto lg:max-w-none lg:items-center lg:gap-1 lg:rounded-full lg:border lg:border-[var(--line)] lg:bg-white/90 lg:p-1.5 lg:pt-1.5 lg:shadow-[0_6px_24px_rgba(20,32,30,0.14)] lg:backdrop-blur-md">
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
              aria-label={isWayOut ? "Back to all your trips" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 rounded-xl px-0 py-1.5 text-[0.5rem] min-[375px]:px-0.5 min-[375px]:text-[0.55rem] font-semibold uppercase tracking-normal transition lg:flex-none lg:flex-row lg:gap-1.5 lg:rounded-full lg:px-3.5 lg:py-1.5 lg:text-[0.72rem] lg:tracking-[0.07em] ${
                active
                  ? "bg-teal/10 text-teal lg:bg-teal lg:text-white lg:shadow-[inset_0_1px_0_rgba(255,255,255,0.14),0_1px_2px_rgba(20,32,30,0.16)]"
                  : isWayOut
                    ? "text-teal lg:border lg:border-teal/35 lg:bg-teal/5 lg:px-3 lg:text-teal lg:hover:border-teal lg:hover:bg-teal/10"
                    : "text-ink-soft lg:hover:bg-sand lg:hover:text-teal"
              }`}
            >
              <span className="relative lg:contents">
                <PendingSwap className="h-5 w-5 shrink-0 lg:h-4 lg:w-4">
                  <Icon className="h-5 w-5 shrink-0 lg:h-4 lg:w-4" />
                </PendingSwap>
                {count > 0 && (
                  <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-rose px-1 text-[0.55rem] font-bold leading-4 text-white lg:hidden">
                    {count}
                    <span className="sr-only"> needing attention</span>
                  </span>
                )}
              </span>
              <span
                className={`w-full text-center leading-tight lg:hidden ${
                  // Two words in a column sized for one: the way out is the only
                  // label that needs a step down to stay on a single line, and it
                  // gets one rather than being shortened or allowed to wrap and
                  // make the whole bar taller.
                  isWayOut
                    ? "whitespace-nowrap text-[0.44rem] tracking-tight min-[375px]:text-[0.48rem] min-[430px]:text-[0.55rem]"
                    : "truncate"
                }`}
              >
                {isWayOut ? "All trips" : tab.short}
              </span>
              <span className="hidden text-left lg:flex lg:flex-col lg:leading-[1.15]">
                <span>{isWayOut ? "All trips" : tab.label}</span>
                {!isWayOut && tab.sub && (
                  <span
                    className={`text-[0.6rem] font-medium normal-case tracking-[0.02em] ${
                      active ? "text-white/75" : "text-ink-soft/75"
                    }`}
                  >
                    {tab.sub}
                  </span>
                )}
              </span>
              {count > 0 && (
                <span
                  className={`hidden rounded-full px-1.5 py-px text-[0.62rem] font-bold leading-4 lg:ml-0.5 lg:inline ${
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

// A folded shirt: the packing templates of what everyone always takes. Deliberately
// not a suitcase, which is already the whole trip, and not a checklist, which is
// already Reminders.
function ShirtIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M7.6 3.9 4.9 5.2 3.4 8.1l2.2 1.1.7-1.1v7.4h7.4V8.1l.7 1.1 2.2-1.1-1.5-2.9-2.7-1.3" />
      <path d="M7.6 3.9a2.5 2.5 0 0 0 4.8 0" />
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
