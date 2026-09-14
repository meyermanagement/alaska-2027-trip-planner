"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * The one way to stop the setup marks in the menu.
 *
 * The menu marks the rows behind the four things the welcome checklist asked
 * for, and takes the marks away by itself the moment the fourth one is done.
 * This is for the household where one of the four is never going to happen --
 * nobody else in the house to describe, or no past trip worth typing in -- so
 * that "stop asking" is an answer somebody can give rather than a thing they
 * have to put up with.
 *
 * There is deliberately no per-row dismissal. Four rows with four small crosses
 * is a second checklist to keep, and it would let a family turn off the one mark
 * that was worth the most to them without ever seeing what it was for.
 *
 * The way back is on the same button, because a control that only goes one way
 * is a trapdoor: somebody who taps this on a Tuesday and adds two people on the
 * Wednesday should be able to see where they are again.
 */
export default function SetupDoneControl({ doneAt = null, left = 0 }) {
  const router = useRouter();
  const [done, setDone] = useState(Boolean(doneAt));
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState("");

  async function change(next) {
    setBusy(true);
    setFailed("");
    try {
      const res = await fetch("/api/setup/done", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ done: next }),
      });
      const body = await res.json().catch(() => null);
      if (!res.ok) throw new Error(body?.error || "Could not save that.");
      setDone(next);
      // The marks live in the header, which is a server component on every
      // screen -- so the menu only stops carrying them once this page's data is
      // read again.
      router.refresh();
    } catch (err) {
      setFailed(
        err?.message === "Failed to fetch"
          ? "No connection. Nothing changed."
          : err?.message || "Could not save that.",
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <section>
      <h2 className="font-display text-xl font-semibold">Setting up</h2>
      <p className="mt-1 text-sm text-ink-soft">
        {done
          ? "The menu is not marking anything. Aly still works better with the four things filled in, and you can pick them up again whenever you like."
          : left > 0
            ? `The menu is marking ${left === 1 ? "the one place" : `the ${left} places`} where something from the welcome checklist is still outstanding.`
            : "Everything the welcome checklist asked for is done, so the menu is not marking anything."}
      </p>

      {failed && (
        <p role="alert" className="mt-3 text-sm text-rose">
          {failed}
        </p>
      )}

      <div className="no-print mt-4">
        <button
          type="button"
          className="btn btn-ghost text-sm"
          disabled={busy}
          onClick={() => change(!done)}
        >
          {done ? "Show me what is left again" : "I'm done setting up"}
        </button>
      </div>
    </section>
  );
}
