"use client";

import { Fragment, useCallback, useEffect, useRef, useState } from "react";

// The band a picker sits in: sand-deep at 55% over sand. Written out so the fades
// at either end dissolve into it rather than into a slightly wrong tone.
const BAND =
  "color-mix(in srgb, var(--color-sand-deep) 55%, var(--color-sand))";

/**
 * One scrolling row of chips, in a band of its own, for screens that used to be
 * a stack of every card at once.
 *
 * The lesson from the packing screen is in the chrome rather than the chips: as a
 * bare row under a page title this read as decoration and got scrolled straight
 * past, so it carries a heading, a count, a filled chip for what is on, and fades
 * and a swipe hint on whichever side actually has more. Each is only drawn while
 * it is true -- a hint that is always there is a hint nobody reads.
 *
 * Rows are `{ key, label, count?, dot?, ghost?, divider? }`. A ghost row is an
 * action rather than a thing, drawn dashed, and is never marked as current. A row
 * marked with a divider gets a hairline before it, which is how one row can hold
 * people, then animals, then the two Add actions without them all reading as the
 * same kind of thing.
 */
export default function PickBand({
  label,
  hint = null,
  rows = [],
  picked,
  onPick,
  className = "",
}) {
  const strip = useRef(null);
  const [more, setMore] = useState({ left: false, right: false });
  const measure = useCallback(() => {
    const el = strip.current;
    if (!el) return;
    setMore({
      left: el.scrollLeft > 4,
      right: el.scrollLeft + el.clientWidth < el.scrollWidth - 4,
    });
  }, []);
  useEffect(() => {
    measure();
    const el = strip.current;
    if (!el) return undefined;
    // What is chosen is what you want to see, and it is often the fifth chip --
    // off the right-hand edge on arrival.
    const on = el.querySelector('[aria-current="true"]');
    if (on) on.scrollIntoView({ block: "nearest", inline: "center" });
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, picked]);

  return (
    <div
      className={`no-print -mx-5 mb-5 border-y border-[var(--line)] bg-sand-deep/50 ${className}`}
    >
      <div className="flex items-baseline gap-2 px-5 pb-1 pt-2.5">
        <p className="section-label">{label}</p>
        {hint && <span className="text-xs text-ink-soft">{hint}</span>}
        {more.right && (
          <span className="ml-auto flex items-center gap-1 text-xs text-ink-soft">
            swipe
            <svg
              viewBox="0 0 20 20"
              aria-hidden="true"
              className="h-3 w-3"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M4 10h11M11 6l4 4-4 4" />
            </svg>
          </span>
        )}
      </div>
      <div className="relative">
        <div
          ref={strip}
          onScroll={measure}
          className="flex gap-2 overflow-x-auto px-5 pb-3 pt-1"
        >
          {rows.map((r) => {
            const on = !r.ghost && r.key === picked;
            return (
              <Fragment key={r.key}>
                {r.divider && (
                  <span
                    aria-hidden="true"
                    className="mx-1 my-2 w-px shrink-0 self-stretch bg-[var(--line)]"
                  />
                )}
                <button
                  type="button"
                  onClick={() => onPick(r.key)}
                  aria-current={on ? "true" : undefined}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition ${
                    on
                      ? "border-teal bg-teal font-semibold text-on-accent shadow-[var(--shadow-card)]"
                      : r.ghost
                        ? "border-dashed border-teal/50 text-teal hover:bg-teal-soft/40"
                        : "border-[var(--line)] bg-white text-ink"
                  }`}
                >
                  {r.dot && (
                    <span
                      aria-hidden="true"
                      className="h-2 w-2 shrink-0 rounded-full"
                      style={{ background: r.dot }}
                    />
                  )}
                  <span className="whitespace-nowrap">{r.label}</span>
                  {r.count !== undefined && r.count !== null && (
                    <span
                      className={`text-xs tabular-nums ${on ? "opacity-80" : "text-ink-soft"}`}
                    >
                      {r.count}
                    </span>
                  )}
                </button>
              </Fragment>
            );
          })}
        </div>
        {more.left && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-0 w-12"
            style={{
              background: `linear-gradient(to right, ${BAND}, ${BAND} 35%, transparent)`,
            }}
          />
        )}
        {more.right && (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 right-0 w-12"
            style={{
              background: `linear-gradient(to left, ${BAND}, ${BAND} 35%, transparent)`,
            }}
          />
        )}
      </div>
    </div>
  );
}
