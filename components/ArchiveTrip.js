"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "./LinkPending";

/**
 * Putting a finished trip away, and getting it back.
 *
 * Past trips accumulate and never leave: twenty-one of them and the shelf is all
 * shelf. Archiving is the tidying, and it is deliberately the smallest possible
 * change -- the trip moves into a shut list at the bottom of the Past trips
 * screen, and that is the whole of it.
 *
 * Everything the trip knows stays in play. Its reviews still teach Aly what this
 * family likes, its packing list still seeds the next one, and its itinerary is
 * still there when somebody wants to remember where they ate. Archiving is about
 * what is worth looking at, not about what counts -- which is why it is offered on
 * a finished trip and never confirmed: nothing is lost, so nothing needs guarding.
 *
 * Coming back out sets the trip to complete rather than to whatever it was before.
 * A trip in the archive is finished by definition, and complete is the word for
 * that; restoring a years-old trip to "planning" would put it back in the family's
 * upcoming list.
 */
export default function ArchiveTrip({ trip, className = "", onDone }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const archived = trip?.status === "archived";

  async function move() {
    if (busy || !trip?.id) return;
    setProblem("");
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("trips")
      .update({ status: archived ? "complete" : "archived" })
      .eq("id", trip.id);
    setBusy(false);
    if (error) {
      // The likely one is a traveler whose account is not allowed to change
      // trips; said plainly rather than as "something went wrong".
      setProblem(
        "That did not go through. Your account may not be allowed to change trips.",
      );
      return;
    }
    onDone?.(trip.id, archived ? "complete" : "archived");
    router.refresh();
  }

  return (
    <span className={`no-print inline-flex items-center gap-2 ${className}`}>
      <button
        type="button"
        onClick={move}
        disabled={busy}
        className="inline-flex items-center gap-1.5 text-xs font-semibold text-ink-faint underline decoration-[var(--line-strong)] underline-offset-2 hover:text-teal hover:decoration-teal/40 disabled:no-underline disabled:opacity-70"
      >
        {busy && <Spinner className="h-3 w-3" />}
        {busy
          ? archived
            ? "Bringing it back…"
            : "Archiving…"
          : archived
            ? "Bring it back"
            : "Archive this trip"}
      </button>
      {problem && <span className="text-xs text-rose">{problem}</span>}
    </span>
  );
}
