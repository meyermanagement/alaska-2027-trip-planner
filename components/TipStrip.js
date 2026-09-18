"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { OFFER_SCOPE, tipWhen, WALLET_SCOPES } from "@/lib/tips/tip";
import { announceTipResolved, onTipResolved } from "@/lib/tips/cleared";
import { tripPath } from "@/lib/trips/route";
import { announceTipHeaderHidden, onTipHeaderHidden } from "@/lib/tips/header";

/**
 * The pro tips that have earned a place at the top of every screen.
 *
 * Only two things get in here: a tip with a date inside the next fortnight, and a
 * tip the model marked as costing something if you wait. Everything else waits on
 * the screen it belongs to, because this is the most expensive space in the app —
 * it is in front of you whatever you actually came to do.
 *
 * Quieter than the passport band above it, and dismissible, which is the honest
 * difference between advice and a problem. Advice you can wave off.
 */
export default function TipStrip({ tips = [], today, readOnly = false }) {
  const [gone, setGone] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState("");
  useEffect(() => onTipHeaderHidden((id) => setGone((prev) => ({ ...prev, [id]: "hidden" }))), []);
  const shown = tips.filter((tip) => !gone[tip.id]);

  // The same tip cleared on the screen below. Nothing to save -- that already
  // happened down there -- so this only stops showing it.
  useEffect(
    () =>
      onTipResolved((id, status) =>
        setGone((prev) => {
          if (status) return { ...prev, [id]: status };
          const next = { ...prev };
          delete next[id];
          return next;
        }),
      ),
    [],
  );

  const resolve = useCallback(async (tip, headerOnly = false) => {
    setBusy(tip.id);
    setError("");
    try {
      const res = await fetch(`/api/tips/${tip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(headerOnly ? { header_hidden: true } : { status: "cleared" }),
      });
      if (!res.ok) throw new Error();
      setGone((prev) => ({ ...prev, [tip.id]: headerOnly ? "hidden" : "cleared" }));
      if (headerOnly) announceTipHeaderHidden(tip.id);
      else announceTipResolved(tip.id, "cleared");
    } catch {
      setError("That did not save. Please try again.");
    } finally {
      setBusy(null);
    }
  }, []);

  const makeTask = useCallback(async (tip) => {
    setGone((prev) => ({ ...prev, [tip.id]: "cleared" }));
    announceTipResolved(tip.id, "cleared");
    try {
      const res = await fetch(`/api/tips/${tip.id}/task`, { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      setGone((prev) => {
        const next = { ...prev };
        delete next[tip.id];
        return next;
      });
      announceTipResolved(tip.id, null);
    }
  }, []);

  if (!shown.length) return null;

  return (
    <section
      aria-label="Pro tips worth knowing now"
      className="no-print border-b border-amber/30 bg-amber/8"
    >
      <div className="mx-auto max-w-5xl space-y-2 px-5 py-3">
        {shown.map((tip) => {
          const when = tipWhen(tip, today);
          return (
            <div key={tip.id} className="text-sm leading-snug">
              {/* Stacked rather than one long row: on a phone a four-column row
                  turns the body into a column two words wide. */}
              <p>
                <span className="mr-2 text-2xs font-bold uppercase tracking-[0.09em] text-amber">
                  {when.label}
                </span>
                <span className="font-semibold text-ink">{tip.title}</span>
              </p>
              <p className="mt-0.5 text-ink-soft">{tip.body}</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
                {tip.trips?.slug || tip.trips?.public_id ? (
                  <Link
                    href={tripPath(tip.trips)}
                    className="text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                  >
                    {tip.trips.name}
                  </Link>
                ) : WALLET_SCOPES.includes(tip.scope) ? (
                  // No trip behind it, but it did come from somewhere, and a tip
                  // about a card is unreadable without the card in front of you.
                  <Link
                    href="/wallet"
                    className="text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                  >
                    {tip.about || "Wallet"}
                  </Link>
                ) : null}
                {tip.trip_id && !readOnly ? (
                  <button
                    type="button"
                    onClick={() => makeTask(tip)}
                    disabled={busy !== null}
                    className="text-xs font-semibold uppercase tracking-[0.06em] text-teal hover:underline"
                  >
                    Remind me
                  </button>
                ) : null}
                {/* Everything but a card offer. The terms are not up here and
                    neither is the refusal button, so the only thing Clear could
                    write is "read" -- which would file the offer's own sentence
                    under the cleared tips while the offer itself sat open in the
                    Wallet. The link above goes to where the decision is made. */}
                {!readOnly ? (
                  <button
                    type="button"
                    disabled={busy !== null}
                    onClick={() => resolve(tip, true)}
                    title="Hide this notice; keep the tip where it belongs"
                    className="min-h-11 text-xs font-semibold text-ink-soft hover:text-teal disabled:opacity-60"
                  >
                    {busy === tip.id ? "Saving…" : "Hide from top"}
                  </button>
                ) : null}
                {tip.scope === OFFER_SCOPE || readOnly ? null : (
                  <button
                    type="button"
                    onClick={() => resolve(tip)}
                    disabled={busy !== null}
                    title="Clear this tip from its page and the top of the screen"
                    className="min-h-11 text-xs font-semibold text-ink-soft hover:text-teal disabled:opacity-60"
                  >
                    {tip.trip_id ? "Clear from trip" : WALLET_SCOPES.includes(tip.scope) ? "Clear from Wallet" : "Clear tip"}
                  </button>
                )}
              </p>
            </div>
          );
        })}
        {error ? <p role="alert" className="text-sm text-rose">{error}</p> : null}
      </div>
    </section>
  );
}
