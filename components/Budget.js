"use client";

/**
 * What the trip is going to cost, and what it has cost.
 *
 * The screen is deliberately not a ledger. Every line on it is either something
 * already on the itinerary -- the flight, the hotel, the whale watching -- or a
 * cost the family added by hand for money that is not an event on any day.
 * Nothing is entered twice, and nothing here can drift from the itinerary,
 * because the itinerary lines ARE the itinerary rows: the two boxes on each of
 * them write cost_estimate and cost_actual straight back onto the item.
 *
 * Two numbers per line, and the difference between them is the whole feature.
 * The estimate is what we think it will be, and it is allowed to be a guess as
 * long as it is labelled as one. The final figure is what was paid, and it only
 * ever comes from a person. An empty box is not zero: it means nobody has priced
 * this yet, which is the most useful thing this screen can tell you while a trip
 * is still being planned.
 *
 * The preferred budget is a preference. It is compared against, it is never
 * enforced, and being over it turns nothing red -- over is information, and the
 * useful reply to it is where the room is, which is what the Ask Aly button
 * underneath is for.
 */

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  BUDGET_GROUPS,
  buildBudget,
  budgetSentence,
  money,
  readMoney,
  roughMoney,
} from "@/lib/budget/budget";
import { ASK_ALY_EVENT } from "@/components/AskAlyTrigger";
import { formatFullDay } from "@/lib/format";

/** Ask Aly, with the question already typed and the Budget tab as her context. */
function askAly(seed) {
  window.dispatchEvent(
    new CustomEvent(ASK_ALY_EVENT, {
      detail: { seed, autoSend: true, focus: "budget" },
    }),
  );
}

export default function Budget({
  trip,
  itinerary = [],
  costs = [],
  onChange,
  onTripChange,
  readOnly = false,
}) {
  const supabase = useMemo(() => createClient(), []);
  const budget = useMemo(
    () => buildBudget({ trip, itinerary, costs }),
    [trip, itinerary, costs],
  );
  const [open, setOpen] = useState(false);
  const [editingTarget, setEditingTarget] = useState(false);
  // Pricing the blanks. Only ever the blanks: a line with a figure on it was
  // priced by a person or a confirmation, and an estimate is not an improvement
  // on either.
  const [pricing, setPricing] = useState(false);
  const [priced, setPriced] = useState(null);
  const [priceError, setPriceError] = useState("");

  async function fillBlanks() {
    if (pricing) return;
    setPricing(true);
    setPriceError("");
    setPriced(null);
    try {
      const res = await fetch("/api/budget/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId: trip?.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok)
        throw new Error(data?.error || "Could not price the trip just now.");
      setPriced(data);
      // Only refresh when something actually landed, so a run that priced
      // nothing does not blink the whole screen for no reason.
      if (data?.applied) onChange?.();
    } catch (error) {
      setPriceError(error?.message || "Could not price the trip just now.");
    } finally {
      setPricing(false);
    }
  }

  const past = trip?.status === "complete" || trip?.status === "archived";

  return (
    <section className="space-y-5">
      <Headline
        budget={budget}
        past={past}
        readOnly={readOnly}
        editing={editingTarget}
        onEdit={() => setEditingTarget(true)}
        onDone={() => setEditingTarget(false)}
        trip={trip}
        supabase={supabase}
        onTripChange={onTripChange}
        open={open}
        onToggle={() => setOpen((v) => !v)}
        pricing={pricing}
        priced={priced}
        priceError={priceError}
        onFillBlanks={fillBlanks}
      />

      {budget.lines.length === 0 ? (
        <Empty past={past} />
      ) : (
        budget.groups.map((group) => (
          <Group
            key={group.id}
            group={group}
            supabase={supabase}
            onChange={onChange}
            readOnly={readOnly}
            past={past}
          />
        ))
      )}

      {!readOnly && (
        <AddCost
          tripId={trip?.id}
          supabase={supabase}
          onChange={onChange}
          past={past}
        />
      )}

      {!readOnly && budget.lines.length > 0 && (
        <div className="no-print flex flex-wrap gap-2">
          {budget.over !== null && budget.over > 0 && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={() =>
                askAly(
                  "We are over what I wanted to spend on this trip. Where could we save without giving up the things we care about?",
                )
              }
            >
              Where could we save?
            </button>
          )}
        </div>
      )}
    </section>
  );
}

/**
 * The three figures, always visible, and the breakdown behind a disclosure.
 *
 * The sentence under them is the one thing worth reading if you read nothing
 * else, so it is above the fold and the group-by-group arithmetic is not.
 */
function Headline({
  budget,
  past,
  readOnly,
  editing,
  onEdit,
  onDone,
  trip,
  supabase,
  onTripChange,
  open,
  onToggle,
  pricing,
  priced,
  priceError,
  onFillBlanks,
}) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-end gap-x-8 gap-y-4">
        <Figure
          label={past ? "You wanted to spend" : "You would like to spend"}
          value={budget.target === null ? "—" : money(budget.target)}
          quiet={budget.target === null}
        />
        <Figure
          label={past ? "It came to" : "Priced so far"}
          value={budget.expected ? money(budget.expected) : "—"}
          quiet={!budget.expected}
          big
        />
        <Figure
          label="Final figures"
          value={budget.actual ? money(budget.actual) : "—"}
          quiet={!budget.actual}
        />
      </div>

      <p className="mt-3 text-sm text-ink-soft">{budgetSentence(budget)}</p>
      {budget.unpriced > 0 && (
        <p className="mt-1 text-sm text-ink-faint">
          {budget.unpriced} thing{budget.unpriced === 1 ? "" : "s"} on this trip
          still {budget.unpriced === 1 ? "carries" : "carry"} no figure, so the
          total is lower than the trip will be.
        </p>
      )}

      {!readOnly && budget.unpriced > 0 && (
        <div className="no-print mt-3">
          <button
            type="button"
            className="btn btn-primary btn-sm"
            onClick={onFillBlanks}
            disabled={pricing}
          >
            {pricing
              ? "Looking up prices…"
              : `Estimate the ${budget.unpriced} missing ${
                  budget.unpriced === 1 ? "price" : "prices"
                }`}
          </button>
          {pricing && (
            <p className="mt-2 text-sm text-ink-soft">
              Looking each one up for these dates and this party. Up to a minute
              — the figures appear as estimates, and every one says what it was
              priced as.
            </p>
          )}
        </div>
      )}

      {priceError && <p className="mt-2 text-sm text-rose">{priceError}</p>}
      {priced && !pricing && (
        <p className="mt-2 text-sm text-ink-soft">
          {priced.applied === 0
            ? priced.message ||
              "Nothing here could be priced honestly, so nothing was filled in."
            : `Priced ${priced.applied} of ${priced.blank}, adding ${money(
                priced.added,
              )}.${
                priced.skipped > 0
                  ? ` ${priced.skipped} left blank rather than guessed at.`
                  : ""
              } Every figure is an estimate — change any of them below.`}
        </p>
      )}

      {!readOnly &&
        (editing ? (
          <TargetForm
            trip={trip}
            supabase={supabase}
            onDone={onDone}
            onTripChange={onTripChange}
          />
        ) : (
          <button
            type="button"
            className="btn btn-ghost btn-sm no-print mt-3"
            onClick={onEdit}
          >
            {budget.target === null
              ? "Set a budget for this trip"
              : "Change the budget"}
          </button>
        ))}

      {budget.groups.length > 0 && (
        <div className="mt-4 border-t border-[var(--line)] pt-3">
          <button
            type="button"
            className="text-sm font-semibold text-teal"
            aria-expanded={open}
            onClick={onToggle}
          >
            {open ? "Hide the breakdown" : "Show the breakdown"}
          </button>
          {open && (
            <ul className="mt-3 space-y-2">
              {budget.groups.map((group) => (
                <li
                  key={group.id}
                  className="flex items-baseline justify-between gap-4 text-sm"
                >
                  <span className="text-ink">
                    {group.label}
                    {group.unpriced > 0 && (
                      <span className="text-ink-faint">
                        {" "}
                        · {group.unpriced} unpriced
                      </span>
                    )}
                  </span>
                  <span className="tabular-nums font-semibold text-ink">
                    {group.expected ? money(group.expected) : "—"}
                  </span>
                </li>
              ))}
              <li className="flex items-baseline justify-between gap-4 border-t border-[var(--line)] pt-2 text-sm">
                <span className="font-semibold text-ink">
                  {past ? "Total" : "Priced so far"}
                </span>
                <span className="tabular-nums font-semibold text-ink">
                  {money(budget.expected) || "—"}
                </span>
              </li>
              {budget.target !== null && (
                <li className="flex items-baseline justify-between gap-4 text-sm text-ink-soft">
                  <span>
                    {budget.over > 0 ? "Over what you wanted" : "Room left"}
                  </span>
                  <span className="tabular-nums">
                    {roughMoney(Math.abs(budget.over)) || "$0"}
                  </span>
                </li>
              )}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Figure({ label, value, quiet, big }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
        {label}
      </p>
      <p
        className={`tabular-nums font-display font-semibold ${
          big ? "text-3xl" : "text-2xl"
        } ${quiet ? "text-ink-faint" : "text-ink"}`}
      >
        {value}
      </p>
    </div>
  );
}

/** The preferred budget, edited in place. A target, and the copy says so. */
function TargetForm({ trip, supabase, onDone, onTripChange }) {
  const [value, setValue] = useState(
    trip?.budget_target === null || trip?.budget_target === undefined
      ? ""
      : String(trip.budget_target),
  );
  const [busy, setBusy] = useState(false);

  async function save(e) {
    e.preventDefault();
    setBusy(true);
    await supabase
      .from("trips")
      .update({ budget_target: readMoney(value) })
      .eq("id", trip.id);
    setBusy(false);
    onDone();
    onTripChange?.();
  }

  return (
    <form onSubmit={save} className="no-print mt-3 space-y-2">
      <label className="block text-sm text-ink-soft" htmlFor="budget-target">
        Roughly what would you like the whole trip to cost?
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <input
          id="budget-target"
          className="field w-40"
          inputMode="decimal"
          placeholder="$6,000"
          value={value}
          onChange={(e) => setValue(e.target.value)}
        />
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={busy}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={onDone}>
          Cancel
        </button>
      </div>
      <p className="text-xs text-ink-faint">
        A target, not a limit. Nothing is blocked for going over it — it is here
        so the trip can be compared against something.
      </p>
    </form>
  );
}

/** One part of the trip, and every line in it. */
function Group({ group, supabase, onChange, readOnly, past }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="font-display text-lg font-semibold">{group.label}</h3>
        <p className="tabular-nums text-sm font-semibold text-ink">
          {group.expected ? money(group.expected) : "Not priced"}
        </p>
      </div>
      <ul className="mt-3 divide-y divide-[var(--line)]">
        {group.lines.map((line) => (
          <Line
            key={`${line.kind}-${line.id}`}
            line={line}
            supabase={supabase}
            onChange={onChange}
            readOnly={readOnly}
            past={past}
          />
        ))}
      </ul>
    </div>
  );
}

/**
 * One line, with its two boxes.
 *
 * Saved on blur rather than behind a Save button: this screen is where somebody
 * sits with a stack of confirmations and types twelve figures, and twelve
 * presses of Save is eleven too many. The write goes to whichever table the line
 * came from, which is why every line carries its own kind.
 */
function Line({ line, supabase, onChange, readOnly, past }) {
  const table = line.kind === "item" ? "itinerary_items" : "trip_costs";

  async function save(field, raw) {
    const next = readMoney(raw);
    const current = field === "cost_estimate" ? line.estimate : line.actual;
    if (next === current) return;
    await supabase
      .from(table)
      .update({ [field]: next })
      .eq("id", line.id);
    onChange();
  }

  async function remove() {
    if (!window.confirm(`Remove “${line.label}” from the budget?`)) return;
    await supabase.from("trip_costs").delete().eq("id", line.id);
    onChange();
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
      <div className="min-w-0 flex-1 basis-full sm:basis-auto">
        <p className="truncate text-sm font-semibold text-ink">{line.label}</p>
        {(line.date || line.sub || line.note) && (
          <p className="truncate text-xs text-ink-faint">
            {line.date
              ? formatFullDay(line.date)
              : line.kind === "cost"
                ? "Not on any day"
                : ""}
            {line.note ? ` · ${line.note}` : ""}
          </p>
        )}
      </div>
      <MoneyBox
        label="Estimated"
        value={line.estimate}
        readOnly={readOnly}
        onSave={(raw) => save("cost_estimate", raw)}
      />
      <MoneyBox
        label={past ? "Paid" : "Final"}
        value={line.actual}
        readOnly={readOnly}
        onSave={(raw) => save("cost_actual", raw)}
      />
      {!readOnly && line.kind === "cost" && (
        <button
          type="button"
          className="no-print text-xs text-ink-faint underline decoration-[var(--line-strong)]"
          onClick={remove}
        >
          Remove
        </button>
      )}
    </li>
  );
}

/** One money box, holding its own text so a half-typed figure is not reformatted. */
function MoneyBox({ label, value, onSave, readOnly }) {
  const shown = value === null || value === undefined ? "" : String(value);
  const [text, setText] = useState(shown);
  // The row can change under us — Aly puts an estimate on something, or another
  // phone does — and a box that keeps showing the old figure would be the one
  // place on this screen that lies.
  useEffect(() => setText(shown), [shown]);

  if (readOnly) {
    return (
      <div className="w-24">
        <p className="text-xs text-ink-faint">{label}</p>
        <p className="tabular-nums text-sm text-ink">{money(value) || "—"}</p>
      </div>
    );
  }

  return (
    <label className="w-24 shrink-0">
      <span className="block text-xs text-ink-faint">{label}</span>
      <input
        className="field tabular-nums w-full"
        inputMode="decimal"
        placeholder="—"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => onSave(text)}
      />
    </label>
  );
}

/** Money that is not an event on any day. */
function AddCost({ tripId, supabase, onChange, past }) {
  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState("");
  const [category, setCategory] = useState("other");
  const [estimate, setEstimate] = useState("");
  const [actual, setActual] = useState("");
  const [busy, setBusy] = useState(false);

  async function add(e) {
    e.preventDefault();
    if (!label.trim()) return;
    setBusy(true);
    await supabase.from("trip_costs").insert({
      trip_id: tripId,
      label: label.trim(),
      category,
      cost_estimate: readMoney(estimate),
      cost_actual: readMoney(actual),
    });
    setLabel("");
    setEstimate("");
    setActual("");
    setCategory("other");
    setBusy(false);
    setOpen(false);
    onChange();
  }

  if (!open) {
    return (
      <button
        type="button"
        className="btn btn-ghost btn-sm no-print"
        onClick={() => setOpen(true)}
      >
        Add a cost
      </button>
    );
  }

  return (
    <form onSubmit={add} className="card no-print space-y-3 p-4">
      <p className="text-sm text-ink-soft">
        For money that is not an event on a day — groceries, gas, checked bags,
        souvenirs, boarding the animals. Anything on the itinerary already has
        its own two boxes above.
      </p>
      <input
        className="field"
        placeholder="Groceries for the week"
        value={label}
        onChange={(e) => setLabel(e.target.value)}
      />
      <div className="flex flex-wrap gap-3">
        <label className="min-w-40 flex-1">
          <span className="block text-xs text-ink-faint">Part of the trip</span>
          <select
            className="field"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
          >
            {BUDGET_GROUPS.map((group) => (
              <option key={group.id} value={group.id}>
                {group.label}
              </option>
            ))}
          </select>
        </label>
        <label className="w-28">
          <span className="block text-xs text-ink-faint">Estimated</span>
          <input
            className="field tabular-nums"
            inputMode="decimal"
            placeholder="$120"
            value={estimate}
            onChange={(e) => setEstimate(e.target.value)}
          />
        </label>
        <label className="w-28">
          <span className="block text-xs text-ink-faint">
            {past ? "Paid" : "Final"}
          </span>
          <input
            className="field tabular-nums"
            inputMode="decimal"
            placeholder="—"
            value={actual}
            onChange={(e) => setActual(e.target.value)}
          />
        </label>
      </div>
      <div className="flex gap-2">
        <button
          type="submit"
          className="btn btn-primary btn-sm"
          disabled={busy}
        >
          {busy ? "Saving…" : "Add it"}
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

/** Nothing priced and nothing on the itinerary, which is where a draft starts. */
function Empty({ past }) {
  return (
    <div className="card p-5">
      <p className="text-sm text-ink-soft">
        {past
          ? "Nothing on this trip carries a figure. Put what you paid against the days and the totals will fill in."
          : "The budget fills itself in as the trip does: every flight, hotel, dinner and tour on the itinerary gets two boxes here — what you think it will cost, and what it came to."}
      </p>
      <button
        type="button"
        className="btn btn-ghost btn-sm no-print mt-3"
        onClick={() =>
          askAly(
            "Roughly what should I expect this trip to cost, and what would you put against each part of it?",
          )
        }
      >
        Ask Aly what to expect
      </button>
    </div>
  );
}
