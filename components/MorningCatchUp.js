"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

/**
 * Asks the server to send the morning email that nothing else sent.
 *
 * Rendered only when the record shows no run today, and it asks once per page
 * regardless — a ref rather than state, because React will mount an effect twice
 * in development and a second request is a second chance to email the household.
 * The server refuses the duplicate anyway; this saves it having to.
 *
 * It reports what happened rather than staying quiet about it. If the app had to
 * rescue its own morning, the reader should know both that their email is on its
 * way and that the thing which should have sent it is still broken.
 */
export default function MorningCatchUp() {
  const router = useRouter();
  const asked = useRef(false);
  const [state, setState] = useState("asking");
  const [error, setError] = useState(null);

  useEffect(() => {
    if (asked.current) return;
    asked.current = true;
    let alive = true;

    fetch("/api/tasks/remind/catch-up", { method: "POST" })
      .then((r) => r.json())
      .then((data) => {
        if (!alive) return;
        if (data.skipped) {
          setState("skipped");
          return;
        }
        if (data.error) {
          setError(data.error);
          setState("failed");
          return;
        }
        setState(data.sent > 0 ? "sent" : "nothing");
        // Redraw so the panel above reads the run it just caused rather than the
        // absence it was rendered from.
        if (data.sent > 0) router.refresh();
      })
      .catch(() => {
        if (alive) setState("failed");
      });

    return () => {
      alive = false;
    };
  }, [router]);

  if (state === "skipped") return null;

  return (
    <p className="mt-1 text-ink-soft" aria-live="polite">
      {state === "asking" && "Sending it now instead…"}
      {state === "sent" &&
        "Sent just now instead, so it is on its way — late, but on its way."}
      {state === "nothing" &&
        "Nothing turned out to be due, so there was nothing to send after all."}
      {state === "failed" &&
        (error
          ? `Sending it now did not work either: ${error}`
          : "Sending it now did not work either.")}
    </p>
  );
}
