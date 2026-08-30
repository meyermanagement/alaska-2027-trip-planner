"use client";

import { useEffect, useState } from "react";
import { elapsedSaid, waitingLine } from "@/lib/agent/waiting";

/**
 * What the panel shows while Aly has not answered yet.
 *
 * A single unmoving "Thinking…" is indistinguishable from a page that has
 * crashed, and a question that needs the web can take most of a minute, so the
 * family were left staring at three full stops wondering whether to press it
 * again. This gives them three things instead: something that visibly moves, a
 * count of how long it has actually been, and a way out.
 *
 * Everything it says is either the elapsed time or a statement about the elapsed
 * time. It never claims to know which step she is on, because from in here it
 * does not -- the one caller that does know its steps passes its own words in as
 * `label` and gets the movement and the count around them.
 */

export default function Thinking({
  label = null,
  onStop = null,
  stopLabel = "Stop",
}) {
  const [seconds, setSeconds] = useState(0);

  useEffect(() => {
    // Restarted whenever the words change, so a caller reporting real steps
    // shows the time on the step rather than the time since it started.
    setSeconds(0);
    const at = Date.now();
    const tick = window.setInterval(() => {
      setSeconds(Math.floor((Date.now() - at) / 1000));
    }, 1000);
    return () => window.clearInterval(tick);
  }, [label]);

  // A caller with real steps says what it is doing; without one, the honest
  // thing to say is how long it has been.
  const said = label || waitingLine(seconds);

  return (
    <div className="flex justify-start">
      <div className="max-w-[85%] rounded-xl bg-sand px-3.5 py-2.5 text-sm text-ink-soft">
        <div className="flex items-center gap-2">
          <span className="aly-dots" aria-hidden="true">
            <i />
            <i />
            <i />
          </span>
          {/* Announced once per change of words. The seconds are deliberately
              outside this: a screen reader counting to sixty out loud is worse
              than silence. */}
          <span aria-live="polite">{said}</span>
          {seconds >= 3 && (
            <span className="tabular text-xs text-ink-faint" aria-hidden="true">
              {elapsedSaid(seconds)}
            </span>
          )}
        </div>
        {onStop && seconds >= 5 && (
          <button
            type="button"
            onClick={onStop}
            className="mt-1.5 text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
          >
            {stopLabel}
          </button>
        )}
      </div>
    </div>
  );
}
