"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { syncPackingForPet } from "@/lib/pets/packing";
import {
  formatDayYear,
  formatRange,
  isDraftTrip,
  isPastTrip,
} from "@/lib/format";
import {
  ARRANGEMENTS,
  SPECIES,
  TRAVEL_STYLES,
  arrangementLabel,
  cabinOutlook,
  isComing,
  petAge,
  petWarnings,
  speciesLabel,
  travelStyleLabel,
  trimNumber,
} from "@/lib/pets/pets";

const CHIP_COLORS = [
  "#b45309",
  "#0f766e",
  "#7c3aed",
  "#be185d",
  "#1d4ed8",
  "#4d7c0f",
];

export default function Pets({ familyId, pets, trips = [], tripPets = [] }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const todayISO = useMemo(() => new Date().toLocaleDateString("en-CA"), []);

  const [rows, setRows] = useState(pets);
  const [links, setLinks] = useState(tripPets);
  const [editing, setEditing] = useState(null); // pet id
  const [adding, setAdding] = useState(false);
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState("");

  // Only trips still ahead can have an arrangement made for them. A pet's
  // boarding for a trip that already happened is history, not a decision.
  const upcoming = useMemo(
    () =>
      (trips || [])
        .filter((t) => !isPastTrip(t, todayISO))
        .sort((a, b) =>
          String(a.start_date || "").localeCompare(b.start_date || ""),
        ),
    [trips, todayISO],
  );

  const warnings = useMemo(
    () =>
      petWarnings({
        trips: upcoming.map((trip) => ({
          ...trip,
          pets: links
            .filter((l) => l.trip_id === trip.id)
            .map((l) => {
              const pet = rows.find((p) => p.id === l.pet_id);
              return pet ? { ...pet, arrangement: l.arrangement } : null;
            })
            .filter(Boolean),
        })),
        today: todayISO,
      }),
    [upcoming, links, rows, todayISO],
  );

  async function savePet(id, patch) {
    setBusy(id || "new");
    setNote("");
    if (id) {
      const { error } = await supabase.from("pets").update(patch).eq("id", id);
      setBusy(null);
      if (error) return error.message;
      setRows((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      );
      setEditing(null);
    } else {
      const next = {
        ...patch,
        family_id: familyId,
        sort_order: rows.length + 1,
        color: patch.color || CHIP_COLORS[rows.length % CHIP_COLORS.length],
      };
      const { data, error } = await supabase
        .from("pets")
        .insert(next)
        .select()
        .maybeSingle();
      setBusy(null);
      if (error) return error.message;
      if (data) setRows((prev) => [...prev, data]);
      setAdding(false);
    }
    router.refresh();
    return "";
  }

  async function removePet(pet) {
    setBusy(pet.id);
    const { error } = await supabase.from("pets").delete().eq("id", pet.id);
    setBusy(null);
    if (error) {
      setNote(error.message);
      return;
    }
    setRows((prev) => prev.filter((p) => p.id !== pet.id));
    setLinks((prev) => prev.filter((l) => l.pet_id !== pet.id));
    setNote(`${pet.name} removed.`);
    router.refresh();
  }

  // One row per pet per trip, so changing an arrangement is an upsert rather
  // than a delete and an insert — the row is the decision, not its absence.
  async function setArrangement(pet, trip, arrangement) {
    const key = `${pet.id}:${trip.id}`;
    setBusy(key);
    setNote("");
    const existing = links.find(
      (l) => l.pet_id === pet.id && l.trip_id === trip.id,
    );
    if (arrangement === "none") {
      if (existing) {
        const { error } = await supabase
          .from("trip_pets")
          .delete()
          .eq("trip_id", trip.id)
          .eq("pet_id", pet.id);
        setBusy(null);
        if (error) {
          setNote(error.message);
          return;
        }
        setLinks((prev) =>
          prev.filter((l) => !(l.pet_id === pet.id && l.trip_id === trip.id)),
        );
        const gone = await syncPackingForPet({
          supabase,
          tripId: trip.id,
          pet,
          arrangement: null,
        });
        if (gone.message) setNote(`${trip.name}: ${gone.message}.`);
        router.refresh();
      } else setBusy(null);
      return;
    }
    const { error } = await supabase
      .from("trip_pets")
      .upsert(
        { trip_id: trip.id, pet_id: pet.id, arrangement },
        { onConflict: "trip_id,pet_id" },
      );
    setBusy(null);
    if (error) {
      setNote(error.message);
      return;
    }
    setLinks((prev) => {
      const rest = prev.filter(
        (l) => !(l.pet_id === pet.id && l.trip_id === trip.id),
      );
      return [...rest, { trip_id: trip.id, pet_id: pet.id, arrangement }];
    });
    // Their things follow them, exactly as a person's do when the roster changes.
    const sync = await syncPackingForPet({
      supabase,
      tripId: trip.id,
      pet,
      arrangement,
    });
    if (sync.message) setNote(`${trip.name}: ${sync.message}.`);
    else if (sync.error) setNote(sync.error);
    router.refresh();
  }

  return (
    <section className="mt-10">
      <div className="mb-4">
        <h2 className="font-display text-2xl font-semibold">Pets</h2>
        <p className="mt-1 text-sm text-ink-soft">
          Who else is in the family, and what happens to them when we go away.
          The weight and the rabies date are the two that decide things: one
          sets whether a flight is even possible, the other can stop a pet at a
          counter. Tell Aly which trips they are on and she will only suggest
          places that take them.
        </p>
      </div>

      {warnings.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber/40 bg-amber/10 p-4">
          <h3 className="text-sm font-semibold text-amber">
            Paperwork worth sorting
          </h3>
          <ul className="mt-2 space-y-1.5">
            {warnings.map((w, i) => (
              <li key={i} className="text-sm leading-relaxed text-ink">
                {w.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {note && <p className="mb-3 text-sm text-ink-soft">{note}</p>}

      <div className="space-y-4">
        {rows.length === 0 && !adding && (
          <p className="text-sm text-ink-soft">
            No pets yet. Add one and Aly will start taking them into account
            when she looks for somewhere to stay.
          </p>
        )}

        {rows.map((pet) => {
          const age = petAge(pet.date_of_birth, todayISO);
          const outlook = cabinOutlook(pet);
          return (
            <article key={pet.id} className="card p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <span
                    aria-hidden="true"
                    className="mt-1 h-3 w-3 shrink-0 rounded-full"
                    style={{ background: pet.color || CHIP_COLORS[0] }}
                  />
                  <div>
                    <h3 className="font-display text-xl font-semibold">
                      {pet.name}
                    </h3>
                    <p className="mt-0.5 text-sm text-ink-soft">
                      {[
                        speciesLabel(pet.species),
                        pet.breed,
                        age?.text,
                        pet.weight_lb
                          ? `${trimNumber(pet.weight_lb)} lb`
                          : null,
                        travelStyleLabel(pet.travel_style),
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </p>
                    {pet.is_service_animal && (
                      <p className="mt-1 text-xs font-semibold text-teal">
                        Trained service animal — not a pet in law, so pet fees,
                        weight limits and breed rules do not apply
                      </p>
                    )}
                  </div>
                </div>
                <div className="no-print flex gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    onClick={() =>
                      setEditing(editing === pet.id ? null : pet.id)
                    }
                  >
                    {editing === pet.id ? "Close" : "Edit"}
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost text-xs"
                    disabled={busy === pet.id}
                    onClick={() => removePet(pet)}
                  >
                    Remove
                  </button>
                </div>
              </div>

              {outlook.key !== "unknown" && (
                <p className="mt-3 text-sm leading-relaxed text-ink-soft">
                  {outlook.text}
                </p>
              )}

              <PetFacts pet={pet} />

              <div className="mt-4 border-t border-sand-deep pt-3">
                <p className="section-label">Trips</p>
                {upcoming.length === 0 ? (
                  <p className="mt-1 text-sm text-ink-soft">
                    Nothing coming up to decide about yet.
                  </p>
                ) : (
                  <div className="mt-2 space-y-2">
                    {upcoming.map((trip) => {
                      const link = links.find(
                        (l) => l.pet_id === pet.id && l.trip_id === trip.id,
                      );
                      const key = `${pet.id}:${trip.id}`;
                      return (
                        <div
                          key={trip.id}
                          className="flex flex-wrap items-center gap-x-3 gap-y-1"
                        >
                          <span className="text-sm font-semibold">
                            {trip.name}
                            {isDraftTrip(trip) ? " (draft)" : ""}
                          </span>
                          <span className="text-xs text-ink-soft">
                            {formatRange(trip.start_date, trip.end_date)}
                          </span>
                          <select
                            className="field no-print ml-auto w-auto py-1 text-xs"
                            value={link?.arrangement || "none"}
                            disabled={busy === key}
                            onChange={(e) =>
                              setArrangement(pet, trip, e.target.value)
                            }
                            aria-label={`What happens to ${pet.name} for ${trip.name}`}
                          >
                            <option value="none">Not on this trip</option>
                            {ARRANGEMENTS.map((a) => (
                              <option key={a.id} value={a.id}>
                                {a.label}
                              </option>
                            ))}
                          </select>
                          <span className="sr-only print:not-sr-only">
                            {link ? arrangementLabel(link.arrangement) : ""}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {editing === pet.id && (
                <PetForm
                  pet={pet}
                  busy={busy === pet.id}
                  onCancel={() => setEditing(null)}
                  onSave={(patch) => savePet(pet.id, patch)}
                />
              )}
            </article>
          );
        })}
      </div>

      <div className="no-print mt-4">
        {adding ? (
          <div className="card p-5">
            <h3 className="font-display text-lg font-semibold">Add a pet</h3>
            <PetForm
              pet={null}
              busy={busy === "new"}
              onCancel={() => setAdding(false)}
              onSave={(patch) => savePet(null, patch)}
            />
          </div>
        ) : (
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setAdding(true)}
          >
            Add a pet
          </button>
        )}
      </div>
    </section>
  );
}

// The facts worth showing without opening the form. Anything blank stays out
// rather than showing an empty label, so a pet with a name and a weight reads
// as a short record rather than a mostly-empty one.
function PetFacts({ pet }) {
  const facts = [
    [
      "Rabies certificate",
      pet.rabies_expiration
        ? `through ${formatDayYear(pet.rabies_expiration)}`
        : null,
    ],
    [
      "Health certificate",
      pet.health_certificate_expiration
        ? `through ${formatDayYear(pet.health_certificate_expiration)}`
        : null,
    ],
    ["Carrier", pet.carrier_size],
    ["Microchip", pet.microchip_number],
    ["Vet", [pet.vet_name, pet.vet_phone].filter(Boolean).join(" · ") || null],
    ["Medication", pet.medications],
    ["Food", pet.dietary_notes],
    ["Temperament", pet.temperament_notes],
    ["Notes", pet.notes],
  ].filter(([, value]) => value);
  if (!facts.length) return null;
  return (
    <dl className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
      {facts.map(([label, value]) => (
        <div key={label} className="text-sm">
          <dt className="text-xs font-semibold text-ink-soft">{label}</dt>
          <dd className="leading-relaxed">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

function PetForm({ pet, busy, onCancel, onSave }) {
  const [form, setForm] = useState({
    name: pet?.name || "",
    species: pet?.species || "dog",
    breed: pet?.breed || "",
    date_of_birth: pet?.date_of_birth || "",
    weight_lb: pet?.weight_lb ?? "",
    travel_style: pet?.travel_style || "",
    carrier_size: pet?.carrier_size || "",
    is_service_animal: pet?.is_service_animal === true,
    microchip_number: pet?.microchip_number || "",
    rabies_expiration: pet?.rabies_expiration || "",
    health_certificate_expiration: pet?.health_certificate_expiration || "",
    vet_name: pet?.vet_name || "",
    vet_phone: pet?.vet_phone || "",
    medications: pet?.medications || "",
    dietary_notes: pet?.dietary_notes || "",
    temperament_notes: pet?.temperament_notes || "",
    notes: pet?.notes || "",
  });
  const [error, setError] = useState("");
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const text = (value) =>
    String(value || "").trim() ? String(value).trim() : null;

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return;
    setError("");
    const weight = Number(String(form.weight_lb).trim());
    const message = await onSave({
      name: form.name.trim(),
      species: form.species || "dog",
      breed: text(form.breed),
      date_of_birth: form.date_of_birth || null,
      // Left null rather than zero when it is blank, so "we have not weighed
      // her" and "she weighs nothing" stay different answers.
      weight_lb:
        String(form.weight_lb).trim() && Number.isFinite(weight) && weight > 0
          ? weight
          : null,
      travel_style: form.travel_style || null,
      carrier_size: text(form.carrier_size),
      is_service_animal: form.is_service_animal === true,
      microchip_number: text(form.microchip_number),
      rabies_expiration: form.rabies_expiration || null,
      health_certificate_expiration: form.health_certificate_expiration || null,
      vet_name: text(form.vet_name),
      vet_phone: text(form.vet_phone),
      medications: text(form.medications),
      dietary_notes: text(form.dietary_notes),
      temperament_notes: text(form.temperament_notes),
      notes: text(form.notes),
    });
    if (message) setError(message);
  }

  const style = TRAVEL_STYLES.find((s) => s.id === form.travel_style);

  return (
    <form
      onSubmit={submit}
      className="no-print mt-4 space-y-3 rounded-xl border border-teal/30 bg-teal-soft/40 p-3"
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold">
          Name
          <input
            className="field mt-1 text-sm"
            value={form.name}
            onChange={set("name")}
          />
        </label>
        <label className="block text-xs font-semibold">
          Species
          <select
            className="field mt-1 text-sm"
            value={form.species}
            onChange={set("species")}
          >
            {SPECIES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-xs font-semibold">
          Breed (optional)
          <input
            className="field mt-1 text-sm"
            value={form.breed}
            onChange={set("breed")}
          />
        </label>
        <label className="block text-xs font-semibold">
          Date of birth (optional)
          <input
            type="date"
            className="field mt-1 text-sm"
            value={form.date_of_birth}
            onChange={set("date_of_birth")}
          />
        </label>
        <label className="block text-xs font-semibold">
          Weight in pounds (optional)
          <input
            type="number"
            step="0.1"
            min="0"
            inputMode="decimal"
            className="field mt-1 text-sm"
            value={form.weight_lb}
            onChange={set("weight_lb")}
          />
          <span className="mt-1 block font-normal text-ink-soft">
            Airlines and hotels write their limits in pounds, and the airline
            limit counts the carrier too.
          </span>
        </label>
        <label className="block text-xs font-semibold">
          How they travel (optional)
          <select
            className="field mt-1 text-sm"
            value={form.travel_style}
            onChange={set("travel_style")}
          >
            <option value="">Not sure yet</option>
            {TRAVEL_STYLES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
          {style && (
            <span className="mt-1 block font-normal text-ink-soft">
              {style.hint}
            </span>
          )}
        </label>
      </div>

      <label className="flex items-start gap-2 rounded-lg border border-teal/25 bg-white/60 p-2.5 text-xs font-semibold">
        <input
          type="checkbox"
          className="mt-0.5"
          checked={form.is_service_animal}
          onChange={(e) =>
            setForm({ ...form, is_service_animal: e.target.checked })
          }
        />
        <span>
          Trained service animal
          <span className="mt-0.5 block font-normal text-ink-soft">
            A different set of rules entirely: no pet fee, no weight limit, no
            breed restriction, and allowed where pets are not. Airlines ask for
            the Department of Transportation service animal form rather than a
            pet booking. An emotional support animal is not this — US airlines
            stopped treating those as service animals in 2021.
          </span>
        </span>
      </label>

      <div className="grid gap-3 border-t border-teal/30 pt-3 sm:grid-cols-2">
        <label className="block text-xs font-semibold">
          Rabies certificate good through (optional)
          <input
            type="date"
            className="field mt-1 text-sm"
            value={form.rabies_expiration}
            onChange={set("rabies_expiration")}
          />
        </label>
        <label className="block text-xs font-semibold">
          Health certificate good through (optional)
          <input
            type="date"
            className="field mt-1 text-sm"
            value={form.health_certificate_expiration}
            onChange={set("health_certificate_expiration")}
          />
          <span className="mt-1 block font-normal text-ink-soft">
            Issued close to departure rather than renewed, so this one usually
            has to be got again for each trip that needs it.
          </span>
        </label>
        <label className="block text-xs font-semibold">
          Carrier (optional)
          <input
            className="field mt-1 text-sm"
            placeholder="18 x 11 x 11 soft-sided"
            value={form.carrier_size}
            onChange={set("carrier_size")}
          />
        </label>
        <label className="block text-xs font-semibold">
          Microchip number (optional)
          <input
            className="field mt-1 text-sm"
            value={form.microchip_number}
            onChange={set("microchip_number")}
          />
        </label>
        <label className="block text-xs font-semibold">
          Vet (optional)
          <input
            className="field mt-1 text-sm"
            value={form.vet_name}
            onChange={set("vet_name")}
          />
        </label>
        <label className="block text-xs font-semibold">
          Vet phone (optional)
          <input
            type="tel"
            className="field mt-1 text-sm"
            value={form.vet_phone}
            onChange={set("vet_phone")}
          />
        </label>
        <label className="block text-xs font-semibold">
          Medication (optional)
          <input
            className="field mt-1 text-sm"
            value={form.medications}
            onChange={set("medications")}
          />
        </label>
        <label className="block text-xs font-semibold">
          Food (optional)
          <input
            className="field mt-1 text-sm"
            value={form.dietary_notes}
            onChange={set("dietary_notes")}
          />
        </label>
        <label className="block text-xs font-semibold sm:col-span-2">
          Temperament (optional)
          <input
            className="field mt-1 text-sm"
            placeholder="Crate trained, nervous around other dogs, fine in a car"
            value={form.temperament_notes}
            onChange={set("temperament_notes")}
          />
          <span className="mt-1 block font-normal text-ink-soft">
            Worth writing down: it is what decides whether a long drive, a
            rental with thin walls or a busy patio is a good idea.
          </span>
        </label>
        <label className="block text-xs font-semibold sm:col-span-2">
          Notes (optional)
          <textarea
            className="field mt-1 text-sm"
            rows={2}
            value={form.notes}
            onChange={set("notes")}
          />
        </label>
      </div>

      {error && <p className="text-sm text-rose">{error}</p>}

      <div className="flex gap-2">
        <button
          type="submit"
          className="btn btn-primary text-sm"
          disabled={busy || !form.name.trim()}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn btn-ghost text-sm"
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
