"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BootStage } from "@/components/BootVeil";
import "./opening.css";

// Which opening the stylesheet draws is decided by one attribute on the
// document, so this page simply writes it. Nothing here is a copy of the
// opening: it is the same components against the same rules, held up instead of
// lifted after a second.
const BOOT_ATTR = "boot";

export default function OpeningWatch() {
  const [kind, setKind] = useState("quick");
  // Bumping this remounts the stage, which is what restarts the one-shot parts
  // of the long opening -- the rim drawing round, the needle swinging in, the
  // word arriving. CSS animations only play again if the element is new.
  const [run, setRun] = useState(0);
  const [bare, setBare] = useState(false);

  useEffect(() => {
    const root = document.documentElement;
    const had = root.dataset[BOOT_ATTR];
    root.dataset[BOOT_ATTR] = kind;
    return () => {
      if (had) root.dataset[BOOT_ATTR] = had;
    };
  }, [kind]);

  const replay = (next) => {
    setKind(next);
    setRun((n) => n + 1);
  };

  return (
    <>
      <div id="boot-stage" key={`${kind}-${run}`} aria-hidden="true">
        <BootStage />
      </div>

      {!bare && (
        <div className="opening-desk">
          <p className="opening-lede">
            The openings, held up so they can be watched. The short one is what
            every load after the first in a browser session gets; the long one
            runs once per session.
          </p>
          <div className="opening-row">
            <button
              type="button"
              className={kind === "quick" ? "on" : ""}
              onClick={() => replay("quick")}
            >
              Short opening
            </button>
            <button
              type="button"
              className={kind === "full" ? "on" : ""}
              onClick={() => replay("full")}
            >
              Long opening
            </button>
            <button type="button" onClick={() => replay(kind)}>
              Play again
            </button>
          </div>
          <div className="opening-row">
            <button type="button" onClick={() => setBare(true)}>
              Hide these controls
            </button>
            <Link href="/">Back to the app</Link>
          </div>
          <p className="opening-note">
            The ground scrolls by exactly one cell of the graticule, so it can
            run as long as you leave this page open without ever appearing to
            start over. The turn and the zoom are on a separate eleven second
            period, which is worth waiting out at least once.
          </p>
        </div>
      )}

      {bare && (
        <button
          type="button"
          className="opening-show"
          onClick={() => setBare(false)}
        >
          Controls
        </button>
      )}
    </>
  );
}
