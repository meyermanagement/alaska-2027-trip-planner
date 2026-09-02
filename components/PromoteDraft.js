"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ASK_ALY_EVENT } from "./AskAlyTrigger";
import { coverQueuePatch } from "@/lib/covers/queue";

/**
 * Moves a finished draft into Upcoming trips.
 *
 * Two things have to be true first, and both are worth saying out loud rather
 * than silently refusing: a trip in Upcoming is sorted and counted down by its
 * dates, so it needs them; and dates that have already gone by would send it
 * straight past Upcoming into Past trips, which is never what someone means
 * when they finalise a plan.
 *
 * This is also the moment the packing list becomes worth building. Nothing packs
 * for a draft -- see lib/packing/draft.js -- so the offer is held back until here
 * and then made once, in the same breath as the move, while the family is already
 * thinking about the trip becoming real. It is an offer and not an action: it
 * seeds the question to Aly rather than writing eighty items unasked.
 *
 * And it is the moment the trip's picture becomes worth drawing, which happens
 * without being offered -- a cover is what the card is mostly made of once the
 * trip is on the trips board, and there is nothing to decide about wanting one.
 * The move itself does not wait for it: it writes a note on the row and the
 * screen picks it up. See lib/covers/queue.js.
 */

export default function PromoteDraft({ trip, onDone, hasPacking = false }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [moved, setMoved] = useState(false);

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
    const patch = { status: "planning" };
    const { error } = await supabase
      .from("trips")
      .update({ ...patch, ...(coverQueuePatch(trip, patch) || {}) })
      .eq("id", trip.id);
    setBusy(false);

    if (error) {
      setProblem("That did not save. Try it again.");
      return;
    }
    if (onDone) onDone();
    setMoved(true);
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
      {moved && !hasPacking && (
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(
              new CustomEvent(ASK_ALY_EVENT, {
                detail: {
                  seed: "Start the packing list for this trip.",
                  autoSend: true,
                },
              }),
            )
          }
          className="text-xs font-normal leading-relaxed text-ink-soft underline decoration-[var(--line-strong)] underline-offset-2 hover:text-teal"
        >
          It is a real trip now — start its packing list?
        </button>
      )}
    </span>
  );
}
