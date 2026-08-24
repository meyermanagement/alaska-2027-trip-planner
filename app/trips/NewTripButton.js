"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

const EMOJI = ["🧳", "🏝️", "🏔️", "🚢", "🎡", "🗺️", "🎿", "🏰"];

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
  const [name, setName] = useState("");
  const [destination, setDestination] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [emoji, setEmoji] = useState("🧳");
  const [copyTemplate, setCopyTemplate] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function create(e) {
    e.preventDefault();
    setBusy(true);
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
      })
      .select("id, slug")
      .single();

    if (tripError) {
      setBusy(false);
      setError(tripError.message);
      return;
    }

    if (copyTemplate) {
      const { data: tpl } = await supabase
        .from("packing_templates")
        .select("id")
        .eq("family_id", familyId)
        .eq("is_base", true)
        .maybeSingle();

      if (tpl) {
        const { data: items } = await supabase
          .from("packing_template_items")
          .select("category, item, assignee, quantity, sort_order")
          .eq("template_id", tpl.id);

        if (items?.length) {
          await supabase.from("packing_items").insert(
            items.map((i) => ({ ...i, trip_id: trip.id }))
          );
        }
      }
    }

    setBusy(false);
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
    <div className="fixed inset-0 z-40 flex items-end justify-center bg-ink/40 p-0 sm:items-center sm:p-6">
      <form
        onSubmit={create}
        className="w-full max-w-md rounded-t-2xl bg-white p-5 sm:rounded-xl"
      >
        <h2 className="font-display text-xl font-semibold">New trip</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Everyone in the family will see it immediately.
        </p>

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
              checked={copyTemplate}
              onChange={(e) => setCopyTemplate(e.target.checked)}
            />
            Start the packing list from the family base template
          </label>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-rose/10 px-3 py-2 text-sm text-rose">
            {error}
          </p>
        )}

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            className="btn btn-ghost flex-1"
            onClick={() => setOpen(false)}
          >
            Cancel
          </button>
          <button className="btn btn-primary flex-1" disabled={busy}>
            {busy ? "Creating…" : "Create trip"}
          </button>
        </div>
      </form>
    </div>
  );
}
