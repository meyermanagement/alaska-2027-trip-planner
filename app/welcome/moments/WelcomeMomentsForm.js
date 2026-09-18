"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import MomentsEditor from "@/components/MomentsEditor";
import { MOMENTS_COPY } from "@/lib/travelers/formCopy";

// The moments step. Reuses the same editor used on each person's page in
// Family -- adding, editing, removing here writes exactly what the People
// screen writes, because they call the same route with the same shape.
//
// Finish or skip stamps welcomed_at through /api/welcome (POST), which is
// what the auth callback checks. After the stamp, the walkthrough is over
// for this person; landing back here later would just re-run the guard and
// send them past.
//
// And this is the last screen of it. The four-things checklist used to follow,
// but every row on it is the household owner's work -- describing everybody
// else, the Wallet, the forwarding address, past trips -- and a secondary was
// redirected off it anyway. It now sits at the end of the owner's own path,
// after the interview proof. Somebody who was invited into a household that
// already has all four of those things done goes straight to the trips they
// were invited to see.

export default function WelcomeMomentsForm({ travelerId, travelerName, canEdit = true }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [momentState, setMomentState] = useState({ dirty: false, busy: false });

  async function finish() {
    if (busy || momentState.busy) return;
    if (momentState.dirty && !window.confirm("Continue without saving your unfinished moment? Moments you already saved will be kept.")) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/welcome", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ step: "moments" }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(data?.error || "That could not be saved.");
        setBusy(false);
        return;
      }
      router.push("/trips");
    } catch {
      setError("That could not be saved.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-5">
      {canEdit && <MomentsEditor
        key={travelerId}
        travelerId={travelerId}
        travelerName={travelerName}
        heading=""
        help={MOMENTS_COPY.help}
        disabled={busy}
        onStateChange={setMomentState}
      />}
      {!canEdit && <p className="text-sm text-ink-soft">Ask a household planner to add or update your favorite moments in Family.</p>}

      {error && <p role="alert" className="text-xs text-terra-deep">{error}</p>}

      <div className="flex flex-wrap gap-2 border-t border-sand-deep pt-4">
        <button
          type="button"
          onClick={finish}
          disabled={busy || momentState.busy}
          className="btn btn-primary whitespace-nowrap px-4 py-2 text-sm"
        >
          {busy ? "Finishing…" : "Go to my trips"}
        </button>
      </div>
      <p className="text-xs text-ink-soft">
        {canEdit
          ? "Nothing to add? You can continue now and add moments later in Family."
          : "You can continue without adding a moment."}
      </p>
    </div>
  );
}
