"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * The household's name, and the only place in the app it can be changed.
 *
 * It was set when the household was made, derived from the founder's own name
 * rather than asked for, so this is the first time anybody sees it. It shows up
 * in one place a person will notice — the line under the wordmark in the invite
 * email — so the control says where it is used. A field whose effect is invisible
 * is a field people either ignore or fear, and this one is safe to change.
 *
 * Primary travelers only. The page already sends secondary travelers away before
 * this renders, and the database says the same thing in its own words: the UPDATE
 * policy on families refuses a secondary. Two locks on one door, on purpose —
 * the client-side one is a courtesy and the database one is the actual rule.
 */
export default function HouseholdName({ familyId, name }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(name || "");
  const [saved, setSaved] = useState(name || "");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    const next = draft.trim().replace(/\s+/g, " ");
    if (!next) {
      // NOT NULL in the schema, so an empty save would be a database error shown
      // to somebody who only cleared a field. Say the actual rule instead.
      setError("A household needs a name. It appears in the invite email.");
      return;
    }
    if (next === saved) {
      setOpen(false);
      setError("");
      return;
    }
    setBusy(true);
    setError("");
    const { error: dbError } = await supabase
      .from("families")
      .update({ name: next })
      .eq("id", familyId);
    setBusy(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    // Shown before the refresh lands, so the new name is on screen the moment it
    // is true rather than after a round trip.
    setSaved(next);
    setDraft(next);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
        <span>
          Invites go out from{" "}
          <span className="font-medium text-ink">{saved}</span>.
        </span>
        <button
          type="button"
          className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
          onClick={() => {
            setDraft(saved);
            setError("");
            setOpen(true);
          }}
        >
          Rename
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] bg-white p-3">
      <label className="section-label block" htmlFor="household-name">
        What this household is called
      </label>
      <p className="mt-1 text-sm text-ink-soft">
        It appears under the Alyeska wordmark in the invite email, so somebody
        who has never seen this app can tell the message is from you.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          id="household-name"
          className="field w-full sm:w-64"
          value={draft}
          maxLength={80}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") {
              setOpen(false);
              setError("");
            }
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={save}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError("");
          }}
        >
          Cancel
        </button>
      </div>
      {error ? <p className="mt-2 text-sm text-rose">{error}</p> : null}
    </div>
  );
}
