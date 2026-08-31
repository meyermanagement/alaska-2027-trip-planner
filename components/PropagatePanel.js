"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { formatDayYear } from "@/lib/format";

/**
 * Pushing the templates onto trips that have not happened yet.
 *
 * Deliberately two presses. The first one only looks: it comes back with the
 * exact items on the exact trips, and nothing has been written. The second one
 * does it. That shape is here because this is the only screen in the app that can
 * delete something off a list somebody is already using, and a count on its own
 * ("would change 23 items") is not enough to decide with.
 */
export default function PropagatePanel() {
  const router = useRouter();
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);

  async function call(apply) {
    setBusy(apply ? "applying" : "checking");
    setError("");
    try {
      const res = await fetch("/api/packing/propagate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(apply ? { apply: true } : {}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "That did not work. Try again in a moment.");
        return;
      }
      if (apply) {
        setDone(data.applied);
        setPlan(null);
        router.refresh();
      } else {
        setPlan(data);
        setDone(null);
      }
    } catch {
      setError("That did not work. Try again in a moment.");
    } finally {
      setBusy("");
    }
  }

  const totals = plan?.totals;
  const nothing =
    plan && totals && !totals.adds && !totals.updates && !totals.removes;

  return (
    <div className="no-print card mb-4 p-4">
      <h2 className="text-sm font-semibold tracking-wide text-ink">
        Push these lists onto upcoming trips
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        A trip&rsquo;s packing list is a copy taken when the trip was built, so
        editing a template here does not change trips you already have. This
        looks at every trip that has not started yet and tells you exactly what
        it would change before it changes anything.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          className="btn btn-ghost"
          onClick={() => call(false)}
          disabled={!!busy}
        >
          {busy === "checking" ? "Looking…" : "Check what would change"}
        </button>
        {plan && !nothing && (
          <button
            className="btn btn-primary"
            onClick={() => call(true)}
            disabled={!!busy}
          >
            {busy === "applying"
              ? "Applying…"
              : `Apply to ${totals.trips} ${totals.trips === 1 ? "trip" : "trips"}`}
          </button>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-rose">{error}</p>}

      {done && (
        <p className="mt-3 text-sm text-ink">
          Done — {done.adds} added, {done.updates} changed, {done.removes}{" "}
          removed.
          {done.errors?.length ? (
            <span className="mt-1 block text-rose">
              Some of it did not land: {done.errors.join("; ")}
            </span>
          ) : null}
        </p>
      )}

      {nothing && (
        <p className="mt-3 text-sm text-ink-soft">
          Nothing to push. Your{" "}
          {plan.considered === 1 ? "one upcoming trip" : "upcoming trips"}{" "}
          already match these lists.
        </p>
      )}

      {plan && !nothing && (
        <div className="mt-4 space-y-3">
          {totals.removes > 0 && (
            <p className="rounded-xl border border-rose/40 bg-rose/5 p-3 text-sm text-ink">
              This includes {totals.removes}{" "}
              {totals.removes === 1 ? "item" : "items"} being deleted off a trip
              list, including any you have already ticked off. Only lines that
              came from a template are ever removed — anything you typed
              yourself is left alone.
            </p>
          )}
          {plan.trips.map((t) => (
            <div
              key={t.trip_id}
              className="rounded-xl border border-[var(--line)] p-3"
            >
              <p className="flex flex-wrap items-baseline gap-x-2 text-sm font-semibold text-ink">
                {t.trip}
                <span className="font-normal text-xs text-ink-soft">
                  {formatDayYear(t.start_date)} · using {t.using.join(" + ")}
                </span>
              </p>
              <ul className="mt-2 space-y-1 text-sm">
                {t.adds.map((a, i) => (
                  <li key={`a${i}`} className="text-ink">
                    <span className="font-semibold text-teal">+</span>{" "}
                    <span className="font-medium">{a.item}</span>
                    <span className="text-ink-soft">
                      {" "}
                      · {a.assignee}
                      {a.last_minute ? " · last minute" : ""} · from{" "}
                      {a.template}
                    </span>
                  </li>
                ))}
                {t.updates.map((u) => (
                  <li key={u.id} className="text-ink">
                    <span className="font-semibold text-ink-soft">~</span>{" "}
                    <span className="font-medium">{u.item}</span>
                    <span className="text-ink-soft">
                      {" "}
                      · {u.assignee} ·{" "}
                      {Object.keys(u.changes)
                        .map(
                          (f) =>
                            `${label(f)}: ${said(u.was[f])} → ${said(u.changes[f])}`,
                        )
                        .join(", ")}
                    </span>
                  </li>
                ))}
                {t.removes.map((r) => (
                  <li key={r.id} className="text-ink">
                    <span className="font-semibold text-rose">&minus;</span>{" "}
                    <span className="font-medium">{r.item}</span>
                    <span className="text-ink-soft">
                      {" "}
                      · {r.assignee}
                      {r.is_packed ? " · already packed" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const LABELS = {
  category: "category",
  quantity: "quantity",
  last_minute: "last minute",
};
const label = (field) => LABELS[field] || field;

/** A changed value, in words rather than as a raw null or boolean. */
function said(value) {
  if (value === true) return "yes";
  if (value === false) return "no";
  if (value === null || value === "") return "blank";
  return String(value);
}
