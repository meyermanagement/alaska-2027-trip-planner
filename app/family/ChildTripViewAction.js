"use client";
import { useRef, useState } from "react";
import { openSavedChildView } from "@/lib/childView/client";

export default function ChildTripViewAction({ person }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const opening = useRef(false);
  async function open() {
    if (opening.current) return;
    opening.current = true; setBusy(true); setError("");
    try { await openSavedChildView(person.id); }
    catch (err) { setError(err.message); opening.current = false; setBusy(false); }
  }
  return (
    <div className="no-print mb-4 mt-4">
      <button
        type="button" disabled={busy} aria-busy={busy} onClick={open}
        className="btn btn-primary min-h-12 w-full px-5 py-3 text-center text-base sm:w-auto"
        aria-describedby={`child-view-note-${person.id}`}
      >
        <span className="min-w-0 break-words">{busy ? `Opening ${person.name}’s trip view…` : <>Open {person.name}’s trip view</>}</span>
      </button>
      {error && <p role="alert" className="mt-2 text-sm">{error}</p>}
      <p id={`child-view-note-${person.id}`} className="mt-2 text-xs text-ink-soft">
        Their trips, packing &amp; theme. Parent passkey required to return.
      </p>
      <details className="mt-2 text-xs text-ink-soft">
        <summary className="w-fit cursor-pointer rounded-md py-2 font-semibold focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal">
          About this view
        </summary>
        <p className="mt-1 max-w-xl leading-relaxed">
          Assigned itineraries and their own packing lists, in their saved theme.
          Only their packing checkmarks and theme can change. No independent child sign-in.
          First-time setup requires your approval. After setup, this button opens their view directly.
          Opening the view signs you out
          in this browser. Your parent passkey is required to return, then you
          sign back in.
        </p>
      </details>
    </div>
  );
}
