"use client";

import { useCallback, useEffect, useState } from "react";

import {
  clearRun,
  describeRun,
  readRun,
  runHasContent,
} from "@/lib/practice/session";

/**
 * What the current rehearsal is holding, and a way to empty it.
 *
 * The practice chain carries whatever a person types from screen to screen so
 * Aly's answers on the proof screen are about the family
 * they invented rather than the built-in stand-in. That carrying is invisible
 * by design -- there is no save confirmation, because nothing is saved -- and
 * invisible state that changes what a model says is the kind of thing that
 * makes somebody distrust the whole rehearsal. So the hub says it out loud:
 * here is the family the next screen will use, and here is the button that
 * throws it away.
 *
 * Renders nothing at all when the run is empty. An untouched hub should look
 * like it did before this existed rather than carry a panel explaining an
 * absence.
 */
export default function RunPanel() {
  // Null until the first client render. sessionStorage does not exist on the
  // server, so the panel cannot be part of the server markup; starting from
  // null and filling in after mount keeps hydration honest.
  const [lines, setLines] = useState(null);

  const refresh = useCallback(() => {
    const run = readRun();
    setLines(runHasContent(run) ? describeRun(run) : []);
  }, []);

  useEffect(() => {
    refresh();
    // A rehearsal often runs across two tabs -- the chain in one, the hub
    // left open in another. Re-reading whenever the tab regains focus means
    // the hub stops claiming an empty run after the other tab filled one in.
    const onFocus = () => refresh();
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [refresh]);

  if (!lines || lines.length === 0) return null;

  return (
    <div className="mt-6 rounded-lg border border-line/60 p-4">
      <p className="section-label text-ink-soft">This run so far</p>
      <ul className="mt-2 space-y-1">
        {lines.map((line) => (
          <li key={line} className="text-sm text-ink-soft">
            {line}
          </li>
        ))}
      </ul>
      <p className="mt-3 text-sm leading-relaxed text-ink-soft">
        The screens after the welcome form work from this, so Aly&rsquo;s
        answers on the proof screen are about this family rather than a
        stand-in. It lives in this browser tab only, and closing the tab throws
        it away.
      </p>
      <div className="mt-3">
        <button
          type="button"
          onClick={() => {
            clearRun();
            refresh();
          }}
          className="btn btn-ghost px-3 py-1.5 text-sm"
        >
          Start a fresh run
        </button>
      </div>
    </div>
  );
}
