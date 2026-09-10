"use client";

import { useEffect, useState } from "react";
import { aboutMeFromParts, splitAboutMe } from "@/lib/travelers/profile";
import AboutSections from "@/components/AboutSections";

// The About-me editor that lives inside the Preferences screen's drawer when a
// person is chosen. Same five questions as the About-you screen, in place.
//
// It used to be one unlabelled textarea with a sentence of prose above it
// telling somebody what sort of thing to type. That was the weaker half of a
// split: the good version of this question -- five labelled boxes with chip
// drawers under them -- existed only on the screen a person sees on their first
// sign-in, while the screen people actually come back to had the box. The
// questions are a shared component now, so the drawer holds the same thing the
// page does.
//
// An existing paragraph is read back into the five boxes it was written in, and
// anything the split does not recognise -- a paragraph Aly wrote out of the
// interview, free text typed before the headings existed -- lands whole in the
// last box, where it can be cut up or left alone.
//
// Saving goes through the About-you route rather than straight to the table, so
// the same request that stores the words also refreshes the interview priors
// Aly reads. Writing the column from the browser, which is what this did
// before, left those priors describing the paragraph that was just replaced.
export default function AboutInlineEditor({
  travelerId,
  travelerName,
  initial,
  homeLat = null,
  homeLon = null,
}) {
  const saved = String(initial || "").trim();
  const [parts, setParts] = useState(() => splitAboutMe(saved));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(0);

  // If the parent hands us a new person (whose changes), reset the boxes.
  useEffect(() => {
    setParts(splitAboutMe(String(initial || "").trim()));
    setError("");
    setSavedAt(0);
  }, [travelerId, initial]);

  const paragraph = aboutMeFromParts(parts);
  const dirty = paragraph !== saved;

  async function save() {
    setBusy(true);
    setError("");
    let response;
    try {
      response = await fetch("/api/about-you/save", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ traveler_id: travelerId, paragraph }),
      });
    } catch (fetchError) {
      setBusy(false);
      setError(
        fetchError?.message || "That did not save. Try again in a moment.",
      );
      return;
    }
    const payload = await response.json().catch(() => ({}));
    setBusy(false);
    if (!response.ok) {
      setError(
        response.status === 403
          ? "That did not save. Ask a primary traveler in the family to write this one."
          : payload?.error || "That did not save. Try again in a moment.",
      );
      return;
    }
    setSavedAt(Date.now());
  }

  const name = String(travelerName || "this person").trim() || "this person";

  return (
    <div className="space-y-3">
      <p className="text-xs text-ink-soft">
        The same five questions {name} would be asked on their own About you
        screen. Aly reads the answers before every answer she writes.
      </p>
      <AboutSections
        parts={parts}
        setParts={setParts}
        homeLat={homeLat}
        homeLon={homeLon}
        idPrefix={`pref-about-${travelerId}`}
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          className="btn btn-primary text-sm"
          onClick={save}
          disabled={busy || !dirty}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        {savedAt > 0 && !dirty && (
          <span className="text-xs text-ink-soft">Saved.</span>
        )}
        {dirty && (
          <span className="text-xs text-ink-soft">Unsaved changes.</span>
        )}
      </div>
      {error && (
        <p className="rounded-xl border border-rose/30 bg-rose/5 p-2 text-xs text-rose">
          {error}
        </p>
      )}
    </div>
  );
}
