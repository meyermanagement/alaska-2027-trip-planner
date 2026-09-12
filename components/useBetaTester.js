"use client";

import { useEffect, useState } from "react";

/**
 * Whether the person looking at the screen is in the beta.
 *
 * Two things in the browser need this answer: the report button that hangs in
 * the corner, and the menu row for the beta survey. It cannot come from the
 * layout -- the layout is shared by every page and reads nothing from the
 * database on purpose -- so it comes from /api/beta/tester, which is the only
 * thing able to answer it, because the table it rests on is not readable from a
 * browser at all.
 *
 * One answer per browser session. sessionStorage rather than a state variable
 * because every client navigation remounts the things that ask, and a fresh
 * request on every screen change to learn something that cannot change
 * mid-session is waste. The remembered answer is read while the first frame is
 * being drawn, so a tester's menu does not visibly grow a row a moment after it
 * opens.
 *
 * False while unknown, and false on any failure. A menu row or a floating button
 * that appears for the public is the worse of the two ways to be wrong.
 */
const CACHE_KEY = "alyeska-beta-tester";

function remembered() {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.sessionStorage.getItem(CACHE_KEY);
    if (saved === "1") return true;
    if (saved === "0") return false;
  } catch {
    // Private browsing, or storage turned off. Ask again, that is all.
  }
  return null;
}

export default function useBetaTester() {
  const [tester, setTester] = useState(() => remembered() === true);
  const [settled, setSettled] = useState(() => remembered() !== null);

  useEffect(() => {
    if (settled) return undefined;
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/beta/tester", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        const yes = Boolean(json?.tester);
        setTester(yes);
        setSettled(true);
        try {
          window.sessionStorage.setItem(CACHE_KEY, yes ? "1" : "0");
        } catch {
          // As above.
        }
      } catch {
        // Offline, or signed out. No button, no row, no complaint.
      }
    })();

    return () => {
      alive = false;
    };
  }, [settled]);

  return tester;
}
