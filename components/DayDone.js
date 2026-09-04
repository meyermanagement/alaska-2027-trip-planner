"use client";

import Stars from "@/components/Stars";
import { canReviewNow, reviewTarget } from "@/lib/reviews/when";
import { directionsToPlace } from "@/lib/travel/modes";
import { dayRecap } from "@/lib/day/done";
import { CATEGORY_ICONS } from "@/lib/format";

/**
 * The other end of the day.
 *
 * At the top of a day the screen says what is next, and offers the weather and a
 * way to ask about it. None of that survives the day: at ten at night a forecast
 * for hours that have gone is clutter, and "what should we do about this" is a
 * question with no remaining answer. So once the day is behind the family this
 * panel takes that space instead, and the day brief above it is not rendered at
 * all.
 *
 * Three things, in the order they are worth reading. What the day was, written
 * from the family's own rows rather than asked of a model, so it is instant and
 * cannot invent a dinner. Where they are sleeping, which is the only remaining
 * thing anybody might need directions to. And the places that are now rateable
 * and are not yet rated -- the evening is the only time anybody will ever be
 * willing to say what they thought, and this is the app asking while it can.
 *
 * Highlighted rather than dashed and quiet, because unlike the "staying at"
 * strip it replaces, this is the most important thing on the screen at the hour
 * it appears.
 */
export default function DayDone({
  rows,
  stay = null,
  items = [],
  today,
  isToday = true,
  nowHM,
  readOnly = false,
  busy = null,
  onSave,
}) {
  const { sentence } = dayRecap(rows);

  // Somewhere they went, that has happened, that nobody has rated yet. Read
  // through reviewTarget so a hotel typed in as four separate nights is asked
  // about once rather than four times.
  const seen = new Set();
  const toRate = [];
  (rows || []).forEach(({ item }) => {
    if (!canReviewNow(item, { today, nowHM })) return;
    const target = reviewTarget(item, items) || item;
    if (seen.has(target.id)) return;
    seen.add(target.id);
    if (target.rating) return;
    toRate.push({ item, target });
  });

  const stayHref = stay ? directionsToPlace(stay.item) : null;

  return (
    <section className="no-print mb-3 rounded-2xl border border-teal/40 bg-teal/10 p-4">
      <h4 className="font-display text-lg font-semibold leading-snug text-teal">
        {isToday ? "That is the day" : "That was the day"}
      </h4>
      {sentence && (
        <p className="mt-1 text-sm leading-relaxed text-ink">{sentence}</p>
      )}

      {stay && !stay.leaving && (
        <p className="mt-2 text-sm text-ink-soft">
          <span aria-hidden="true" className="mr-1.5">
            {CATEGORY_ICONS[stay.item.category]}
          </span>
          {isToday ? "Tonight you are at " : "You stayed at "}
          {stayHref ? (
            <a
              href={stayHref}
              target="_blank"
              rel="noreferrer"
              className="font-semibold text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal"
            >
              {stay.item.title}
            </a>
          ) : (
            <span className="font-semibold text-ink">{stay.item.title}</span>
          )}
          {stay.night ? ` — night ${stay.night} of ${stay.nights}` : null}
        </p>
      )}

      {!readOnly && toRate.length > 0 && (
        <div className="mt-3 border-t border-teal/25 pt-3">
          <p className="text-[0.78rem] font-semibold uppercase tracking-[0.06em] text-teal/80">
            {toRate.length === 1
              ? "One place to rate while it is fresh"
              : `${toRate.length} places to rate while they are fresh`}
          </p>
          <ul className="mt-2 space-y-1.5">
            {toRate.map(({ item, target }) => (
              <li
                key={target.id}
                className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1"
              >
                <span className="min-w-0 flex-1 truncate text-sm text-ink">
                  <span aria-hidden="true" className="mr-1.5 opacity-60">
                    {CATEGORY_ICONS[item.category]}
                  </span>
                  {item.title}
                </span>
                <Stars
                  size="sm"
                  dim="text-teal/25"
                  value={target.rating || 0}
                  onPick={(rating) =>
                    busy === target.id ? null : onSave(item, { rating })
                  }
                />
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-ink-faint">
            A tap is enough. Open the item above if you want to write a note
            with it.
          </p>
        </div>
      )}
    </section>
  );
}
