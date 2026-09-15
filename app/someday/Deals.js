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
// Two things to do with a fare and the card says both plainly. Put it on a trip,
// which is the whole point, or say it is not for us, which is worth recording: a
// refusal is a fact about this family that should still be true next month, and an
// app that forgets it will show them the same fare next week.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatMoney } from "@/lib/rewards";
import { formatDay } from "@/lib/format";

function fareLine(deal) {
  const bits = [`${money(deal.price)} each`];
  if (deal.cabin && deal.cabin !== "economy") bits.push(deal.cabin);
  if (deal.airline) bits.push(deal.airline);
  if (deal.travel_start || deal.travel_end)
    bits.push(
      `${deal.travel_start || "?"} to ${deal.travel_end || deal.travel_start}`,
    );
  return bits.join(" \u00b7 ");
}

function money(value) {
  return formatMoney(Number(value)) || "";
}

export default function Deals({ deals = [], trips = [] }) {
  const router = useRouter();
  const open = deals.filter((deal) => deal.status === "open");
  const refused = deals.filter((deal) => deal.status === "dismissed");
  const taken = deals.filter((deal) => deal.status === "taken");
  // Retired by the watcher for having passed its book-by date. Not open, and not
  // something the family turned down either: it simply ran out, and saying so is
  // better than a card quietly disappearing off the screen.
  const ran = deals.filter((deal) => deal.status === "expired");

  const [pasting, setPasting] = useState(false);
  const [text, setText] = useState("");
  const [where, setWhere] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");
  const [error, setError] = useState("");
  const [acting, setActing] = useState(null);
  const [reasoning, setReasoning] = useState(null);
  const [reason, setReason] = useState("");

  const read = async () => {
    setBusy(true);
    setError("");
    setSaid("");
    try {
      const res = await fetch("/api/deals/parse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          source_name: where,
          source_url: link,
        }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(body?.error || "That did not save.");
        return;
      }
      if (!body?.saved) {
        // The refusal is the useful answer here, so it is shown in the words the
        // route used rather than flattened into "could not read that".
        setSaid(body?.why ? `I did not save it: ${body.why}.` : "");
        return;
      }
      setText("");
      setLink("");
      setPasting(false);
      setSaid(
        body.missing?.length
          ? `Saved. It does not say ${body.missing.join(", or ")}, so I have left those out.`
          : "",
      );
      router.refresh();
    } catch {
      setError("That did not save.");
    } finally {
      setBusy(false);
    }
  };

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

  const pasteForm = (
    <div className="card p-3">
      <label className="section-label block" htmlFor="deal-text">
        Paste the alert
      </label>
      <textarea
        id="deal-text"
        className="field mt-1 h-28 w-full"
        value={text}
        placeholder="STL to Lisbon, $412 round trip, travel 2027-05-28 to 2027-06-06, book by 2026-09-22"
        onChange={(event) => setText(event.target.value)}
      />
      <div className="mt-2 flex flex-wrap gap-3">
        <div>
          <label className="section-label block" htmlFor="deal-where">
            Where it came from
          </label>
          <input
            id="deal-where"
            className="field mt-1 w-56"
            value={where}
            placeholder="Thrifty Traveler"
            maxLength={80}
            onChange={(event) => setWhere(event.target.value)}
          />
        </div>
        <div className="min-w-0 flex-1">
          <label className="section-label block" htmlFor="deal-link">
            Link, if you have one
          </label>
          <input
            id="deal-link"
            className="field mt-1 w-full"
            value={link}
            placeholder="https://"
            maxLength={500}
            onChange={(event) => setLink(event.target.value)}
          />
        </div>
      </div>
      <p className="mt-2 text-sm text-ink-soft">
        I read only what the alert says. A price, a date or an airline that is
        not written down is left out rather than guessed at.
      </p>
      {error ? <p className="mt-2 text-sm text-rose">{error}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy || text.trim().length < 12 || !where.trim()}
          onClick={read}
        >
          {busy ? "Reading…" : "Read it"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            setPasting(false);
            setError("");
          }}
        >
          Cancel
        </button>
      </div>
    </div>
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

  // Nothing pasted yet: one quiet line, and the form only when it is asked for.
  // The line no longer opens by asking whether you have seen a fare worth
  // checking. Finding the fares is going to happen somewhere else, and a screen
  // that opens by asking the family to go looking is describing the old plan.
  if (!open.length && !refused.length && !taken.length) {
    return (
      <section>
        {pasting ? (
          pasteForm
        ) : (
          <p className="text-sm text-ink-soft">
            <button
              type="button"
              className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
              onClick={() => setPasting(true)}
            >
              Paste a fare
            </button>{" "}
            and I will say what it means for these places, your airports and the
            trips you already have.
          </p>
        )}
        {said ? <p className="mt-2 text-sm text-ink">{said}</p> : null}
      </section>
    );
  }

  return (
    <section>
      {open.length ? (
        <>
          <h2 className="font-display text-lg font-semibold">
            Fares you pasted in
          </h2>
          <p className="mt-1 max-w-2xl text-sm text-ink-soft">
            Judged against your airports, the ceilings on this list and the
            trips you already have.
          </p>
          <ul className="mt-3 space-y-3">{open.map(card)}</ul>
        </>
      ) : null}

      <div className="mt-3">
        {pasting ? (
          pasteForm
        ) : (
          <button
            type="button"
            className="text-sm text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
            onClick={() => setPasting(true)}
          >
            Paste another fare
          </button>
        )}
      </div>
      {said ? <p className="mt-2 text-sm text-ink">{said}</p> : null}

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
