"use client";

import { useEffect, useId, useRef, useState } from "react";

/**
 * The four demonstrations, one at a time.
 *
 * Until September 2026 the front door was nine scenes in a row, about 1,900
 * words, and testers gave up two sections in. Nobody reads a scroll of
 * demonstrations; they pick one. So the four that matter most sit behind a
 * tab strip -- the same .tabbar/.tab pattern the trip screen uses for its four
 * doors -- and the reader sees one, and chooses the rest.
 *
 * Every panel is rendered on the server and stays in the DOM, hidden rather
 * than unmounted, so a browser without JavaScript is handed all four in order
 * and a crawler reads every word.
 */
export default function HowTabs({ tabs }) {
  const [at, setAt] = useState(0);
  const base = useId();
  const barRef = useRef(null);

  // The trip screen's rule for its own bar: a fade on the right edge while
  // there is more strip to the right, gone once you reach the end. Under 420px
  // the bar is a two-by-two grid with nothing to scroll, and the measure comes
  // back false on its own.
  const [moreTabs, setMoreTabs] = useState(false);
  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return undefined;
    const measure = () =>
      setMoreTabs(bar.scrollWidth - bar.clientWidth - bar.scrollLeft > 2);
    measure();
    bar.addEventListener("scroll", measure, { passive: true });
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => {
      bar.removeEventListener("scroll", measure);
      ro.disconnect();
    };
  }, []);

  // Bring the chosen tab into view when the strip scrolls, by hand rather than
  // with scrollIntoView, which is entitled to scroll the page as well.
  useEffect(() => {
    const bar = barRef.current;
    const el = document.getElementById(`${base}-tab-${at}`);
    if (!bar || !el || bar.scrollWidth <= bar.clientWidth) return;
    const left = el.offsetLeft;
    const right = left + el.offsetWidth;
    if (left < bar.scrollLeft) bar.scrollLeft = Math.max(0, left - 12);
    else if (right > bar.scrollLeft + bar.clientWidth)
      bar.scrollLeft = right - bar.clientWidth + 12;
  }, [at, base]);

  function onKey(e) {
    const n = tabs.length;
    let next = null;
    if (e.key === "ArrowRight") next = (at + 1) % n;
    if (e.key === "ArrowLeft") next = (at + n - 1) % n;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = n - 1;
    if (next === null) return;
    e.preventDefault();
    setAt(next);
    document.getElementById(`${base}-tab-${next}`)?.focus();
  }

  return (
    <div className="home-how">
      <div className="relative min-w-0">
        <nav
          ref={barRef}
          className="tabbar home-how-bar"
          role="tablist"
          aria-label="How it works"
          onKeyDown={onKey}
        >
          {tabs.map((t, i) => {
            const here = i === at;
            return (
              <button
                key={t.label}
                type="button"
                role="tab"
                id={`${base}-tab-${i}`}
                aria-controls={`${base}-panel-${i}`}
                aria-selected={here}
                tabIndex={here ? 0 : -1}
                onClick={() => setAt(i)}
                className="tab"
              >
                {t.label}
              </button>
            );
          })}
        </nav>
        {/* Pointer-events off: a gradient that eats taps on the last tab would
            be a worse fault than the one it is fixing. */}
        {moreTabs ? (
          <span aria-hidden="true" className="home-how-fade" />
        ) : null}
      </div>

      {tabs.map((t, i) => (
        <div
          key={t.label}
          role="tabpanel"
          id={`${base}-panel-${i}`}
          aria-labelledby={`${base}-tab-${i}`}
          className={i === at ? "home-how-panel" : "hidden"}
        >
          <div className="grid items-start gap-7 lg:grid-cols-[minmax(0,17rem)_1fr] lg:gap-14">
            <div className="lg:pt-2">
              <h3 className="font-display text-[24px] font-semibold leading-[1.15] sm:text-[28px]">
                {t.title}
              </h3>
              <p className="mt-3 text-[16px] leading-relaxed text-ink-soft sm:text-[17px]">
                {t.body}
              </p>
            </div>
            <div className="min-w-0">{t.media}</div>
          </div>
        </div>
      ))}
    </div>
  );
}
