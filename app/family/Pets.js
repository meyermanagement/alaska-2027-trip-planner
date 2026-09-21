"use client";
import { FAMILY_FORM_COPY } from "@/lib/travelers/formCopy";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ensurePetTemplate, renamePetTemplate } from "@/lib/pets/template";
import { formatDayYear, homeToday, isPastTrip } from "@/lib/format";
import {
  PAPERS,
  SPECIES,
  cabinOutlook,
  petAge,
  petWarnings,
  PET_SEXES,
  petSexPhrase,
  speciesLabel,
  speciesProfile,
  sterilizationLabel,
  travelStyleLabel,
  travelStylesFor,
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

export default function Pets({
  familyId,
  pets,
  trips = [],
  tripPets = [],
  // Chosen by the band at the top of the Family screen, which points at people
  // and animals from one row -- so which animal is open, and whether the add form
  // is up, are decided out there rather than here.
  only = null,
  addOpen = false,
  onAddDone = null,
  bare = false,
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const todayISO = useMemo(() => new Date().toLocaleDateString("en-CA"), []);

  const [rows, setRows] = useState(pets);
  const [links, setLinks] = useState(tripPets);
  const [editing, setEditing] = useState(null); // pet id
  const [addingInner, setAdding] = useState(false);
  const adding = bare ? addOpen : addingInner;
  const closeAdd = () => (onAddDone ? onAddDone() : setAdding(false));
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

  const shownWarnings = bare
    ? warnings.filter((w) => w.petId === only)
    : warnings;

  async function savePet(id, patch) {
    setBusy(id || "new");
    setNote("");
    if (id) {
      const before = rows.find((p) => p.id === id);
      const { error } = await supabase.from("pets").update(patch).eq("id", id);
      setBusy(null);
      if (error) return error.message;
      setRows((prev) =>
        prev.map((p) => (p.id === id ? { ...p, ...patch } : p)),
      );
      setEditing(null);
      // Renaming Bella to Bells and leaving "Bella's things" sitting on the
      // Packing templates screen is the small wrongness that makes a family
      // stop trusting the rest of it.
      if (patch.name && before?.name && patch.name !== before.name)
        await renamePetTemplate({
          supabase,
          pet: { ...before, ...patch, id },
          previousName: before.name,
        });
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
      // The list is made now rather than the first time this animal is put on a
      // trip, so it is there to be looked at and edited before anybody needs it.
      // A cat's things and a horse's things are not the same five lines.
      if (data) {
        const made = await ensurePetTemplate({ supabase, familyId, pet: data });
        if (made.templateId && made.created)
          setNote(
            `${data.name} added, with a packing list of ${made.items.length} ${
              made.items.length === 1 ? "line" : "lines"
            } you can edit on the Packing templates screen.`,
          );
      }
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

  return (
    <section className={bare ? "" : "mt-10"}>
      <div className={bare ? "hidden" : "mb-4"}>
        <h2 className="font-display text-2xl font-semibold">Animals</h2>
        <p className="mt-1 text-sm text-ink-soft">
          {FAMILY_FORM_COPY.animalsHelp} You can choose who comes on each trip.
        </p>
      </div>

      {/* The same rule as the people panel: on a screen showing one animal, this
          is that animal's paperwork rather than the whole menagerie's. */}
      {shownWarnings.length > 0 && (
        <div className="mb-4 rounded-xl border border-amber/40 bg-amber/10 p-4">
          <h3 className="text-sm font-semibold text-amber">
            {bare && shownWarnings[0]?.petName
              ? `Paperwork worth sorting for ${shownWarnings[0].petName}`
              : "Paperwork worth sorting"}
          </h3>
          <ul className="mt-2 space-y-1.5">
            {shownWarnings.map((w, i) => (
              <li key={i} className="text-sm leading-relaxed text-ink">
                {w.text}
              </li>
            ))}
          </ul>
        </div>
      )}

      {note && <p className="mb-3 text-sm text-ink-soft">{note}</p>}

      <div className="space-y-4">
        {!bare && rows.length === 0 && !adding && (
          <p className="text-sm text-ink-soft">
            No animals added yet. Include anyone who travels with you or needs
            care at home.
          </p>
        )}

        {(bare ? rows.filter((pet) => pet.id === only) : rows).map((pet) => {
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
                        petSexPhrase(pet) || null,
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
            <h3 className="font-display text-lg font-semibold">
              Add an animal
            </h3>
            <PetForm
              pet={null}
              busy={busy === "new"}
              onCancel={closeAdd}
              onSave={async (patch) => {
                const out = await savePet(null, patch);
                if (bare && !out) closeAdd();
                return out;
              }}
            />
          </div>
        ) : (
          !bare && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => setAdding(true)}
            >
              Add an animal
            </button>
          )
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
    ...speciesProfile(pet.species).papers.map((key) => {
      const paper = PAPERS[key];
      const value = paper ? pet[paper.column] : null;
      return [
        paper?.short || "",
        value ? `through ${formatDayYear(value)}` : null,
      ];
    }),
    [speciesProfile(pet.species).carrier?.label || "Carrier", pet.carrier_size],
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

export function PetForm({ pet, busy, onCancel, onSave }) {
  const [form, setForm] = useState({
    name: pet?.name || "",
    species: pet?.species || "dog",
    breed: pet?.breed || "",
    sex: pet?.sex || "",
    // Three states, not two: yes, no, and nobody has recorded it. A checkbox
    // would turn "we never asked" into "no", which is the answer a kennel acts on.
    is_sterilized:
      pet?.is_sterilized === true
        ? "yes"
        : pet?.is_sterilized === false
          ? "no"
          : "",
    date_of_birth: pet?.date_of_birth || "",
    weight_lb: pet?.weight_lb ?? "",
    travel_style: pet?.travel_style || "",
    carrier_size: pet?.carrier_size || "",
    is_service_animal: pet?.is_service_animal === true,
    microchip_number: pet?.microchip_number || "",
    rabies_expiration: pet?.rabies_expiration || "",
    health_certificate_expiration: pet?.health_certificate_expiration || "",
    coggins_expiration: pet?.coggins_expiration || "",
    vet_name: pet?.vet_name || "",
    vet_phone: pet?.vet_phone || "",
    medications: pet?.medications || "",
    dietary_notes: pet?.dietary_notes || "",
    temperament_notes: pet?.temperament_notes || "",
    notes: pet?.notes || "",
  });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value });
  const text = (value) =>
    String(value || "").trim() ? String(value).trim() : null;

  async function submit(e) {
    e.preventDefault();
    if (busy || saving) return;
    if (!form.name.trim()) {
      setError("Enter the animal's name.");
      return;
    }
    setError("");
    const weight = Number(String(form.weight_lb).trim());
    if (
      String(form.weight_lb).trim() &&
      (!Number.isFinite(weight) || weight <= 0)
    ) {
      setError("Enter a weight greater than zero, or leave it blank.");
      return;
    }
    setSaving(true);
    try {
      const message = await onSave({
        name: form.name.trim(),
        species: form.species || "dog",
        breed: text(form.breed),
        sex: form.sex || null,
        is_sterilized:
          form.is_sterilized === "yes"
            ? true
            : form.is_sterilized === "no"
              ? false
              : null,
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
        health_certificate_expiration:
          form.health_certificate_expiration || null,
        coggins_expiration: form.coggins_expiration || null,
        vet_name: text(form.vet_name),
        vet_phone: text(form.vet_phone),
        medications: text(form.medications),
        dietary_notes: text(form.dietary_notes),
        temperament_notes: text(form.temperament_notes),
        notes: text(form.notes),
      });
      if (message) setError(message);
    } catch {
      setError(
        "This animal could not be saved. Your changes are still here. Try again.",
      );
    } finally {
      setSaving(false);
    }
  }

  // Every question below that differs between a dog and a horse comes from here.
  // The species select sits at the top of the form on purpose: answer it and the
  // rest of the form changes under you, which is the whole point.
  const profile = speciesProfile(form.species);
  const styles = travelStylesFor(form.species);
  const style = styles.find((s) => s.id === form.travel_style);

  return (
    <form
      onSubmit={submit}
      className="no-print mt-4 space-y-3 rounded-xl border border-teal/30 bg-teal-soft/40 p-3"
    >
      <fieldset disabled={busy || saving} className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block text-xs font-semibold">
            {FAMILY_FORM_COPY.animalName} (required)
            <input
              required
              maxLength={60}
              className="field mt-1 text-base"
              value={form.name}
              onChange={set("name")}
            />
          </label>
          <label className="block text-xs font-semibold">
            {FAMILY_FORM_COPY.speciesLabel}
            <select
              className="field mt-1 text-base"
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
              className="field mt-1 text-base"
              value={form.breed}
              onChange={set("breed")}
            />
          </label>
          <label className="block text-xs font-semibold">
            Sex (optional)
            <select
              className="field mt-1 text-base"
              value={form.sex}
              onChange={set("sex")}
            >
              <option value="">Not recorded</option>
              {PET_SEXES.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.label}
                </option>
              ))}
            </select>
          </label>
          {profile.askFixed && (
            <label className="block text-xs font-semibold">
              {sterilizationLabel(form.species, form.sex)} (optional)
              <select
                className="field mt-1 text-base"
                value={form.is_sterilized}
                onChange={set("is_sterilized")}
              >
                <option value="">Not recorded</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
              <span className="mt-1 block font-normal text-ink-soft">
                {profile.fixedHint}
              </span>
            </label>
          )}
          <label className="block text-xs font-semibold">
            Date of birth (optional)
            <input
              type="date"
              max={homeToday()}
              className="field mt-1 text-base"
              value={form.date_of_birth}
              onChange={set("date_of_birth")}
            />
          </label>
          {profile.askWeight && (
            <label className="block text-xs font-semibold">
              Weight in pounds (optional)
              <input
                type="number"
                step="0.1"
                min="0.1"
                inputMode="decimal"
                className="field mt-1 text-base"
                value={form.weight_lb}
                onChange={set("weight_lb")}
              />
              <span className="mt-1 block font-normal text-ink-soft">
                {profile.weightHint}
              </span>
            </label>
          )}
          <label className="block text-xs font-semibold">
            How they travel (optional)
            <select
              className="field mt-1 text-base"
              value={form.travel_style}
              onChange={set("travel_style")}
            >
              <option value="">Not sure yet</option>
              {form.travel_style && !style && (
                <option value={form.travel_style}>
                  Saved choice:{" "}
                  {travelStyleLabel(form.travel_style) || form.travel_style}{" "}
                  (review)
                </option>
              )}
              {styles.map((s) => (
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
            {form.travel_style && !style && (
              <span className="mt-1 block font-normal text-ink-soft">
                This saved choice is not normally offered for this kind of
                animal. Review it or choose another option. It will not be
                removed automatically.
              </span>
            )}
          </label>
        </div>

        {profile.serviceAnimal && (
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
                Record trained service-animal status here. Confirm eligibility,
                documentation, and travel requirements with the carrier and
                destination before booking.
              </span>
            </span>
          </label>
        )}

        <div className="grid gap-3 border-t border-teal/30 pt-3 sm:grid-cols-2">
          <p className="section-label sm:col-span-2">
            Travel documents and equipment
          </p>
          {profile.papers.map((key) => {
            const paper = PAPERS[key];
            if (!paper) return null;
            return (
              <label key={key} className="block text-xs font-semibold">
                {paper.label} (optional)
                <input
                  type="date"
                  className="field mt-1 text-base"
                  value={form[paper.column]}
                  onChange={set(paper.column)}
                />
                {paper.hint && (
                  <span className="mt-1 block font-normal text-ink-soft">
                    {paper.hint}
                  </span>
                )}
              </label>
            );
          })}
          {profile.carrier && (
            <label className="block text-xs font-semibold">
              {profile.carrier.label} (optional)
              <input
                className="field mt-1 text-base"
                placeholder={profile.carrier.placeholder}
                value={form.carrier_size}
                onChange={set("carrier_size")}
              />
            </label>
          )}
          <label className="block text-xs font-semibold">
            Microchip number (optional)
            <input
              className="field mt-1 text-base"
              value={form.microchip_number}
              onChange={set("microchip_number")}
            />
          </label>
        </div>
        <div className="grid gap-3 border-t border-teal/30 pt-3 sm:grid-cols-2">
          <p className="section-label sm:col-span-2">
            Care while you&apos;re away
          </p>
          <label className="block text-xs font-semibold">
            Veterinarian or clinic (optional)
            <input
              className="field mt-1 text-base"
              value={form.vet_name}
              onChange={set("vet_name")}
            />
          </label>
          <label className="block text-xs font-semibold">
            Veterinarian phone (optional)
            <input
              type="tel"
              className="field mt-1 text-base"
              value={form.vet_phone}
              onChange={set("vet_phone")}
            />
          </label>
          <label className="block text-xs font-semibold">
            Medications and care instructions (optional)
            <textarea
              rows={2}
              className="field mt-1 text-base"
              value={form.medications}
              onChange={set("medications")}
            />
          </label>
          <label className="block text-xs font-semibold">
            Food and feeding routine (optional)
            <textarea
              rows={2}
              className="field mt-1 text-base"
              value={form.dietary_notes}
              onChange={set("dietary_notes")}
            />
          </label>
          <label className="block text-xs font-semibold sm:col-span-2">
            Behavior and handling needs (optional)
            <input
              className="field mt-1 text-base"
              placeholder={profile.temperamentPlaceholder}
              value={form.temperament_notes}
              onChange={set("temperament_notes")}
            />
            <span className="mt-1 block font-normal text-ink-soft">
              What should a sitter, boarder, or travel companion know?
            </span>
          </label>
          <label className="block text-xs font-semibold sm:col-span-2">
            Other care notes (optional)
            <textarea
              className="field mt-1 text-base"
              rows={2}
              value={form.notes}
              onChange={set("notes")}
            />
          </label>
        </div>
      </fieldset>

      {error && (
        <p role="alert" className="text-sm text-rose">
          {error}
        </p>
      )}

      <div className="flex gap-2">
        <button
          type="submit"
          className="btn btn-primary text-sm"
          disabled={busy || saving || !form.name.trim()}
        >
          {busy || saving ? "Saving…" : "Save animal"}
        </button>
        <button
          type="button"
          className="btn btn-ghost text-sm"
          disabled={busy || saving}
          onClick={onCancel}
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
