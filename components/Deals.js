"use client";

// The fares, judged.
//
// Every line on a card came off a row this household typed: the airports they fly
// from, the ceiling they set on a place, the budget they put on the trip, how many
// of them are going, what else is that week. The card does no arithmetic of its
// own -- the sentences arrive already true from lib/deals/verdict.js, worked out on
// the server on every load, so a card cannot go on claiming a fare is under budget
// after the budget moved.
//
// Fares arrive by being forwarded. Nobody types one in: a household who reads
// three fare newsletters is not going to copy a fare into a second app, and the
// form that asked them to has been taken out. What is left here is the judging and
// the deciding.
//
// Two things to do with a fare and the card says both plainly. Put it on a trip,
// which is the whole point, or say it is not for us, which is worth recording: a
// refusal is a fact about this family that should still be true next month, and an
// app that forgets it will show them the same fare next week.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/rewards";
import { formatDay } from "@/lib/format";
import { monthsSaid } from "@/lib/someday/months";

function fareLine(deal) {
  const bits = [`${money(deal.price)} each`];
  if (deal.cabin && deal.cabin !== "economy") bits.push(deal.cabin);
  if (deal.airline) bits.push(deal.airline);
  if (deal.travel_start || deal.travel_end)
    bits.push(
      `${deal.travel_start || "?"} to ${deal.travel_end || deal.travel_start}`,
    );
  // Most alerts give a season, not a window, and the months are the part the
  // family judges the fare on. Said as months so nobody reads a day into them.
  else if (deal.travel_months?.length)
    bits.push(monthsSaid(deal.travel_months.map(Number)));
  return bits.join(" \u00b7 ");
}

function money(value) {
  return formatMoney(Number(value)) || "";
}

/**
 * @param deals every fare on file, each with its verdict already worked out.
 * @param trips the live trips, for the "put it on" picker.
 * @param tripId set when this panel is on one trip's screen: only the fares that
 *   matched that trip are shown, and the heading says so. The bucket list passes
 *   nothing and gets the lot.
 */
export default function Deals({ deals = [], trips = [], tripId = null }) {
  const router = useRouter();
  const mine = tripId
    ? deals.filter((deal) => deal.verdict?.trip?.id === tripId)
    : deals;
  const open = mine.filter((deal) => deal.status === "open");
  const refused = mine.filter((deal) => deal.status === "dismissed");
  const taken = mine.filter((deal) => deal.status === "taken");
  // Retired by the watcher for having passed its book-by date. Not open, and not
  // something the family turned down either: it simply ran out, and saying so is
  // better than a card quietly disappearing off the screen.
  const ran = mine.filter((deal) => deal.status === "expired");

  const [error, setError] = useState("");
  const [acting, setActing] = useState(null);
  const [reasoning, setReasoning] = useState(null);
  const [reason, setReason] = useState("");

  const decide = async (deal, patch) => {
    setActing(deal.id);
    try {
      const res = await fetch(`/api/deals/${deal.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch),
      });
      if (!res.ok) throw new Error();
      setReasoning(null);
      setReason("");
      router.refresh();
    } catch {
      setError("That did not save.");
    } finally {
      setActing(null);
    }
  };

  const live = trips.filter(
    (trip) => trip.status !== "complete" && trip.status !== "cancelled",
  );

  const card = (deal) => {
    const v = deal.verdict || { facts: [] };
    return (
      <li key={deal.id} className="card p-3">
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <h3 className="font-display text-lg font-semibold">
            {deal.origin} to {deal.destination}
          </h3>
          {v.headline ? (
            // Wrapping on purpose: the longest of these -- "Under your ceiling,
            // and you have the trip" -- is wider than a 320px card, and a chip
            // that keeps its one line pushes the sentence out past the edge.
            <span
              className="chip max-w-full text-left text-teal"
              style={{ whiteSpace: "normal" }}
            >
              {v.headline}
            </span>
          ) : null}
          {v.flights?.verdict === "booked" ? (
            // The one case where a fare is information rather than a decision:
            // the flights on that trip are already bought, so this only matters
            // if it beats what they paid. Said on the card rather than by
            // throwing the fare away.
            <span
              className="chip max-w-full text-left text-ink-soft"
              style={{ whiteSpace: "normal" }}
            >
              Flights already booked
            </span>
          ) : null}
        </div>
        <p className="mt-0.5 text-sm text-ink-soft">{fareLine(deal)}</p>

        {v.facts?.length ? (
          <ul className="mt-2 space-y-1 text-sm text-ink">
            {v.facts.map((fact) => (
              <li key={fact} className="flex gap-2">
                <span aria-hidden="true" className="text-ink-faint">
                  &middot;
                </span>
                <span>{fact}</span>
              </li>
            ))}
          </ul>
        ) : null}

        <p className="mt-2 text-xs text-ink-faint">
          {deal.source_url ? (
            <a
              href={deal.source_url}
              target="_blank"
              rel="noreferrer noopener"
              className="underline decoration-[var(--line)] underline-offset-2 hover:text-ink"
            >
              {deal.source_name}
            </a>
          ) : (
            deal.source_name
          )}
        </p>

        {reasoning === deal.id ? (
          <div className="mt-2">
            <label className="section-label block" htmlFor={`why-${deal.id}`}>
              Why not, in a few words
            </label>
            <input
              id={`why-${deal.id}`}
              className="field mt-1 w-full"
              value={reason}
              maxLength={200}
              placeholder="Wrong week for us"
              onChange={(event) => setReason(event.target.value)}
            />
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="btn btn-primary"
                disabled={acting === deal.id}
                onClick={() =>
                  decide(deal, { status: "dismissed", reason: reason.trim() })
                }
              >
                {acting === deal.id ? "Saving…" : "Save it"}
              </button>
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  setReasoning(null);
                  setReason("");
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
            {v.trip ? (
              <button
                type="button"
                className="btn btn-primary px-3 py-1"
                disabled={acting === deal.id}
                onClick={() =>
                  decide(deal, { status: "taken", trip_id: v.trip.id })
                }
              >
                Put it on {v.trip.name}
              </button>
            ) : live.length ? (
              <label className="flex flex-wrap items-center gap-2">
                <span className="text-ink-soft">Put it on</span>
                <select
                  className="field py-1"
                  defaultValue=""
                  disabled={acting === deal.id}
                  onChange={(event) => {
                    if (!event.target.value) return;
                    decide(deal, {
                      status: "taken",
                      trip_id: event.target.value,
                    });
                  }}
                >
                  <option value="">a trip…</option>
                  {live.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {trip.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <button
              type="button"
              className="text-ink-soft underline decoration-[var(--line)] underline-offset-2 hover:text-ink"
              disabled={acting === deal.id}
              onClick={() => {
                setReasoning(deal.id);
                setReason("");
              }}
            >
              Not for us
            </button>
          </div>
        )}
      </li>
    );
  };

  // Nothing on file, so there is nothing to say. The screen that holds this panel
  // explains how fares get here; a panel that announced its own emptiness would
  // be saying it twice.
  if (!open.length && !refused.length && !taken.length && !ran.length)
    return null;

  return (
    <section>
      {open.length ? (
        <>
          <h2 className="font-display text-lg font-semibold">
            {tripId ? "Fares for this trip" : "Fares that came in"}
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            {tripId
              ? "Read out of the alerts you forwarded, and measured against this trip's dates, party and budget."
              : "Read out of the alerts you forwarded, and measured against your airports, the ceilings on this list and the trips you already have."}
          </p>
          <ul className="mt-3 space-y-3">{open.map(card)}</ul>
        </>
      ) : null}
      {error ? <p className="mt-2 text-sm text-rose">{error}</p> : null}

      {taken.length ? (
        <div className="mt-6">
          <h3 className="section-label">Fares you took</h3>
          <ul className="mt-2 space-y-1 text-sm text-ink-soft">
            {taken.map((deal) => (
              <li key={deal.id}>
                {deal.origin} to {deal.destination}, {money(deal.price)} each
                {deal.verdict?.trip ? ` on ${deal.verdict.trip.name}` : ""}.
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {ran.length ? (
        <div className="mt-6">
          <h3 className="section-label">Fares that ran out</h3>
          <ul className="mt-2 space-y-1 text-sm text-ink-soft">
            {ran.map((deal) => (
              <li key={deal.id}>
                {deal.origin} to {deal.destination}, {money(deal.price)} each
                {deal.book_by
                  ? ` — the book-by date was ${formatDay(deal.book_by) || deal.book_by}`
                  : ""}
                .
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {refused.length ? (
        <div className="mt-6">
          <h3 className="section-label">Fares you turned down</h3>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Aly leaves these alone unless something has changed, and says what
            changed.
          </p>
          <ul className="mt-2 space-y-2">
            {refused.map((deal) => (
              <li
                key={deal.id}
                className="rounded-xl border border-[var(--line)] bg-white/60 p-3 sm:flex sm:items-start sm:justify-between sm:gap-4"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-ink">
                    {deal.origin} to {deal.destination}, {money(deal.price)}{" "}
                    each
                  </p>
                  {deal.dismissed_reason ? (
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {deal.dismissed_reason}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="btn btn-ghost mt-2 w-full shrink-0 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] disabled:opacity-60 sm:mt-0 sm:w-auto"
                  disabled={acting === deal.id}
                  onClick={() => decide(deal, { status: "open" })}
                >
                  {acting === deal.id ? "Asking…" : "Ask again"}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
