"use client";

// "Nearby" needs somewhere to be near.
//
// Two ways to say it, both deliberate acts. The button asks the phone once; the
// box takes a typed place. Nothing is asked for and nothing is sent until one of
// them is used, so planning from the sofa in Webster Groves never involves a
// permission prompt, and the app never quietly follows anyone around.
//
// The typed way matters more than it looks. On a ship at sea, in a port with no
// signal, or on a plane, the phone either refuses or answers confidently wrong -
// and someone who knows they are in Skagway can just say so.

import { useEffect, useRef, useState } from "react";
import { COARSE_M } from "@/lib/places/here";

const STORE_KEY = "aly.here";

/** Kept for the session, so it survives the drawer closing and reopening. */
export function readStored() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(STORE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function store(here) {
  if (typeof window === "undefined") return;
  try {
    if (here) window.sessionStorage.setItem(STORE_KEY, JSON.stringify(here));
    else window.sessionStorage.removeItem(STORE_KEY);
  } catch {
    /* a private window with storage blocked still gets to use the button */
  }
}

const REFUSED_KEY = "aly.here.refused";

/**
 * Ask the phone where it is, without a word on screen.
 *
 * The visible button above is for the chat drawer, where somebody has decided to
 * ask about nearby things. This is for the day being lived, where the useful
 * question -- how long to the next thing -- is worthless measured from anywhere
 * but here, so the app asks rather than waiting to be told.
 *
 * Two rules keep that from becoming nagging. It only ever runs on the day of a
 * trip in progress, and a refusal is remembered for the session, so somebody who
 * says no is asked once and then left alone. It resolves to null on every failure
 * path: the day view works without a position and must never wait on one.
 */
export async function askQuietly() {
  if (typeof navigator === "undefined" || !navigator.geolocation) return null;
  try {
    if (window.sessionStorage.getItem(REFUSED_KEY)) return null;
  } catch {
    /* storage blocked; asking once more is the lesser evil */
  }
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const { latitude, longitude, accuracy } = position.coords || {};
        const found = {
          lat: latitude,
          lon: longitude,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
          source: "device",
          label: null,
        };
        // Written to the same place the button writes to, so the drawer, the
        // nearby cards and the day all agree about where the family is.
        store(found);
        resolve(found);
      },
      (err) => {
        // Only an outright refusal is remembered. A timeout in a parking garage
        // is not a decision, and next time it may well work.
        if (err?.code === 1) {
          try {
            window.sessionStorage.setItem(REFUSED_KEY, "1");
          } catch {
            /* nothing to remember it with */
          }
        }
        resolve(null);
      },
      // A five minute old fix is still where you are, and reusing it means no
      // second permission prompt and no waiting for a cold GPS lock.
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
    );
  });
}

function describe(here) {
  if (!here) return "";
  if (here.label) return here.label;
  return `${here.lat.toFixed(3)}, ${here.lon.toFixed(3)}`;
}

export default function WhereIAm({ here, onChange }) {
  const [asking, setAsking] = useState(false);
  const [typing, setTyping] = useState(false);
  const [text, setText] = useState("");
  const [problem, setProblem] = useState("");
  const boxRef = useRef(null);

  useEffect(() => {
    if (typing) boxRef.current?.focus();
  }, [typing]);

  function set(next) {
    store(next);
    onChange?.(next);
  }

  function askThePhone() {
    setProblem("");
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setProblem(
        "This phone will not share its location. Type where you are instead.",
      );
      setTyping(true);
      return;
    }
    setAsking(true);
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setAsking(false);
        const { latitude, longitude, accuracy } = position.coords || {};
        const found = {
          lat: latitude,
          lon: longitude,
          accuracy: Number.isFinite(accuracy) ? accuracy : null,
          source: "device",
          label: null,
        };
        set(found);
        // Said plainly rather than hidden: a position this rough would put a
        // confident number of miles on a card that is really a guess about which
        // town you are in.
        if (Number.isFinite(accuracy) && accuracy > COARSE_M) {
          setProblem(
            "Your phone is only sure to within a few miles, so I will talk about the area rather than exact distances. Type where you are for something better.",
          );
        }
      },
      (err) => {
        setAsking(false);
        setProblem(
          err?.code === 1
            ? "Location is switched off for this site. Turn it on in your browser settings, or type where you are."
            : "Your phone could not work out where it is. Type where you are instead.",
        );
        setTyping(true);
      },
      // A cold GPS fix takes a while, and a slightly older fix is fine for
      // deciding which side of an island you are on.
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 120000 },
    );
  }

  async function lookUpTyped(e) {
    e?.preventDefault();
    const said = text.trim();
    if (said.length < 2) return;
    setProblem("");
    setAsking(true);
    try {
      const res = await fetch(`/api/here?q=${encodeURIComponent(said)}`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.here) {
        setProblem(
          data?.error || "I could not place that. Try the town or the island.",
        );
        return;
      }
      set(data.here);
      setTyping(false);
      setText("");
    } catch {
      setProblem("I could not reach the map just then.");
    } finally {
      setAsking(false);
    }
  }

  return (
    <div className="text-xs">
      {here ? (
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1 rounded-full bg-teal-soft px-2 py-1 font-medium text-teal">
            <span aria-hidden="true">◉</span>
            Near {describe(here)}
          </span>
          <button
            type="button"
            onClick={() => {
              setTyping(true);
              setProblem("");
            }}
            className="text-ink-soft underline underline-offset-2"
          >
            Change
          </button>
          <button
            type="button"
            onClick={() => {
              set(null);
              setProblem("");
              setTyping(false);
            }}
            className="text-ink-soft underline underline-offset-2"
          >
            Forget it
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={askThePhone}
            disabled={asking}
            className="inline-flex items-center gap-1 rounded-full border border-sand-deep px-2.5 py-1 font-medium text-ink disabled:opacity-60"
          >
            <span aria-hidden="true">◎</span>
            {asking ? "Finding you…" : "Use my location"}
          </button>
          <button
            type="button"
            onClick={() => setTyping((t) => !t)}
            className="text-ink-soft underline underline-offset-2"
          >
            or say where you are
          </button>
        </div>
      )}

      {typing && (
        <form onSubmit={lookUpTyped} className="mt-2 flex items-center gap-2">
          <input
            ref={boxRef}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Skagway, or Mambo Beach"
            aria-label="Where you are right now"
            className="field h-9 flex-1 py-1 text-xs"
          />
          <button
            type="submit"
            disabled={asking || text.trim().length < 2}
            className="btn btn-primary shrink-0 px-3 py-1 text-xs"
          >
            Set
          </button>
        </form>
      )}

      {problem && <p className="mt-1 text-ink-soft">{problem}</p>}
    </div>
  );
}
