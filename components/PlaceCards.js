"use client";

// A recommendation you can act on: the photograph, where it is, why it was
// suggested, the place's own site, the map, and one button to put it on the
// itinerary.
//
// The button does not write anything itself. It says, in the family's own voice,
// what they want - and Aly proposes the change the same way she would if they had
// typed it. One path for every change, and the confirmation card still appears.

import {
  KIND_LABELS,
  addRequest,
  asksForPlaces,
  findMoreRequest,
  groupPlaces,
  moreRequest,
} from "@/lib/places/cards";
import { directionsLink } from "@/lib/places/here";
import { missingNightly, nightlyLine } from "@/lib/places/stay";

// A bare number in brackets is ambiguous - it could be a price or a distance -
// so the count says what it counts. Grouped with commas, because 3140 reviews
// reads slower than 3,140.
function reviews(count) {
  return `${count.toLocaleString("en-US")} review${count === 1 ? "" : "s"}`;
}

function Stars({ rating, count }) {
  if (!rating) return null;
  return (
    <span className="inline-flex items-baseline gap-1 tabular-nums">
      <span aria-hidden="true" className="text-amber">
        ★
      </span>
      <span className="font-medium text-ink">{rating.toFixed(1)}</span>
      <span className="sr-only">out of 5 on Google</span>
      {count ? (
        <span className="text-ink-faint">· {reviews(count)}</span>
      ) : null}
    </span>
  );
}

function Card({ place, onAdd, onMore, busy, here }) {
  const label = KIND_LABELS[place.kind] || KIND_LABELS.do;
  const nightly = nightlyLine(place);
  // Only offered when they have said where they are: directions from nowhere is
  // just the map link with extra steps.
  const directions = here ? directionsLink(place, here) : null;
  return (
    <li className="flex flex-col overflow-hidden rounded-xl border border-sand-deep bg-white">
      {place.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/api/place-photo?name=${encodeURIComponent(place.photo)}&w=600`}
          alt={place.name}
          className="h-32 w-full object-cover"
          loading="lazy"
        />
      ) : null}

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-start justify-between gap-2">
          {/* Under the list's own heading, so a screen reader reads "Most
              popular" and then the places on it rather than nine things at the
              same level. */}
          <h5 className="text-sm font-semibold leading-snug text-ink">
            {place.name}
          </h5>
          <span className="shrink-0 rounded-full bg-sand px-2 py-0.5 text-[11px] font-medium text-ink-soft">
            {label}
          </span>
        </div>

        {/* Area, price and rating read as one line: the three things you weigh a
            place by, so they belong together rather than stacked. */}
        <p className="mt-1 flex flex-wrap items-baseline gap-x-1.5 text-xs text-ink-soft">
          {place.area ? <span>{place.area}</span> : null}
          {place.price && !nightly ? (
            <span className="whitespace-nowrap tabular-nums">
              {place.area ? <span aria-hidden="true">· </span> : null}
              {place.price}
            </span>
          ) : null}
          {place.rating ? (
            <span className="whitespace-nowrap">
              {place.area || (place.price && !nightly) ? (
                <span aria-hidden="true">· </span>
              ) : null}
              <Stars rating={place.rating} count={place.ratingCount} />
            </span>
          ) : null}
          {place.distance ? (
            <span className="whitespace-nowrap font-medium text-teal">
              {place.area || place.price || place.rating ? (
                <span aria-hidden="true" className="font-normal text-ink-soft">
                  ·{" "}
                </span>
              ) : null}
              <span className="tabular-nums">{place.distance}</span>
            </span>
          ) : null}
        </p>

        {/* What a night costs on their own dates, given a line of its own rather
            than a place in the run of area-price-rating. It is the number the
            decision turns on, and $$$$ never separated one hotel from another. */}
        {nightly ? (
          <p className="mt-1.5 text-xs font-semibold tabular-nums text-ink">
            {nightly}
          </p>
        ) : missingNightly(place) ? (
          <p className="mt-1.5 text-xs text-ink-faint">
            No nightly average for these dates yet
          </p>
        ) : null}

        {place.why ? (
          <p className="mt-2 text-xs leading-relaxed text-ink">{place.why}</p>
        ) : null}

        {/* Only on a second helping, and set apart from the reasons rather than
            appended to them: it is the answer to a different question, and a
            drawback tucked onto the end of a sentence of praise gets skimmed
            over by exactly the person it was written for. */}
        {place.tradeoff ? (
          <p className="mt-2 rounded-lg bg-sand/80 px-2.5 py-2 text-xs leading-relaxed text-ink-soft">
            <span className="font-semibold text-ink">The trade-off: </span>
            {place.tradeoff}
          </p>
        ) : null}

        {/* Only ever a program the family is actually in: the shortlist is checked
            against their own rows before it reaches this component, and a perk
            whose program is not theirs has already been removed. */}
        {place.program ? (
          <div className="mt-2 rounded-lg bg-glacier/40 px-2.5 py-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-teal">
              Through your programs
            </p>
            <p className="mt-0.5 text-xs font-semibold leading-snug text-ink">
              {place.program}
            </p>
            {place.perk ? (
              <p className="mt-0.5 text-xs leading-relaxed text-ink">
                {place.perk}
              </p>
            ) : null}
            <p className="mt-0.5 text-[11px] leading-snug text-ink-soft">
              Worth confirming when you book.
            </p>
          </div>
        ) : null}

        {place.address ? (
          <p className="mt-2 text-[11px] leading-relaxed text-ink-faint">
            {place.address}
          </p>
        ) : null}

        {/* Pushed to the foot of the card so the buttons line up across a row,
            whatever length the reasons ran to. */}
        <div className="mt-auto flex flex-wrap items-center gap-2 pt-3">
          <button
            type="button"
            onClick={() => onAdd?.(place)}
            disabled={busy}
            className="rounded-lg bg-teal px-3 py-1.5 text-xs font-medium text-white disabled:opacity-60"
          >
            Add to itinerary
          </button>
          {/* The other half of what people do with a shortlist: not decide, but
              find out. Asking rather than adding keeps the conversation going,
              which is the whole point of a card being in a conversation. */}
          {onMore ? (
            <button
              type="button"
              onClick={() => onMore(place)}
              disabled={busy}
              className="rounded-lg border border-sand-deep px-3 py-1.5 text-xs font-medium text-ink disabled:opacity-60"
            >
              Tell me more
            </button>
          ) : null}
          {directions ? (
            <a
              href={directions}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-sand-deep px-3 py-1.5 text-xs font-medium text-ink"
            >
              Directions
            </a>
          ) : null}
          {place.maps ? (
            <a
              href={place.maps}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-sand-deep px-3 py-1.5 text-xs font-medium text-ink"
            >
              Map & photos
            </a>
          ) : null}
          {place.website ? (
            <a
              href={place.website}
              target="_blank"
              rel="noreferrer"
              className="rounded-lg border border-sand-deep px-3 py-1.5 text-xs font-medium text-ink"
            >
              Website
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

export default function PlaceCards({
  places,
  onAdd,
  onMore = null,
  onFindMore = null,
  busy = false,
  here = null,
}) {
  if (!Array.isArray(places) || !places.length) return null;
  // Two lists when there are two lists to show, and one when there is not. The
  // grouping is decided in one place so the heading can never appear over a
  // shortlist that was never split.
  const sections = groupPlaces(places);
  const split = sections.length > 1;
  return (
    <div className="mt-2">
      {sections.map((section, s) => (
        <section
          key={section.group || `loose-${s}`}
          className={s ? "mt-4" : ""}
        >
          {split && section.label ? (
            <div className="mb-2">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
                {section.label}
              </h4>
              {section.note ? (
                <p className="mt-0.5 text-[11px] leading-snug text-ink-faint">
                  {section.note}
                </p>
              ) : null}
            </div>
          ) : null}
          <ul className="grid gap-2 sm:grid-cols-2">
            {section.places.map((place, i) => (
              <Card
                key={`${place.name}-${i}`}
                place={place}
                onAdd={onAdd}
                onMore={onMore}
                busy={busy}
                here={here}
              />
            ))}
          </ul>
        </section>
      ))}

      {/* Under the whole shortlist rather than on a card, because it is a
          question about the shortlist: was that everything? Offered only on the
          newest set, so pressing it cannot ask for more of a list four
          exchanges back. */}
      {onFindMore ? (
        <button
          type="button"
          onClick={onFindMore}
          disabled={busy}
          className="btn btn-primary mt-3.5 w-full sm:w-auto"
        >
          <svg viewBox="0 0 20 20" fill="none" aria-hidden="true">
            <circle
              cx="9"
              cy="9"
              r="6"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            <path
              d="M13.5 13.5 17.5 17.5"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
            />
          </svg>
          Find more like these
        </button>
      ) : null}
    </div>
  );
}

export { addRequest, asksForPlaces, findMoreRequest, moreRequest };
