"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  countdownSaid,
  daysUntil,
  formatRange,
  lastDayOf,
  tripDayNumber,
} from "@/lib/format";
import { coverToken } from "@/lib/covers/tint";
import { parseTripRef, tripPath } from "@/lib/trips/route";
import { TRIPS_VIEW_EVENT } from "@/lib/trips/viewEvent";
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
// Two levels, because seven equal doors never said which of them were about a
// trip and which were about the family. Three groups now, each named for the
// question it answers, and a group opens in place rather than going anywhere:
//
//   Travel Journal   the trips themselves -- one screen, three groups of trip
//   Travel Checklist what has to be packed and done before you go
//   Travel File      how this family travels, kept between trips
//
// Settings stays a door of its own, off the bottom of the column, because it is
// not travel at all.
//
// The three trip rows are the same screen with a different group showing. That
// is deliberate: a draft, a booked trip and a finished one are the same object at
// three ages, and the board already sorted them into three tabs. The address
// carries the group -- /trips?view=drafts -- so a row can point straight at one.
const TRIP_ROWS = [
  {
    href: "/trips?view=drafts",
    view: "drafts",
    label: "Trip Builder",
    sub: "Still being worked out",
    Icon: PencilIcon,
  },
  {
    href: "/trips?view=upcoming",
    view: "upcoming",
    label: "Planned Trips",
    sub: "Booked and coming up",
    Icon: SuitcaseIcon,
  },
  {
    href: "/trips?view=past",
    view: "past",
    label: "Trip Log",
    sub: "Trips already taken",
    Icon: ClockIcon,
  },
];

const GROUPS_BASE = [
  {
    key: "journal",
    label: "Travel Journal",
    sub: "Where you've been and where you want to go next",
    Icon: JournalIcon,
    kids: TRIP_ROWS,
  },
  {
    key: "checklist",
    label: "Travel Checklist",
    sub: "What to pack and what to do before you go",
    Icon: ChecklistIcon,
    // The one number in this menu worth interrupting somebody for lives on
    // Reminders, one level down -- so while the group is shut it shows on the
    // group. A count nobody can see until they open the right door is not a
    // count.
    badge: true,
    kids: [
      {
        href: "/packing",
        label: "Packing",
        sub: "The lists every trip starts from",
        Icon: ShirtIcon,
      },
      {
        href: "/reminders",
        label: "Reminders",
        sub: "Everything due before you leave",
        Icon: BellIcon,
        badge: true,
      },
    ],
  },
  {
    key: "file",
    label: "Travel File",
    sub: "How you and your family travel",
    Icon: FolderIcon,
    kids: [
      {
        href: "/preferences",
        label: "Travel preferences",
        sub: "How you like to travel",
        Icon: StarIcon,
      },
      {
        href: "/reviews",
        label: "Past reviews",
        sub: "What you thought of it",
        Icon: ReviewIcon,
      },
      {
        href: "/family",
        label: "Family & pets",
        sub: "People and animals",
        Icon: PeopleIcon,
      },
      {
        href: "/wallet",
        // Not "Points, miles & cards", which named the contents and not the
        // job. The screen keeps track of every rewards program the family
        // belongs to, what each one is worth to them, and what is newly on
        // offer that they could use.
        label: "Wallet",
        sub: "Rewards, perks and new offers",
        Icon: RewardsIcon,
      },
    ],
  },
];

const SETTINGS = {
  href: "/settings",
  label: "Settings",
  sub: "About you, your look, sign-in",
  Icon: GearIcon,
};

// The More group carries the three rooms of the app that are not about a trip
// at all: what we promise you (Our Pledge), how you tell us the app got
// something wrong (Contact Us), and what you have set (Settings). Kept as a
// group rather than three top-level rows, so the column above it stays
// entirely about travel and the housekeeping is one door.
const MORE_GROUP = {
  key: "more",
  label: "More",
  sub: "What we promise, how to reach us, and your settings",
  Icon: DotsIcon,
  // Our Pledge and Contact Us are the two rooms a family is likely to want
  // to look at; Settings is the room they open once to check whose account it
  // is. So the reading order is what-we-promise, how-to-reach-us, and then
  // the housekeeping door at the bottom.
  kids: [
    {
      href: "/pledge",
      label: "Our Pledge",
      sub: "No bias, no selling your information, no ads",
      Icon: ShieldIcon,
    },
    {
      href: "/contact",
      label: "Contact Us",
      sub: "Tell us what went right, or what went wrong",
      Icon: MailIcon,
    },
    SETTINGS,
  ],
};

// GROUPS_BASE is the three travel groups. GROUPS is what the menu actually
// draws: those three plus the More group (Settings, Our Pledge, Contact Us)
// pinned to the bottom of the column. Kept as a computed constant rather
// than mutating GROUPS_BASE so the two sets can never drift.
const GROUPS = [...GROUPS_BASE, MORE_GROUP];

// A secondary traveler -- a minor, or a friend along for one trip -- gets three
// doors and no groups: the trips they are on, their own share of the checklist,
// and themselves. Their packing items live inside a trip, on its packing tab,
// which is why there is no fourth one, and grouping three rows would be a
// structure with nothing in it. The rest is not merely hidden: the database
// refuses those reads, so drawing those rows would offer four empty rooms.
//
// Settings is in that list on purpose. It is the screen About you, your look and
// the sign-in address now live on, and for a secondary traveler About you is the
// one thing about themselves the database will let them change at all -- every
// other column on their own row is refused. A single thing you are permitted to
// edit should not be unreachable.
const SECONDARY_ROWS = [
  {
    href: "/trips",
    label: "Trips",
    sub: "The trips you are on",
    Icon: SuitcaseIcon,
  },
  {
    href: "/reminders",
    label: "Reminders",
    sub: "Everything due before you leave",
    Icon: BellIcon,
    badge: true,
  },
  SETTINGS,
];

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

// Whether a row points at the screen you are standing on. The trip rows carry a
// query on the end of the address, and one of them -- /trips -- is also the
// prefix of every single trip's own screen, so those ask for an exact match.
function onScreen(href, pathname, exact = false) {
  const path = String(href).split("?")[0];
  if (exact) return pathname === path;
  return pathname === path || pathname.startsWith(`${path}/`);
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

  // A search field along the bottom of the menu, appearing whenever the menu
  // is open. Typing filters the rows above it in place; the field itself is
  // the entire scope of the search -- it does not go anywhere on its own, it
  // just narrows what the menu is showing. When the menu closes the query is
  // cleared, because a filter meant for one glance at the menu is not meant
  // for the next glance at it. Kept as a separate state from the menu open
  // state itself so the filter can update the rows without the arc having to
  // re-open every keystroke.
  const [query, setQuery] = useState("");
  const queryInputRef = useRef(null);

  // What the model returned for the last query it settled on -- either a set
  // of menu keys that answer the query, or null while the first fetch for a
  // query is still in flight (fetching is the compass-spin loading state).
  // The set is stored beside the query it corresponds to so we know when to
  // discard it: the moment the user has typed something new, the previous
  // set stops describing what is on the screen and we go back to "still
  // fetching" until the next call returns. When the model errors we keep
  // navFilter null so no rows disappear on a fetch failure.
  const [navFilter, setNavFilter] = useState({ query: "", keys: null });
  const [navFetching, setNavFetching] = useState(false);
  const navAbortRef = useRef(null);
  const navSeqRef = useRef(0);

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
  const secondary = effective === SECONDARY;

  // Which group is open, and only ever one. The menu is thrown from a disc in
  // the bottom corner and has a phone's height to live in; two groups open at
  // once ran off the top of the screen. It opens on the group holding the screen
  // you are on, so the menu answers "where am I" before you touch anything.
  const holding = GROUPS.find((g) =>
    g.kids.some((k) => onScreen(k.href, pathname)),
  );
  const [group, setGroup] = useState(holding ? holding.key : null);
  useEffect(() => {
    const held = GROUPS.find((g) =>
      g.kids.some((k) => onScreen(k.href, pathname)),
    );
    setGroup(held ? held.key : null);
  }, [pathname]);

  // Which of the three trip groups the board is showing, so the row that asked
  // for it can be the one filled in. It is in the address rather than the path,
  // and the board writes it there itself as you press its tabs.
  //
  // Read through useSearchParams rather than off the window when the menu opens.
  // The window read looked equivalent and was not: pressing Drafts on the board
  // changes the address without any navigation, so nothing here re-rendered, and
  // the menu went on showing Planned Trips filled in until the next real page
  // load. This hook is told about a replaceState as well as a navigation, which
  // is the only way the highlight can keep up with a tab press.
  const params = useSearchParams();
  const view = String(params.get("view") || "").toLowerCase();

  // Shut the sheet the moment you arrive somewhere, and on Escape. Clear the
  // filter with it: a query typed on one screen is not the right filter on
  // the next, and the menu reopening with a stale filter would look empty
  // for a reason the user cannot see from the outside.
  useEffect(() => {
    setOpen(false);
    setQuery("");
    setNavFilter({ query: "", keys: null });
    setNavFetching(false);
    if (navAbortRef.current) navAbortRef.current.abort();
  }, [pathname]);

  // On close, drop the query so the next open starts on the full menu. Kept
  // separate from the pathname effect above so a manual close (Escape, the
  // scrim tap) also clears it -- staying on the same screen does not save the
  // filter, because the filter is a way of looking at this one menu opening.
  useEffect(() => {
    if (!open) {
      setQuery("");
      setNavFilter({ query: "", keys: null });
      setNavFetching(false);
      if (navAbortRef.current) navAbortRef.current.abort();
    }
  }, [open]);
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
    // Focus the sheet so a keyboard lands inside it rather than back on the
    // page, then, on the next frame, hand focus to the search field so a
    // person opening the menu can start typing without a second tap. On a
    // phone this raises the software keyboard automatically -- the whole
    // reason the field is next to the compass instead of buried inside the
    // arc.
    sheetRef.current?.focus();
    const raf =
      typeof window !== "undefined" &&
      typeof window.requestAnimationFrame === "function"
        ? window.requestAnimationFrame(() => queryInputRef.current?.focus())
        : setTimeout(() => queryInputRef.current?.focus(), 0);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (
        typeof window !== "undefined" &&
        typeof window.cancelAnimationFrame === "function"
      ) {
        window.cancelAnimationFrame(raf);
      } else {
        clearTimeout(raf);
      }
    };
  }, [open]);

  // Debounced live translation of the query into a set of menu keys the model
  // thinks answer it. Runs on every keystroke while the menu is open, with a
  // short debounce so a person still typing does not fire a request per
  // character. Cancels any in-flight request when a new keystroke arrives.
  // The menu itself is rebuilt every render, so we look at the current
  // rendered rows through a ref -- fetching in this effect and reading rows
  // in the render body would fight over the render cycle, and rows is cheap
  // to snapshot at fetch time.
  const rowsForFilterRef = useRef([]);
  useEffect(() => {
    if (!open) return undefined;
    const q = query.trim();
    if (!q) {
      setNavFilter({ query: "", keys: null });
      setNavFetching(false);
      if (navAbortRef.current) navAbortRef.current.abort();
      return undefined;
    }
    setNavFetching(true);
    const seq = ++navSeqRef.current;
    const controller =
      typeof AbortController !== "undefined" ? new AbortController() : null;
    if (navAbortRef.current) navAbortRef.current.abort();
    navAbortRef.current = controller;
    const timer = setTimeout(async () => {
      const menuPayload = rowsForFilterRef.current;
      if (!Array.isArray(menuPayload) || menuPayload.length === 0) {
        setNavFetching(false);
        return;
      }
      try {
        const res = await fetch("/api/nav-search", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            query: q,
            currentPath: pathname || "",
            menu: menuPayload,
          }),
          signal: controller?.signal,
        });
        if (seq !== navSeqRef.current) return;
        const data = await res.json().catch(() => ({}));
        setNavFilter({
          query: q,
          keys: Array.isArray(data?.keys) ? data.keys : null,
        });
      } catch (err) {
        if (err?.name === "AbortError") return;
        if (seq !== navSeqRef.current) return;
        setNavFilter({ query: q, keys: null });
      } finally {
        if (seq === navSeqRef.current) setNavFetching(false);
      }
    }, 240);
    return () => {
      clearTimeout(timer);
    };
  }, [query, open, pathname]);

  // The plate above the arc. "Happening now" while they are away and a
  // countdown before they leave, because those are two different sentences and
  // a card that says the same thing on both days is only right on one of them.
  //
  // Not shown while you are on that trip's own screen: there it is an offer to
  // go where you already are, and it pushes the doors -- the only thing the menu
  // can still do for you -- a plate's height further from your thumb.
  const onThisTrip = Boolean(
    trip?.public_id && openTripKey && trip.public_id === openTripKey,
  );
  const where = trip && today ? tripDayNumber(trip, today) : null;
  const soon = trip && !where ? countdownSaid(daysUntil(trip.start_date)) : "";

  // Filter state. The primary types into the search field beside the compass
  // and a model translates the query into a set of menu keys that answer it.
  // Three conditions decide what happens to the rows below:
  //   - No query typed: nothing filters, every row shows as it always did.
  //   - Query typed and the model has settled on a matching key set for that
  //     exact query: only the returned keys show, in the order the model
  //     returned them.
  //   - Query typed but no settled result yet (still fetching, or the last
  //     fetch failed, or the query has moved on since the last result): show
  //     every row untouched, and let the spinning compass in the bar say
  //     that a filter is on its way. Hiding rows during a stale interval
  //     would flicker the column every keystroke, which is worse than a
  //     brief moment of "the answer is arriving".
  const filtering = query.trim().length > 0;
  const filterReady =
    filtering &&
    Array.isArray(navFilter.keys) &&
    navFilter.query === query.trim();
  const keySet = filterReady ? new Set(navFilter.keys) : null;
  const keyOrder = filterReady
    ? new Map(navFilter.keys.map((k, i) => [k, i]))
    : null;
  const shows = (key) => !keySet || keySet.has(key);

  // The current-trip plate is a row like any other in the filter. When the
  // model returned keys and "hero" is not among them the plate hides; while
  // the fetch is still in flight the plate stays put so the column does not
  // jump around underneath the typing.
  const heroMatches = shows("hero");
  const hero =
    trip && !onThisTrip && heroMatches ? (
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

  // Everything the menu could ever show, before the filter is applied. Two
  // arrays: one is the flat list of row objects the render will draw; the
  // other is the small menu shape sent to the model when a query is in the
  // field. Building both here means the render, the fetch, and the filter
  // all see the same set of keys.
  const allRows = [];
  const menuPayload = [];
  const currentPathKey = pathname || "";
  const pushRow = (row, payload) => {
    allRows.push(row);
    menuPayload.push(payload);
  };
  if (trip && !onThisTrip) {
    // The current-trip plate is included in the payload as a destination the
    // model can pick. The render draws it separately as `hero`, not inside
    // the rows.map, so it does not appear in allRows here; it is filtered
    // above through heroMatches.
    menuPayload.push({
      key: "hero",
      kind: "link",
      label: trip.name || "",
      sub: where
        ? `Happening now, day ${where}`
        : soon
          ? `Next trip, ${soon}`
          : "Next trip",
      here: onThisTrip,
    });
  }
  if (insideTrip) {
    pushRow(
      {
        kind: "wayout",
        key: "wayout",
        href: "/trips",
        label: "All trips",
        Icon: BackIcon,
        lead: true,
      },
      {
        key: "wayout",
        kind: "link",
        label: "All trips",
        sub: "Back out of this trip",
      },
    );
  }
  if (secondary) {
    for (const row of SECONDARY_ROWS) {
      pushRow(
        {
          kind: "link",
          key: row.href,
          ...row,
          active: onScreen(row.href, pathname),
        },
        {
          key: row.href,
          kind: "link",
          label: row.label || "",
          sub: row.sub || "",
          here: currentPathKey === row.href,
        },
      );
    }
  } else {
    for (const g of GROUPS) {
      pushRow(
        {
          kind: "group",
          key: `group:${g.key}`,
          groupKey: g.key,
          label: g.label,
          sub: g.sub,
          Icon: g.Icon,
          badge: g.badge,
          lead: !insideTrip && g.key === "journal",
        },
        {
          key: `group:${g.key}`,
          kind: "group",
          label: g.label || "",
          sub: g.sub || "",
        },
      );
      g.kids.forEach((kid, n) => {
        pushRow(
          {
            kind: "link",
            kid: true,
            last: n === g.kids.length - 1,
            key: kid.href,
            groupKey: g.key,
            ...kid,
            active:
              onScreen(kid.href, pathname, Boolean(kid.view)) &&
              (!kid.view || (view || "upcoming") === kid.view),
          },
          {
            key: kid.href,
            kind: "link",
            parent: `group:${g.key}`,
            label: kid.label || "",
            sub: kid.sub || "",
            here: currentPathKey === kid.href,
          },
        );
      });
    }
    // Settings used to be pushed here as a bottom row of its own. It now lives
    // inside the More group, alongside Our Pledge and Contact Us, so the
    // whole non-travel section of the menu is one door.
  }
  rowsForFilterRef.current = menuPayload;

  // Apply the filter, and count the seat down the column so the entrance
  // stagger stays in draw order. Without a filter, the previous rule stands:
  // only the open group's kids show. With a settled filter, only rows whose
  // keys came back from the model show; when a kid is included but its
  // group's key is not, the group header is added back so the kid does not
  // appear parentless in the column.
  const includedKeys = filterReady ? new Set(navFilter.keys) : null;
  if (includedKeys) {
    for (const row of allRows) {
      if (row.kind === "link" && row.kid && !includedKeys.has(row.key))
        continue;
      if (row.kind === "link" && row.kid && includedKeys.has(row.key)) {
        if (row.groupKey) includedKeys.add(`group:${row.groupKey}`);
      }
    }
  }
  const rows = [];
  let seat = 1;
  const orderIndex = (row) => {
    if (!keyOrder) return 0;
    const idx = keyOrder.get(row.key);
    return idx === undefined ? 9999 : idx;
  };
  const passesFilter = (row) => {
    if (!includedKeys) return true;
    return includedKeys.has(row.key);
  };
  if (filterReady) {
    // Ordered by the model's ranking, with group headers pulled to sit just
    // above their kids so a filtered folder still looks like a folder.
    const kept = allRows.filter(passesFilter);
    // Group kids under their group in the final render regardless of the
    // model's exact ordering; the model picks who is in, the client picks
    // where the header goes so the column reads as a menu rather than as a
    // ranked list.
    const groupOrder = new Map();
    const groupKids = new Map();
    const flatOrdered = [];
    kept.sort((a, b) => orderIndex(a) - orderIndex(b));
    for (const row of kept) {
      if (row.kind === "group") {
        if (!groupOrder.has(row.groupKey)) {
          groupOrder.set(row.groupKey, flatOrdered.length);
          flatOrdered.push(row);
          groupKids.set(row.groupKey, []);
        }
      } else if (row.kind === "link" && row.kid && row.groupKey) {
        if (!groupOrder.has(row.groupKey)) {
          const parent = allRows.find(
            (r) => r.kind === "group" && r.groupKey === row.groupKey,
          );
          if (parent) {
            groupOrder.set(row.groupKey, flatOrdered.length);
            flatOrdered.push(parent);
            groupKids.set(row.groupKey, []);
          }
        }
        groupKids.get(row.groupKey)?.push(row);
      } else {
        flatOrdered.push(row);
      }
    }
    // Weave kids in right after their group.
    for (const row of flatOrdered) {
      rows.push({ ...row, i: seat });
      seat++;
      if (row.kind === "group" && groupKids.has(row.groupKey)) {
        const kids = groupKids.get(row.groupKey) || [];
        // The last kid loses its bottom border in the pill styling.
        kids.forEach((kid, idx) => {
          rows.push({ ...kid, last: idx === kids.length - 1, i: seat });
          seat++;
        });
      }
    }
  } else {
    // Unfiltered: the previous rule stands.
    for (const row of allRows) {
      if (row.kind === "link" && row.kid) {
        if (row.groupKey !== group) continue;
      }
      rows.push({ ...row, i: seat });
      seat++;
    }
  }

  return (
    <>
      {/* The menu is an arc struck off the compass rather than a sheet raised
          from the bottom edge.

          A sheet is a second screen: it takes the whole width, covers what you
          were looking at, and has to be dismissed. This is a handful of objects
          thrown up out of the disc you just pressed, with the
          page still visible everywhere around them — so the menu belongs
          visibly to the button that opened it and to the corner it came from,
          and the screen underneath is never fully taken away.

          The column reads downward, the way every other list in the app does,
          with the Travel Journal first and Settings last. Running it the other
          way -- outward from the thumb -- was a nice idea about where a hand is
          and a bad one about where the eye starts: it put the least-used door
          directly beneath the trip plate, at the top of the shape, where the
          reading begins.

          Each node is a frosted pill and not a bare circle because the second
          line survives — the explanation of what each screen is for, which the
          desktop dock used to get and the phone never could. Two lines of small
          text cannot be read off a photograph, so they need something behind
          them; a pill carrying both is about 250 of the 312 pixels a phone
          gives you, and there is no width left over to bow the column out into a
          curve. That is no loss: a curve reads as one list of equals, and these
          rows are no longer equals -- three of them are doors to a group, and
          what is behind an opened one is set in underneath it.

          Above the arc, on its own full-width plate, the trip the family is
          actually pointed at: the one they are on, or the next one they are
          going on. It is a card rather than another node because it is a
          different kind of thing from a destination in the app — it is where
          most presses of this menu were heading anyway, and answering that
          before any of the doors is the point of putting it there.

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
                {/* Read downward, in the order the rows are written: the trip
                    plate, then the Travel Journal under it, then the other two
                    groups, with Settings last. The arc used to run the other
                    way, outward from the thumb, which put the least-used door
                    directly under the plate and made the column read bottom-up
                    against every other list in the app. */}
                {rows.map((row) => {
                  if (row.kind === "group") {
                    const isOpen = group === row.groupKey;
                    const count = row.badge && !isOpen ? attention : 0;
                    return (
                      <button
                        key={row.key}
                        type="button"
                        aria-expanded={isOpen}
                        onClick={() =>
                          setGroup((held) =>
                            held === row.groupKey ? null : row.groupKey,
                          )
                        }
                        style={{ "--arc-i": row.i }}
                        className={`arc-pill group ${row.lead ? "lead " : ""}${
                          isOpen ? "open" : ""
                        }`}
                      >
                        <span className="arc-disc">
                          <row.Icon className="h-[18px] w-[18px] shrink-0" />
                          {count > 0 && (
                            <span className="arc-dot">
                              {count}
                              <span className="sr-only">
                                {" "}
                                needing attention
                              </span>
                            </span>
                          )}
                        </span>
                        <span className="min-w-0">
                          <span className="arc-label block font-display text-[0.95rem] font-semibold leading-tight">
                            {row.label}
                          </span>
                          {/* The two lines a group carries are a sentence about
                              what is behind the door, and the doors are three
                              rather than seven now -- so this one is allowed to
                              wrap rather than be cut off mid-word. */}
                          <span className="arc-sub block text-[0.72rem] leading-[1.25]">
                            {row.sub}
                          </span>
                        </span>
                        <span aria-hidden="true" className="arc-chev">
                          <ChevronIcon className="h-[15px] w-[15px] shrink-0" />
                        </span>
                      </button>
                    );
                  }

                  const isWayOut = row.kind === "wayout";
                  const active = row.active;
                  const count = row.badge ? attention : 0;
                  const Icon = row.Icon;
                  return (
                    <Link
                      key={row.key}
                      href={row.href}
                      aria-current={active ? "page" : undefined}
                      /* A link on a page like these prefetches only as far as
                         the loading skeleton: enough to draw the frame
                         instantly, and nothing of what the screen is actually
                         made of, so the wait is still the whole server render
                         after the tap. router.prefetch asks for the render
                         itself. Fired on the row being touched or pointed at
                         rather than on every row when the menu opens, because
                         warming six screens nobody asked for is how a phone on
                         mobile data ends up slower than it started. */
                      onPointerEnter={() => router.prefetch(row.href)}
                      onPointerDown={() => router.prefetch(row.href)}
                      onFocus={() => router.prefetch(row.href)}
                      onClick={(e) => {
                        setOpen(false);
                        // Already on the board: the three groups are all here, so
                        // the router has nothing to fetch and a press through it
                        // changed the address and drew no skeleton. Hand the
                        // request to the board instead, which puts its skeleton up
                        // and then draws the group. Modified clicks are left alone
                        // so a row can still be opened in a new tab.
                        if (
                          row.view &&
                          pathname === "/trips" &&
                          !e.metaKey &&
                          !e.ctrlKey &&
                          !e.shiftKey &&
                          !e.altKey &&
                          e.button === 0
                        ) {
                          e.preventDefault();
                          window.dispatchEvent(
                            new CustomEvent(TRIPS_VIEW_EVENT, {
                              detail: { view: row.view },
                            }),
                          );
                        }
                      }}
                      style={{
                        // Its place in the stagger, counted from the plate.
                        "--arc-i": row.i,
                      }}
                      className={`arc-pill ${row.kid ? "kid " : ""}${
                        row.lead ? "lead " : ""
                      }${active ? "on" : ""}`}
                    >
                      <span className="arc-disc">
                        <PendingSwap
                          href={row.href}
                          className={
                            row.kid
                              ? "h-[15px] w-[15px] shrink-0"
                              : "h-[18px] w-[18px] shrink-0"
                          }
                        >
                          <Icon
                            className={
                              row.kid
                                ? "h-[15px] w-[15px] shrink-0"
                                : "h-[18px] w-[18px] shrink-0"
                            }
                          />
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
                          {isWayOut ? "All trips" : row.label}
                        </span>
                        <span className="arc-sub block truncate text-[0.72rem] leading-tight">
                          {isWayOut ? "Back out of this trip" : row.sub}
                        </span>
                      </span>
                    </Link>
                  );
                })}
                {/* When the filter is a match for nothing the column looks
                    empty for a reason the user cannot see from the outside;
                    say so, in one small line the same width as the pills, so
                    the field they typed into does not look broken. */}
                {filterReady && rows.length === 0 && !hero && (
                  <p className="px-1 py-2 text-[0.78rem] text-ink/60">
                    Nothing in the menu matches
                    {" \u201C"}
                    {query.trim()}
                    {"\u201D"}.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      <nav
        aria-label="Main menu"
        aria-hidden={keyboardOpen && !open ? "true" : undefined}
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
          // underneath cannot land on a control on the way down -- except
          // while the menu is open, where the software keyboard is up on
          // purpose because the search field beside the compass is what the
          // user is typing into. Hiding the bar then would hide the field.
          keyboardOpen && !open ? "translate-y-[130%]" : ""
        }`}
        style={{
          paddingBottom:
            "max(1rem, calc(env(safe-area-inset-bottom) + 0.4rem))",
        }}
      >
        <div className="mx-auto flex max-w-5xl items-end justify-between gap-3">
          {/* When the menu is closed the compass sits on its own as a plain
              disc. When the menu is open it becomes the left cap of a single
              stadium-shaped pill that also carries the search field, so the
              disc you pressed and the field you type into read as one
              surface rather than two controls sitting next to each other.
              The pill borrows the same face, edge and shadow the closed disc
              uses, so nothing about the compass changes shape when the pill
              grows around it -- only what is beside it. */}
          <div
            className={`pointer-events-auto relative flex items-center transition-[background-color,border-color,box-shadow,padding,gap] duration-200 ${
              open
                ? "h-14 flex-1 gap-1 rounded-full border border-[var(--disc-edge)] bg-[var(--disc-face)] pr-3 shadow-[var(--disc-shadow)]"
                : "h-14 w-14"
            }`}
          >
            <button
              type="button"
              onClick={() => {
                setOpen((v) => !v);
              }}
              aria-expanded={open}
              aria-label={open ? "Close the menu" : "Open the menu"}
              /* When the menu is closed the button paints its own disc --
                 face, edge and shadow from the skin. When the menu is open
                 the pill around it carries all three, so the button drops
                 them and becomes a bare, round hit target the same size --
                 no seam between the compass and its own container. */
              className={`relative inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full text-ink transition active:translate-y-px ${
                open
                  ? ""
                  : "border border-[var(--disc-edge)] bg-[var(--disc-face)] shadow-[var(--disc-shadow)] hover:border-[var(--line-strong)]"
              }`}
            >
              {/* Drawn to very nearly the width of the button, and the only
                  place in the app that wears the graduated bezel. The
                  button's own rim is the bezel's edge -- the mark supplies
                  the sixteen marks inside it and no second circle -- which
                  is what turns this from a logo in a circle into a dial.

                  The needle turns to point right while the menu is open and
                  back to north when it is shut -- a compass held still is a
                  logo, one that swings is a control, and the direction it
                  settles on says which of the two states you are in without
                  a second icon. The graduations stay put while it swings,
                  because a card that turned with the needle would leave
                  north sitting on the east mark. */}
              {/* The graduated bezel is drawn in both states, but it is
                  painted in the pill's own border color when the menu is
                  open, rather than in the ink color it uses closed. Closed,
                  the disc is an instrument and the ticks are the numbers on
                  it; open, the same ticks read as the pill's own rim
                  curving inward around the compass, so the shape stays one
                  pill rather than a disc sitting inside another shape. The
                  needle is held at the smaller compact size in both states,
                  so nothing about the compass jumps when the pill opens. */}
              <AlyeskaMark
                className="h-[52px] w-[52px] shrink-0"
                bezel
                compact
                bezelColor={open ? "var(--disc-edge)" : "currentColor"}
                turned={open}
                spinning={navFetching}
              />
              {/* The one number worth interrupting somebody for still shows
                on the closed control, because it lives on a screen the menu
                is hiding. Hidden while the menu is open -- the pill around
                the compass would put the badge on top of the search
                field. */}
              {attention > 0 && !isActive("/reminders") && !open && (
                <span className="absolute -right-0.5 -top-0.5 min-w-[1.15rem] rounded-full bg-rose px-1 text-[0.62rem] font-bold leading-[1.15rem] text-on-accent ring-2 ring-[var(--disc-face)]">
                  {attention}
                  <span className="sr-only"> reminders needing attention</span>
                </span>
              )}
            </button>
            {/* Inside the same pill as the compass while the menu is open --
                one surface, two parts of the same control. The field is
                aligned to the compass by vertical centring rather than a
                fixed height, so a taller pill (the compass is 56 px) still
                reads as one clean stadium. */}
            {open && (
              <>
                <SearchIcon className="h-4 w-4 shrink-0 text-ink/50" />
                <input
                  ref={queryInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    // Escape closes the menu from inside the field so a
                    // person whose hands are on the keyboard does not have
                    // to reach for the compass again.
                    if (e.key === "Escape") setOpen(false);
                  }}
                  placeholder="What would you like to do?"
                  aria-label="Filter the menu"
                  className="ml-1 min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink/50 focus:outline-none"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery("");
                      queryInputRef.current?.focus();
                    }}
                    aria-label="Clear the filter"
                    className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-ink/60 transition hover:bg-ink/5 hover:text-ink"
                  >
                    <CloseIcon className="h-3.5 w-3.5" />
                  </button>
                )}
              </>
            )}
          </div>
          {showAsk &&
            !open &&
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

// An open book: the record of where this family has been and where they are
// going. Not a suitcase -- that is one trip -- and not a calendar, which the
// itinerary already uses.
function JournalIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M10 5.4C8.6 4.3 6.7 3.8 4 3.9v10.4c2.7-.1 4.6.4 6 1.5 1.4-1.1 3.3-1.6 6-1.5V3.9c-2.7-.1-4.6.4-6 1.5Z" />
      <path d="M10 5.4v10.4" />
    </svg>
  );
}

// A board with a tick on it: the things that have to be packed and done. The
// tick is what separates it from the folder below.
function ChecklistIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="4.2" y="4" width="11.6" height="13" rx="2" />
      <path d="M7.6 4V3.2h4.8V4" />
      <path d="M7.6 10.2l1.7 1.7 3.4-3.6" />
    </svg>
  );
}

// The magnifier for the filter field at the bottom of the menu. Drawn in the
// same weight as the bar's other line icons so the field belongs to the same
// visual set as the discs on either side of it.
function SearchIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="8.6" cy="8.6" r="4.6" />
      <path d="m12.5 12.5 3.4 3.4" />
    </svg>
  );
}

// A small ex for the clear button on the filter field. The same weight and
// joins as everything else in the bar so the field's controls read as one set.
function CloseIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M5 5l10 10" />
      <path d="M15 5L5 15" />
    </svg>
  );
}

// A folder: what the family keeps between trips rather than for one of them.
function FolderIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M3 6.6c0-1 .8-1.8 1.8-1.8h2.6l1.6 1.9h5.2c1 0 1.8.8 1.8 1.8v5.1c0 1-.8 1.8-1.8 1.8H4.8c-1 0-1.8-.8-1.8-1.8V6.6Z" />
    </svg>
  );
}

// A pencil: a trip still being written.
function PencilIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M13.4 3.9l2.7 2.7-8.2 8.2-3.4.7.7-3.4 8.2-8.2Z" />
      <path d="M11.7 5.6l2.7 2.7" />
    </svg>
  );
}

// A clock with its hands set back: trips already taken.
function ClockIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="10" cy="10" r="6.8" />
      <path d="M10 6.2V10l2.8 1.7" />
    </svg>
  );
}

// A speech bubble with a line in it: what somebody said about a place. The Ask
// Aly bubble is filled and this one is not, and this one carries a rule, so the
// two do not read as the same control.
function ReviewIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M16.4 9.6c0 3-2.9 5.4-6.4 5.4-.8 0-1.6-.1-2.3-.4L4.3 16l1-2.8A5.1 5.1 0 0 1 3.6 9.6C3.6 6.6 6.5 4.2 10 4.2s6.4 2.4 6.4 5.4Z" />
      <path d="M7.4 9.6h5.2" />
    </svg>
  );
}

// The chevron on a group, which turns over when the group opens.
function ChevronIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M5.6 8.2 10 12.4l4.4-4.2" />
    </svg>
  );
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

// Three dots in a row: the convention for a drawer of things that did not
// fit into a named group. Used on the More row -- Settings, Our Pledge and
// Contact Us -- because none of those are travel and naming the group after
// any one of them would mis-lead the other two.
function DotsIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <circle cx="4.4" cy="10" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="10" cy="10" r="1.3" fill="currentColor" stroke="none" />
      <circle cx="15.6" cy="10" r="1.3" fill="currentColor" stroke="none" />
    </svg>
  );
}

// A shield: the shape of a promise -- what the app will not do. On Our Pledge.
function ShieldIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <path d="M10 3 4 5v4.4c0 3.6 2.5 6.4 6 7.3 3.5-.9 6-3.7 6-7.3V5l-6-2Z" />
    </svg>
  );
}

// An envelope: the way to reach a person on the other end. On Contact Us.
function MailIcon({ className }) {
  return (
    <svg {...iconProps(className)}>
      <rect x="3" y="5.4" width="14" height="9.2" rx="1.6" />
      <path d="M3.6 6.4 10 10.6l6.4-4.2" />
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
