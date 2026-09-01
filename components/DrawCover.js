"use client";

// The button that asks for a trip's picture.
//
// Aly can do this too, and asking her is the better way to ask for a *different*
// one -- "more winter", "show the ship" -- because she can carry the words. This
// is the other half of that pair, and it exists for the same reason every Aly
// action in this app has a plain control beside it: a feature reachable only by
// conversation is a feature the family has to remember how to phrase.
//
// It waits in place rather than navigating away. A drawing takes twenty to forty
// seconds, which is long enough that the button has to keep saying something,
// and short enough that leaving the screen would be the wrong instruction.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Spinner } from "./LinkPending";
import { PictureIcon } from "./Icons";

export default function DrawCover({ trip, className = "" }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(null);
  const has = Boolean(trip?.cover_image_url);

  async function draw() {
    setBusy(true);
    setFailed(null);
    try {
      const res = await fetch(`/api/trips/${trip.id}/cover`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || json.status !== "ready") {
        // The model's own sentence when there is one. A refusal says something
        // useful ("no image in the answer" means it answered in words), and a
        // 503 means the model is busy and the next press may well land.
        setFailed(json.error || "That did not work. Try again in a moment.");
      } else {
        // The picture is on the row now, and the row is what every card on
        // every screen draws from, so the whole page is refetched rather than
        // this one image swapped in place.
        router.refresh();
      }
    } catch {
      setFailed("That did not work. Try again in a moment.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={className}>
      <button
        type="button"
        onClick={draw}
        disabled={busy}
        className="btn btn-ghost btn-sm no-print w-full disabled:opacity-70"
      >
        {busy ? (
          <>
            <Spinner className="h-3.5 w-3.5" />
            Drawing…
          </>
        ) : (
          <>
            <PictureIcon />
            {has ? "Draw another cover" : "Draw a cover"}
          </>
        )}
      </button>
      {busy && (
        <p className="mt-1.5 text-xs text-ink-soft">
          Half a minute or so. You can keep working; it will appear on the trip.
        </p>
      )}
      {failed && (
        <p role="status" className="mt-1.5 text-xs text-rose">
          {failed}
        </p>
      )}
    </div>
  );
}
