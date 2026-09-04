"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTime, parseDate } from "@/lib/format";

/**
 * Moving one thing by pressing it and sliding it: up and down for a new time,
 * left and right for a different day.
 *
 * The typed fields are not going anywhere -- they are still the only way to say
 * "quarter past six" without arithmetic, and the only way any of this works with a
 * keyboard or a screen reader. But the two commonest edits on a trip that is
 * actually happening are not "set this to a date and a time", they are "this is
 * running late, push it" and "this is not today, it is tomorrow". Doing either one
 * today costs six taps: open the card, press Edit, find the field, spin it, save,
 * wait. So: press and hold the card, slide, let go.
 *
 * Why the deliberate press. A card that moved on any touch would move every time
 * somebody scrolled the day or flicked to the next one, and a wrong time saves
 * silently. A third of a second of stillness is long enough that the browser has
 * not begun a scroll -- a scroll starts on movement -- and short enough not to feel
 * like a puzzle. Any movement before the timer fires cancels it and the touch goes
 * back to being a scroll or a day swipe.
 *
 * Why one axis at a time. The first version of the day move let a single drag
 * change both the day and the time, on the theory that "tomorrow at nine" is one
 * thought. In the hand it was one gesture doing two things it was easy to do by
 * accident: a thumb travelling four days sideways is never perfectly level, so it
 * quietly moved the excursion twenty minutes as well. So the axis locks. The first
 * dozen pixels after the lift decide whether this drag is about the clock or about
 * the calendar, and the drag then only offers the one it chose. Two edits are two
 * gestures, which is also two chances to let go and change nothing.
 *
 * Why pointer events and no library. Every drag-and-drop library on npm is built
 * for reordering a list: it wants to reflow the list under the finger and hand back
 * an index. This is not a reorder. Vertically the list is a clock and the answer is
 * a time; horizontally the answer is a date, and the day it belongs to is not even
 * on screen. Nothing around the card moves while the finger is down; the day
 * re-sorts once, on release. Pointer events give the whole gesture -- mouse, touch
 * and pen -- in one set of handlers, plus setPointerCapture, which is what keeps
 * the drag alive when the finger leaves the card it started on.
 *
 * Both steps are fixed distances rather than a mapping onto the page's own layout:
 * 44 pixels is fifteen minutes and 64 pixels is one day, on every card. A rail of
 * ticks says so while a time drag is live, the day rail at the top of the screen
 * lights the tile being aimed at while a day drag is live, and either way the thing
 * about to be saved is drawn large next to the finger, because the one thing that
 * must never be a surprise is what is about to be saved.
 */

// A thumb's comfortable travel for one step, and what one step is worth.
const PX_PER_STEP = 44;
const STEP_MIN = 15;
// Sideways is a coarser gesture than up and down, and its steps are whole days
// rather than quarter hours, so each one is worth more travel.
const PX_PER_DAY = 64;
// Stillness before the card lifts.
const HOLD_MS = 330;
// A finger that moves this far before the timer fires was scrolling or swiping.
const SLOP_PX = 8;
// And this far after the lift is enough to say which axis it meant.
const AXIS_PX = 12;
const DAY_MAX = 23 * 60 + 45;

function minutesOf(hm) {
  const m = /^(\d{1,2}):(\d{2})/.exec(String(hm || ""));
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

function hmOf(mins) {
  const v = Math.max(0, Math.min(DAY_MAX, mins));
  return `${String(Math.floor(v / 60)).padStart(2, "0")}:${String(v % 60).padStart(2, "0")}`;
}

function shortDay(iso) {
  const d = parseDate(iso);
  if (!d) return "No date";
  return d.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

function buzz(ms) {
  try {
    if (navigator.vibrate) navigator.vibrate(ms);
  } catch {
    // A phone that will not buzz is not a reason to abandon the drag.
  }
}

export default function ItemDrag({
  startTime,
  // The trip's days in order, and which one this card is sitting on. Absent or
  // one day long means there is nowhere sideways to go, and the drag is a time
  // drag only.
  dayKeys = [],
  dayKey = null,
  disabled = false,
  onCommit,
  // Told the day being aimed at so the rail at the top of the screen can light
  // the tile. Sideways is the one axis whose target is off the card, and often
  // off the bottom of a long day as well, so the badge by the thumb cannot be
  // the only place it is said.
  onAim,
  children,
}) {
  const base = minutesOf(startTime);
  const dayFrom = dayKeys.indexOf(dayKey);
  const canDay = dayFrom >= 0 && dayKeys.length > 1;
  const holdRef = useRef(null);
  const downRef = useRef(null);
  const boxRef = useRef(null);
  // One object rather than five states: every frame of a drag changes all of
  // them together, and a partially applied drag draws a card at the old offset
  // with the new time beside it.
  const [drag, setDrag] = useState(null);
  const [saving, setSaving] = useState(false);
  // The same fact as `drag`, kept where a native event listener can read it.
  // React state is a closure; the listener below is attached once and would
  // otherwise be reading whatever `drag` was when it was attached.
  const liftedRef = useRef(false);
  liftedRef.current = Boolean(drag);
  // And the last day handed upwards, so it can be taken back on release
  // without making the aim callback part of the render path.
  const aimedRef = useRef(null);

  const aim = useCallback(
    (key) => {
      if (aimedRef.current === key) return;
      aimedRef.current = key;
      if (onAim) onAim(key);
    },
    [onAim],
  );

  // Why this exists, and why the obvious version did not work.
  //
  // React attaches touchmove at the document root as a *passive* listener, and a
  // passive listener is one that has promised not to cancel the event. So
  // e.preventDefault() inside onPointerMove is silently ignored, and the browser
  // goes on doing what it had already decided to do with the touch: scroll the
  // page, or hand the day panel a swipe. The card lifted, the rail drew, and then
  // the finger scrolled the day out from under it and the browser sent
  // pointercancel, which took the rail away. Setting touch-action while a touch is
  // already in flight does not help either -- that property is read once, when the
  // finger lands.
  //
  // The fix is a listener this component attaches itself, non-passive, on its
  // own element. Because the lift needs a third of a second of stillness, no
  // scroll has begun by the time it fires, and a touchmove cancelled before the
  // scroll starts is a scroll that never starts. It matters twice over now that
  // the gesture goes sideways as well: the day panel turns a horizontal flick
  // into "next day", and a lifted card must not be flicking the day it is
  // standing on out from under itself.
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const stop = (e) => {
      if (liftedRef.current && e.cancelable) e.preventDefault();
    };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  }, []);

  const clearHold = useCallback(() => {
    if (holdRef.current) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
    }
  }, []);

  useEffect(() => clearHold, [clearHold]);
  // A card that unmounts mid-drag -- the day re-sorted, the trip reloaded --
  // must not leave a tile lit up on the rail above it.
  useEffect(() => () => aim(null), [aim]);

  const off = base === null || disabled || saving;

  function onPointerDown(e) {
    if (off) return;
    // A right-click, or a second finger arriving mid-pinch, is not a press.
    if (e.pointerType === "mouse" && e.button !== 0) return;
    // Anything the card offers on its own -- Edit, Delete, a status pill, a
    // link, a star -- keeps its tap. The gesture belongs to the empty parts of
    // the card, which is where a thumb lands when the intent is "move this".
    if (e.target.closest("button, a, input, textarea, select, label")) return;
    const { clientX, clientY, pointerId } = e;
    downRef.current = { x: clientX, y: clientY, pointerId };
    clearHold();
    holdRef.current = setTimeout(() => {
      holdRef.current = null;
      const el = boxRef.current;
      if (!el || !downRef.current) return;
      try {
        el.setPointerCapture(downRef.current.pointerId);
      } catch {
        // Capture is a convenience; the drag still tracks without it.
      }
      buzz(12);
      // Belt as well as braces: some platforms do honour a mid-gesture change,
      // and every one of them honours it for the next touch on this card.
      el.style.touchAction = "none";
      // Where in the card the thumb actually landed, so the thing being aimed
      // at can be drawn beside the thumb rather than over the title. On a
      // six-line hotel card those are 120px apart, and the one thing that must
      // not be covered is the name of the thing being moved.
      const rect = el.getBoundingClientRect();
      setDrag({
        // Which axis this drag turned out to be about. Undecided until the
        // finger has travelled far enough to mean it.
        axis: null,
        dx: 0,
        dy: 0,
        mins: base,
        dayAt: dayFrom,
        grabY: Math.round(downRef.current.y - rect.top),
        // And how far in from the card's left edge, which is where the calendar
        // axis has to hang its first day from: the day the card is on sits
        // under the thumb that picked it up, not in the middle of the card.
        grabX: Math.round(downRef.current.x - rect.left),
      });
    }, HOLD_MS);
  }

  function onPointerMove(e) {
    const down = downRef.current;
    if (!down) return;
    const dy = e.clientY - down.y;
    const dx = e.clientX - down.x;
    if (!drag) {
      // Still waiting on the timer. Movement means this was a scroll or a
      // flick to another day, and both belong to the page, not to this card.
      if (Math.abs(dy) > SLOP_PX || Math.abs(dx) > SLOP_PX) {
        clearHold();
        downRef.current = null;
      }
      return;
    }
    e.preventDefault();
    setDrag((d) => {
      if (!d) return d;
      let axis = d.axis;
      if (!axis) {
        const far = Math.max(Math.abs(dx), Math.abs(dy));
        if (far < AXIS_PX) return { ...d, dx, dy };
        // Sideways only counts as sideways when there is somewhere to go.
        axis = Math.abs(dx) > Math.abs(dy) && canDay ? "day" : "time";
      }
      if (axis === "day") {
        const steps = Math.round(dx / PX_PER_DAY);
        const dayAt = Math.max(
          0,
          Math.min(dayKeys.length - 1, dayFrom + steps),
        );
        if (dayAt !== d.dayAt) {
          buzz(6);
          aim(dayKeys[dayAt]);
        }
        return { ...d, axis, dx, dy, dayAt };
      }
      const steps = Math.round(dy / PX_PER_STEP);
      const mins = Math.max(0, Math.min(DAY_MAX, base + steps * STEP_MIN));
      return { ...d, axis, dx, dy, mins };
    });
  }

  function unlock() {
    if (boxRef.current) boxRef.current.style.touchAction = "";
  }

  async function onPointerUp() {
    clearHold();
    const live = drag;
    downRef.current = null;
    setDrag(null);
    unlock();
    aim(null);
    if (!live) return;
    // Nothing to save if the finger came back to where it started, and nothing
    // to save if it never picked an axis -- a hold and a release is a hold and
    // a release.
    const next =
      live.axis === "day"
        ? live.dayAt !== dayFrom
          ? { date: dayKeys[live.dayAt] }
          : null
        : live.axis === "time" && live.mins !== base
          ? { time: hmOf(live.mins) }
          : null;
    if (!next) return;
    setSaving(true);
    await onCommit(next);
    setSaving(false);
  }

  function onPointerCancel() {
    clearHold();
    downRef.current = null;
    setDrag(null);
    unlock();
    aim(null);
  }

  const lifted = Boolean(drag);
  const onDay = lifted && drag.axis === "day";
  const onTime = lifted && drag.axis === "time";
  const moved = onTime && drag.mins !== base;

  return (
    <div
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      className={off ? undefined : "relative select-none"}
    >
      {onTime && <Rail base={base} mins={drag.mins} top={drag.grabY} />}
      {onDay && (
        <DayRail
          dayKeys={dayKeys}
          from={dayFrom}
          at={drag.dayAt}
          left={drag.grabX}
        />
      )}
      <div
        style={
          lifted
            ? {
                // Before the axis is decided the card follows the finger both
                // ways, because it does not yet know which way this is going;
                // after, it only moves along the axis it is answering, which is
                // most of what tells the hand the choice has been made.
                transform: `translate(${onTime ? 0 : drag.dx}px, ${
                  onDay ? 0 : drag.dy
                }px) scale(1.015)`,
                // No transition on the offset: it has to sit exactly where the
                // finger is, and 150ms of easing on a drag reads as lag.
                transition: "box-shadow 150ms, opacity 150ms",
                boxShadow: "0 12px 28px rgba(0,0,0,0.18)",
                position: "relative",
                zIndex: 30,
              }
            : undefined
        }
      >
        {children}
      </div>
      {/* The readout by the thumb. Not during a day drag: the axis above the
          card is already saying the date, in the same teal, larger, and with the
          days either side of it for company -- a badge repeating it would only be
          covering up the card being moved. */}
      {lifted && !onDay && (
        <div
          aria-live="polite"
          style={{
            transform: `translate(${onTime ? 0 : drag.dx}px, ${drag.dy}px)`,
            top: `${(drag.grabY || 0) - 16}px`,
          }}
          className="pointer-events-none absolute right-2 z-50 rounded-lg bg-ink px-2.5 py-1 text-white shadow-lg"
        >
          <span className="tabular text-base font-semibold tracking-[0.01em]">
            {formatTime(hmOf(drag.mins))}
          </span>
          {moved && (
            <span className="ml-1.5 text-[0.7rem] opacity-70">
              {drag.mins > base ? "later" : "earlier"}
            </span>
          )}
          {/* Before the axis is chosen, the badge says what the two directions
              are for rather than pretending to be one of them. */}
          {!drag.axis && canDay && (
            <span className="ml-1.5 text-[0.7rem] opacity-70">
              or slide across for another day
            </span>
          )}
        </div>
      )}
      {/* The axis is drawn, so it is invisible to a screen reader, and the badge
          that used to carry the live announcement is gone on this axis. Said here
          instead, in words, as the day changes. */}
      {onDay && (
        <p aria-live="polite" className="sr-only">
          {shortDay(dayKeys[drag.dayAt])}
        </p>
      )}
      {saving && (
        <p className="tabular mt-1 text-xs font-semibold text-teal">
          Moving it…
        </p>
      )}
    </div>
  );
}

/**
 * The ticks, drawn only while a card is being moved through the clock.
 *
 * Fifteen minutes is 44 pixels whether the card is a two-line flight or a
 * six-line hotel, so the rail is the only thing on screen that says how far a
 * given distance is worth. It is drawn on its own small panel rather than as
 * loose marks: an hour of ticks is four hundred pixels tall, which without a
 * backing reads as stray times printed over whatever cards happen to be above
 * and below.
 *
 * Centred on the thumb, and an hour and a quarter either way -- far enough for
 * "we are running late", and not so far that the panel becomes a second clock
 * competing with the day.
 */
function Rail({ base, mins, top = 0 }) {
  const REACH = 5;
  const half = REACH * PX_PER_STEP;
  const steps = [];
  for (let s = -REACH; s <= REACH; s++) {
    const at = base + s * STEP_MIN;
    if (at < 0 || at > DAY_MAX) continue;
    steps.push({ at, y: (s + REACH) * PX_PER_STEP, onHour: at % 60 === 0 });
  }
  return (
    <div
      aria-hidden="true"
      style={{ top: `${top - half - 10}px`, height: `${2 * half + 20}px` }}
      // Above the lifted card, not beneath it. The card is the full width of
      // the day, so a rail drawn behind it shows only the two or three ticks
      // that happen to fall in the gaps between cards -- which is worse than no
      // rail, because it looks like the ticks are missing.
      className="pointer-events-none absolute -left-1 z-[45] w-14 rounded-lg bg-white shadow-md ring-1 ring-[var(--line)]"
    >
      {steps.map((s) => (
        <div
          key={s.at}
          style={{ top: `${s.y + 10}px` }}
          className="absolute left-0 flex h-0 w-full items-center gap-1"
        >
          <span
            className={
              s.at === mins
                ? "block h-0.5 w-3 rounded-r bg-teal"
                : s.onHour
                  ? "block h-px w-2.5 rounded-r bg-ink/30"
                  : "block h-px w-1.5 rounded-r bg-ink/15"
            }
          />
          {(s.onHour || s.at === mins) && (
            <span
              className={`tabular text-[0.6rem] font-semibold leading-none ${
                s.at === mins ? "text-teal" : "text-ink-faint"
              }`}
            >
              {formatTime(hmOf(s.at))}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

/**
 * The calendar, drawn only while a card is being moved through the days.
 *
 * The vertical drag has had its rail of quarter hours since the day it shipped,
 * and the sideways drag went out without the equivalent: it named the day it was
 * aiming at in the badge by the thumb and lit a tile up at the top of the
 * screen, and both of those tell you where you have got to without telling you
 * where anything else is. A day is 64 pixels; the only way to know that is to be
 * shown it.
 *
 * So: an axis above the card, one tick per day of the trip, hung off the point
 * the thumb picked the card up from -- the day the card is already on sits
 * exactly under the finger, and every other day of the trip is a measured
 * distance either side of it. The dates are the trip's own days, so a trip that
 * ends on the ninth simply stops there rather than offering a tenth that would
 * be refused.
 *
 * The panel is only as wide as the card, which on a phone holds a little under
 * three days either side of the thumb, so a long trip does not fit. Rather than
 * shrink the day steps to make it fit -- which would make the axis lie about the
 * distance the finger has to travel -- it pans: the ticks keep their 64 pixels
 * and the whole calendar slides along under the panel to keep the day being
 * aimed at in view, the way a filmstrip does. Until the aimed day reaches the
 * edge, nothing pans at all and the day the card came from stays put under the
 * thumb, which is the thing worth anchoring.
 */
function DayRail({ dayKeys, from, at, left }) {
  const boxRef = useRef(null);
  const [w, setW] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (el) setW(el.clientWidth);
  }, []);

  // Where the aimed tick would fall with no panning, and how far the calendar
  // has to slide to bring it back inside. EDGE is a tick's own half width plus a
  // little, so an aimed day is never a half-legible thing against the border.
  const EDGE = 34;
  const rest = left + 8 + (at - from) * PX_PER_DAY;
  let pan = 0;
  if (w) {
    if (rest < EDGE) pan = EDGE - rest;
    else if (rest > w - EDGE) pan = w - EDGE - rest;
  }

  return (
    <div
      ref={boxRef}
      aria-hidden="true"
      // Hanging just above the card, and a little wider than it, so the first
      // and last ticks are not cut in half by the card's own edges.
      className="pointer-events-none absolute -left-2 -right-2 -top-[3.1rem] z-[45] h-11 overflow-hidden rounded-lg bg-white shadow-md ring-1 ring-[var(--line)]"
    >
      {/* The line the ticks stand on, so the axis reads as one measured thing
          rather than a row of loose labels. */}
      <span className="absolute inset-x-0 bottom-[0.55rem] block h-px bg-ink/10" />
      {dayKeys.map((key, i) => {
        const d = parseDate(key);
        if (!d) return null;
        // 8px for the panel's own overhang past the card's left edge.
        const x = left + 8 + (i - from) * PX_PER_DAY + pan;
        // Nothing is gained by laying out a fortnight of ticks the panel will
        // only clip.
        if (x < -40 || (w && x > w + 40)) return null;
        const here = i === at;
        const start = i === from;
        return (
          <div
            key={key}
            style={{ left: `${x}px` }}
            className="absolute bottom-0 top-0 -ml-6 w-12 text-center"
          >
            <span
              className={`tabular block pt-[0.3rem] text-[0.6rem] font-semibold uppercase leading-none tracking-[0.06em] ${
                here ? "text-teal" : "text-ink-faint"
              }`}
            >
              {/* The weekday, except on the first of a month, where the month
                  itself is the more useful of the two: a trip that runs from the
                  thirtieth to the second would otherwise show a 30, a 31, a 1
                  and a 2 with nothing saying that the numbers restarted. */}
              {d.getDate() === 1
                ? d.toLocaleDateString("en-US", { month: "short" })
                : d.toLocaleDateString("en-US", { weekday: "short" })}
            </span>
            <span
              className={`tabular block pt-[0.15rem] text-[0.78rem] font-semibold leading-none ${
                here ? "text-teal" : "text-ink-soft"
              }`}
            >
              {d.getDate()}
            </span>
            {/* Three states on one tick, in one glyph: the day being aimed at is
                a teal stem, the day the card came from is a hollow ring so it is
                clear what is being left, and everything else is a hairline. */}
            <span
              className={`absolute bottom-[0.3rem] left-1/2 block -translate-x-1/2 rounded ${
                here
                  ? "h-2.5 w-0.5 bg-teal"
                  : start
                    ? "h-1.5 w-1.5 rounded-full border border-ink-faint bg-white"
                    : "h-1.5 w-px bg-ink/25"
              }`}
            />
          </div>
        );
      })}
    </div>
  );
}

/**
 * The mark on a card that says whether it can be moved by holding it.
 *
 * A gesture nobody can see is a gesture nobody uses, and worse, a card that
 * lifts under some thumbs and not others reads as a bug rather than a rule. So
 * every card that could conceivably be moved carries a small grip, and the grip
 * says which of the two states it is in.
 *
 * The first attempt drew the two states as solid dots and hollow dots. At the
 * size a grip has to be -- three-pixel dots, beside a category mark, on a card
 * whose real business is the name of a place -- hollow dots did not read as a
 * different state, they read as the same grip printed badly. So the unusable one
 * is struck through instead: the same six dots with a line drawn across them,
 * which is the one mark that means "not this" without a word of explanation. The
 * rule is spoken as well as drawn -- the title attribute for a mouse, the
 * screen-reader line for everybody who will never see either mark.
 */
export function DragGrip({ ready }) {
  const said = ready
    ? "Hold this card and slide it: up or down for another time, across for another day."
    : "This has no time yet, so it cannot be moved by holding it. Give it a time first.";
  return (
    <span
      title={said}
      className="no-print relative mt-1 grid shrink-0 grid-cols-2 gap-[3.5px]"
    >
      {Array.from({ length: 6 }).map((_, i) => (
        <span
          key={i}
          aria-hidden="true"
          className={`block size-[3.5px] rounded-full ${
            ready ? "bg-ink-soft" : "bg-ink-faint/45"
          }`}
        />
      ))}
      {!ready && (
        <span
          aria-hidden="true"
          // Long enough to leave the dots on both sides, so it reads as a line
          // through the grip rather than a line inside it.
          className="pointer-events-none absolute left-1/2 top-1/2 h-px w-[1.3rem] -translate-x-1/2 -translate-y-1/2 -rotate-45 rounded bg-ink-faint"
        />
      )}
      <span className="sr-only">{said}</span>
    </span>
  );
}
