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
import { useRouter } from "next/navigation";
import { offerDate, offerHost } from "@/lib/rewards-offers";
import { formatMoney } from "@/lib/rewards";
import HistoryGroups from "@/components/HistoryGroups";
import HistoryRetentionNotice from "@/components/HistoryRetentionNotice";

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
  const [said, setSaid] = useState("");
  const [problem, setProblem] = useState("");
  const router = useRouter();

  if (!rows.length && !bare) return null;

  // Where the card goes, said and then done. The old button was labelled "Ask
  // again", which named neither who was being asked nor what would happen, and
  // the press only dropped the row from this list: the offer really had gone
  // back to Current offers, but that section is rendered on the server above
  // these tabs and was not re-read, so the screen showed a card disappearing and
  // nothing arriving. The refresh is the missing half, and the sentence says
  // where to look while it happens.
  const reconsider = async (offer) => {
    setBusy(offer.id);
    setSaid("");
    setProblem("");
    try {
      const res = await fetch(`/api/offers/${offer.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "open" }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setProblem(body?.error || "That could not be put back.");
        setBusy(null);
        return;
      }
      setRows((prev) => prev.filter((row) => row.id !== offer.id));
      setSaid(
        `${offer.card_name} is back under Current offers, where Aly will weigh it as a live question.`,
      );
      router.refresh();
    } catch {
      setProblem("That could not be put back.");
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
          ? "Aly leaves these alone unless the terms genuinely improve — a bigger bonus, less spending, or a smaller fee. Put one back under Current offers to have her weigh it as a live question again."
          : "No offers in history. Offers you turn down appear here."}
      </p>
      <HistoryRetentionNotice />
      <HistoryGroups items={rows} shortHistory getDate={offer => offer.history_entered_at || offer.decided_on || offer.created_at}
        renderItems={periodOffers => <ul className="mt-3 space-y-2">
        {periodOffers.map((offer) => (
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
              onClick={() => reconsider(offer)}
              className="btn btn-ghost mt-3 w-full shrink-0 px-3 py-1 text-xs font-semibold uppercase tracking-[0.06em] disabled:opacity-60 sm:mt-0 sm:w-auto"
            >
              {busy === offer.id ? "Putting it back…" : "Consider it again"}
            </button>
          </li>
        ))}
      </ul>} />
      {said ? <p className="mt-3 text-sm text-ink">{said}</p> : null}
      {problem ? <p className="mt-3 text-sm text-rose">{problem}</p> : null}
    </section>
  );
}
