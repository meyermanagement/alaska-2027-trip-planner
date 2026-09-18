"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { SPECIES, speciesLabel } from "@/lib/pets/pets";
import { GENDERS, genderLabel } from "@/lib/travelers/profile";
import { FAMILY_FORM_COPY, OWN_GENDER_TERM, welcomeGender } from "@/lib/travelers/formCopy";
import HomePicker, { locateHome } from "@/components/HomePicker";
import AlyKnowsSidebar from "@/components/AlyKnowsSidebar";
import { patchRun } from "@/lib/practice/session";

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
  // Family name as it exists in the database now. The signup trigger tries
  // to derive one from the caller's full name (Rivera Family) and falls back
  // to a placeholder if it cannot. Either way this screen surfaces it as an
  // editable field so the family can choose what they call themselves.
  familyName = "",
  myName,
  myUserId = null,
  myEmail = "",
  // When true, Save writes nothing and does not navigate. Instead the same
  // rows -- family name, home, people, pets -- are shown back as a recap of
  // what the real Save would have written. Used from the practice hub so
  // somebody with a family already set up can walk through the welcome form
  // without clobbering it.
  practice = false,
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [name, setName] = useState(familyName);
  const [address, setAddress] = useState("");
  // What the suggestion box handed back, if one was chosen. Saves us a second
  // lookup for a point we already have.
  const [located, setLocated] = useState(null);
  // People. One row -- the user themselves, prefilled with their display name
  // so it is obvious the row is theirs; they can rename it. Adding a partner or
  // a child is one press of the button below, and a family of one should not
  // have to remove a blank row that made an assumption on their behalf.
  //
  // Both optional fields use the same choices as the Family editor, including
  // a person's own term. Neither field fills in travel-document information.
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
    if (!canSave) return;
    if (people.some((person) => !person.name.trim()) || pets.some((pet) => !pet.name.trim())) {
      setError("Enter a name for each person and animal you added, or remove unused rows.");
      return;
    }
    setBusy(true);
    setError("");
    setPreview(null);

    // The family name always goes back with the home update, so what the user
    // typed is what the row says, whether or not they changed it. Trimmed and
    // capped at the shared Family limit; blanks fall back to the original name so somebody who
    // cleared the field does not end up with an empty family row.
    const cleanFamilyName = (name || "").trim().slice(0, FAMILY_FORM_COPY.householdNameLimit);
    const nextFamilyName = cleanFamilyName || familyName || "New Family";

    // Practice: work out the same rows the real Save would write, but do not
    // touch the database and do not navigate. The recap lives on the page
    // under the button, and the family is kept in the practice run so the
    // screens after this one work from it instead of the built-in stand-in.
    if (practice) {
      const typed = address.trim().replace(/\s+/g, " ");
      const cleanPeople = people
        .map((r) => ({
          name: (r.name || "").trim(),
          dob: (r.dob || "").trim() || null,
          gender: welcomeGender(r),
        }))
        .filter((r) => r.name.length > 0);
      if (cleanPeople.length === 0) {
        setBusy(false);
        setError("Enter your name to continue.");
        return;
      }
      const cleanPets = pets
        .map((r) => ({
          name: (r.name || "").trim(),
          species: r.species || "other",
        }))
        .filter((r) => r.name.length > 0);
      setBusy(false);
      patchRun({
        familyName: nextFamilyName,
        home: typed,
        people: cleanPeople,
        pets: cleanPets,
      });
      setPreview({
        familyName: nextFamilyName,
        home: typed || null,
        people: cleanPeople,
        pets: cleanPets,
      });
      return;
    }

    // Home: if the family typed an address, geocode it (only when they did not
    // pick a suggestion). Address writes even if the point cannot be found --
    // the words are what the family recognises. Family name always writes; the
    // rest of the columns only change when there is an address.
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
          name: nextFamilyName,
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
    } else if (nextFamilyName !== familyName) {
      const { error: nameErr } = await supabase
        .from("families")
        .update({ name: nextFamilyName })
        .eq("id", familyId);
      if (nameErr) {
        setBusy(false);
        setError(nameErr.message);
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
        gender: welcomeGender(r),
        sort_order: i + 1,
      }))
      .filter((r) => r.name.length > 0);
    if (clean.length === 0) {
      setBusy(false);
      setError("Enter your name to continue.");
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
    // First-login chain: Welcome (this form) hands off to About-you with the
    // interview as its next stop, so the primary answers the paragraph about
    // themselves and then walks straight into the ten-question interview
    // without having to find either screen from the Family tab.
    router.push("/about-you?first=1&next=/interview");
  }

  return (
    <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <form
        className="space-y-6"
        onSubmit={(event) => {
          event.preventDefault();
          save();
        }}
      >
        <section className="card p-4">
          <label className="section-label block" htmlFor="welcome-family-name">
            {FAMILY_FORM_COPY.householdLabel} (optional)
          </label>
          <p className="mt-1 text-xs text-ink-soft">
            {FAMILY_FORM_COPY.householdHelp}
          </p>
          <input
            id="welcome-family-name"
            className="field mt-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Rivera Family"
            maxLength={FAMILY_FORM_COPY.householdNameLimit}
          />
        </section>

        <section className="card p-4">
          <label className="section-label block" htmlFor="welcome-home">
            {FAMILY_FORM_COPY.homeLabel}
          </label>
          <p className="mt-1 text-xs text-ink-soft">
            {FAMILY_FORM_COPY.homeHelp}
          </p>
          <div className="mt-2">
            <HomePicker
              id="welcome-home"
              placeholder={FAMILY_FORM_COPY.homePlaceholder}
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
          <h2 className="section-label">Who are you planning for?</h2>
          <p className="mt-1 text-xs text-ink-soft">
            Start with yourself, then add anyone you regularly travel with.
            Adding a person creates a profile, not a login. You can invite them
            later from Family.
          </p>
          <div className="mt-3 space-y-4">
            {people.map((row, i) => (
              <div
                className="rounded-lg border border-line/60 p-3 space-y-2"
                key={i}
              >
                <div className="flex items-center gap-2">
                  <label className="min-w-0 flex-1 text-xs font-semibold text-ink-soft">
                    {i === 0 ? "Your name (required)" : "Their name"}
                    <input
                      className="field mt-1"
                      required
                      value={row.name}
                      onChange={(e) => setPerson(i, { name: e.target.value })}
                      placeholder={i === 0 ? "Your name" : "Their name"}
                      maxLength={60}
                    />
                  </label>
                  {i > 0 && (
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removePerson(i)}
                      disabled={busy}
                      aria-label={`Remove ${row.name || `person ${i + 1}`}`}
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
                      className="field mt-1 text-base"
                      value={row.dob || ""}
                      onChange={(e) => setPerson(i, { dob: e.target.value })}
                      max={new Date().toISOString().slice(0, 10)}
                    />
                  </label>
                  <label className="block text-xs font-semibold text-ink-soft">
                    Gender (optional)
                    <select
                      className="field mt-1 text-base"
                      value={row.gender || ""}
                      onChange={(e) => setPerson(i, { gender: e.target.value })}
                    >
                      <option value="">Leave blank</option>
                      {GENDERS.map((g) => (
                        <option key={g.value} value={g.value}>
                          {g.label}
                        </option>
                      ))}
                      <option value={OWN_GENDER_TERM}>Another term…</option>
                    </select>
                    {row.gender === OWN_GENDER_TERM && (
                      <input
                        className="field mt-2 text-base"
                        aria-label={`Gender in ${row.name || "this person's"} own words`}
                        placeholder="In their own words"
                        value={row.gender_own || ""}
                        onChange={(e) => setPerson(i, { gender_own: e.target.value })}
                        maxLength={40}
                      />
                    )}
                  </label>
                </div>
                <p className="text-xs text-ink-soft">{FAMILY_FORM_COPY.genderHelp}</p>
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
          <h2 className="section-label">Any animals to plan around? (optional)</h2>
          <p className="mt-1 text-xs text-ink-soft">
            {FAMILY_FORM_COPY.animalsHelp}
          </p>
          {pets.length > 0 && (
            <div className="mt-3 space-y-4">
              {pets.map((row, i) => (
                <div
                  className="rounded-lg border border-line/60 p-3 space-y-2"
                  key={i}
                >
                  <div className="flex items-center gap-2">
                    <label className="min-w-0 flex-1 text-xs font-semibold text-ink-soft">
                    {FAMILY_FORM_COPY.animalName}
                      <input
                        className="field mt-1"
                        required
                        value={row.name}
                        onChange={(e) => setPet(i, { name: e.target.value })}
                        placeholder="Their name"
                        maxLength={60}
                      />
                    </label>
                    <button
                      type="button"
                      className="btn btn-ghost btn-sm"
                      onClick={() => removePet(i)}
                      disabled={busy}
                      aria-label={`Remove ${row.name || `animal ${i + 1}`}`}
                    >
                      Remove
                    </button>
                  </div>
                  <label className="block text-xs font-semibold text-ink-soft">
                    {FAMILY_FORM_COPY.speciesLabel}
                    <select
                      className="field mt-1 text-base"
                      value={row.species}
                      onChange={(e) => setPet(i, { species: e.target.value })}
                    >
                      {SPECIES.map((s) => (
                        <option key={s.id} value={s.id}>
                          {speciesLabel(s.id)}
                        </option>
                      ))}
                    </select>
                  </label>
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
            type="submit"
            className="btn btn-primary"
            disabled={!canSave}
          >
            {busy ? "Saving…" : practice ? "Preview these details" : "Save and continue"}
          </button>
          {practice && (
            <a href="/interview-check" className="btn btn-ghost">
              Back to practice
            </a>
          )}
          {!practice && (
            <p className="text-xs text-ink-soft">
              Next: About you. You can edit these details later in Family.
            </p>
          )}
        </div>
        {error && <p role="alert" className="text-sm text-rose">{error}</p>}
        {preview && <WelcomePreview preview={preview} />}
      </form>
      <AlyKnowsSidebar
        practice={practice}
        familyName={name}
        address={address}
        located={located}
        people={people}
        pets={pets}
      />
    </div>
  );
}

// The recap for the practice run of the welcome form. Shows the three groups
// the real Save would write -- home, people, pets -- with a plain note that
// nothing was written. Only rendered in practice mode.
function WelcomePreview({ preview }) {
  return (
    <div className="mt-4 rounded-2xl border border-teal/40 bg-teal-soft/40 p-4">
      <p className="section-label text-teal">Practice preview</p>

      <div className="mt-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Family name
        </p>
        <p className="mt-1 text-sm text-ink">{preview.familyName}</p>
      </div>

      <div className="mt-4">
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
              {i === 0 ? " (you)" : " (no login yet)"}
              {p.dob ? ` — born ${p.dob}` : ""}
              {p.gender ? ` — ${genderLabel(p.gender)}` : ""}
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
        Kept for this practice run in this browser tab only. Your real family,
        people, and animals are unchanged.
      </p>

      <div className="mt-4">
        <a
          href="/interview-check/about-you"
          className="btn btn-primary px-4 py-2 text-sm"
        >
          Continue to About you
        </a>
      </div>
    </div>
  );
}
