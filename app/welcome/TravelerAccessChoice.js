"use client";

import { TRAVEL_ACCESS_CHOICES, welcomeAge } from "@/lib/welcome/access";

export default function TravelerAccessChoice({ person, index, disabled, onChange }) {
  const age = welcomeAge(person.dob);
  const name = person.name.trim();
  if (!name) return null;
  return <section className="mt-4 border-t border-line pt-4">
    <p className="section-label text-teal">Set up access · Optional</p>
    {age === "unknown" ? <p className="mt-2 text-xs leading-relaxed text-ink-soft">
      Add their date of birth to choose adult access or a parent-managed trip view.
      You can leave it blank and set up access later in Family.
    </p> : age === "minor" ? <div className="mt-3 rounded-xl border border-teal/30 bg-teal-soft/30 p-4">
      <h3 className="text-sm font-semibold">A trip view made for {name}.</h3>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">Parent-managed trip view: see their itinerary, check off their own packing and day-pack items, and choose their theme.</p>
      <p className="mt-2 text-xs leading-relaxed text-ink-soft">No independent login, Ask Aly, or trip editing. After saving, open their profile in Family to complete parent consent and the return safeguard.</p>
    </div> : <>
      <h3 className="mt-2 text-base font-semibold">Will {name} help plan, or travel with you?</h3>
      <p className="mt-1 text-xs leading-relaxed text-ink-soft">Both adult options use their own login. You’ll review an invitation separately before anything is sent.</p>
      <fieldset className="mt-3 grid gap-3" disabled={disabled}>
        <legend className="sr-only">{name}’s access</legend>
        {TRAVEL_ACCESS_CHOICES.map(choice => <label key={choice.value} className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 ${person.accessChoice === choice.value ? "border-teal bg-teal-soft/30" : "border-line"}`}>
          <input className="mt-1 accent-teal" type="radio" name={`welcome-access-${index}`} value={choice.value} checked={person.accessChoice === choice.value} onChange={() => onChange(choice.value)} />
          <span className="min-w-0">
            <span className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1"><strong className="text-sm">{choice.title}</strong><span className="text-xs text-ink-soft">{choice.label}</span></span>
            <span className="mt-2 block text-xs leading-relaxed">{choice.body}</span>
            <span className="mt-3 block border-t border-line pt-3 text-xs leading-relaxed text-ink-soft">{choice.scope}</span>
          </span>
        </label>)}
      </fieldset>
      <button type="button" className="btn btn-ghost btn-sm mt-2" disabled={disabled} onClick={() => onChange("")}>Set this up later</button>
      {person.accessChoice === "" && <p className="mt-1 text-xs text-ink-soft" role="status">No login will be set up. You can choose access later in Family.</p>}
    </>}
  </section>;
}
