"use client";

import { useMemo, useState } from "react";
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
 *
 * The second press is now a choice rather than a single door. Every proposed
 * change carries a key from the planner, each one has a tick, and the three ways
 * out -- one item, one trip, everything -- are the same mechanism with different
 * amounts selected. All-or-nothing was wrong for the case that actually comes up:
 * a template edit meant for the cruise in July should not have to wait for a
 * decision about the horse show in September.
 */
export default function PropagatePanel() {
  const router = useRouter();
  const [plan, setPlan] = useState(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [done, setDone] = useState(null);
  // Keys that are ticked. Everything a fresh plan proposes starts ticked, so
  // pressing straight through behaves the way the one button used to.
  const [picked, setPicked] = useState(() => new Set());

  const keysOf = (entry) =>
    [...entry.adds, ...entry.updates, ...entry.removes].map((c) => c.key);

  async function check() {
    setBusy("checking");
    setError("");
    try {
      const res = await fetch("/api/packing/propagate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "That did not work. Try again in a moment.");
        return;
      }
      setPlan(data);
      setPicked(new Set((data.trips || []).flatMap(keysOf)));
      setDone(null);
    } catch {
      setError("That did not work. Try again in a moment.");
    } finally {
      setBusy("");
    }
  }

  /**
   * Apply a set of keys. `label` is only for the button's own busy state, so two
   * buttons cannot both look like they are working.
   */
  async function apply(keys, label) {
    const only = Array.from(keys);
    if (!only.length) return;
    setBusy(label);
    setError("");
    try {
      const res = await fetch("/api/packing/propagate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apply: true, only }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data?.error || "That did not work. Try again in a moment.");
        return;
      }
      setDone(data.applied);
      // Look again rather than clearing. Pushing one trip usually means the next
      // one is the point of the visit, and making the family press "Check what
      // would change" a second time to see what is left is a way of hiding it.
      const rest = await fetch("/api/packing/propagate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const after = rest.ok ? await rest.json() : null;
      if (after) {
        setPlan(after);
        setPicked(new Set((after.trips || []).flatMap(keysOf)));
      } else {
        setPlan(null);
        setPicked(new Set());
      }
      router.refresh();
    } catch {
      setError("That did not work. Try again in a moment.");
    } finally {
      setBusy("");
    }
  }

  /** Throw the proposal away. Nothing has been written, so nothing is undone. */
  function discard() {
    setPlan(null);
    setPicked(new Set());
    setError("");
    setDone(null);
  }

  const toggle = (key) =>
    setPicked((was) => {
      const next = new Set(was);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const setTrip = (entry, on) =>
    setPicked((was) => {
      const next = new Set(was);
      for (const k of keysOf(entry)) {
        if (on) next.add(k);
        else next.delete(k);
      }
      return next;
    });

  const totals = plan?.totals;
  const nothing =
    plan && totals && !totals.adds && !totals.updates && !totals.removes;

  // What is ticked, counted the way the buttons need it: overall, and how many
  // of those are deletions, because that is the number the warning is about.
  const chosen = useMemo(() => {
    if (!plan) return { count: 0, removes: 0, trips: 0 };
    let count = 0,
      removes = 0,
      trips = 0;
    for (const entry of plan.trips || []) {
      const mine = keysOf(entry).filter((k) => picked.has(k));
      if (mine.length) trips += 1;
      count += mine.length;
      removes += entry.removes.filter((r) => picked.has(r.key)).length;
    }
    return { count, removes, trips };
  }, [plan, picked]);

  const allKeys = plan ? (plan.trips || []).flatMap(keysOf) : [];
  const everything = allKeys.length;

  return (
    <div className="no-print card mb-4 p-4">
      <h2 className="text-sm font-semibold tracking-wide text-ink">
        Push these lists onto upcoming trips
      </h2>
      <p className="mt-1 text-sm text-ink-soft">
        A trip&rsquo;s packing list is a copy taken when the trip was built, so
        editing a template here does not change trips you already have. This
        looks at every trip that has not started yet and tells you exactly what
        it would change before it changes anything. Then you choose how much of
        it to do &mdash; one item, one trip, or all of it.
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button className="btn btn-ghost" onClick={check} disabled={!!busy}>
          {busy === "checking" ? "Looking…" : "Check what would change"}
        </button>
        {plan && !nothing && (
          <>
            <button
              className="btn btn-primary"
              onClick={() => apply(new Set(allKeys), "all")}
              disabled={!!busy || !everything}
            >
              {busy === "all"
                ? "Applying…"
                : `Apply all ${everything} ${everything === 1 ? "change" : "changes"} on ${totals.trips} ${totals.trips === 1 ? "trip" : "trips"}`}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => apply(picked, "picked")}
              disabled={!!busy || !chosen.count || chosen.count === everything}
            >
              {busy === "picked"
                ? "Applying…"
                : `Apply the ${chosen.count} ticked`}
            </button>
            {/* The way out. A plan that has been read and rejected should be
                dismissable, not something you leave the page to escape: until
                now the only exits from a screenful of proposed deletions were
                to apply some of them or to navigate away. Nothing has been
                written at this point, so this discards a proposal rather than
                undoing anything. */}
            <button
              className="btn btn-ghost"
              onClick={discard}
              disabled={!!busy}
            >
              Cancel
            </button>
          </>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-rose">{error}</p>}

      {done && (
        <p className="mt-3 text-sm text-ink">
          Done — {done.adds} added, {done.updates} changed, {done.removes}{" "}
          removed.
          {done.missing ? (
            <span className="mt-1 block text-ink-soft">
              {done.missing}{" "}
              {done.missing === 1 ? "change was" : "changes were"} no longer
              there to make — the lists had moved on since you looked. What is
              below is current.
            </span>
          ) : null}
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
          {chosen.removes > 0 && (
            <p className="rounded-xl border border-rose/40 bg-rose/5 p-3 text-sm text-ink">
              What you have ticked includes {chosen.removes}{" "}
              {chosen.removes === 1 ? "item" : "items"} being deleted off a trip
              list, including any you have already ticked off. Only lines that
              came from a template are ever removed — anything you typed
              yourself is left alone. Untick a line to keep it.
            </p>
          )}
          {plan.trips.map((t) => {
            const keys = keysOf(t);
            const mine = keys.filter((k) => picked.has(k)).length;
            const busyHere = busy === `trip:${t.trip_id}`;
            return (
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
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <button
                    className="btn btn-primary text-xs"
                    onClick={() => apply(new Set(keys), `trip:${t.trip_id}`)}
                    disabled={!!busy}
                  >
                    {busyHere
                      ? "Applying…"
                      : `Apply all ${keys.length} to this trip`}
                  </button>
                  {mine > 0 && mine < keys.length && (
                    <button
                      className="btn btn-ghost text-xs"
                      onClick={() =>
                        apply(
                          new Set(keys.filter((k) => picked.has(k))),
                          `trip:${t.trip_id}`,
                        )
                      }
                      disabled={!!busy}
                    >
                      Apply the {mine} ticked here
                    </button>
                  )}
                  <button
                    className="text-xs text-teal underline"
                    onClick={() => setTrip(t, mine < keys.length)}
                    disabled={!!busy}
                  >
                    {mine < keys.length ? "Tick all of these" : "Untick these"}
                  </button>
                </div>
                <ul className="mt-2 space-y-1 text-sm">
                  {t.adds.map((a) => (
                    <Line
                      key={a.key}
                      itemKey={a.key}
                      on={picked.has(a.key)}
                      onToggle={toggle}
                      disabled={!!busy}
                      mark="+"
                      markClass="text-teal"
                      name={a.item}
                    >
                      · {a.assignee}
                      {a.last_minute ? " · last minute" : ""} · from{" "}
                      {a.template}
                    </Line>
                  ))}
                  {t.updates.map((u) => (
                    <Line
                      key={u.key}
                      itemKey={u.key}
                      on={picked.has(u.key)}
                      onToggle={toggle}
                      disabled={!!busy}
                      mark="~"
                      markClass="text-ink-soft"
                      name={u.item}
                    >
                      · {u.assignee} ·{" "}
                      {Object.keys(u.changes)
                        .map(
                          (f) =>
                            `${label(f)}: ${said(u.was[f])} → ${said(u.changes[f])}`,
                        )
                        .join(", ")}
                    </Line>
                  ))}
                  {t.removes.map((r) => (
                    <Line
                      key={r.key}
                      itemKey={r.key}
                      on={picked.has(r.key)}
                      onToggle={toggle}
                      disabled={!!busy}
                      mark="−"
                      markClass="text-rose"
                      name={r.item}
                    >
                      · {r.assignee}
                      {r.is_packed ? " · already packed" : ""}
                    </Line>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/**
 * One proposed change, with its tick.
 *
 * A label wrapping the whole line rather than a bare checkbox, so the words are
 * the target too: these lines are read on a phone and a 16px box is not a thumb.
 */
function Line({
  itemKey,
  on,
  onToggle,
  disabled,
  mark,
  markClass,
  name,
  children,
}) {
  return (
    <li>
      <label className="flex cursor-pointer items-start gap-2 py-0.5 text-ink">
        <input
          type="checkbox"
          className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-teal)]"
          checked={on}
          onChange={() => onToggle(itemKey)}
          disabled={disabled}
        />
        <span className={on ? "" : "opacity-50"}>
          <span className={`font-semibold ${markClass}`}>{mark}</span>{" "}
          <span className="font-medium">{name}</span>
          <span className="text-ink-soft"> {children}</span>
        </span>
      </label>
    </li>
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
