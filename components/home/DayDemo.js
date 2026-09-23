"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import DayItemBrief from "@/components/DayItemBrief";
import WaysThere from "@/components/WaysThere";
import { CATEGORY_ICONS, STATUS_STYLES, formatDay, formatTime } from "@/lib/format";
import { PHASE_CLASS, PHASE_LABEL, minutesUntil, untilSaid } from "@/lib/day/phase";
import { dayWithoutNumbers, hedgeSaid } from "@/lib/weather/forecast";
import { distanceSaid } from "@/lib/travel/route";

/**
 * The While you are there scene, as the day view itself rather than a picture
 * of one.
 *
 * Everything below is invented: the family (Dani, Sam, Nana and Mia, the same
 * one the rest of the front door uses), the week in Kīhei, the times, the
 * forecasts, the distances and the confirmation number. No business is named.
 * The places are real places, described by what they are.
 *
 * The clock is stopped at 7:20 on Tuesday morning, March 17, so the screen
 * shows the day the conversation below it asks about ("What do we need to know
 * about tomorrow?", asked on Monday evening) and the one the rain nudge in the
 * hero interrupts later that morning. At 7:20 lunch is still at one; the nudge
 * at 11:10 is what moves it.
 *
 * It is drawn with the app's own parts wherever they are pure: the day tiles
 * and arrows use the itinerary's classes, and each item's lines (leave by, the
 * hour's forecast, getting there) come from DayItemBrief, the same component
 * the trip screen renders. The band above a day and the early forecast are
 * redrawn here because the real ones fetch and dispatch, and a public page has
 * nobody signed in to fetch for. They follow the same rules the real ones do:
 * per-item forecasts only today and tomorrow, a hedged day forecast two to
 * seven days out, and nothing for days already lived.
 *
 * What can be pressed here does something: the tiles and arrows change the
 * day, a finished item folds open, and the day pack ticks. Nothing leaves the
 * page.
 */

const TODAY = "2026-03-17";
const NOW_HM = "07:20";

const DAYS = [
  {
    date: "2026-03-14",
    stay: "Arriving today",
    items: [
      { id: "fl", category: "flight", start_time: "09:40", title: "Flight to Kahului", location: "OGG", status: "confirmed", stars: 4 },
      { id: "car", category: "transport", start_time: "10:30", title: "Rental car pickup", location: "Kahului Airport", status: "confirmed", stars: 3 },
      { id: "in", category: "lodging", start_time: "16:00", title: "Check in, the condo", location: "Kīhei", status: "confirmed", stars: 5 },
    ],
  },
  {
    date: "2026-03-15",
    items: [
      { id: "kb", category: "activity", start_time: "09:00", title: "Keawakapu Beach", location: "Kīhei", status: "planned", stars: 5 },
      { id: "si", category: "dining", start_time: "14:00", title: "Shave ice", location: "Kīhei", status: "planned", stars: 5 },
    ],
  },
  {
    date: "2026-03-16",
    items: [
      { id: "hana", category: "transport", start_time: "07:00", title: "Road to Hāna", location: "Hāna Highway", status: "planned", stars: 4 },
      { id: "fish", category: "dining", start_time: "18:30", title: "Dinner, fish counter by the harbor", location: "Kīhei", status: "planned", stars: 5 },
    ],
  },
  {
    date: "2026-03-17",
    weather: { glyph: "🌦️", high: 84, low: 71, said: "Showers in the afternoon", rainChance: 40 },
    // Traffic on a weekday morning, which is why it is 15 minutes here and
    // the 12 the conversation quoted the evening before.
    nextLeg: {
      meters: 13500,
      options: [
        { mode: "drive", minutes: 15, source: "traffic" },
      ],
    },
    pack: [
      "Sunscreen",
      "Mia’s light jacket",
      "Photo ID",
      "Cash for the balance",
      "Dani’s motion sickness tablets",
      "Water",
      "Snacks",
    ],
    aly: "The boat’s confirmation asks for cash and photo ID. Check that both are packed before you head out.",
    items: [
      {
        id: "snork",
        category: "excursion",
        start_time: "08:20",
        title: "Snorkel, Mākena",
        location: "Mākena Landing",
        confirmation_number: "MKN4‑8821",
        status: "confirmed",
        phase: "next",
        open: true,
        leg: { minutes: 15, meters: 13500, source: "traffic" },
        insight: {
          arrive_minutes: 30,
          arrive_why: "Check-in closes at 7:50, half an hour before the boat.",
          bring: "Photo ID and cash for the balance.",
        },
        hour: { hm: "08:00", temp: 78, said: "Sunny", glyph: "☀️", rainChance: 10, wind: 12 },
      },
      {
        id: "lunch",
        category: "dining",
        start_time: "13:00",
        title: "Lunch, back at the condo",
        location: "Kīhei",
        status: "planned",
        phase: "later",
        leg: { minutes: 15, meters: 13500, source: "route" },
        hour: { hm: "13:00", temp: 82, said: "Passing showers", glyph: "🌦️", rainChance: 40, wind: 14 },
      },
      {
        id: "sun",
        category: "activity",
        start_time: "18:40",
        title: "Sunset walk from the door",
        location: "Kīhei",
        status: "planned",
        phase: "later",
        leg: { minutes: 4, meters: 300, walkable: true, source: "route" },
        insight: { arrive_minutes: 10, arrive_why: "Sunset is at 6:50. This puts you on the sand for the last of the light." },
        hour: { hm: "19:00", temp: 76, said: "Partly cloudy", glyph: "⛅", rainChance: 20, wind: 11 },
      },
    ],
  },
  {
    date: "2026-03-18",
    weather: { glyph: "⛅", high: 83, low: 70, said: "Partly cloudy", rainChance: 20 },
    nextLeg: {
      meters: 59500,
      options: [{ mode: "drive", minutes: 85, source: "route" }],
    },
    pack: ["Fleece for everyone", "Long pants", "Sunscreen", "Water", "Snacks"],
    items: [
      {
        id: "hal",
        category: "excursion",
        start_time: "10:30",
        title: "Haleakalā summit",
        location: "Haleakalā National Park",
        status: "planned",
        phase: "future",
        open: true,
        leg: { minutes: 85, meters: 59500, source: "route" },
        insight: {
          arrive_minutes: 15,
          arrive_why: "Time to park and walk up to the lookout.",
          dress_code: "Layers and long pants. The summit runs about 30 degrees colder than the condo.",
        },
        hour: { hm: "11:00", temp: 52, feels: 44, said: "Clear", glyph: "☀️", rainChance: 0, wind: 26 },
      },
      {
        id: "paia",
        category: "dining",
        start_time: "17:30",
        title: "Dinner in Pāʻia",
        location: "Pāʻia",
        status: "planned",
        phase: "future",
        leg: { minutes: 60, meters: 58000, source: "route" },
        hour: { hm: "17:00", temp: 79, said: "Mostly clear", glyph: "🌤️", rainChance: 10, wind: 13 },
      },
    ],
  },
  {
    date: "2026-03-19",
    early: { glyph: "☀️", high: 85, low: 71, said: "Sunny", rainChance: 10 },
    items: [
      { id: "wai", category: "activity", start_time: "09:00", title: "Beach morning, Wailea", location: "Wailea", status: "planned" },
      { id: "luau", category: "dining", start_time: "17:30", title: "Lūʻau", location: "Kāʻanapali", status: "confirmed" },
    ],
  },
  {
    date: "2026-03-20",
    early: { glyph: "🌦️", high: 82, low: 70, said: "Showers", rainChance: 50 },
    items: [
      { id: "whale", category: "excursion", start_time: "09:00", title: "Whale watch, Māʻalaea", location: "Māʻalaea Harbor", status: "needs_booking" },
    ],
  },
  {
    date: "2026-03-21",
    stay: "Leaving today",
    early: { glyph: "☀️", high: 84, low: 70, said: "Sunny", rainChance: 10 },
    items: [
      { id: "out", category: "lodging", start_time: "10:00", title: "Check out, the condo", location: "Kīhei", status: "confirmed" },
      { id: "home", category: "flight", start_time: "14:15", title: "Flight home", location: "OGG", status: "confirmed" },
    ],
  },
];

const TODAY_INDEX = DAYS.findIndex((d) => d.date === TODAY);
const DAY_MS = 86400000;

function daysFrom(a, b) {
  return Math.round((Date.parse(`${b}T12:00:00Z`) - Date.parse(`${a}T12:00:00Z`)) / DAY_MS);
}

function tileDate(key) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function FoldChevron({ open }) {
  return (
    <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center text-ink-faint">
      <svg
        viewBox="0 0 16 16"
        fill="none"
        className={`size-3.5 transition-transform duration-150 ${open ? "rotate-90" : ""}`}
      >
        <path
          d="M6 3.5 10.5 8 6 12.5"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </span>
  );
}

function Stars({ n }) {
  return (
    <span className="tabular shrink-0 text-xs leading-none" aria-label={`Rated ${n} out of 5`}>
      <span className="text-amber" aria-hidden="true">{"★".repeat(n)}</span>
      <span className="text-sand-deep" aria-hidden="true">{"★".repeat(5 - n)}</span>
    </span>
  );
}

/** The day's forecast line, numbers first, the way the band prints it. */
function Sky({ weather }) {
  const rest = dayWithoutNumbers(weather);
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink-soft">
      <span aria-hidden="true" className="text-lg leading-none">{weather.glyph}</span>
      <span className="tabular font-semibold text-ink">
        {weather.high}&deg; / {weather.low}&deg;
      </span>
      {rest && <span>{rest}</span>}
    </p>
  );
}

/** The band above today and tomorrow. */
function Band({ day, isToday }) {
  const next = day.items.find((i) => i.phase === "next") || day.items[0];
  const until = isToday
    ? untilSaid(minutesUntil(next, { nowHM: NOW_HM }), formatTime(next.start_time))
    : null;
  return (
    <section className="mb-3 rounded-2xl border border-teal/25 bg-teal/[0.04] px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-teal">
          {isToday ? "Today" : "Tomorrow"}
        </p>
        <Sky weather={day.weather} />
      </div>
      {until && (
        <p className="mt-1.5 text-sm text-ink">
          <span className="font-semibold">{next.title}</span> {until}
        </p>
      )}
      {day.nextLeg && (
        <WaysThere
          options={day.nextLeg.options}
          title={isToday ? "From your current location" : `To ${next.title}, from the condo`}
          distance={distanceSaid(day.nextLeg)}
        />
      )}
    </section>
  );
}

function Early({ weather, daysOut }) {
  const rest = dayWithoutNumbers(weather);
  return (
    <p className="mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-2xl border border-dashed border-[var(--line)] bg-sand/50 px-4 py-2 text-sm text-ink-soft">
      <span aria-hidden="true" className="text-lg leading-none">{weather.glyph}</span>
      <span className="tabular font-semibold text-ink">
        {weather.high}&deg; / {weather.low}&deg;
      </span>
      {rest && <span>{rest}</span>}
      <span className="text-ink-faint">{hedgeSaid(daysOut)}</span>
    </p>
  );
}

function ItemCard({ item, phase, withBrief, onFold }) {
  const status = STATUS_STYLES[item.status] || STATUS_STYLES.planned;
  return (
    <article
      className={`card p-3.5 ${PHASE_CLASS[phase] || ""}`}
      aria-current={phase === "next" ? "true" : undefined}
    >
      <div className="flex items-start gap-3">
        {onFold && (
          <button
            type="button"
            onClick={onFold}
            aria-expanded="true"
            aria-label="Fold this back to one line"
            className="-my-1 -ml-1 grid size-7 shrink-0 place-items-center rounded-lg hover:bg-sand/60"
          >
            <FoldChevron open />
          </button>
        )}
        <span className="text-xl leading-none" aria-hidden="true">
          {CATEGORY_ICONS[item.category]}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular text-sm font-semibold tracking-[0.01em] text-teal">
              {formatTime(item.start_time)}
            </span>
            <h4 className="font-semibold leading-snug">{item.title}</h4>
            <span className={`chip ${status.cls}`}>{status.label}</span>
            {PHASE_LABEL[phase] && (
              <span
                className={`chip ${
                  phase === "next"
                    ? "border-teal/40 bg-teal/10 text-teal"
                    : "border-[var(--line)] text-ink-faint"
                }`}
              >
                {PHASE_LABEL[phase]}
              </span>
            )}
          </div>
          {item.location && <p className="mt-0.5 text-sm text-ink-soft">{item.location}</p>}
          {item.confirmation_number && (
            <p className="mt-1 font-mono text-xs text-ink-soft">Conf: {item.confirmation_number}</p>
          )}
          {withBrief && (
            <DayItemBrief
              item={item}
              insight={item.insight || null}
              leg={item.leg || null}
              hour={item.hour || null}
              nowHM={phase === "next" ? NOW_HM : null}
              isNext={phase === "next"}
            />
          )}
        </div>
      </div>
    </article>
  );
}

function DoneRow({ item, onOpen }) {
  return (
    <div className="rounded-[0.875rem] border border-[var(--line)] bg-sand/40">
      <button
        type="button"
        onClick={onOpen}
        aria-expanded="false"
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2 text-left text-sm text-ink-soft hover:text-ink"
      >
        <FoldChevron open={false} />
        <span aria-hidden="true" className="opacity-60">{CATEGORY_ICONS[item.category]}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate">{item.title}</span>
          <span className="tabular flex items-center gap-1.5 text-xs">
            <span className="font-semibold tracking-[0.01em]">{formatTime(item.start_time)}</span>
            {item.stars ? <Stars n={item.stars} /> : null}
          </span>
        </span>
      </button>
    </div>
  );
}

/**
 * A later item, shut to one line that still says the two things worth knowing
 * before it is opened: the weather at that hour and how far it is.
 */
function LaterRow({ item, onOpen }) {
  const leg = item.leg;
  const travel = leg?.minutes
    ? `${leg.minutes} min ${leg.walkable ? "walk" : "drive"}`
    : null;
  return (
    <div className="card">
      <button
        type="button"
        onClick={onOpen}
        aria-expanded="false"
        className="flex w-full min-w-0 items-center gap-2 px-3 py-2.5 text-left text-sm"
      >
        <FoldChevron open={false} />
        <span aria-hidden="true">{CATEGORY_ICONS[item.category]}</span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-semibold">{item.title}</span>
          <span className="tabular block truncate text-xs text-ink-soft">
            <span className="font-semibold tracking-[0.01em] text-teal">
              {formatTime(item.start_time)}
            </span>
            {item.hour ? (
              <>
                {" · "}
                <span aria-hidden="true">{item.hour.glyph} </span>
                {item.hour.temp}&deg;
              </>
            ) : null}
            {travel ? ` · ${travel}` : ""}
          </span>
        </span>
      </button>
    </div>
  );
}

/**
 * The day's bag, shut until asked for, the way the day screen draws it: the
 * band says how much is left, and opening it is the list you tick at the door.
 */
function Pack({ day }) {
  const [open, setOpen] = useState(false);
  const [ticked, setTicked] = useState(() => new Set());
  const toggle = (line) =>
    setTicked((was) => {
      const next = new Set(was);
      if (next.has(line)) next.delete(line);
      else next.add(line);
      return next;
    });
  const left = day.pack.length - ticked.size;
  return (
    <div className="mt-3 rounded-[0.875rem] border border-teal/25 bg-teal/[0.04]">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <FoldChevron open={open} />
        <span aria-hidden="true">🎒</span>
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-ink">
          Day pack
        </span>
        <span className="tabular shrink-0 text-xs text-ink-soft">
          {left === 0 ? "All packed" : `${left} left`}
        </span>
      </button>
      {open && (
        <ul className="grid gap-x-4 gap-y-1.5 px-3 pb-3 sm:grid-cols-2">
          {day.pack.map((line) => (
            <li key={line}>
              <label className="flex cursor-pointer items-start gap-2.5">
                <input
                  type="checkbox"
                  checked={ticked.has(line)}
                  onChange={() => toggle(line)}
                  className="mt-0.5 size-4 shrink-0 accent-teal"
                />
                <span className={`text-sm ${ticked.has(line) ? "strike-done" : ""}`}>{line}</span>
              </label>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DayPanel({ day, index, active }) {
  const [opened, setOpened] = useState(
    () => new Set(day.items.filter((it) => it.open).map((it) => it.id)),
  );
  const offset = daysFrom(TODAY, day.date);
  const past = offset < 0;
  const isToday = offset === 0;
  const lived = isToday || offset === 1;

  const flip = (id) =>
    setOpened((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <div
      role="tabpanel"
      aria-hidden={active ? undefined : "true"}
      inert={active ? undefined : true}
      className={`[grid-area:1/1] ${active ? "" : "invisible"}`}
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-soft">
          {formatDay(day.date)}
        </h3>
        <span className="text-xs text-ink-faint">
          Day {index + 1} of {DAYS.length}
        </span>
      </div>

      <p className="mb-2.5 text-xs text-ink-soft">
        <span aria-hidden="true">{CATEGORY_ICONS.lodging} </span>
        {day.stay ? `${day.stay} · ` : ""}
        Staying at the condo, Kīhei
      </p>

      {lived && day.weather && <Band day={day} isToday={isToday} />}
      {day.early && <Early weather={day.early} daysOut={offset} />}

      <div className="space-y-2">
        {day.items.map((item) => {
          if (past && !opened.has(item.id)) {
            return <DoneRow key={item.id} item={item} onOpen={() => flip(item.id)} />;
          }
          if (lived && !opened.has(item.id)) {
            return <LaterRow key={item.id} item={item} onOpen={() => flip(item.id)} />;
          }
          const phase = past ? "past" : item.phase || "future";
          return (
            <ItemCard
              key={item.id}
              item={item}
              phase={phase}
              withBrief={lived}
              onFold={past || (lived && !item.open) ? () => flip(item.id) : null}
            />
          );
        })}
      </div>

      {day.pack && <Pack day={day} />}

      {day.aly && (
        <p className="mt-3 rounded-[10px] bg-sand p-3 text-[13px] leading-relaxed">
          <span className="font-semibold">Aly:</span> {day.aly}
        </p>
      )}
    </div>
  );
}

export default function DayDemo() {
  const [index, setIndex] = useState(TODAY_INDEX);
  const [overflowing, setOverflowing] = useState(false);
  const rail = useRef(null);
  const touch = useRef(null);

  const step = useCallback(
    (by) => setIndex((i) => Math.max(0, Math.min(DAYS.length - 1, i + by))),
    [],
  );

  // Arrows only when the rail does not fit, the way the trip screen does it.
  useEffect(() => {
    const el = rail.current;
    if (!el) return undefined;
    const measure = () => setOverflowing(el.scrollWidth > el.clientWidth + 1);
    measure();
    const seen = new ResizeObserver(measure);
    seen.observe(el);
    return () => seen.disconnect();
  }, []);

  // The chosen day centered inside the rail by moving the rail itself, never
  // scrollIntoView, which would drag the whole page sideways and down.
  useEffect(() => {
    const el = rail.current;
    const tile = el?.querySelector('[data-active="true"]');
    if (!el || !tile) return;
    // Measured against the rail itself, not offsetLeft, whose offsetParent is
    // whatever positioned box the landing page happens to wrap this in.
    const tr = tile.getBoundingClientRect();
    const er = el.getBoundingClientRect();
    const left = el.scrollLeft + (tr.left - er.left) - (el.clientWidth - tr.width) / 2;
    const max = el.scrollWidth - el.clientWidth;
    el.scrollLeft = Math.max(0, Math.min(left, max));
  }, [index, overflowing]);

  return (
    <div className="ma-in card p-4 sm:p-5" style={{ animationDelay: "80ms" }}>
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
        <p className="text-xs font-semibold uppercase tracking-[0.1em] text-ink-faint">
          An example trip
        </p>
        <p className="text-[13px] text-ink-soft">Maui &middot; Tuesday, 7:20 am</p>
      </div>

      <div className="mb-4 flex items-center gap-2">
        {overflowing && (
          <button
            type="button"
            onClick={() => step(-1)}
            disabled={index <= 0}
            aria-label="Previous day"
            className="day-arrow"
          >
            ‹
          </button>
        )}
        <div
          ref={rail}
          role="tablist"
          aria-label="Days of this trip"
          onKeyDown={(e) => {
            if (e.key === "ArrowRight") {
              e.preventDefault();
              step(1);
            }
            if (e.key === "ArrowLeft") {
              e.preventDefault();
              step(-1);
            }
          }}
          className="flex min-w-0 flex-1 gap-2 overflow-x-auto pb-1 sm:gap-1.5"
        >
          {DAYS.map((day, i) => {
            const active = i === index;
            const date = tileDate(day.date);
            const count = day.items.length;
            return (
              <button
                key={day.date}
                type="button"
                role="tab"
                aria-selected={active}
                tabIndex={active ? 0 : -1}
                data-active={active}
                onClick={() => setIndex(i)}
                className={`day-tile ${active ? "day-tile-on" : ""}`}
              >
                <span className="day-tile-top">
                  {date.toLocaleDateString("en-US", { weekday: "short" })}
                </span>
                <span className="day-tile-num">{date.getDate()}</span>
                <span className="day-tile-foot">
                  {date.toLocaleDateString("en-US", { month: "short" })}
                </span>
                <span className="day-tile-dots" aria-hidden="true">
                  {Array.from({ length: Math.min(count, 4) }).map((_, d) => (
                    <span key={d} className="day-tile-dot" />
                  ))}
                </span>
                <span className="sr-only">
                  Day {i + 1}, {count} {count === 1 ? "item" : "items"}
                  {i === TODAY_INDEX ? ", today" : ""}
                </span>
                {i === TODAY_INDEX && <span className="day-tile-today" aria-hidden="true" />}
              </button>
            );
          })}
        </div>
        {overflowing && (
          <button
            type="button"
            onClick={() => step(1)}
            disabled={index >= DAYS.length - 1}
            aria-label="Next day"
            className="day-arrow"
          >
            ›
          </button>
        )}
      </div>

      {/* Every day in one grid cell, so the card is as tall as the longest day
          and the headline beside it does not move when a tile is pressed. A
          sideways swipe changes the day, as it does on the trip screen. */}
      <div
        className="grid grid-cols-[minmax(0,1fr)]"
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          const dx = t.clientX - start.x;
          const dy = t.clientY - start.y;
          if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
        }}
        onTouchCancel={() => {
          touch.current = null;
        }}
      >
        {DAYS.map((day, i) => (
          <DayPanel key={day.date} day={day} index={i} active={i === index} />
        ))}
      </div>
    </div>
  );
}
