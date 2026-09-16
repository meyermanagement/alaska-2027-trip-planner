"use client";

import { useEffect, useState } from "react";

/**
 * What the browser is allowed to know about who is looking at the screen.
 *
 * Two answers, one request. Whether the person is in the beta decides the report
 * button that hangs in the corner and the menu row for the beta survey; whether
 * they are on the admin allowlist decides the menu row for the workshop screens.
 * Neither can come from the layout -- the layout is shared by every page and
 * reads nothing from the database on purpose -- so both come from
 * /api/beta/tester, which is the only thing able to answer either, because the
 * tables they rest on are not readable from a browser at all.
 *
 * They are asked together rather than from two routes because they are the same
 * question with two halves, and a second round trip on every load to learn one
 * more boolean about yourself is waste.
 *
 * One answer per browser session. sessionStorage rather than a state variable
 * because every client navigation remounts the things that ask, and a fresh
 * request on every screen change to learn something that cannot change
 * mid-session is waste. The remembered answer is read while the first frame is
 * being drawn, so a tester's menu does not visibly grow a row a moment after it
 * opens.
 *
 * False while unknown, and false on any failure. A menu row or a floating button
 * that appears for the public is the worse of the two ways to be wrong. Neither
 * boolean is a permission: the page behind each row checks the same thing again
 * for itself, and so does every route behind those pages.
 */
const CACHE_KEY = "alyeska-beta-tester";
const ADMIN_KEY = "alyeska-admin-user";

function remembered(key) {
  if (typeof window === "undefined") return null;
  try {
    const saved = window.sessionStorage.getItem(key);
    if (saved === "1") return true;
    if (saved === "0") return false;
  } catch {
    // Private browsing, or storage turned off. Ask again, that is all.
  }
  return null;
}

function keep(key, yes) {
  try {
    window.sessionStorage.setItem(key, yes ? "1" : "0");
  } catch {
    // As above.
  }
}

// Both halves, from the one request. Each caller picks the half it needs; a
// screen that mounts the report button and the menu together makes one fetch
// between them, because the second hook finds the answer already remembered.
function useWhoIsAsking() {
  const [flags, setFlags] = useState(() => ({
    tester: remembered(CACHE_KEY) === true,
    admin: remembered(ADMIN_KEY) === true,
  }));
  const [settled, setSettled] = useState(
    () => remembered(CACHE_KEY) !== null && remembered(ADMIN_KEY) !== null,
  );

  useEffect(() => {
    if (settled) return undefined;
    let alive = true;

    (async () => {
      try {
        const res = await fetch("/api/beta/tester", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        const tester = Boolean(json?.tester);
        const admin = Boolean(json?.admin);
        setFlags({ tester, admin });
        setSettled(true);
        keep(CACHE_KEY, tester);
        keep(ADMIN_KEY, admin);
      } catch {
        // Offline, or signed out. No button, no row, no complaint.
      }
    })();

    return () => {
      alive = false;
    };
  }, [settled]);

  return flags;
}

export default function useBetaTester() {
  return useWhoIsAsking().tester;
}

export function useAdminUser() {
  return useWhoIsAsking().admin;
}
