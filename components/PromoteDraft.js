"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Moves a finished draft into Upcoming trips.
 *
 * Two things have to be true first, and both are worth saying out loud rather
 * than silently refusing: a trip in Upcoming is sorted and counted down by its
 * dates, so it needs them; and dates that have already gone by would send it
 * straight past Upcoming into Past trips, which is never what someone means
 * when they finalise a plan.
 */
export default function PromoteDraft({ trip, onDone }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  async function promote() {
    setProblem("");
    if (!trip.start_date || !trip.end_date) {
      setProblem(
        "It needs a first and last day before it can move — ask Aly for dates, or set them under Edit trip.",
      );
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    if (trip.end_date < today) {
      setProblem(
        "Those dates have already gone by, so it would land in Past trips. Change the dates first.",
      );
      return;
    }

    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("trips")
      .update({ status: "planning" })
      .eq("id", trip.id);
    setBusy(false);

    if (error) {
      setProblem("That did not save. Try it again.");
      return;
    }
    if (onDone) onDone();
    router.refresh();
  }

  return (
    <span className="no-print inline-flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={promote}
        disabled={busy}
        className="text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal disabled:opacity-60"
      >
        {busy ? "Moving…" : "Move to Upcoming trips"}
      </button>
      {problem && (
        <span className="text-xs font-normal leading-relaxed text-rose">
          {problem}
        </span>
      )}
    </span>
  );
}
