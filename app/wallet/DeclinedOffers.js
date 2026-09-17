"use client";

// The cards you said no to.
//
// A refusal has to be visible somewhere, or it is indistinguishable from the app
// quietly forgetting to mention something. This is that somewhere: the terms you
// turned down, the day you turned them down, and a way back in. Without the way
// back a single hurried dismissal in March would silently retire a card forever,
// which is a worse failure than asking twice.
//
// It stays off the screen entirely until there is a refusal to show. Nobody
// arrives at the Wallet looking for a list of things they already decided --
// unless they went to the History tab, which is the one place where an empty list
// is an answer rather than clutter, and where saying nothing would read as the
// tab having failed to load.

import { useState } from "react";
import { offerDate, offerHost } from "@/lib/rewards-offers";
import { formatMoney } from "@/lib/rewards";

function terms(offer) {
  const parts = [];
  if (offer.bonus_text) parts.push(offer.bonus_text);
  if (offer.min_spend)
    parts.push(
      `after ${formatMoney(Number(offer.min_spend))} of spending${
        offer.spend_window_days ? ` in ${offer.spend_window_days} days` : ""
      }`,
    );
  if (offer.annual_fee !== null && offer.annual_fee !== undefined)
    parts.push(
      Number(offer.annual_fee) === 0
        ? "no annual fee"
        : `${formatMoney(Number(offer.annual_fee))} a year`,
    );
  return parts.join(", ");
}

export default function DeclinedOffers({
  offers = [],
  // On the History tab, where the heading and an empty line are the point.
  bare = false,
}) {
  const [rows, setRows] = useState(offers);
  const [busy, setBusy] = useState(null);

  if (!rows.length && !bare) return null;

  const askAgain = async (offer) => {
    setBusy(offer.id);
    try {
      const res = await fetch(`/api/offers/${offer.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" }),
      });
      if (!res.ok) throw new Error();
      setRows((prev) => prev.filter((row) => row.id !== offer.id));
    } catch {
      setBusy(null);
    }
  };

  return (
    <section className={bare ? "no-print" : "no-print mt-8"}>
      <h2 className="font-display text-lg font-semibold">
        Offers you turned down
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        {rows.length
          ? "Aly leaves these alone unless the terms genuinely improve — a bigger bonus, less spending, or a smaller fee. Ask again and she will treat it as an open question at the next look."
          : "Nothing turned down yet. Press “Not this card” on a welcome offer and it lands here, with the terms you saw and the day you saw them, so a card you passed on once is never quietly retired for good."}
      </p>
      <ul className="mt-3 space-y-2">
        {rows.map((offer) => (
          <li
            key={offer.id}
            className="rounded-xl border border-[var(--line)] bg-white/60 p-4 sm:flex sm:items-start sm:justify-between sm:gap-4"
          >
            <div className="min-w-0">
              <p className="font-semibold leading-snug text-ink">
                {offer.issuer ? `${offer.issuer} ` : ""}
                {offer.card_name}
              </p>
              {terms(offer) ? (
                <p className="mt-0.5 text-sm text-ink-soft">{terms(offer)}</p>
              ) : null}
              <p className="mt-1 text-xs text-ink-faint">
                You passed on it
                {offer.decided_on ? ` on ${offerDate(offer.decided_on)}` : ""}
                {offer.source_url
                  ? `, read from ${offerHost(offer.source_url)}`
                  : ""}
                .
              </p>
            </div>
            <button
              type="button"
              disabled={busy === offer.id}
              onClick={() => askAgain(offer)}
              className="btn btn-ghost mt-3 w-full shrink-0 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] disabled:opacity-60 sm:mt-0 sm:w-auto"
            >
              {busy === offer.id ? "Asking…" : "Ask again"}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
