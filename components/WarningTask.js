"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * "Put this on the checklist" for a passport warning.
 *
 * The warning itself is not stored anywhere — it is worked out from the passport
 * dates every time a page is drawn — so this sends nothing but a trip id and lets
 * the server work the warning out again and write the task. A button that could
 * post its own task text would be a button that could write anything into this
 * family's checklist.
 *
 * Its own small client component so the band and the panel can stay server-
 * rendered, which is what lets the warning appear on the first paint of every
 * screen.
 */
export default function WarningTask({ tripId }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [said, setSaid] = useState("");

  if (!tripId) return null;

  const go = async () => {
    setBusy(true);
    setSaid("");
    try {
      const res = await fetch("/api/warnings/task", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tripId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "");
      setSaid(
        body?.note ||
          "On the checklist, and in the morning email until it is done.",
      );
      router.refresh();
    } catch (err) {
      setSaid(err?.message || "Could not add that to the checklist.");
    }
    setBusy(false);
  };

  return (
    <p className="no-print mt-3 flex flex-wrap items-baseline gap-3">
      <button
        type="button"
        onClick={go}
        disabled={busy || Boolean(said)}
        className="btn-ghost px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em] disabled:opacity-50"
      >
        {busy ? "Adding…" : "Remind me"}
      </button>
      {said ? (
        <span aria-live="polite" className="text-[0.82rem] text-ink-soft">
          {said}
        </span>
      ) : null}
    </p>
  );
}
