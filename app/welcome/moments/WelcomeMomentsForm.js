"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import MomentsEditor from "@/components/MomentsEditor";

// The moments step. Reuses the same editor used on each person's page in
// Family -- adding, editing, removing here writes exactly what the People
// screen writes, because they call the same route with the same shape.
//
// Finish or skip stamps welcomed_at through /api/welcome (POST), which is
// what the auth callback checks. After the stamp, the walkthrough is over
// for this person; landing back here later would just re-run the guard and
// send them straight to /trips.

export default function WelcomeMomentsForm({ travelerId, travelerName }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function finish() {
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
      <MomentsEditor
        travelerId={travelerId}
        travelerName={travelerName}
        heading="Your favorite moments"
        help={`Anything you or the family owner has written about ${travelerName || "you"} lives here. Add a new one, edit wording that came out wrong, remove one that no longer fits.`}
      />

      {error && <p className="text-xs text-terra-deep">{error}</p>}

      <div className="flex flex-wrap gap-2 border-t border-sand-deep pt-4">
        <button
          type="button"
          onClick={finish}
          disabled={busy}
          className="btn btn-primary whitespace-nowrap px-4 py-2 text-sm"
        >
          {busy ? "Finishing..." : "I'm done -- take me in"}
        </button>
      </div>
      <p className="text-xs text-ink-soft">
        You can add or change moments any time on your file in Family.
      </p>
    </div>
  );
}
