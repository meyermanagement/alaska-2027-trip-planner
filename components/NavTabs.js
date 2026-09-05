"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  countdownSaid,
  daysUntil,
  formatRange,
  lastDayOf,
  tripDayNumber,
} from "@/lib/format";
import { coverToken } from "@/lib/covers/tint";
import { parseTripRef, tripPath } from "@/lib/trips/route";
import AlyeskaMark from "./AlyeskaMark";
import AskAlyTrigger, { BubbleIcon } from "./AskAlyTrigger";
import { PendingSwap } from "./LinkPending";
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
 * So: no bar at all. Two discs lying on top of the page, bottom left and bottom
 * right, each with a shadow under it so it reads as floating above the content
 * rather than competing with it. A bar is a horizon: it cuts the screen and
 * everything above it has to end before it starts. Two discs are objects, and
 * the page runs on underneath them.
 *
 * Bottom left, the menu: the compass alone, on a disc. It carried the name of
 * the screen you were on and a chevron, and both have gone. The screen already
 * says what it is at the top; a control repeating it in the opposite corner was
 * answering a question nobody standing on the page has, and the words are what
 * forced the whole corner into a pill wide enough to need a bar behind it.
 * Tapping it raises a sheet with every destination spelled out in full, one per
 * line, with the second line of explanation the desktop dock used to get and the
 * phone never could. The screen you are on is ticked.
 *
 * Bottom right, Ask Aly: the same disc, the same size, carrying the speech
 * bubble alone. Both marks are drawn large inside their disc, with only about
 * ten pixels of clearance to the edge — a small glyph centred in a big circle
 * reads as a button waiting for a label, and there is no label coming. It used to live in the top right corner, a full reach away from
 * a thumb; it is the thing people press most, so it takes the corner the thumb
 * lands on first. Navigation is deliberate and can afford the longer reach,
 * which is why the two are this way round and not the other. Only the fill tells
 * them apart, and that is the point: two identical discs, one of them the app's
 * single accent, because one of them is the thing you came to do.
 *
 * One exception inside a single trip: the first row in the sheet stops naming
 * where you already are and becomes the way out — an arrow, and the words
 * "All trips". Filling it in like a current page made it look like a label
 * rather than a door. That row is the only place the way out lives; it briefly
 * had a third disc of its own on the bar, which made a two-control corner into a
 * cluster and put the least considered decision on the screen at the same weight
 * as the two most common ones.
 *
 * Every row here, and the arrow beside the pill, turns its icon into a spinner
 * while the screen it asks for is on its way. The sheet closes on the press, so
 * without that there is nothing at all between the press and the next screen --
 * which on a slow answer is indistinguishable from an app that has stopped.
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
    // Not "Points, miles & cards", which named the contents and not the job.
    // The screen keeps track of every rewards program the family belongs to,
    // what each one is actually worth to them, and what is newly on offer that
    // they could use.
    sub: "Rewards programs, perks & new offers",
    Icon: RewardsIcon,
  },
  {
    href: "/preferences",
    label: "Travel preferences",
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
  // The trip the family is pointed at, if there is one: the top of the menu.
  // Chosen and roster-checked in TopBar, which is the thing that knows who is
  // asking. Absent on the skeleton, which has no database.
  trip = null,
  today = null,
}) {
  // Read once, lazily, so the first frame the skeleton draws is already right
  // rather than being corrected a moment later.
  const [recalled] = useState(recall);
  const effective = level || recalled;
  useEffect(() => {
    remember(level);
  }, [level]);
  const pathname = usePathname() || "";
  const router = useRouter();
  const keyboardOpen = useSoftKeyboard();
  const [open, setOpen] = useState(false);
  // Kept on screen for the length of the closing animation after open goes
  // false. Unmounting on the press would cut the arc away mid-movement, so the
  // intent and the presence are two different pieces of state.
  const [present, setPresent] = useState(false);
  const sheetRef = useRef(null);

  const isActive = (href) =>
    pathname === href || pathname.startsWith(`${href}/`);
  // Inside one trip, as opposed to the list of them.
  const insideTrip = /^\/trips\/[^/]+/.test(pathname);
  // Which trip, by the half of the address that is actually its identity. The
  // readable half drifts after a rename and old links carry none at all, so
  // comparing whole paths would answer no on a trip you are plainly looking at.
  const openTripKey = insideTrip
    ? parseTripRef(pathname.split("/")[2] || "").key
    : "";
  const tabs =
    effective === SECONDARY
      ? TABS.filter((t) => SECONDARY_TABS.has(t.href))
      : TABS;

  // Shut the sheet the moment you arrive somewhere, and on Escape.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (open) {
      setPresent(true);
      return undefined;
    }
    const t = setTimeout(() => setPresent(false), 150);
    return () => clearTimeout(t);
  }, [open]);
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

  // The plate above the arc. "Happening now" while they are away and a
  // countdown before they leave, because those are two different sentences and
  // a card that says the same thing on both days is only right on one of them.
  //
  // Not shown while you are on that trip's own screen: there it is an offer to
  // go where you already are, and it pushes the seven doors -- the only thing
  // the menu can still do for you -- a plate's height further from your thumb.
  const onThisTrip = Boolean(
    trip?.public_id && openTripKey && trip.public_id === openTripKey,
  );
  const where = trip && today ? tripDayNumber(trip, today) : null;
  const soon = trip && !where ? countdownSaid(daysUntil(trip.start_date)) : "";
  const hero = trip && !onThisTrip ? (
    <Link
      href={tripPath(trip, where ? "itinerary" : "overview")}
      onPointerEnter={() => router.prefetch(tripPath(trip, "itinerary"))}
      onClick={() => setOpen(false)}
      className="arc-hero"
      /* The trip's own color, the one its cover is printed in, rather than the
         accent. Painted in the accent the plate was the same green as the pill
         for the screen you were already on, so the menu appeared to have two
         things selected and neither of them said which. Only one thing in this
         shape is allowed to be the accent, and it is the one that means "you
         are here". */
      style={{ "--arc-hero-hue": coverToken(trip), "--arc-i": 0 }}
    >
      <span aria-hidden="true" className="arc-hero-mark">
        {trip.cover_emoji || "🧭"}
      </span>
      <span className="min-w-0 flex-1">
        <span className="arc-hero-when block text-[0.58rem] font-bold uppercase tracking-[0.12em]">
          {where ? "Happening now" : "Next trip"}
        </span>
        <span className="block truncate font-display text-[0.95rem] font-semibold leading-tight">
          {trip.name}
        </span>
        <span className="arc-sub block truncate text-[0.72rem] leading-tight">
          {where
            ? `Day ${where.day} of ${where.of} · back to today`
            : [soon, formatRange(trip.start_date, lastDayOf(trip))]
                .filter(Boolean)
                .join(" · ")}
        </span>
      </span>
      <span aria-hidden="true" className="arc-hero-go">
        <ArrowIcon className="h-[15px] w-[15px] shrink-0" />
      </span>
    </Link>
  ) : null;


  return (
    <>
      {/* The menu is an arc struck off the compass rather than a sheet raised
          from the bottom edge.

          A sheet is a second screen: it takes the whole width, covers what you
          were looking at, and has to be dismissed. This is seven objects thrown
          out from the disc you just pressed, along a shallow curve, with the
          page still visible everywhere around them — so the menu belongs
          visibly to the button that opened it and to the corner it came from,
          and the screen underneath is never fully taken away.

          The column reads downward, the way every other list in the app does,
          with Trips first and Settings last. Running it the other way -- outward
          from the thumb -- was a nice idea about where a hand is and a bad one
          about where the eye starts: it put the least-used door directly beneath
          the trip plate, at the top of the shape, where the reading begins.

          Each node is a frosted pill and not a bare circle because the second
          line survives — the explanation of what each screen is for, which the
          desktop dock used to get and the phone never could. Two lines of small
          text cannot be read off a photograph, so they need something behind
          them; a pill carrying both is about 250 of the 312 pixels a phone
          gives you, which leaves roughly forty for the sweep. The bow is
          therefore real but shallow, a lean rather than a fan, and it is set in
          one custom property so a 320px phone can spend less on it.

          Above the arc, on its own full-width plate, the trip the family is
          actually pointed at: the one they are on, or the next one they are
          going on. It is a card rather than another node because it is a
          different kind of thing from a destination in the app — it is where
          most presses of this menu were heading anyway, and answering that
          before the seven doors is the point of putting it there.

          It sits above the bar it rose from, and below the Ask Aly drawer, so
          that if both ever open the conversation is in front. */}
      {present && (
        <div
          className={`no-print fixed inset-0 z-[38] ${open ? "arc-in" : "arc-out"}`}
        >
          <button
            type="button"
            aria-label="Close the menu"
            onClick={() => setOpen(false)}
            /* Lighter than the scrim under a sheet, and blurred rather than
               darkened: the page is meant to still be there. */
            className="arc-scrim absolute inset-0 bg-ink/30 backdrop-blur-[3px]"
          />
          <div
            ref={sheetRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-label="Main menu"
            className="menu-arc absolute inset-x-0 bottom-0 outline-none"
            style={{
              paddingBottom:
                "max(5.1rem, calc(env(safe-area-inset-bottom) + 4.6rem))",
            }}
          >
            {/* Anchored to the same left edge the compass is on, so the arc
                reads as having been thrown from it rather than floating in the
                middle of a wide screen. */}
            <div className="mx-auto max-w-5xl px-4">
              <div className="flex max-w-[23rem] flex-col items-start gap-1.5">
                {hero}
                {/* Read downward, in the order the tabs are written: the trip
                    plate, then Trips under it, then the rest, with Settings
                    last. The arc used to run the other way, outward from the
                    thumb, which put the least-used door directly under the
                    plate and made the column read bottom-up against every other
                    list in the app. */}
                {tabs.map((tab, index) => {
                  const isWayOut = tab.href === "/trips" && insideTrip;
                  const active = isActive(tab.href) && !isWayOut;
                  const count = tab.badge ? attention : 0;
                  const Icon = isWayOut ? BackIcon : tab.Icon;
                  // Zero at both ends, widest in the middle: one half-period of
                  // a sine, which is what makes the column read as a curve
                  // rather than a staircase.
                  const bow =
                    tabs.length > 1
                      ? Math.sin((Math.PI * index) / (tabs.length - 1))
                      : 0;
                  return (
                    <Link
                      key={tab.href}
                      href={tab.href}
                      aria-current={active ? "page" : undefined}
                      /* A link on a page like these prefetches only as far as
                         the loading skeleton: enough to draw the frame
                         instantly, and nothing of what the screen is actually
                         made of, so the wait is still the whole server render
                         after the tap. router.prefetch asks for the render
                         itself. Fired on the row being touched or pointed at
                         rather than on all seven when the menu opens, because
                         warming six screens nobody asked for is how a phone on
                         mobile data ends up slower than it started. */
                      onPointerEnter={() => router.prefetch(tab.href)}
                      onPointerDown={() => router.prefetch(tab.href)}
                      onFocus={() => router.prefetch(tab.href)}
                      onClick={() => setOpen(false)}
                      style={{
                        marginLeft: `calc(var(--arc-span) * ${bow.toFixed(3)})`,
                        // Its place in the stagger, counted from the plate.
                        "--arc-i": index + 1,
                      }}
                      /* Trips is drawn larger than the six below it. It is the
                         door most presses of this menu are looking for, and on a
                         trip screen it is the way back out -- so it gets the
                         size that says so rather than being one of seven equal
                         rows in a curve. */
                      className={`arc-pill ${index === 0 ? "lead " : ""}${active ? "on" : ""}`}
                    >
                      <span className="arc-disc">
                        <PendingSwap href={tab.href} className="h-[18px] w-[18px] shrink-0">
                          <Icon className="h-[18px] w-[18px] shrink-0" />
                        </PendingSwap>
                        {count > 0 && (
                          <span className="arc-dot">
                            {count}
                            <span className="sr-only"> needing attention</span>
                          </span>
                        )}
                      </span>
                      <span className="min-w-0">
                        <span className="arc-label block truncate font-display text-[0.95rem] font-semibold leading-tight">
                          {isWayOut ? "All trips" : tab.label}
                        </span>
                        <span className="arc-sub block truncate text-[0.72rem] leading-tight">
                          {isWayOut ? "Back out of this trip" : tab.sub}
                        </span>
                      </span>
                    </Link>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      <nav
        aria-label="Main menu"
        aria-hidden={keyboardOpen ? "true" : undefined}
        /* No surface of its own: two discs lying on the page, and the page
           visible everywhere between and behind them. The wrapper takes no
           presses -- only the discs do -- so the strip of screen either side of
           them still belongs to whatever is underneath. */
        /* Above the arc's own scrim while the menu is open, so the disc you
           pressed to open it is still there -- and still the thing you press to
           put it away. A menu whose button vanishes underneath it makes you hunt
           for empty page to tap instead. */
        className={`no-print pointer-events-none fixed inset-x-0 bottom-0 ${
          present ? "z-[39]" : "z-30"
        } px-4 transition-transform duration-200 ${
          // Out of reach as well as out of sight, so a tap meant for the field
          // underneath cannot land on a control on the way down.
          keyboardOpen ? "translate-y-[130%]" : ""
        }`}
        style={{
          paddingBottom:
            "max(1rem, calc(env(safe-area-inset-bottom) + 0.4rem))",
        }}
      >
        <div className="mx-auto flex max-w-5xl items-end justify-between gap-3">
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-label={open ? "Close the menu" : "Open the menu"}
            /* Face, edge and shadow all come from the skin. On the two dark
               skins a card-colored circle on a near-black page had nothing
               separating it -- the drop shadow underneath is black on black --
               so those skins hand back a lighter face, a stronger rim and a lit
               top edge instead. See --disc-face in globals.css. */
            className="pointer-events-auto relative inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border border-[var(--disc-edge)] bg-[var(--disc-face)] text-ink shadow-[var(--disc-shadow)] transition hover:border-[var(--line-strong)] active:translate-y-px"
          >
            {/* Drawn to very nearly the width of the button. The mark carries no
                housing of its own, so the button's rim is the only circle here.

                The needle turns to point right while the menu is open and back
                to north when it is shut -- a compass held still is a logo, one
                that swings is a control, and the direction it settles on says
                which of the two states you are in without a second icon. */}
            <AlyeskaMark
              className={`h-[52px] w-[52px] shrink-0 transition-transform duration-200 ease-out ${
                open ? "rotate-90" : "rotate-0"
              }`}
            />
            {/* The one number worth interrupting somebody for still shows on the
              closed control, because it lives on a screen the menu is hiding. */}
            {attention > 0 && !isActive("/reminders") && (
              <span className="absolute -right-0.5 -top-0.5 min-w-[1.15rem] rounded-full bg-rose px-1 text-[0.62rem] font-bold leading-[1.15rem] text-on-accent ring-2 ring-[var(--disc-face)]">
                {attention}
                <span className="sr-only"> reminders needing attention</span>
              </span>
            )}
          </button>
          {showAsk &&
            (askLive ? (
              <span className="pointer-events-auto">
                <AskAlyTrigger href={askHref} round />
              </span>
            ) : (
              // Loading. The disc is drawn in full -- teal, bubble, shadow --
              // rather than as a grey skeleton circle, because the skeleton
              // version disappeared into whatever card happened to be behind
              // it and the corner simply looked empty. A grey shape works for a
              // row of text on a page; it does not work for the one element
              // that is meant to be the brightest thing on the screen.
              //
              // It is a span rather than a button, and dimmed, because the
              // drawer that answers a press is mounted by the page and the page
              // is what has not arrived yet. So it reads as the control on its
              // way in, which is what it is.
              <span
                aria-hidden="true"
                className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-teal text-on-accent opacity-60 shadow-[var(--disc-shadow)] ring-1 ring-ink/10"
              >
                <BubbleIcon className="h-8 w-8 shrink-0" />
              </span>
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

// The tick that used to mark the screen you were on has gone: on the arc the
// current node is filled in the accent, which is the same marker the rest of the
// app uses and does not need a second one beside it.

// The way into the trip on the plate.
function ArrowIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M4 10h11M10.4 5.4 15 10l-4.6 4.6" />
    </svg>
  );
}
