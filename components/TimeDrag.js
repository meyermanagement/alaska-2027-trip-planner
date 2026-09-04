"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { formatTime } from "@/lib/format";

/**
 * Moving one thing to a different time by pressing it and sliding it.
 *
 * The typed time field is not going anywhere -- it is still the only way to say
 * "quarter past six" without arithmetic, and the only way any of this works with a
 * keyboard or a screen reader. But the commonest edit on a day that is actually
 * happening is not "set this to a time", it is "this is running late, push it".
 * Doing that today costs six taps: open the card, press Edit, find the time field,
 * spin it, save, wait. So: press and hold the card, slide, let go.
 *
 * Why the deliberate press. A card that moved on any touch would move every time
 * somebody scrolled the day, and a wrong time saves silently. A third of a second
 * of stillness is long enough that the browser has not begun a scroll -- a scroll
 * starts on movement -- and short enough not to feel like a puzzle. Any movement
 * before the timer fires cancels it and the touch goes back to being a scroll.
 *
 * Why pointer events and no library. Every drag-and-drop library on npm is built
 * for reordering a list: it wants to reflow the list under the finger and hand back
 * an index. This is not a reorder. The list is a clock, and the answer is a time --
 * the same card in the same place at 4:15 instead of 3:30. Nothing around it moves
 * while the finger is down; the day re-sorts once, on release, when the new time is
 * saved. Pointer events give the whole gesture -- mouse, touch and pen -- in one set
 * of handlers, plus setPointerCapture, which is what keeps the drag alive when the
 * finger leaves the card it started on.
 *
 * The step is fixed distance, not a mapping onto the day's own layout: 44 pixels is
 * fifteen minutes, everywhere, on every card. A rail of ticks down the left edge
 * says so while the drag is live, and the time being aimed at is drawn large next
 * to the finger, because the one thing that must never be a surprise is what is
 * about to be saved.
 */

// A thumb's comfortable travel for one step, and what one step is worth.
const PX_PER_STEP = 44;
const STEP_MIN = 15;
// Stillness before the card lifts.
const HOLD_MS = 330;
// A finger that moves this far before the timer fires was scrolling.
const SLOP_PX = 8;
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

export default function TimeDrag({
  startTime,
  disabled = false,
  onCommit,
  children,
}) {
  const base = minutesOf(startTime);
  const holdRef = useRef(null);
  const downRef = useRef(null);
  const boxRef = useRef(null);
  // One object rather than four states: every frame of a drag changes all of
  // them together, and a partially applied drag draws a card at the old offset
  // with the new time beside it.
  const [drag, setDrag] = useState(null);
  const [saving, setSaving] = useState(false);

  const clearHold = useCallback(() => {
    if (holdRef.current) {
      clearTimeout(holdRef.current);
      holdRef.current = null;
    }
  }, []);

  useEffect(() => clearHold, [clearHold]);

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
      if (navigator.vibrate) navigator.vibrate(12);
      // Where in the card the thumb actually landed, so the time being aimed at
      // can be drawn beside the thumb rather than over the title. On a six-line
      // hotel card those are 120px apart, and the one thing that must not be
      // covered is the name of the thing being moved.
      const rect = el.getBoundingClientRect();
      setDrag({
        dy: 0,
        mins: base,
        grabY: Math.round(downRef.current.y - rect.top),
      });
    }, HOLD_MS);
  }

  function onPointerMove(e) {
    const down = downRef.current;
    if (!down) return;
    const dy = e.clientY - down.y;
    if (!drag) {
      // Still waiting on the timer. Movement means this was a scroll.
      if (Math.abs(dy) > SLOP_PX || Math.abs(e.clientX - down.x) > SLOP_PX) {
        clearHold();
        downRef.current = null;
      }
      return;
    }
    e.preventDefault();
    const steps = Math.round(dy / PX_PER_STEP);
    const mins = Math.max(0, Math.min(DAY_MAX, base + steps * STEP_MIN));
    setDrag((d) => ({ ...d, dy, mins }));
  }

  async function onPointerUp() {
    clearHold();
    const live = drag;
    downRef.current = null;
    setDrag(null);
    if (!live) return;
    if (live.mins === base) return;
    setSaving(true);
    await onCommit(hmOf(live.mins));
    setSaving(false);
  }

  function onPointerCancel() {
    clearHold();
    downRef.current = null;
    setDrag(null);
  }

  const lifted = Boolean(drag);
  const moved = lifted && drag.mins !== base;

  return (
    <div
      ref={boxRef}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      // Only while lifted. Locking touch-action before the press is deliberate
      // would take scrolling away from the whole itinerary.
      style={lifted ? { touchAction: "none" } : undefined}
      className={off ? undefined : "relative select-none"}
    >
      {lifted && <Rail base={base} mins={drag.mins} top={drag.grabY} />}
      <div
        style={
          lifted
            ? {
                transform: `translateY(${drag.dy}px) scale(1.015)`,
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
      {lifted && (
        <div
          aria-live="polite"
          style={{
            transform: `translateY(${drag.dy}px)`,
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
        </div>
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
 * The ticks, drawn only while a card is lifted.
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
