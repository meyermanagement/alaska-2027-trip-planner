"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * The index down the side of the packing screen.
 *
 * Seven lists, an animal and the house used to arrive as three stacked sections
 * with a row of chips buried in the middle of them, so the question "where is
 * Veda's Alaska list" was answered by scrolling. Here every list the family has
 * -- the family templates, each animal's own list, and the household's departure
 * list -- is one column of rows with its count beside it, and the panel to the
 * right is whichever row is on. On a phone the column lies down into a strip of
 * chips above the panel, because a sticky sidebar on a 390px screen is a sidebar
 * nobody can read.
 */
// The band the strip sits in: sand-deep at 55% over sand. Written out so the
// fades at either end dissolve into it rather than into a slightly wrong tone.
const BAND =
  "color-mix(in srgb, var(--color-sand-deep) 55%, var(--color-sand))";

export default function PackIndex({ groups, picked, onPick }) {
  const rows = groups.flatMap((g) => g.rows);
  const strip = useRef(null);
  // Whether there is anything off either end. A strip that looks like a finished
  // row of chips is a strip nobody swipes, so the fades are only drawn on the
  // side that actually has more, and they disappear when you reach the end.
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
    // The chosen list is the one you want to see, and on a phone it is often the
    // fourth or fifth chip -- off the right-hand edge on arrival.
    const on = el.querySelector('[aria-current="true"]');
    if (on) on.scrollIntoView({ block: "nearest", inline: "center" });
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [measure, picked]);
  return (
    <>
      {/* Phone: one scrolling strip, in the same order as the column. It sits in
          a band of its own with a heading over it, because as a bare row of
          chips under the page title it read as decoration and got scrolled
          past. */}
      <div className="no-print -mx-5 mb-5 border-y border-[var(--line)] bg-sand-deep/50 lg:hidden">
        <div className="flex items-baseline gap-2 px-5 pb-1 pt-2.5">
          <p className="section-label">Which list</p>
          <span className="text-xs text-ink-soft">
            {rows.length} to choose from
          </span>
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
              const on = r.key === picked;
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => onPick(r.key)}
                  aria-current={on ? "true" : undefined}
                  className={`flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition ${
                    on
                      ? "border-teal bg-teal font-semibold text-on-accent shadow-[var(--shadow-card)]"
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
                  <span
                    className={`text-xs tabular-nums ${on ? "opacity-80" : "text-ink-soft"}`}
                  >
                    {r.count}
                  </span>
                </button>
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

      {/* Desktop: the column, sticky under the top bar. */}
      <nav
        aria-label="Packing lists"
        className="no-print hidden lg:sticky lg:top-6 lg:block"
      >
        {groups.map((g) => (
          <div key={g.label} className="mb-5 last:mb-0">
            <p className="section-label mb-1.5">{g.label}</p>
            <ul className="space-y-0.5">
              {g.rows.map((r) => {
                const on = r.key === picked;
                return (
                  <li key={r.key}>
                    <button
                      type="button"
                      onClick={() => onPick(r.key)}
                      aria-current={on ? "true" : undefined}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                        on
                          ? "bg-white font-semibold shadow-[var(--shadow-card)]"
                          : "text-ink-soft hover:bg-white/60 hover:text-ink"
                      }`}
                    >
                      {r.dot && (
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: r.dot }}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      <span className="shrink-0 text-xs tabular-nums opacity-70">
                        {r.count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
