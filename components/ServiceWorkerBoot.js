"use client";

import { useEffect } from "react";

/**
 * Register the offline document worker on first mount, and ask the browser to
 * keep the family's cache around across storage pressure.
 *
 * The registration is idempotent -- the browser handles the update check on
 * its own and swaps in a new worker the next time no clients are open on the
 * old one. Persistent storage is a request rather than a guarantee: browsers
 * grant it based on their own heuristics (installed as a PWA on iOS, engaged
 * user + push notifications on Chrome). Asking never hurts.
 */
export default function ServiceWorkerBoot() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!("serviceWorker" in navigator)) return;

    // Only register in production or when explicitly enabled in dev; running
    // in the dev server would grab the fetches Next.js uses for HMR and hot
    // updates, which is confusing and slow.
    if (process.env.NODE_ENV !== "production") return;

    navigator.serviceWorker.register("/sw.js").catch(() => {
      // A refused registration -- inside an iframe, over HTTP, or blocked
      // by the browser -- is not fatal. Documents still open online.
    });

    if (navigator.storage && navigator.storage.persist) {
      navigator.storage.persist().catch(() => {
        // Same reasoning: refused means the family stays on standard
        // eviction rules, which is where they were before this ran.
      });
    }
  }, []);

  return null;
}
