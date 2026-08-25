"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import CreateWithAly from "./CreateWithAly";

const EMOJI = ["🧳", "🏝️", "🏔️", "🚢", "🎡", "🗺️", "🎿", "🏰"];

// The three things a new trip can be, in the family's words rather than the
// database's. Everything else a status can say — booked, happening now,
// archived — is a change to make later, on the trip itself.
const KINDS = [
  {
    value: "planning",
    label: "Upcoming",
    hint: "A trip that is really happening. Sits with the countdowns.",
  },
  {
    value: "draft",
    label: "Draft",
    hint: "An idea being worked out. Off the calendar until you move it.",
  },
  {
    value: "complete",
    label: "Past trip",
    hint: "One you have already taken, kept for the record.",
  },
];

// The old behaviour, kept as the safety net for when the model cannot be
// reached: every trip starts with at least what the family always packs.
async function copyBaseTemplate(supabase, familyId, tripId) {
  const { data: tpl } = await supabase
    .from("packing_templates")
    .select("id")
    .eq("family_id", familyId)
    .eq("is_base", true)
    .maybeSingle();
  if (!tpl) return;

  const { data: items } = await supabase
    .from("packing_template_items")
    .select("category, item, assignee, quantity, sort_order")
    .eq("template_id", tpl.id);
  if (!items?.length) return;

  await supabase
    .from("packing_items")
    .insert(items.map((i) => ({ ...i, trip_id: tripId })));
}

function slugify(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 60);
}

export default function NewTripButton({ familyId }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  // Two ways to start the same thing: fill it in, or talk it through.
  const [how, setHow] = useState("form");
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [emoji, setEmoji] = useState("🧳");
  const [kind, setKind] = useState("planning");
  const [autoPack, setAutoPack] = useState(true);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState("");
  const [error, setError] = useState("");

  function close() {
    setOpen(false);
    setError("");
  }

  async function create(e) {
    e.preventDefault();
    if (start && end && end < start) {
      setError("The last day cannot be before the first day.");
      return;
    }
    setBusy(true);
    setStep("Creating…");
    setError("");
    const supabase = createClient();

    const { data: trip, error: tripError } = await supabase
      .from("trips")
      .insert({
        family_id: familyId,
        name: name.trim(),
        slug: slugify(name),
        destination: destination.trim() || null,
        start_date: start || null,
        end_date: end || null,
        cover_emoji: emoji,
        status: kind,
      })
      .select("id, slug")
      .single();

    if (tripError) {
      setBusy(false);
      setStep("");
      setError(tripError.message);
      return;
    }

    if (autoPack) {
      // Worked out on the server from the base template, the lists from past
      // trips, and where and when this one is. It can take a moment, and it is
      // never worth losing a created trip over, so every failure falls through
      // to copying the base template here.
      setStep("Working out the packing list…");
      let done = false;
      try {
        const res = await fetch("/api/packing/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ tripId: trip.id }),
        });
        const body = await res.json().catch(() => null);
        done = res.ok && body?.source !== "none";
      } catch {
        done = false;
      }
      if (!done) await copyBaseTemplate(supabase, familyId, trip.id);
    }

    setBusy(false);
    setStep("");
    setOpen(false);
    router.push(`/trips/${trip.slug}`);
    router.refresh();
  }

  if (!open) {
    return (
      <button className="btn btn-primary" onClick={() => setOpen(true)}>
        + New trip
      </button>
    );
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center overflow-y-auto bg-ink/40 p-0 sm:items-center sm:p-6">
      <div className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-xl">
        <h2 className="font-display text-xl font-semibold">New trip</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Everyone in the family will see it immediately.
        </p>

        <div
          className="mt-4 inline-flex w-full rounded-full border border-[var(--line)] bg-sand/60 p-1"
          role="tablist"
          aria-label="How to start the trip"
        >
          {[
            { id: "form", label: "Fill it in myself" },
            { id: "aly", label: "Create with Aly" },
          ].map((t) => {
            const on = how === t.id;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={on}
                onClick={() => setHow(t.id)}
                className={`flex-1 rounded-full px-3 py-1.5 text-sm font-semibold transition ${
                  on
                    ? "bg-teal text-white shadow-sm"
                    : "text-ink-soft hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {how === "aly" ? (
          <>
            <div className="mt-4">
              <CreateWithAly onStarted={close} />
            </div>
            <button
              type="button"
              className="btn btn-ghost mt-2 w-full"
              onClick={close}
            >
              Cancel
            </button>
          </>
        ) : (
          <form onSubmit={create}>
            <div className="mt-4 space-y-3">
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Trip name
                </span>
                <input
                  className="field"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Italy 2028"
                  required
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Destination
                </span>
                <input
                  className="field"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  placeholder="Rome, Florence & the Amalfi Coast"
                />
              </label>

              <fieldset>
                <legend className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  What kind of trip
                </legend>
                <div className="space-y-1.5">
                  {KINDS.map((k) => {
                    const on = kind === k.value;
                    return (
                      <label
                        key={k.value}
                        className={`flex cursor-pointer items-start gap-2.5 rounded-xl border px-3 py-2 transition ${
                          on
                            ? "border-teal bg-teal-soft/50"
                            : "border-[var(--line)] bg-white hover:border-teal/40"
                        }`}
                      >
                        <input
                          type="radio"
                          name="trip-kind"
                          className="mt-0.5 h-4 w-4 shrink-0 accent-teal"
                          value={k.value}
                          checked={on}
                          onChange={() => setKind(k.value)}
                        />
                        <span className="min-w-0">
                          <span className="block text-sm font-semibold">
                            {k.label}
                          </span>
                          <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                            {k.hint}
                          </span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              <div className="grid grid-cols-2 gap-3">
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    Start
                  </span>
                  <input
                    className="field"
                    type="date"
                    value={start}
                    onChange={(e) => setStart(e.target.value)}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                    End
                  </span>
                  <input
                    className="field"
                    type="date"
                    value={end}
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
              </div>
              {kind === "draft" && (
                <p className="text-xs leading-relaxed text-ink-soft">
                  Dates can wait on a draft — leave them blank and add them when
                  the idea firms up.
                </p>
              )}

              <div>
                <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-ink-soft">
                  Cover
                </span>
                <div className="flex flex-wrap gap-2">
                  {EMOJI.map((e) => (
                    <button
                      key={e}
                      type="button"
                      onClick={() => setEmoji(e)}
                      className={`h-10 w-10 rounded-lg border text-lg ${
                        emoji === e
                          ? "border-teal bg-teal-soft"
                          : "border-[var(--line)] bg-white"
                      }`}
                    >
                      {e}
                    </button>
                  ))}
                </div>
              </div>
              <label className="flex items-start gap-2 text-sm text-ink-soft">
                <input
                  type="checkbox"
                  className="mt-0.5 h-4 w-4 accent-teal"
                  checked={autoPack}
                  onChange={(e) => setAutoPack(e.target.checked)}
                />
                Auto-generate packing list from previous trips, location, and
                time of year.
              </label>
            </div>

            {error && (
              <p className="mt-3 rounded-lg bg-rose/10 px-3 py-2 text-sm text-rose">
                {error}
              </p>
            )}

            {busy && step && (
              <p className="mt-3 text-sm text-ink-soft" aria-live="polite">
                {step}
              </p>
            )}

            <div className="mt-5 flex gap-2">
              <button
                type="button"
                className="btn btn-ghost flex-1"
                onClick={close}
              >
                Cancel
              </button>
              <button className="btn btn-primary flex-1" disabled={busy}>
                {busy ? "Working…" : "Create trip"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
