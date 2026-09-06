"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SPECIES, speciesLabel } from "@/lib/pets/pets";
import HomePicker, { locateHome } from "@/components/HomePicker";

/**
 * The first-login form.
 *
 * A row per person and a row per animal. The user fills in what they can and
 * presses save; the page writes the home to the families row, the people to
 * travelers, and the animals to pets, then hands them to the Family screen
 * where the Get to know button is waiting.
 *
 * Every row is optional past the primary traveler; the button below the form
 * is what commits the batch. This is a form on purpose -- not a chat, not a
 * question at a time -- so that the shape of the family is obvious before the
 * first question about how they travel.
 */
export default function WelcomeForm({ familyId, myName }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [address, setAddress] = useState("");
  // What the suggestion box handed back, if one was chosen. Saves us a second
  // lookup for a point we already have.
  const [located, setLocated] = useState(null);
  // People. The first row is the user themselves, prefilled with their display
  // name so it is obvious the row is theirs; they can rename it. Empty rows
  // beyond are for whoever else they want to add now.
  const [people, setPeople] = useState([{ name: myName || "" }, { name: "" }]);
  const [pets, setPets] = useState([{ name: "", species: "dog" }]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function setPerson(i, patch) {
    setPeople((all) => all.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  }
  function addPerson() {
    setPeople((all) => [...all, { name: "" }]);
  }
  function removePerson(i) {
    setPeople((all) => all.filter((_, n) => n !== i));
  }
  function setPet(i, patch) {
    setPets((all) => all.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  }
  function addPet() {
    setPets((all) => [...all, { name: "", species: "dog" }]);
  }
  function removePet(i) {
    setPets((all) => all.filter((_, n) => n !== i));
  }

  const primary = (people[0]?.name || "").trim();
  const canSave = primary.length > 0 && !busy;

  async function save() {
    setBusy(true);
    setError("");

    // Home: if the family typed an address, geocode it (only when they did not
    // pick a suggestion). Address writes even if the point cannot be found --
    // the words are what the family recognises.
    const typed = address.trim().replace(/\s+/g, " ");
    if (typed) {
      const chosen =
        located && located.address === typed
          ? { lat: located.lat, lon: located.lon, exact: located.precise }
          : await locateHome(typed);
      const written = chosen?.exact && chosen.label ? chosen.label : typed;
      const { error: homeErr } = await supabase
        .from("families")
        .update({
          home_address: written,
          home_lat: chosen?.lat ?? null,
          home_lon: chosen?.lon ?? null,
          home_precise: chosen ? Boolean(chosen.exact) : null,
          home_geo_at: chosen ? new Date().toISOString() : null,
        })
        .eq("id", familyId);
      if (homeErr) {
        setBusy(false);
        setError(homeErr.message);
        return;
      }
    }

    // People. Any row with a name becomes a traveler; empty rows are ignored.
    // Sort order runs from the top of the form so the primary is first on the
    // Family screen.
    const clean = people
      .map((r, i) => ({ name: r.name.trim(), sort_order: i + 1 }))
      .filter((r) => r.name.length > 0);
    if (clean.length === 0) {
      setBusy(false);
      setError("At least one name.");
      return;
    }
    const { error: peopleErr } = await supabase.from("travelers").insert(
      clean.map((r) => ({
        family_id: familyId,
        name: r.name.slice(0, 60),
        is_person: true,
        sort_order: r.sort_order,
      })),
    );
    if (peopleErr) {
      setBusy(false);
      setError(peopleErr.message);
      return;
    }

    // Pets. Same shape.
    const cleanPets = pets
      .map((r, i) => ({
        name: r.name.trim(),
        species: r.species || "other",
        sort_order: i + 1,
      }))
      .filter((r) => r.name.length > 0);
    if (cleanPets.length > 0) {
      const { error: petsErr } = await supabase.from("pets").insert(
        cleanPets.map((r) => ({
          family_id: familyId,
          name: r.name.slice(0, 60),
          species: r.species,
          sort_order: r.sort_order,
        })),
      );
      if (petsErr) {
        setBusy(false);
        setError(petsErr.message);
        return;
      }
    }

    setBusy(false);
    router.push("/family?welcomed=1");
  }

  return (
    <div className="mt-6 space-y-6">
      <section className="card p-4">
        <label className="section-label block" htmlFor="welcome-home">
          Where the family lives
        </label>
        <p className="mt-1 text-xs text-ink-soft">
          Start typing and pick from the list, so we can put a point on it. If
          the list does not have it, whatever you type will still save.
        </p>
        <div className="mt-2">
          <HomePicker
            value={address}
            onChange={setAddress}
            onLocated={(place) => {
              setLocated(place);
              setAddress(place.address);
            }}
          />
        </div>
      </section>

      <section className="card p-4">
        <p className="section-label">Who else is in the family</p>
        <p className="mt-1 text-xs text-ink-soft">
          The first row is you. Add anyone else who might come on a trip. You
          can rename or add more later on the Family screen.
        </p>
        <div className="mt-3 space-y-2">
          {people.map((row, i) => (
            <div className="flex items-center gap-2" key={i}>
              <input
                className="field flex-1"
                value={row.name}
                onChange={(e) => setPerson(i, { name: e.target.value })}
                placeholder={i === 0 ? "Your name" : "Their name"}
                maxLength={60}
              />
              {i > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => removePerson(i)}
                  disabled={busy}
                  aria-label={`Remove person ${i + 1}`}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-3"
          onClick={addPerson}
          disabled={busy}
        >
          Add another person
        </button>
      </section>

      <section className="card p-4">
        <p className="section-label">Animals in the family</p>
        <p className="mt-1 text-xs text-ink-soft">
          Even the ones that always stay home. It helps Aly know when to ask
          about a sitter and when not to.
        </p>
        <div className="mt-3 space-y-2">
          {pets.map((row, i) => (
            <div className="flex items-center gap-2" key={i}>
              <input
                className="field flex-1"
                value={row.name}
                onChange={(e) => setPet(i, { name: e.target.value })}
                placeholder="Their name"
                maxLength={60}
              />
              <select
                className="field"
                value={row.species}
                onChange={(e) => setPet(i, { species: e.target.value })}
                aria-label="Species"
              >
                {SPECIES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {speciesLabel(s.id)}
                  </option>
                ))}
              </select>
              {i > 0 && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => removePet(i)}
                  disabled={busy}
                  aria-label={`Remove animal ${i + 1}`}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-3"
          onClick={addPet}
          disabled={busy}
        >
          Add another animal
        </button>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canSave}
          onClick={save}
        >
          {busy ? "Saving…" : "Save and start the interview"}
        </button>
        <p className="text-xs text-ink-soft">
          You can change or add more on the Family screen after this.
        </p>
      </div>
      {error && <p className="text-sm text-rose">{error}</p>}
    </div>
  );
}
