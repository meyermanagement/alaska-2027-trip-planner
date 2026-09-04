"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import AlyeskaMark from "./AlyeskaMark";
import AskAlyTrigger from "./AskAlyTrigger";
import { SECONDARY } from "@/lib/travelers/access";
import useSoftKeyboard from "./useSoftKeyboard";

/**
 * The bar along the bottom of every signed-in screen, and the only navigation
 * the app has.
 *
 * It replaces a row of six equal tabs. Six tabs on a phone meant six labels in
 * fifty-eight pixels each, one of which ("Preferences") had to be shrunk below
 * a legible size to fit, and the whole thing floated clear of the edges as a
 * rounded panel with the page sliding underneath it — which read as something
 * that had come loose rather than part of the app.
 *
 * So: one solid bar, welded to the bottom edge, nothing visible beneath it, and
 * two things on it.
 *
 * Bottom left, the menu. A pill carrying the compass, the name of the screen you
 * are on, and a chevron; tapping it raises a sheet with every destination spelled
 * out in full, one per line, with the second line of explanation the desktop dock
 * used to get and the phone never could. The screen you are on is ticked. This
 * side of the bar answers one question only — where am I in the app, and where
 * else can I go.
 *
 * Bottom right, Ask Aly. It used to live in the top right corner, a full reach
 * away from a thumb; it is the thing people press most, so it takes the corner
 * the thumb lands on first. Navigation is deliberate and can afford the longer
 * reach, which is why the two are this way round and not the other.
 *
 * One exception inside a single trip: the first row in the sheet stops naming
 * where you already are and becomes the way out — an arrow, and the words
 * "All trips". Filling it in like a current page made it look like a label
 * rather than a door.
 *
 * While you are typing on a phone the whole bar leaves. Left alone, iOS lifts
 * anything pinned to the bottom of the screen up on top of the keyboard as soon
 * as you scroll, so it ends up sitting in the middle of the page over the form
 * you are filling in. It slides back as soon as the keyboard closes.
 */
const TABS = [
  {
    href: "/trips",
    label: "Trips",
    sub: "Itineraries & plans",
    Icon: SuitcaseIcon,
  },
  {
    href: "/reminders",
    label: "Reminders",
    sub: "Pre-travel checklist",
    Icon: BellIcon,
    badge: true,
  },
  {
    href: "/packing",
    label: "Packing",
    sub: "Packing templates",
    Icon: ShirtIcon,
  },
  {
    href: "/wallet",
    label: "Wallet",
    sub: "Points, miles & cards",
    Icon: RewardsIcon,
  },
  {
    href: "/preferences",
    label: "Preferences",
    // Not "And what you thought", which only made sense as a trailing clause on
    // the label and told nobody what the screen is for. Half of it is reviews of
    // places and activities the family has already been to, and that is the half
    // people come back for.
    sub: "Reviews of places and activities",
    Icon: StarIcon,
  },
  {
    href: "/family",
    label: "Family",
    sub: "People & pets",
    Icon: PeopleIcon,
  },
  {
    href: "/settings",
    label: "Settings",
    sub: "About you, your look, sign-in",
    Icon: GearIcon,
  },
];

// A secondary traveler -- a minor, or a friend along for one trip -- gets two
// doors: the trips they are on, and their own share of the checklist. Their
// packing items live inside a trip, on its packing tab, which is why there is no
// third one. The rest is not merely hidden: the database refuses those reads, so
// drawing those rows would offer four empty rooms.
const SECONDARY_TABS = new Set(["/trips", "/reminders", "/settings"]);

// Settings is in that set on purpose. It is the screen About you, your look and
// the sign-in address now live on, and for a secondary traveler About you is the
// one thing about themselves the database will let them change at all -- every
// other column on their own row is refused. A single thing you are permitted to
// edit should not be unreachable.

// The loading skeleton draws this bar too, and it has no database of its own to
// ask -- that is the whole point of a skeleton. Without help it falls back to the
// full menu, which is why a secondary traveler saw doors they cannot open flicker
// past on every navigation. So the answer is remembered in the browser the first
// time a real screen supplies it, and the skeleton reads it back. It only ever
// decides what to draw for a moment; the database is what actually refuses.
const REMEMBERED = "alyeska.level";

function remember(level) {
  try {
    if (level) window.localStorage.setItem(REMEMBERED, level);
  } catch {
    // A browser with storage switched off just gets the flicker back.
  }
}

function recall() {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(REMEMBERED);
  } catch {
    return null;
  }
}

export default function NavTabs({
  attention = 0,
  level = null,
  askHref,
  showAsk = true,
  // The skeleton draws the button as a shape rather than a control, because
  // there is no drawer mounted behind it yet to answer a press.
  askLive = true,
}) {
  // Read once, lazily, so the first frame the skeleton draws is already right
  // rather than being corrected a moment later.
  const [recalled] = useState(recall);
  const effective = level || recalled;
  useEffect(() => {
    remember(level);
  }, [level]);
  const pathname = usePathname() || "";
  const keyboardOpen = useSoftKeyboard();
  const [open, setOpen] = useState(false);
  const sheetRef = useRef(null);

  const isActive = (href) =>
    pathname === href || pathname.startsWith(`${href}/`);
  // Inside one trip, as opposed to the list of them.
  const insideTrip = /^\/trips\/[^/]+/.test(pathname);
  const tabs =
    effective === SECONDARY
      ? TABS.filter((t) => SECONDARY_TABS.has(t.href))
      : TABS;

  // The name on the pill. Inside a trip the pill cannot say "Trips", because
  // that is the door out and not where you are; and it cannot say the trip's
  // name either, because the band at the top of the screen is already saying
  // exactly that and two corners repeating one word is how a screen starts to
  // look careless.
  const here = tabs.find((t) => isActive(t.href));
  const label = insideTrip ? "This trip" : here?.label || "Menu";

  // Shut the sheet the moment you arrive somewhere, and on Escape.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    // Focus the sheet so a keyboard lands inside it rather than back on the page.
    sheetRef.current?.focus();
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* The sheet sits above the bar it rose from, and below the Ask Aly
          drawer, so that if both ever open the conversation is in front. */}
      {open && (
        <div className="no-print fixed inset-0 z-[38] flex flex-col justify-end">
          <button
            type="button"
            aria-label="Close the menu"
            onClick={() => setOpen(false)}
            className="absolute inset-0 bg-ink/45 backdrop-blur-[2px]"
          />
          <div
            ref={sheetRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
            className="relative mx-auto w-full max-w-lg rounded-t-[1.35rem] border border-[var(--line)] bg-white px-3 pt-2.5 shadow-[0_-10px_40px_rgba(20,32,30,0.22)] outline-none"
            style={{
              paddingBottom:
                "max(0.9rem, calc(env(safe-area-inset-bottom) + 0.6rem))",
              maxHeight: "82vh",
              overflowY: "auto",
            }}
          >
            <span
              aria-hidden="true"
              className="mx-auto mb-2.5 block h-1 w-10 rounded-full bg-[var(--line-strong)]"
            />
            <ul className="space-y-1.5">
              {tabs.map((tab) => {
                // The way back out of a trip, rather than a name for where you are.
                const isWayOut = tab.href === "/trips" && insideTrip;
                const active = isActive(tab.href) && !isWayOut;
                const count = tab.badge ? attention : 0;
                const Icon = isWayOut ? BackIcon : tab.Icon;
                return (
                  <li key={tab.href}>
                    <Link
                      href={tab.href}
                      aria-current={active ? "page" : undefined}
                      onClick={() => setOpen(false)}
                      className={`flex items-center gap-3 rounded-[var(--radius-card)] border px-3.5 py-3 transition ${
                        active
                          ? "border-teal/40 bg-teal-soft"
                          : "border-[var(--line)] bg-sand hover:border-[var(--line-strong)]"
                      }`}
                    >
                      <Icon
                        className={`h-5 w-5 shrink-0 ${
                          active ? "text-teal" : "text-ink-soft"
                        }`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-[1rem] font-semibold text-ink">
                          {isWayOut ? "All trips" : tab.label}
                        </span>
                        <span className="block truncate text-[0.78rem] text-ink-soft">
                          {isWayOut ? "Back out of this trip" : tab.sub}
                        </span>
                      </span>
                      {count > 0 && (
                        <span className="shrink-0 rounded-full bg-rose px-1.5 py-px text-[0.68rem] font-bold leading-5 text-on-accent">
                          {count}
                          <span className="sr-only"> needing attention</span>
                        </span>
                      )}
                      {active && (
                        <TickIcon className="h-4 w-4 shrink-0 text-teal" />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      )}

      <nav
        aria-label="Main menu"
        aria-hidden={keyboardOpen ? "true" : undefined}
        /* Solid, edge to edge, and nothing shows underneath it. */
        className={`no-print fixed inset-x-0 bottom-0 z-30 border-t border-[var(--line)] bg-white px-3 pt-2 transition-transform duration-200 ${
          // Out of reach as well as out of sight, so a tap meant for the field
          // underneath cannot land on a menu row on the way down.
          keyboardOpen ? "translate-y-full pointer-events-none" : ""
        }`}
        style={{ paddingBottom: "max(0.55rem, env(safe-area-inset-bottom))" }}
      >
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={`${label} — open the menu`}
            className="relative inline-flex min-w-0 items-center gap-2 rounded-full border border-[var(--line)] bg-sand px-3 py-2 text-ink transition hover:border-[var(--line-strong)] active:translate-y-px min-[375px]:px-3.5"
          >
            <AlyeskaMark className="h-[1.35rem] w-[1.35rem] shrink-0" />
            <span className="min-w-0 truncate font-display text-[0.95rem] font-semibold">
              {label}
            </span>
            <ChevronIcon className="h-3.5 w-3.5 shrink-0 text-ink-soft" />
            {/* The one number worth interrupting somebody for still shows on the
                closed pill, because it lives on a screen the menu is hiding. */}
            {attention > 0 && !isActive("/reminders") && (
              <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-rose px-1 text-[0.55rem] font-bold leading-4 text-on-accent">
                {attention}
                <span className="sr-only"> reminders needing attention</span>
              </span>
            )}
          </button>
          {showAsk &&
            (askLive ? (
              <AskAlyTrigger href={askHref} />
            ) : (
              <span
                aria-hidden="true"
                className="sk h-9 w-[6.5rem] shrink-0 rounded-full"
              />
            ))}
        </div>
      </nav>
    </>
  );
}

// Line icons drawn to match the Ask Aly bubble: one weight, round joins, no
// fills.
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

// Sliders rather than a cog. A ring with eight short teeth collapses into a sun
// at twenty pixels, and this app already has weather in it; three rails with a
// knob on each stays unmistakable at the same one stroke weight.
function GearIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M3 5.6h2.6M8.8 5.6H17M3 10h8.2M14.4 10H17M3 14.4h2.6M8.8 14.4H17" />
      <circle cx="7.2" cy="5.6" r="1.6" />
      <circle cx="12.8" cy="10" r="1.6" />
      <circle cx="7.2" cy="14.4" r="1.6" />
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

// Points up while the sheet is shut: this opens upward.
function ChevronIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M5.4 12.4 10 7.8l4.6 4.6" />
    </svg>
  );
}

function TickIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M4.4 10.6l3.5 3.4 7.7-8" />
    </svg>
  );
}
