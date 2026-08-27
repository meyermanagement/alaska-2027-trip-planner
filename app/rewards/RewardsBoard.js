"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import Link from "next/link";
import { programsForTrip } from "@/lib/tips/members";
import {
  CATALOG,
  CATALOG_AS_OF,
  VALUATION_SOURCE,
  catalogByKind,
  catalogEntry,
} from "@/lib/rewards-catalog";
import {
  CREDIT_PERIODS,
  KIND_ORDER,
  REWARD_KINDS,
  creditsFor,
  estimatedValue,
  formatCredit,
  formatMoney,
  formatPoints,
  formatRule,
  normalizeCredits,
  normalizeRules,
  payWithOptions,
  routeShort,
  totalCreditValue,
  totalEstimatedValue,
} from "@/lib/rewards";

const SPENDS = [
  { key: "flights", label: "Flights" },
  { key: "hotels", label: "Hotels" },
  { key: "dining", label: "Dining" },
  { key: "car", label: "Car rental" },
  { key: "cruise", label: "Cruises" },
  { key: "groceries", label: "Groceries" },
  { key: "gas", label: "Gas" },
];

const BLANK = {
  kind: "credit_card",
  brand: "",
  program_name: "",
  currency_label: "points",
  traveler_id: "",
  points_balance: "",
  points_checked_on: "",
  point_value_cents: "",
  member_number: "",
  status_tier: "",
  annual_fee: "",
  earn_rules: [],
  credits: [],
  perks: "",
  expiry_note: "",
  notes: "",
};

function toForm(row) {
  return {
    kind: row.kind || "other",
    brand: row.brand || "",
    program_name: row.program_name || "",
    currency_label: row.currency_label || "points",
    traveler_id: row.traveler_id || "",
    points_balance: row.points_balance ?? "",
    points_checked_on: row.points_checked_on || "",
    point_value_cents: row.point_value_cents ?? "",
    member_number: row.member_number || "",
    status_tier: row.status_tier || "",
    annual_fee: row.annual_fee ?? "",
    earn_rules: normalizeRules(row.earn_rules),
    credits: normalizeCredits(row.credits),
    perks: row.perks || "",
    expiry_note: row.expiry_note || "",
    notes: row.notes || "",
  };
}

/** Empty strings become null so the database keeps its own defaults. */
function toRow(form) {
  const number = (v) => (v === "" || v === null ? null : Number(v));
  return {
    kind: form.kind,
    brand: form.brand.trim(),
    program_name: form.program_name.trim() || null,
    currency_label: form.currency_label.trim() || "points",
    traveler_id: form.traveler_id || null,
    points_balance: number(form.points_balance),
    points_checked_on: form.points_checked_on || null,
    point_value_cents: number(form.point_value_cents),
    member_number: form.member_number.trim() || null,
    status_tier: form.status_tier.trim() || null,
    annual_fee: number(form.annual_fee),
    earn_rules: normalizeRules(form.earn_rules),
    credits: normalizeCredits(form.credits),
    perks: form.perks.trim() || null,
    expiry_note: form.expiry_note.trim() || null,
    notes: form.notes.trim() || null,
  };
}

function maskNumber(value) {
  const text = String(value);
  if (text.length <= 4) return "••••";
  return `•••• ${text.slice(-4)}`;
}

export default function RewardsBoard({
  familyId,
  travelers,
  programs,
  trips = [],
  items = [],
}) {
  const supabase = createClient();
  const router = useRouter();
  const [rows, setRows] = useState(programs);
  const [form, setForm] = useState(null); // null | { id | null, values }
  const [busy, setBusy] = useState(false);
  const [shown, setShown] = useState(() => new Set());
  const [balanceFor, setBalanceFor] = useState(null);
  const [balanceDraft, setBalanceDraft] = useState("");
  const formRef = useRef(null);

  // The form opens directly under the button, but on a long list the page can
  // still be scrolled past it — so bring it into view whenever it appears.
  useEffect(() => {
    if (!form) return;
    formRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [form?.id, Boolean(form)]);

  const nameFor = (id) => travelers.find((t) => t.id === id)?.name;
  const total = totalEstimatedValue(rows);
  const cards = rows.filter((r) => r.kind === "credit_card");

  /**
   * Which trips each program belongs to.
   *
   * Same reasoning the tips use, run here so a program is never a mystery: the
   * operators written on a trip's own lines decide it, so Castaway Club lands on
   * the Disney sailing and not on the Holland America one, and a trip named
   * Alaska is not Alaska Airlines. Two states are worth a chip — it counts on
   * this trip, or that part of the trip is still unbooked so it could. A program
   * that cannot count anywhere gets no chip rather than a row of apologies.
   */
  const tripChips = useMemo(() => {
    const byProgram = new Map();
    for (const trip of trips) {
      const itinerary = items.filter((i) => i.trip_id === trip.id);
      const sorted = programsForTrip({ programs: rows, trip, itinerary });
      for (const [state, list] of [
        ["applies", sorted.applies],
        ["open", sorted.opportunity],
      ]) {
        for (const program of list) {
          if (!program?.id) continue;
          const found = byProgram.get(program.id) || [];
          found.push({ trip, state });
          byProgram.set(program.id, found);
        }
      }
    }
    return byProgram;
  }, [rows, trips, items]);

  const groups = useMemo(() => {
    return KIND_ORDER.map((kind) => ({
      kind,
      meta: REWARD_KINDS.find((k) => k.key === kind),
      items: rows.filter((r) => r.kind === kind),
    })).filter((g) => g.items.length);
  }, [rows]);

  const payWith = useMemo(() => {
    if (!cards.length) return [];
    return SPENDS.map((spend) => ({
      ...spend,
      options: payWithOptions(rows, spend.key),
      credits: creditsFor(rows, spend.key),
    })).filter((s) => s.options.length || s.credits.length);
  }, [rows, cards.length]);

  const creditTotal = useMemo(() => totalCreditValue(rows), [rows]);

  async function save() {
    if (!form) return;
    const patch = toRow(form.values);
    if (!patch.brand) return;
    setBusy(true);
    if (form.id) {
      const { data } = await supabase
        .from("rewards_programs")
        .update({ ...patch, updated_at: new Date().toISOString() })
        .eq("id", form.id)
        .select("*")
        .maybeSingle();
      if (data)
        setRows((list) => list.map((r) => (r.id === form.id ? data : r)));
    } else {
      const { data } = await supabase
        .from("rewards_programs")
        .insert({ ...patch, family_id: familyId })
        .select("*")
        .maybeSingle();
      if (data) setRows((list) => [...list, data]);
    }
    setBusy(false);
    setForm(null);
    router.refresh();
  }

  async function remove(row) {
    if (!window.confirm(`Remove ${row.brand} from your rewards?`)) return;
    setBusy(true);
    await supabase.from("rewards_programs").delete().eq("id", row.id);
    setRows((list) => list.filter((r) => r.id !== row.id));
    setBusy(false);
    router.refresh();
  }

  async function saveBalance(row) {
    const value = balanceDraft === "" ? null : Number(balanceDraft);
    setBusy(true);
    const { data } = await supabase
      .from("rewards_programs")
      .update({
        points_balance: Number.isFinite(value) ? value : null,
        points_checked_on: new Date().toISOString().slice(0, 10),
        updated_at: new Date().toISOString(),
      })
      .eq("id", row.id)
      .select("*")
      .maybeSingle();
    if (data) setRows((list) => list.map((r) => (r.id === row.id ? data : r)));
    setBusy(false);
    setBalanceFor(null);
    router.refresh();
  }

  function startAdd(preset) {
    const base = { ...BLANK, ...(preset || {}) };
    setForm({ id: null, values: base });
  }

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="text-sm text-ink-soft">
          {rows.length ? (
            <>
              <span className="font-semibold text-ink">
                {rows.length} {rows.length === 1 ? "program" : "programs"}
              </span>
              {total > 0 && (
                <>
                  {" · "}
                  <span>
                    roughly {formatMoney(total)} of points and miles between
                    them
                  </span>
                </>
              )}
            </>
          ) : (
            "Nothing added yet."
          )}
        </div>
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => startAdd()}
        >
          Add a program
        </button>
      </div>

      {form && (
        <div ref={formRef} className="scroll-mt-24">
          <ProgramForm
            values={form.values}
            isNew={!form.id}
            travelers={travelers}
            busy={busy}
            onChange={(values) => setForm((f) => ({ ...f, values }))}
            onCancel={() => setForm(null)}
            onSave={save}
          />
        </div>
      )}

      {payWith.length > 0 && (
        <section>
          <h2 className="font-display text-lg font-semibold">
            What to pay with
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Worked out from the earning rules on your own cards. Where it
            matters how you book, each way is listed separately.
            {creditTotal > 0 && (
              <>
                {" "}
                Statement credits are shown too — up to{" "}
                <span className="font-semibold text-ink">
                  {formatMoney(creditTotal)}
                </span>{" "}
                a year across your cards, if you use all of them.
              </>
            )}
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {payWith.map((spend) => (
              <div
                key={spend.key}
                className="rounded-xl border border-[var(--line)] bg-white/70 px-4 py-3"
              >
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                  {spend.label}
                </p>
                <ul className="mt-1.5 space-y-1.5">
                  {spend.options.map((option, i) => (
                    <li key={`${option.card.id}-${i}`}>
                      <p className="text-sm font-semibold leading-snug">
                        {option.card.brand}
                        {spend.options.length > 1 && (
                          <span className="font-normal text-ink-soft">
                            {" "}
                            · {routeShort(option.route)}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-ink-soft">
                        {formatRule(option.rule)}
                      </p>
                    </li>
                  ))}
                </ul>
                {spend.credits.length > 0 && (
                  <ul className="mt-2 space-y-1 border-t border-[var(--line)] pt-2">
                    {spend.credits.slice(0, 3).map((entry, i) => (
                      <li
                        key={`${entry.card.id}-credit-${i}`}
                        className="text-xs text-ink-soft"
                      >
                        <span className="font-semibold text-teal">
                          {formatMoney(entry.credit.amount)} credit
                        </span>{" "}
                        on {entry.card.brand}
                        {entry.credit.note ? ` — ${entry.credit.note}` : ""}
                      </li>
                    ))}
                    {spend.credits.length > 3 && (
                      <li className="text-xs text-ink-faint">
                        and {spend.credits.length - 3} more credit
                        {spend.credits.length - 3 === 1 ? "" : "s"} that could
                        apply
                      </li>
                    )}
                  </ul>
                )}
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-ink-faint">
            Credits are listed, not counted down: the app does not know what you
            have already put against one this year.
          </p>
        </section>
      )}

      {groups.length === 0 && !form && (
        <div className="card p-6">
          <h2 className="font-display text-lg font-semibold">
            Start with what you already carry
          </h2>
          <p className="mt-1 text-sm text-ink-soft">
            Pick one and the earning rules and rough point values come filled
            in, ready to correct. You can add a balance now or later.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            {CATALOG.slice(0, 8).map((entry) => (
              <button
                key={entry.brand}
                type="button"
                className="chip border border-[var(--line)] bg-white/70 transition hover:border-teal hover:text-teal"
                onClick={() => startAdd(fromCatalog(entry))}
              >
                {entry.brand}
              </button>
            ))}
          </div>
        </div>
      )}

      {groups.map((group) => (
        <section key={group.kind}>
          <h2 className="font-display text-lg font-semibold">
            {group.meta?.plural || group.kind}
          </h2>
          <p className="mt-0.5 text-sm text-ink-soft">{group.meta?.blurb}</p>
          <div className="mt-3 space-y-3">
            {group.items.map((row) => {
              const rules = normalizeRules(row.earn_rules);
              const credits = normalizeCredits(row.credits);
              const value = estimatedValue(row);
              const points = formatPoints(row.points_balance);
              return (
                <article key={row.id} className="card p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h3 className="font-display text-lg font-semibold">
                        {row.brand}
                      </h3>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        {row.status_tier && (
                          <span className="chip bg-teal-soft text-teal">
                            {row.status_tier}
                          </span>
                        )}
                        {row.traveler_id ? (
                          <span className="chip bg-sand-deep/60 text-ink-soft">
                            {nameFor(row.traveler_id) || "Someone"}
                          </span>
                        ) : (
                          <span className="chip bg-sand-deep/60 text-ink-soft">
                            Whole family
                          </span>
                        )}
                        {row.kind === "credit_card" ? (
                          <span className="chip bg-sand-deep/60 text-ink-soft">
                            Any trip
                          </span>
                        ) : (
                          (tripChips.get(row.id) || []).map(
                            ({ trip, state }) => (
                              <Link
                                key={`${row.id}-${trip.id}`}
                                href={`/trips/${trip.slug}`}
                                title={
                                  state === "applies"
                                    ? `${trip.name} has something booked with them`
                                    : `That part of ${trip.name} is not booked yet, so this could still be used`
                                }
                                className={
                                  state === "applies"
                                    ? "chip border border-teal/40 bg-teal-soft text-teal transition hover:border-teal"
                                    : "chip border border-dashed border-[var(--line)] bg-white/70 text-ink-soft transition hover:border-teal hover:text-teal"
                                }
                              >
                                {trip.name}
                                {state === "open" && (
                                  <span className="ml-1 opacity-70">
                                    · could use
                                  </span>
                                )}
                              </Link>
                            ),
                          )
                        )}
                        {row.program_name && (
                          <span className="text-xs text-ink-soft">
                            earns {row.program_name}
                          </span>
                        )}
                        {row.annual_fee !== null &&
                          row.annual_fee !== undefined && (
                            <span className="text-xs text-ink-soft">
                              {Number(row.annual_fee) === 0
                                ? "no annual fee"
                                : `${formatMoney(Number(row.annual_fee))} a year`}
                            </span>
                          )}
                      </div>
                    </div>
                    <div className="text-right">
                      {points ? (
                        <p className="text-lg font-semibold tabular-nums">
                          {points}{" "}
                          <span className="text-xs font-medium text-ink-soft">
                            {row.currency_label || "points"}
                          </span>
                        </p>
                      ) : (
                        <p className="text-sm text-ink-soft">No balance yet</p>
                      )}
                      {value ? (
                        <p className="text-xs text-ink-soft">
                          about {formatMoney(value)}
                        </p>
                      ) : null}
                      {row.points_checked_on && (
                        <p className="text-[0.68rem] text-ink-faint">
                          checked {row.points_checked_on}
                        </p>
                      )}
                    </div>
                  </div>

                  {rules.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {rules.map((rule, i) => (
                        <span
                          key={i}
                          className="rounded-full border border-[var(--line)] bg-white/70 px-2.5 py-1 text-[0.7rem] font-medium text-ink-soft"
                        >
                          {formatRule(rule)}
                        </span>
                      ))}
                    </div>
                  )}

                  {credits.length > 0 && (
                    <div className="mt-3 rounded-xl border border-[var(--line)] bg-sand/60 px-3 py-2">
                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">
                        Statement credits
                      </p>
                      <ul className="mt-1 space-y-0.5">
                        {credits.map((credit, i) => (
                          <li key={i} className="text-sm text-ink-soft">
                            <span className="font-semibold text-ink">
                              {formatMoney(credit.amount)}
                            </span>{" "}
                            {formatCredit(credit).replace(
                              `${formatMoney(credit.amount)} `,
                              "",
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {(row.perks || row.expiry_note || row.notes) && (
                    <div className="mt-3 space-y-1 text-sm text-ink-soft">
                      {row.perks && <p>{row.perks}</p>}
                      {row.expiry_note && <p>{row.expiry_note}</p>}
                      {row.notes && <p>{row.notes}</p>}
                    </div>
                  )}

                  {row.member_number && (
                    <p className="mt-3 text-sm text-ink-soft">
                      Member{" "}
                      <span className="font-mono">
                        {shown.has(row.id)
                          ? row.member_number
                          : maskNumber(row.member_number)}
                      </span>{" "}
                      <button
                        type="button"
                        className="text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2"
                        onClick={() =>
                          setShown((set) => {
                            const next = new Set(set);
                            if (next.has(row.id)) next.delete(row.id);
                            else next.add(row.id);
                            return next;
                          })
                        }
                      >
                        {shown.has(row.id) ? "Hide" : "Show"}
                      </button>
                    </p>
                  )}

                  <div className="no-print mt-4 flex flex-wrap items-center gap-3">
                    {balanceFor === row.id ? (
                      <span className="flex items-center gap-2">
                        <span className="block w-32">
                          <input
                            className="field"
                            type="number"
                            inputMode="numeric"
                            value={balanceDraft}
                            onChange={(e) => setBalanceDraft(e.target.value)}
                            aria-label={`Points balance for ${row.brand}`}
                          />
                        </span>
                        <button
                          type="button"
                          className="btn btn-primary"
                          disabled={busy}
                          onClick={() => saveBalance(row)}
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost"
                          onClick={() => setBalanceFor(null)}
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                        onClick={() => {
                          setBalanceFor(row.id);
                          setBalanceDraft(
                            row.points_balance === null ||
                              row.points_balance === undefined
                              ? ""
                              : String(row.points_balance),
                          );
                        }}
                      >
                        {points ? "Update balance" : "Add a balance"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-xs font-semibold text-ink-soft underline decoration-[var(--line-strong)] underline-offset-2 hover:text-teal"
                      onClick={() =>
                        setForm({ id: row.id, values: toForm(row) })
                      }
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="ml-auto text-xs font-semibold text-rose"
                      disabled={busy}
                      onClick={() => remove(row)}
                    >
                      Remove
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      ))}

      <p className="text-xs text-ink-soft">
        The suggested earning rules come from each issuer’s own page, read in{" "}
        {CATALOG_AS_OF}, and the rough worth of a point from{" "}
        <a
          className="font-semibold text-teal underline decoration-teal/30 underline-offset-2"
          href={VALUATION_SOURCE.url}
          target="_blank"
          rel="noreferrer"
        >
          {VALUATION_SOURCE.label}
        </a>
        . Both change often, and what a point is really worth is whatever you
        manage to redeem it for — so treat every estimate here as a rough guide
        and correct anything that looks wrong.
      </p>
    </div>
  );
}

/**
 * Catalog entry → form values, leaving the personal fields empty. The note
 * carries where the numbers came from, so a balance saved today still says which
 * page it was read off and roughly when.
 */
function fromCatalog(entry) {
  const provenance = entry.source
    ? `Earning rules and rates read from ${entry.source} in ${CATALOG_AS_OF}. Worth checking against your own account.`
    : "";
  return {
    kind: entry.kind,
    brand: entry.brand,
    program_name: entry.program_name || "",
    currency_label: entry.currency_label || "points",
    point_value_cents: entry.point_value_cents ?? "",
    annual_fee: entry.annual_fee ?? "",
    earn_rules: normalizeRules(entry.earn_rules),
    credits: normalizeCredits(entry.credits),
    perks: entry.perks || "",
    expiry_note: entry.expiry_note || "",
    notes: provenance,
  };
}

function ProgramForm({
  values,
  isNew,
  travelers,
  busy,
  onChange,
  onCancel,
  onSave,
}) {
  const set = (patch) => onChange({ ...values, ...patch });
  const isCard = values.kind === "credit_card";
  const grouped = catalogByKind();

  return (
    <form
      className="card space-y-4 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        onSave();
      }}
    >
      <h2 className="font-display text-lg font-semibold">
        {isNew ? "Add a rewards program" : `Edit ${values.brand}`}
      </h2>

      {isNew && (
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Start from a known one
          </span>
          <select
            className="field"
            value={catalogEntry(values.brand) ? values.brand : ""}
            onChange={(e) => {
              const entry = catalogEntry(e.target.value);
              onChange(
                entry
                  ? { ...values, ...fromCatalog(entry) }
                  : { ...values, brand: "" },
              );
            }}
          >
            <option value="">Type it in myself</option>
            {grouped.map((group) => (
              <optgroup key={group.kind} label={group.label}>
                {group.items.map((entry) => (
                  <option key={entry.brand} value={entry.brand}>
                    {entry.brand}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
          <span className="mt-1 block text-xs text-ink-soft">
            Fills in the earning rules, the statement credits and a rough value
            per point. Everything stays editable — check it against your own
            account.
          </span>
        </label>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Kind
          </span>
          <select
            className="field"
            value={values.kind}
            onChange={(e) => set({ kind: e.target.value })}
          >
            {REWARD_KINDS.map((k) => (
              <option key={k.key} value={k.key}>
                {k.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Name
          </span>
          <input
            className="field"
            required
            value={values.brand}
            onChange={(e) => set({ brand: e.target.value })}
            placeholder="Marriott Bonvoy"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Whose account
          </span>
          <select
            className="field"
            value={values.traveler_id}
            onChange={(e) => set({ traveler_id: e.target.value })}
          >
            <option value="">The whole family</option>
            {travelers.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Points are called
          </span>
          <input
            className="field"
            value={values.currency_label}
            onChange={(e) => set({ currency_label: e.target.value })}
            placeholder="points"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Balance
          </span>
          <input
            className="field"
            type="number"
            inputMode="numeric"
            value={values.points_balance}
            onChange={(e) => set({ points_balance: e.target.value })}
            placeholder="42500"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Balance checked on
          </span>
          <input
            className="field"
            type="date"
            value={values.points_checked_on}
            onChange={(e) => set({ points_checked_on: e.target.value })}
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Worth per point, in cents
          </span>
          <input
            className="field"
            type="number"
            step="0.01"
            value={values.point_value_cents}
            onChange={(e) => set({ point_value_cents: e.target.value })}
            placeholder="1.2"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Status or tier
          </span>
          <input
            className="field"
            value={values.status_tier}
            onChange={(e) => set({ status_tier: e.target.value })}
            placeholder="Gold Elite"
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Membership number
          </span>
          <input
            className="field"
            value={values.member_number}
            onChange={(e) => set({ member_number: e.target.value })}
            autoComplete="off"
          />
        </label>
        {isCard && (
          <>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
                Points go to
              </span>
              <input
                className="field"
                value={values.program_name}
                onChange={(e) => set({ program_name: e.target.value })}
                placeholder="Chase Ultimate Rewards"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
                Annual fee
              </span>
              <input
                className="field"
                type="number"
                step="1"
                value={values.annual_fee}
                onChange={(e) => set({ annual_fee: e.target.value })}
                placeholder="95"
              />
            </label>
          </>
        )}
      </div>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
          {isCard ? "What it earns" : "Earning rules"}
        </legend>
        <p className="text-xs text-ink-soft">
          One line per rule: how many points per dollar, and on what. This is
          what lets Aly say which card to put a hotel or a flight on.
        </p>
        {values.earn_rules.map((rule, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-16 shrink-0">
              <input
                className="field"
                type="number"
                step="0.5"
                value={rule.rate}
                aria-label="Points per dollar"
                onChange={(e) => {
                  const next = [...values.earn_rules];
                  next[i] = { ...rule, rate: e.target.value };
                  set({ earn_rules: next });
                }}
              />
            </span>
            <span className="shrink-0 text-sm text-ink-soft">x on</span>
            <span className="min-w-40 flex-1">
              <input
                className="field"
                value={rule.on}
                aria-label="What it applies to"
                placeholder="hotels booked direct"
                onChange={(e) => {
                  const next = [...values.earn_rules];
                  next[i] = { ...rule, on: e.target.value };
                  set({ earn_rules: next });
                }}
              />
            </span>
            <span className="w-full sm:w-44">
              <input
                className="field"
                value={rule.note}
                aria-label="Any cap or condition"
                placeholder="first $6,000 a year"
                onChange={(e) => {
                  const next = [...values.earn_rules];
                  next[i] = { ...rule, note: e.target.value };
                  set({ earn_rules: next });
                }}
              />
            </span>
            <button
              type="button"
              className="text-xs font-semibold text-rose"
              onClick={() =>
                set({
                  earn_rules: values.earn_rules.filter((_, j) => j !== i),
                })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() =>
            set({
              earn_rules: [...values.earn_rules, { rate: 1, on: "", note: "" }],
            })
          }
        >
          Add a rule
        </button>
      </fieldset>

      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
          Statement credits
        </legend>
        <p className="text-xs text-ink-soft">
          Money the card gives back each year, like a travel credit or a Global
          Entry fee credit. The app lists these next to what to pay with; it
          does not track how much you have already used.
        </p>
        {values.credits.map((credit, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <span className="w-24 shrink-0">
              <input
                className="field"
                type="number"
                step="1"
                value={credit.amount}
                aria-label="Credit amount in dollars"
                placeholder="300"
                onChange={(e) => {
                  const next = [...values.credits];
                  next[i] = { ...credit, amount: e.target.value };
                  set({ credits: next });
                }}
              />
            </span>
            <span className="shrink-0 text-sm text-ink-soft">on</span>
            <span className="min-w-40 flex-1">
              <input
                className="field"
                value={credit.on}
                aria-label="What the credit covers"
                placeholder="travel purchases"
                onChange={(e) => {
                  const next = [...values.credits];
                  next[i] = { ...credit, on: e.target.value };
                  set({ credits: next });
                }}
              />
            </span>
            <span className="w-44 shrink-0">
              <select
                className="field"
                value={credit.resets}
                aria-label="How often it resets"
                onChange={(e) => {
                  const next = [...values.credits];
                  next[i] = { ...credit, resets: e.target.value };
                  set({ credits: next });
                }}
              >
                {CREDIT_PERIODS.map((period) => (
                  <option key={period.key} value={period.key}>
                    {period.label}
                  </option>
                ))}
              </select>
            </span>
            <span className="min-w-32 flex-1">
              <input
                className="field"
                value={credit.note}
                aria-label="Any condition"
                placeholder="enrollment required"
                onChange={(e) => {
                  const next = [...values.credits];
                  next[i] = { ...credit, note: e.target.value };
                  set({ credits: next });
                }}
              />
            </span>
            <button
              type="button"
              className="text-xs font-semibold text-rose"
              onClick={() =>
                set({ credits: values.credits.filter((_, j) => j !== i) })
              }
            >
              Remove
            </button>
          </div>
        ))}
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() =>
            set({
              credits: [
                ...values.credits,
                { amount: "", on: "", resets: "annual", note: "" },
              ],
            })
          }
        >
          Add a credit
        </button>
      </fieldset>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Perks worth remembering
          </span>
          <textarea
            className="field min-h-20"
            value={values.perks}
            onChange={(e) => set({ perks: e.target.value })}
            placeholder="Free night up to 35,000 points each year; 10% back on redemptions."
          />
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-[0.07em] text-ink-soft">
            Anything else
          </span>
          <textarea
            className="field min-h-20"
            value={values.notes}
            onChange={(e) => set({ notes: e.target.value })}
            placeholder="Points expire after 24 months of no activity."
          />
        </label>
      </div>

      <div className="flex flex-wrap gap-3">
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {isNew ? "Add it" : "Save changes"}
        </button>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>
          Cancel
        </button>
      </div>
    </form>
  );
}
