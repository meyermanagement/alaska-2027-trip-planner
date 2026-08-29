"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { tipWhen, WALLET_SCOPES } from "@/lib/tips/tip";

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
export default function TipStrip({ tips = [], today }) {
  const [gone, setGone] = useState({});
  const shown = tips.filter((tip) => !gone[tip.id]);

  const resolve = useCallback(async (tip, status) => {
    setGone((prev) => ({ ...prev, [tip.id]: status }));
    try {
      const res = await fetch(`/api/tips/${tip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
    } catch {
      // Put it back rather than pretend. A tip that silently failed to clear
      // would reappear on the next page load anyway, which is more confusing.
      setGone((prev) => {
        const next = { ...prev };
        delete next[tip.id];
        return next;
      });
    }
  }, []);

  const makeTask = useCallback(async (tip) => {
    setGone((prev) => ({ ...prev, [tip.id]: "cleared" }));
    try {
      const res = await fetch(`/api/tips/${tip.id}/task`, { method: "POST" });
      if (!res.ok) throw new Error();
    } catch {
      setGone((prev) => {
        const next = { ...prev };
        delete next[tip.id];
        return next;
      });
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
            <div key={tip.id} className="text-[0.88rem] leading-snug">
              {/* Stacked rather than one long row: on a phone a four-column row
                  turns the body into a column two words wide. */}
              <p>
                <span className="mr-2 text-[0.68rem] font-bold uppercase tracking-[0.09em] text-amber">
                  {when.label}
                </span>
                <span className="font-semibold text-ink">{tip.title}</span>
              </p>
              <p className="mt-0.5 text-ink-soft">{tip.body}</p>
              <p className="mt-1 flex flex-wrap items-baseline gap-x-3">
                {tip.trips?.slug ? (
                  <Link
                    href={`/trips/${tip.trips.slug}`}
                    className="text-[0.78rem] font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                  >
                    {tip.trips.name}
                  </Link>
                ) : WALLET_SCOPES.includes(tip.scope) ? (
                  // No trip behind it, but it did come from somewhere, and a tip
                  // about a card is unreadable without the card in front of you.
                  <Link
                    href="/wallet"
                    className="text-[0.78rem] font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                  >
                    {tip.about || "Wallet"}
                  </Link>
                ) : null}
                {tip.trip_id ? (
                  <button
                    type="button"
                    onClick={() => makeTask(tip)}
                    className="text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-teal hover:underline"
                  >
                    Remind me
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={() => resolve(tip, "cleared")}
                  className="text-[0.7rem] font-semibold uppercase tracking-[0.06em] text-ink-soft hover:text-teal"
                >
                  Clear
                </button>
              </p>
            </div>
          );
        })}
      </div>
    </section>
  );
}
