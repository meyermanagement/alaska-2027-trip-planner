"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { ABOUT_ME_EXAMPLES } from "@/lib/travelers/profile";

/**
 * "Tell Aly what you are like on a trip", on the Trips page.
 *
 * This sits here rather than only on the Family tab for two reasons. The first is
 * that a new family lands on Trips with nothing on it, and this is the one useful
 * thing they can do before anything is booked -- every other input to a
 * recommendation needs a trip, a preference or a packing list to exist first, and
 * this one does not. The second is access: a secondary traveler never sees the
 * Family tab at all, and their own paragraph is theirs to write, so if it were
 * only there they would have no way in.
 *
 * Two shapes, one component. Empty, it is an invitation with room to type in it.
 * Filled, it collapses to a single quiet line with an Edit link, because
 * "answered, and changeable" is a different message from "please answer this" and
 * a card that keeps asking after it has been answered is a card people learn to
 * ignore. It never disappears entirely: the family asked that this be something
 * you can add to at any time, and a prompt that vanishes once satisfied is not
 * that.
 */
export default function AboutMeCard({ travelerId, name, about }) {
  const saved = String(about || "").trim();
  const [open, setOpen] = useState(!saved);
  const [text, setText] = useState(saved);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  // No row means no owner, and no owner means there is nothing to write to. This
  // happens to a member who joined without claiming a seat.
  if (!travelerId) return null;

  async function save() {
    setBusy(true);
    setError("");
    const supabase = createClient();
    const { data, error: dbError } = await supabase
      .from("travelers")
      .update({ about_me: text.trim() || null })
      .eq("id", travelerId)
      .select("id");
    setBusy(false);

    if (dbError) {
      setError(dbError.message || "That did not save. Try again in a moment.");
      return;
    }
    // A write the rules refuse does not raise -- row-level security filters the
    // row away and the update reports success having changed nothing. Counting
    // what came back is the only way to tell "saved" from "silently dropped",
    // and without this the person would be told their words were kept.
    if (!data || data.length === 0) {
      setError(
        "That did not save. Ask a primary traveler in the family to write this one for you.",
      );
      return;
    }
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="no-print mb-6 flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm text-ink-soft">
        <span className="font-semibold uppercase tracking-wide text-ink-faint">
          About you
        </span>
        <span className="min-w-0 flex-1 truncate">
          {saved || "Nothing yet."}
        </span>
        <button
          type="button"
          className="shrink-0 font-semibold text-teal underline"
          onClick={() => {
            setText(saved);
            setOpen(true);
          }}
        >
          {saved ? "Edit" : "Add"}
        </button>
      </div>
    );
  }

  return (
    <div className="no-print mb-6 rounded-xl border border-teal/30 bg-teal-soft/40 p-4">
      <h2 className="font-display text-lg font-semibold">
        {name
          ? `Tell Aly what you're like on a trip, ${name}`
          : "Tell Aly what you're like on a trip"}
      </h2>
      <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
        This is what shapes the recommendations, the pro tips and the
        suggestions you get. Aly reads it before she answers, so a few sentences
        here make the advice fit you instead of fitting anybody. It works before
        you have booked a thing, and you can change it any time.
      </p>
      <textarea
        className="field mt-3 text-sm"
        rows={5}
        placeholder="What do you enjoy? What pace do you want? What would you rather skip?"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="mt-2 space-y-1.5">
        <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          For example
        </p>
        {ABOUT_ME_EXAMPLES.map((example) => (
          <p key={example} className="text-xs leading-relaxed text-ink-soft">
            &ldquo;{example}&rdquo;
          </p>
        ))}
      </div>
      {error && <p className="mt-2 text-sm font-semibold text-rose">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={save}
          disabled={busy || text.trim() === saved}
        >
          {busy ? "Saving…" : "Save"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          onClick={() => {
            setText(saved);
            setError("");
            setOpen(false);
          }}
        >
          {saved ? "Cancel" : "Not now"}
        </button>
      </div>
    </div>
  );
}
