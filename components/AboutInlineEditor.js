"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { ABOUT_ME_PLACEHOLDER } from "@/lib/travelers/profile";

// A compact About-me editor that lives inline on the Preferences screen when a
// specific person is chosen. Same paragraph the interview writes and the
// person's edit screen writes, edited in place with a Save button and a
// visible confirmation.
//
// Kept deliberately smaller than the /about-you page: no examples, no prompts,
// no navigation. That page is a whole-screen affair for the first-run
// experience where the goal is to earn a real paragraph from somebody who has
// never written one. Here, the paragraph already exists (or does not), and the
// job is to fix a word or add a sentence without leaving the screen.
//
// Writes go directly to travelers.about_me. RLS decides whether the current
// user can edit this row -- the same rule that governs the person's own edit
// page and the about-you page.
export default function AboutInlineEditor({
  travelerId,
  travelerName,
  initial,
}) {
  const saved = String(initial || "").trim();
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState(0);
  const ref = useRef(null);

  // Auto-grow the textarea so a real paragraph doesn't disappear behind a
  // scroll bar. Same trick the person-edit form uses.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text]);

  // If the parent hands us a new person (whose changes), reset the field.
  useEffect(() => {
    setText(String(initial || "").trim());
    setError("");
    setSavedAt(0);
  }, [travelerId, initial]);

  const dirty = text.trim() !== saved;

  async function save() {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { error: dbError } = await supabase
      .from("travelers")
      .update({ about_me: text.trim() || null })
      .eq("id", travelerId)
      .select("id");
    setBusy(false);
    if (dbError) {
      setError(dbError.message || "That did not save. Try again in a moment.");
      return;
    }
    setSavedAt(Date.now());
  }

  const name = String(travelerName || "this person").trim() || "this person";

  return (
    <div className="space-y-2">
      <p className="text-xs text-ink-soft">
        A paragraph in {name}&rsquo;s own voice: what they do, what
        they&rsquo;re into, the places and subjects that pull at them. Aly reads
        it before every answer she writes.
      </p>
      <textarea
        ref={ref}
        className="field min-h-24 overflow-hidden text-sm"
        rows={4}
        placeholder={ABOUT_ME_PLACEHOLDER}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
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
