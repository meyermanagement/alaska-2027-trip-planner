"use client";

import TripRoster from "./TripRoster";

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
