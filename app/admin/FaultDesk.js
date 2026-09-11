"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import {
  FEEDBACK_STATUSES,
  faultSourceLabel,
  statusLabel,
} from "@/lib/feedback/shared";

/**
 * What broke on its own.
 *
 * The same table as the written reports and a section of its own, because the two
 * read differently: a person's report is a paragraph to be understood, and a
 * fault is a line to be recognized. What matters here is how many times and how
 * recently, so the count leads and the stack is folded away until somebody
 * actually wants it.
 *
 * One row per fault per tester, not one row per occurrence. A screen that throws
 * on every visit would otherwise push a fault that happened once off the bottom
 * of the page, which is exactly the wrong way round.
 */
export default function FaultDesk({ faults = [] }) {
  const router = useRouter();
  const [busy, setBusy] = useState("");
  const [open, setOpen] = useState("");
  const [error, setError] = useState("");

  async function mark(id, status) {
    setBusy(id);
    setError("");
    try {
      const res = await fetch("/api/admin/feedback", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ id, status }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        setError(data?.error || "That did not save.");
        return;
      }
      router.refresh();
    } catch {
      setError("That did not save.");
    } finally {
      setBusy("");
    }
  }

  const waiting = faults.filter((one) => one.status === "new").length;
  const times = faults.reduce((sum, one) => sum + (one.seenCount || 1), 0);

  return (
    <section>
      <h2 className="font-display text-xl font-semibold">
        What broke on its own
      </h2>
      <p className="mt-1.5 text-sm text-ink-soft">
        {faults.length
          ? `${faults.length} ${faults.length === 1 ? "fault" : "faults"}, seen ${times} ${times === 1 ? "time" : "times"} between them. ${waiting} not looked at yet.`
          : "Nothing has thrown yet. Errors, unanswered promises and broken calls land here by themselves."}
      </p>

      {error && <p className="mt-3 text-sm text-rose">{error}</p>}

      <ul className="mt-4 space-y-3">
        {faults.map((one) => (
          <li key={one.id} className="card p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <span className="text-sm font-semibold">
                {faultSourceLabel(one.source)}
                {one.status !== "new" && (
                  <span className="ml-2 text-xs font-normal text-ink-soft">
                    {statusLabel(one.status)}
                  </span>
                )}
              </span>
              <span className="text-xs text-ink-soft">
                {one.seenCount > 1
                  ? `${one.seenCount} times, last ${one.lastAt || one.at}`
                  : `Once, ${one.at}`}
              </span>
            </div>

            <p className="mt-2 break-words font-mono text-sm leading-relaxed">
              {one.body}
            </p>

            <p className="mt-3 text-xs text-ink-soft">
              {[
                one.path ? `On ${one.path}` : null,
                one.email || null,
                one.skin ? `Look: ${one.skin}` : null,
                one.viewport || null,
                one.build ? `Build ${one.build}` : null,
                one.browser || null,
              ]
                .filter(Boolean)
                .join(" · ")}
            </p>

            {one.thrownAt && (
              <p className="mt-1.5 break-all text-xs text-ink-soft">
                Thrown at {one.thrownAt}
              </p>
            )}

            {one.stack && (
              <div className="mt-2">
                <button
                  type="button"
                  onClick={() => setOpen(open === one.id ? "" : one.id)}
                  className="btn btn-ghost btn-sm"
                  aria-expanded={open === one.id}
                >
                  {open === one.id ? "Hide the stack" : "Show the stack"}
                </button>
                {open === one.id && (
                  <pre className="mt-2 overflow-x-auto whitespace-pre-wrap break-words rounded-lg border border-sand-deep p-3 text-xs leading-relaxed text-ink-soft">
                    {one.stack}
                  </pre>
                )}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-1.5 border-t border-sand-deep pt-3">
              {FEEDBACK_STATUSES.map((status) => (
                <button
                  key={status}
                  type="button"
                  onClick={() => mark(one.id, status)}
                  disabled={busy === one.id || one.status === status}
                  aria-pressed={one.status === status}
                  className={`chip ${one.status === status ? "chip-shade" : ""}`}
                >
                  {statusLabel(status)}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
