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
//
// The two are named here by when they happen rather than by how long they take.
// They were Short and Long, which is what they look like side by side and not
// what anybody wants to know: one of them is every load of the app, and the other
// is the moment somebody signs in.
const BOOT_ATTR = "boot";

// The crossings the short opening chooses between, by the names they are known by
// here rather than by their numbers -- a person judging one wants to know what it
// is meant to feel like. The ids are the ones the stylesheet keys on, and the
// count has to agree with ROUTE_COUNT in app/layout.js.
const CROSSINGS = [
  { id: "1", name: "Long swing" },
  { id: "2", name: "Late arcs" },
  { id: "3", name: "Coastline" },
];

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
  // Which crossing is on screen. Null until the effect reads what the head script
  // drew for this load, so the page shows the same one the app would have.
  const [crossing, setCrossing] = useState(null);

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

  // Same bargain as the skin: written to the document for as long as this page is
  // open, and put back on the way out, so watching the coastline crossing here
  // does not decide what the next real load flies.
  useEffect(() => {
    const root = document.documentElement;
    const had = root.dataset.route;
    if (crossing === null) {
      setCrossing(had ?? CROSSINGS[0].id);
      return undefined;
    }
    root.dataset.route = crossing;
    return () => {
      if (had) root.dataset.route = had;
    };
  }, [crossing]);

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
        key={`${kind}-${run}-${skin ?? "none"}-${crossing ?? "none"}`}
        aria-hidden="true"
      >
        <BootStage />
      </div>

      {!bare && (
        <div className="opening-desk">
          <p className="opening-lede">
            The openings, held up so they can be watched. The crossing is what
            every load of the app gets, however it was reached; the arrival,
            with the compass swinging on to north, plays once, on the load that
            follows somebody signing in.
          </p>
          <div className="opening-row">
            <button
              type="button"
              className={kind === "quick" ? "on" : ""}
              onClick={() => replay("quick")}
            >
              Every load
            </button>
            <button
              type="button"
              className={kind === "full" ? "on" : ""}
              onClick={() => replay("full")}
            >
              After signing in
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
            {CROSSINGS.map((c) => (
              <button
                key={c.id}
                type="button"
                className={crossing === c.id ? "on" : ""}
                onClick={() => setCrossing(c.id)}
              >
                {c.name}
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
            The ground scrolls by a whole number of graticule cells, so a
            crossing can run as long as you leave this page open without ever
            appearing to start over. The turn and the zoom are on a separate
            eleven second period, which is worth waiting out at least once. A
            real load draws one of the three crossings at random; here you can
            ask for the one you want to look at. The crossings belong to the
            everyday opening only, since the arrival has no map behind it.
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
