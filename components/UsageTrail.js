"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { sendUsage } from "@/lib/usage/client";

/**
 * Where somebody is, and how long they stayed there.
 *
 * Sits in the root layout and reports one row per screen: the path, and the
 * milliseconds between arriving and leaving. Nothing is sent on arrival — a
 * screen is only interesting once you know how long it held somebody — so the
 * row goes out when they navigate away, or when the tab is hidden or closed,
 * whichever happens first.
 *
 * Time spent with the tab in the background is not time spent on the screen, so
 * the clock stops when the document is hidden and starts again when it comes
 * back. Without that, a phone left face-down over lunch reports an hour of rapt
 * attention on whatever screen was open.
 *
 * There is no consent gate and no identifier of its own: the row is written
 * under the signed-in account by the route, and a request with nobody signed in
 * writes nothing at all. So a visitor on the login screen is not recorded, and
 * a family is not followed by anything they cannot see the account for.
 */
export default function UsageTrail() {
  const pathname = usePathname();
  // The screen currently being timed, and the clock. Refs rather than state:
  // none of this should cause a render.
  const current = useRef({ path: pathname, spent: 0, since: Date.now() });

  useEffect(() => {
    const previous = current.current;
    if (previous.path && previous.path !== pathname) {
      const held =
        previous.spent +
        (document.visibilityState === "hidden"
          ? 0
          : Date.now() - previous.since);
      sendUsage([{ kind: "page", path: previous.path, ms: held }]);
    }
    current.current = { path: pathname, spent: 0, since: Date.now() };
  }, [pathname]);

  useEffect(() => {
    function pause() {
      const now = current.current;
      now.spent += Date.now() - now.since;
      now.since = Date.now();
    }

    function onVisibility() {
      if (document.visibilityState === "hidden") {
        pause();
        // Sent now rather than held until the tab comes back, because on a
        // phone the tab very often does not come back: the browser is killed
        // in the background and the row goes with it.
        if (current.current.spent > 0) {
          sendUsage(
            [
              {
                kind: "page",
                path: current.current.path,
                ms: current.current.spent,
              },
            ],
            { beacon: true },
          );
          current.current.spent = 0;
        }
      } else {
        current.current.since = Date.now();
      }
    }

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onVisibility);
    };
  }, []);

  return null;
}
