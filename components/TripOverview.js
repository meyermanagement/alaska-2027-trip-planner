"use client";

import TripRoster from "./TripRoster";
import DrawCover from "./DrawCover";

/**
 * What a trip is, as opposed to what is happening on it.
 *
 * All of this used to live in the card at the top of the page, which meant every
 * tab opened under a block holding the description, the whole roster of people
 * and animals, and three counting tiles -- most of a phone screen of things that
 * do not change while you work, sitting on top of the thing that does. The header
 * now keeps only what is worth carrying between tabs: what the trip is called,
 * when it is, where it is, and how far away. Everything else is here, on a tab
 * you land on first and then leave.
 */
export default function TripOverview({
  trip,
  people,
  pets,
  going,
  onGoingChange,
  petLinks,
  onPetLinksChange,
  packing,
  stats,
  readOnly,
  past,
  onPackingChanged,
}) {
  return (
    <div className="space-y-5">
      {/* The numbers first, because "how is it coming along" is the question the
          Overview is opened to answer, and three tiles answer it without a
          sentence. They are tiles rather than a line of text so the eye can take
          all three in one movement. */}
      <dl className="grid grid-cols-3 gap-3 sm:gap-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-xl border border-[var(--line)] bg-sand/70 px-4 py-3 text-center"
          >
            <dt className="section-label">{s.label}</dt>
            <dd className="font-display mt-1 text-2xl font-semibold">
              {s.value}
            </dd>
          </div>
        ))}
      </dl>

      {/* The picture behind this trip, and the one control that changes it.
          On this tab rather than in the header, because the header is where the
          picture is *seen* and putting a third button over it would crowd the
          two that are already there -- and because asking for a cover is a thing
          done once, not a thing done on the way past. */}
      {!readOnly && (
        <section className="card flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <h2 className="section-label">The picture on this trip</h2>
            <p className="mt-2 text-sm leading-relaxed text-ink-soft">
              {trip.cover_image_url
                ? "Drawn for this trip from where and when it is. Ask for another if it is not right — or tell Aly what to change about it."
                : "There is no picture on this trip yet. The app will draw one from where and when the trip is: no photograph, no stock library, just a flat illustration of the place."}
            </p>
          </div>
          <DrawCover trip={trip} className="shrink-0 sm:w-48" />
        </section>
      )}

      {trip.summary && (
        <section className="card p-5">
          <h2 className="section-label">About this trip</h2>
          <p className="mt-2 text-sm leading-relaxed text-ink-soft">
            {trip.summary}
          </p>
        </section>
      )}

      {/* Who is going, in its own card rather than tucked under the description.
          It is the one thing on this tab that is a control as well as a fact:
          adding somebody rewrites the packing list. */}
      <section className="card p-5">
        <TripRoster
          trip={trip}
          people={people}
          pets={pets}
          going={going}
          onGoingChange={onGoingChange}
          petLinks={petLinks}
          onPetLinksChange={onPetLinksChange}
          packing={packing}
          readOnly={readOnly}
          past={past}
          onPackingChanged={onPackingChanged}
        />
      </section>
    </div>
  );
}
