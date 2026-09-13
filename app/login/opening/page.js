"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { BootStage } from "@/components/BootVeil";
import { SKINS } from "@/lib/skins";
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
  // Read off the document rather than assumed, because the script in the head
  // has already put whichever skin this browser last chose onto <html>, and
  // starting anywhere else would flash a skin nobody asked for. Null until the
  // effect below runs, so the server and the first client render agree.
  const [skin, setSkin] = useState(null);

  // Only for as long as this page is open. The chosen skin is written to the
  // document and not to the cookie, so looking at an opening in Sodium at
  // midnight does not leave the whole app wearing Sodium in the morning.
  useEffect(() => {
    const root = document.documentElement;
    const had = root.dataset.skin;
    if (skin === null) {
      setSkin(had ?? null);
      return undefined;
    }
    root.dataset.skin = skin;
    return () => {
      if (had) root.dataset.skin = had;
    };
  }, [skin]);

  useEffect(() => {
    const root = document.documentElement;
    const had = root.dataset[BOOT_ATTR];
    root.dataset[BOOT_ATTR] = kind;
    return () => {
      if (had) root.dataset[BOOT_ATTR] = had;
    };
  }, [kind]);

  // The skin is in the stage's key as well as the opening, because a skin
  // rewrites the custom properties the animations were resolved against and
  // switching one underneath a running opening can leave the map drawn in the
  // colors of neither. Remounting draws the whole picture again in the skin that
  // was asked for, which is also what somebody judging a skin wants to see.
  const replay = (next) => {
    setKind(next);
    setRun((n) => n + 1);
  };

  return (
    <>
      <div
        id="boot-stage"
        key={`${kind}-${run}-${skin ?? "none"}`}
        aria-hidden="true"
      >
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
          <div className="opening-row opening-skins">
            {SKINS.map((s) => (
              <button
                key={s.id}
                type="button"
                className={skin === s.id ? "on" : ""}
                onClick={() => setSkin(s.id)}
                title={s.tag}
              >
                <span
                  className="opening-swatch"
                  style={{ background: s.swatch[0], borderColor: s.swatch[1] }}
                  aria-hidden="true"
                />
                {s.name}
              </button>
            ))}
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
