"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Removing a trip nobody is taking.
 *
 * Aly could already do this, and would only do it when the person asking typed
 * the trip's name back at her. Nothing on the screen could, which meant the way
 * to get rid of a draft somebody started by accident was to open the drawer and
 * ask in words. So this is the same guard, as a control: one small link, and then
 * the name typed out before the button will work.
 *
 * The typing is not ceremony. A trip takes its itinerary, its packing list, its
 * tasks, its notes and its conversations with it -- all of them cascade in the
 * database -- and it goes for the whole family, not just for whoever pressed the
 * button. So the count of what is about to go is said out loud, and the name is
 * asked for, because a misplaced tap should not be able to end a trip.
 *
 * Only offered for trips that have not happened. A past trip is the record of
 * something the family did, and the way to tidy the shelf is to archive it.
 */
export default function RemoveTrip({ trip, onGone, afterHref = null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");

  const name = String(trip?.name || "").trim();
  // Case and stray spaces forgiven; the point is that they read the name and
  // wrote it, not that they matched it character for character.
  const matches = typed.trim().toLowerCase() === name.toLowerCase() && !!name;

  async function remove() {
    if (!matches || busy) return;
    setProblem("");
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.from("trips").delete().eq("id", trip.id);
    setBusy(false);
    if (error) {
      // The likely one is a secondary traveler, whom the database stops even
      // though this control is not shown to them; said plainly rather than as
      // "something went wrong".
      setProblem(
        "That did not go through. Your account may not be allowed to remove trips.",
      );
      return;
    }
    onGone?.(trip.id);
    // Leaving the trip's own page would otherwise land on a page whose trip no
    // longer exists.
    if (afterHref) router.push(afterHref);
    router.refresh();
  }

  if (!open) {
    return (
      <button
        type="button"
        className="no-print text-xs font-semibold text-ink-faint underline decoration-[var(--line-strong)] underline-offset-2 hover:text-rose hover:decoration-rose/40"
        onClick={() => setOpen(true)}
      >
        Remove this trip
      </button>
    );
  }

  const stops = Number(trip?.stops);
  const packing = Number(trip?.packing);
  const carries = [
    Number.isFinite(stops) && stops > 0
      ? `${stops} ${stops === 1 ? "plan" : "plans"}`
      : null,
    Number.isFinite(packing) && packing > 0
      ? `${packing} packing ${packing === 1 ? "item" : "items"}`
      : null,
  ].filter(Boolean);

  return (
    <div className="no-print w-full rounded-xl border border-rose/50 bg-rose/[0.06] p-3">
      <p className="text-xs leading-relaxed text-ink">
        This removes <span className="font-semibold">{name}</span> for everyone
        in the family
        {carries.length > 0 ? `, along with its ${carries.join(" and ")}` : ""}.
        It cannot be undone.
      </p>
      <label className="mt-2 block text-xs font-semibold text-ink-soft">
        Type the trip name to confirm
        <input
          type="text"
          className="field mt-1 text-sm"
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder={name}
          autoComplete="off"
        />
      </label>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn bg-rose text-xs font-semibold text-on-accent shadow-sm hover:bg-rose/90"
          // Live only once the name is there. The disabled look is the honest
          // one here: a button that deletes a trip should not be pressable
          // while the family is still reading what it takes with it.
          disabled={!matches || busy}
          onClick={remove}
        >
          {busy ? "Removing…" : "Remove trip"}
        </button>
        <button
          type="button"
          className="btn btn-ghost text-xs"
          onClick={() => {
            setOpen(false);
            setTyped("");
            setProblem("");
          }}
        >
          Keep it
        </button>
      </div>
      {problem && (
        <p className="mt-2 text-xs leading-relaxed text-rose">{problem}</p>
      )}
    </div>
  );
}
