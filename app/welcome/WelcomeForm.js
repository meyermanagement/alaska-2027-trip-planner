"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SPECIES, speciesLabel } from "@/lib/pets/pets";
import { GENDERS } from "@/lib/travelers/profile";
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
export default function WelcomeForm({
  familyId,
  myName,
  myUserId = null,
  myEmail = "",
  // When true, Save writes nothing and does not navigate. Instead the same
  // three rows -- home, people, pets -- are shown back as a recap of what the
  // real Save would have written. Used from the practice hub so somebody with
  // a family already set up can walk through the welcome form without
  // clobbering it.
  practice = false,
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [address, setAddress] = useState("");
  // What the suggestion box handed back, if one was chosen. Saves us a second
  // lookup for a point we already have.
  const [located, setLocated] = useState(null);
  // People. One row -- the user themselves, prefilled with their display name
  // so it is obvious the row is theirs; they can rename it. Adding a partner or
  // a child is one press of the button below, and a family of one should not
  // have to remove a blank row that made an assumption on their behalf.
  //
  // Each row also carries date of birth and gender -- both optional, both
  // things Aly leans on for the ordinary parts of planning (age tells her a
  // ten-year-old is on the trip; gender helps with what to pack and who
  // shares a room). Free-text "another term" lives on the Family screen; the
  // welcome form keeps to the four common values plus a blank so nobody has
  // to click through a picker they do not care about.
  const [people, setPeople] = useState([
    { name: myName || "", dob: "", gender: "" },
  ]);
  // No animals by default. A press of the button starts a row for anyone who
  // has one; a family without one should not have to clear a placeholder dog.
  const [pets, setPets] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  // Populated in practice mode with what would have been written. Rendered
  // below the button in place of the real navigation.
  const [preview, setPreview] = useState(null);

  function setPerson(i, patch) {
    setPeople((all) => all.map((r, n) => (n === i ? { ...r, ...patch } : r)));
  }
  function addPerson() {
    setPeople((all) => [...all, { name: "", dob: "", gender: "" }]);
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
    setPreview(null);

    // Practice: work out the same three rows the real Save would write, but
    // do not touch the database and do not navigate. The recap lives on the
    // page under the button.
    if (practice) {
      const typed = address.trim().replace(/\s+/g, " ");
      const cleanPeople = people
        .map((r) => ({
          name: (r.name || "").trim(),
          dob: (r.dob || "").trim() || null,
          gender: (r.gender || "").trim() || null,
        }))
        .filter((r) => r.name.length > 0);
      if (cleanPeople.length === 0) {
        setBusy(false);
        setError("At least one name.");
        return;
      }
      const cleanPets = pets
        .map((r) => ({
          name: (r.name || "").trim(),
          species: r.species || "other",
        }))
        .filter((r) => r.name.length > 0);
      setBusy(false);
      setPreview({
        home: typed || null,
        people: cleanPeople,
        pets: cleanPets,
      });
      return;
    }

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
    // Family screen. The first non-empty row is the person filling this in --
    // primary, linked to the auth user, tagged with their email. Every other
    // row is a secondary traveler: they belong to the family, they show up on
    // trips, they can be given a seat later on the Family screen, but this
    // form does not create logins for them.
    const clean = people
      .map((r, i) => ({
        name: (r.name || "").trim(),
        // The <input type="date"> hands back an ISO date or ""; a blank stays
        // blank so nothing is written.
        dob: (r.dob || "").trim() || null,
        // Only the four canonical values reach here; "Another term" is a
        // Family-screen feature.
        gender: (r.gender || "").trim() || null,
        sort_order: i + 1,
      }))
      .filter((r) => r.name.length > 0);
    if (clean.length === 0) {
      setBusy(false);
      setError("At least one name.");
      return;
    }
    const rows = clean.map((r, idx) => ({
      family_id: familyId,
      name: r.name.slice(0, 60),
      is_person: true,
      sort_order: r.sort_order,
      date_of_birth: r.dob,
      gender: r.gender,
      access_level: idx === 0 ? "primary" : "secondary",
      // The primary row is the person signing in, so it carries the auth
      // identity. Secondaries have no login yet.
      user_id: idx === 0 ? myUserId : null,
      email: idx === 0 ? myEmail || null : null,
    }));
    const { error: peopleErr } = await supabase.from("travelers").insert(rows);
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
          The first row is you. Everyone else is added as a secondary traveler:
          they can see trips they are on and check off their own packing and
          tasks, and can be given a full login later. Date of birth and gender
          are both optional -- Aly uses them for the ordinary things (age tells
          her a ten-year-old is on the trip, gender helps with what to pack and
          who shares a room). You can add more people or edit these later on the
          Family screen.
        </p>
        <div className="mt-3 space-y-4">
          {people.map((row, i) => (
            <div
              className="rounded-lg border border-line/60 p-3 space-y-2"
              key={i}
            >
              <div className="flex items-center gap-2">
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
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="block text-xs font-semibold text-ink-soft">
                  Date of birth (optional)
                  <input
                    type="date"
                    className="field mt-1 text-sm"
                    value={row.dob || ""}
                    onChange={(e) => setPerson(i, { dob: e.target.value })}
                    max={new Date().toISOString().slice(0, 10)}
                  />
                </label>
                <label className="block text-xs font-semibold text-ink-soft">
                  Gender (optional)
                  <select
                    className="field mt-1 text-sm"
                    value={row.gender || ""}
                    onChange={(e) => setPerson(i, { gender: e.target.value })}
                  >
                    <option value="">Not recorded</option>
                    {GENDERS.map((g) => (
                      <option key={g.value} value={g.value}>
                        {g.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            </div>
          ))}
        </div>
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-3"
          onClick={addPerson}
          disabled={busy}
        >
          {people.length === 1 ? "Add somebody else" : "Add another person"}
        </button>
      </section>

      <section className="card p-4">
        <p className="section-label">Animals in the family</p>
        <p className="mt-1 text-xs text-ink-soft">
          Add one row per animal, with a name and what kind. Even the ones that
          always stay home -- it helps Aly know when to ask about a sitter and
          when not to. You can add more later on the Family screen.
        </p>
        {pets.length > 0 && (
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
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() => removePet(i)}
                  disabled={busy}
                  aria-label={`Remove animal ${i + 1}`}
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
        )}
        <button
          type="button"
          className="btn btn-ghost btn-sm mt-3"
          onClick={addPet}
          disabled={busy}
        >
          {pets.length === 0 ? "Add an animal" : "Add another animal"}
        </button>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          className="btn btn-primary"
          disabled={!canSave}
          onClick={save}
        >
          {busy
            ? "Saving…"
            : practice
              ? "Show what would save"
              : "Save and start the interview"}
        </button>
        {practice && (
          <a href="/interview-check" className="btn btn-ghost">
            Back to practice
          </a>
        )}
        <p className="text-xs text-ink-soft">
          {practice
            ? "Nothing gets written. Your real family is unchanged."
            : "You can change or add more on the Family screen after this."}
        </p>
      </div>
      {error && <p className="text-sm text-rose">{error}</p>}
      {preview && <WelcomePreview preview={preview} />}
    </div>
  );
}

// The recap for the practice run of the welcome form. Shows the three groups
// the real Save would write -- home, people, pets -- with a plain note that
// nothing was written. Only rendered in practice mode.
function WelcomePreview({ preview }) {
  return (
    <div className="mt-4 rounded-2xl border border-teal/40 bg-teal-soft/40 p-4">
      <p className="section-label text-teal">What would have been saved</p>

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Home
        </p>
        <p className="mt-1 text-sm text-ink">
          {preview.home || "(No address typed.)"}
        </p>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          People ({preview.people.length})
        </p>
        <ul className="mt-1 space-y-1 text-sm text-ink">
          {preview.people.map((p, i) => (
            <li key={i}>
              {p.name}
              {i === 0 ? " (primary)" : " (secondary)"}
              {p.dob ? ` — born ${p.dob}` : ""}
              {p.gender ? ` — ${p.gender}` : ""}
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-4">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Animals ({preview.pets.length})
        </p>
        {preview.pets.length === 0 ? (
          <p className="mt-1 text-sm text-ink-soft">(None.)</p>
        ) : (
          <ul className="mt-1 space-y-1 text-sm text-ink">
            {preview.pets.map((p, i) => (
              <li key={i}>
                {p.name} — {p.species}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="mt-4 text-xs text-ink-soft">
        Nothing was written. Your real family, people and animals are unchanged.
      </p>
    </div>
  );
}
