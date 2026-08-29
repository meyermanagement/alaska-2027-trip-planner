"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { WALLET_SCOPES } from "@/lib/tips/tip";
import { announceTipResolved } from "@/lib/tips/cleared";
import { tripPath } from "@/lib/trips/route";

/**
 * The tips you have put away, kept where they can be found again.
 *
 * At the bottom of Reminders and shut by default, because that is what it is for:
 * a record rather than a screen. Nothing is fetched until it is opened, so the
 * list costs nothing on the days nobody wonders.
 *
 * Worth keeping at all because clearing a tip is a judgement about a moment. "We
 * are not driving that road" is true until the itinerary changes; "we already have
 * a converter" is true until it is left in a drawer. Six months on, the list is
 * the only way to find out what the app stopped mentioning.
 *
 * It used to list only the tips pressed with Ignore, back when Clear and Ignore
 * were different buttons. They are one button now, and it lists everything put
 * away either way.
 */
export default function ClearedTips() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setProblem("");
    try {
      const res = await fetch("/api/tips/cleared");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "");
      setRows(json.tips || []);
    } catch {
      setProblem("Could not fetch those. Try opening it again.");
    }
    setBusy(false);
  }, []);

  const restore = useCallback(async (tip) => {
    setRows((prev) => (prev || []).filter((row) => row.id !== tip.id));
    // If it was cleared a minute ago and this is somebody taking it back, the
    // card and the band still have it in hand and only need telling to show it
    // again. If it was cleared last month they never had it, and nothing short of
    // a reload can put it back -- which is fine, because that is not the case
    // anybody is anxious about.
    announceTipResolved(tip.id, null);
    try {
      const res = await fetch(`/api/tips/${tip.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "active" }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setRows((prev) => [tip, ...(prev || [])]);
      announceTipResolved(tip.id, "cleared");
      setProblem("That did not save. It is still here.");
    }
  }, []);

  return (
    <details
      className="no-print mt-10 border-t border-[var(--line)] pt-5"
      onToggle={(event) => {
        const isOpen = event.currentTarget.open;
        setOpen(isOpen);
        if (isOpen && rows === null && !busy) load();
      }}
    >
      <summary className="cursor-pointer list-none text-[0.72rem] font-semibold uppercase tracking-[0.09em] text-ink-faint transition hover:text-ink-soft">
        {open ? "Hide" : "Show"} tips you have cleared
      </summary>

      <div className="mt-4">
        {problem ? (
          <p role="alert" className="text-[0.82rem] text-rose">
            {problem}
          </p>
        ) : null}
        {busy && rows === null ? (
          <p className="text-[0.84rem] text-ink-soft">Fetching…</p>
        ) : null}
        {rows && !rows.length ? (
          <p className="text-[0.84rem] leading-relaxed text-ink-soft">
            Nothing cleared yet. Anything you clear ends up here, in case it
            stops being wrong, and can be brought back.
          </p>
        ) : null}
        {rows && rows.length ? (
          <ul className="space-y-3">
            {rows.map((tip) => (
              <li
                key={tip.id}
                className="rounded-xl border border-[var(--line)] bg-white/60 p-4"
              >
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <h4 className="font-semibold leading-snug text-ink-soft">
                    {tip.title}
                  </h4>
                  {WALLET_SCOPES.includes(tip.scope) ? (
                    <Link
                      href="/wallet"
                      className="text-[0.78rem] font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                    >
                      {tip.about || "Wallet"}
                    </Link>
                  ) : tip.trips?.slug || tip.trips?.public_id ? (
                    <Link
                      href={tripPath(tip.trips)}
                      className="text-[0.76rem] font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                    >
                      {tip.trips.name}
                    </Link>
                  ) : null}
                </div>
                <p className="mt-1 text-[0.86rem] leading-relaxed text-ink-faint">
                  {tip.body}
                </p>
                <button
                  type="button"
                  onClick={() => restore(tip)}
                  className="btn-ghost mt-3 px-3 py-1 text-[0.68rem] font-semibold uppercase tracking-[0.06em]"
                >
                  Bring it back
                </button>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </details>
  );
}
