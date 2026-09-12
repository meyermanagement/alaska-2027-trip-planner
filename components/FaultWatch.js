"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

import {
  MAX_FAULTS_PER_VISIT,
  MAX_FAULT_MESSAGE_CHARS,
  MAX_FAULT_STACK_CHARS,
  looksLikeNoise,
} from "@/lib/feedback/shared";

/**
 * The reports nobody writes.
 *
 * A tester tells us about the bug they noticed. This tells us about the ones
 * they did not: a screen that threw while they scrolled past it, a promise
 * nobody caught, a save that came back a five hundred and left them looking at a
 * spinner. Those are the failures people give up on rather than describe, and
 * during a beta they are the ones worth having.
 *
 * Three things are watched and nothing else: an uncaught error, a rejected
 * promise, and a call to this app's own API that comes back broken. Each
 * distinct fault is sent once per visit and a visit is capped, because a
 * component throwing inside a render loop can throw four hundred times a second
 * and neither the desk nor somebody's data plan should carry that.
 *
 * What is deliberately not watched: anything from another origin, a scroll
 * observer complaining about its own loop, an aborted fetch, and a request that
 * failed because the phone lost signal. None of those are bugs in this app, and
 * a log full of them is a log nobody reads.
 */
export default function FaultWatch() {
  const pathname = usePathname() || "";
  // Read by the listeners, which are attached once. A fault should say which
  // screen it happened on, not which screen the app opened on.
  const pathRef = useRef(pathname);
  pathRef.current = pathname;

  useEffect(() => {
    if (typeof window === "undefined") return undefined;
    // One watcher per page load, even where React mounts a component twice in
    // development. A second watcher would double every fault.
    if (window.__alyeskaFaultWatch) return undefined;
    window.__alyeskaFaultWatch = true;

    const seen = new Set();
    let sent = 0;

    function context() {
      const here = pathRef.current || "";
      const trip = /\/trips\/([0-9a-f-]{36})/i.exec(here);
      return {
        path: here,
        tripId: trip ? trip[1] : null,
        skin: document.documentElement?.dataset?.skin || null,
        viewport: `${window.innerWidth}x${window.innerHeight} at ${
          Math.round((window.devicePixelRatio || 1) * 10) / 10
        }x`,
      };
    }

    function report(source, message, detail) {
      const text = String(message || "").slice(0, MAX_FAULT_MESSAGE_CHARS);
      if (looksLikeNoise(text)) return;
      const mark = `${source}|${text}|${detail?.call || ""}`;
      if (seen.has(mark) || sent >= MAX_FAULTS_PER_VISIT) return;
      seen.add(mark);
      sent += 1;

      // keepalive, so a fault thrown on the way out of a page still leaves.
      // The failure of the report itself is swallowed on purpose: an app that
      // cannot log an error must not then throw about it.
      try {
        realFetch
          .call(window, "/api/feedback/log", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              source,
              message: text,
              ...context(),
              detail,
            }),
            keepalive: true,
          })
          .catch(() => {});
      } catch {
        /* nothing to be done about it */
      }
    }

    function onError(event) {
      const error = event?.error;
      const message =
        error?.message || event?.message || "Threw with no message";
      const chunk = isStaleChunk(message);
      report(chunk ? "chunk" : "script", message, {
        stack: String(error?.stack || "").slice(0, MAX_FAULT_STACK_CHARS),
        at: event?.filename
          ? `${event.filename}:${event.lineno || 0}:${event.colno || 0}`
          : null,
      });
      if (chunk) recoverFromStaleBuild();
    }

    function onRejection(event) {
      const reason = event?.reason;
      const message =
        (typeof reason === "string" ? reason : reason?.message) ||
        "Rejected with no message";
      // A failed import usually arrives here rather than as an error event, so
      // the same failure has to be recognised on both doors or half of them get
      // filed as an ordinary rejected promise and nothing is done about them.
      const chunk = isStaleChunk(message);
      report(chunk ? "chunk" : "promise", message, {
        stack: String(reason?.stack || "").slice(0, MAX_FAULT_STACK_CHARS),
      });
      if (chunk) recoverFromStaleBuild();
    }

    window.addEventListener("error", onError);
    window.addEventListener("unhandledrejection", onRejection);

    // The app's own calls. Only this origin's API, and only the answers that
    // mean the server broke rather than the request was wrong: a 400 is usually
    // the app telling somebody their input was no good, which is not a fault,
    // while a 500 is nobody's fault but ours.
    const realFetch = window.fetch;
    const patched = async function alyeskaFetch(input, init) {
      const response = await realFetch.call(window, input, init);
      try {
        const url = new URL(
          typeof input === "string" ? input : input?.url || String(input),
          window.location.origin,
        );
        const ours =
          url.origin === window.location.origin &&
          url.pathname.startsWith("/api/") &&
          // Not the log itself, and not the trail: either would let a broken
          // desk report its own reports forever.
          !url.pathname.startsWith("/api/feedback") &&
          !url.pathname.startsWith("/api/usage");
        if (ours && response.status >= 500) {
          report("call", `${response.status} from ${url.pathname}`, {
            call: url.pathname,
            status: response.status,
            method: String(init?.method || "GET").toUpperCase(),
          });
        }
      } catch {
        /* an address we cannot read is not a fault worth reporting */
      }
      return response;
    };
    window.fetch = patched;

    return () => {
      window.removeEventListener("error", onError);
      window.removeEventListener("unhandledrejection", onRejection);
      if (window.fetch === patched) window.fetch = realFetch;
      window.__alyeskaFaultWatch = false;
    };
  }, []);

  return null;
}

/**
 * The failure a deploy causes on somebody else's phone.
 *
 * Every build names its files after a hash of their contents, so a screen the
 * app has not opened yet is fetched by a name that only exists in the build the
 * page was loaded from. Ship a new build while a tester has the app open --
 * which during a beta is most of the day -- and the next screen they tap asks
 * for a file that is no longer there. Nothing is wrong with their phone, their
 * signal or the app: they are simply holding yesterday.
 */
const STALE_CHUNK =
  /Loading chunk|ChunkLoadError|Importing a module script failed|error loading dynamically imported module|Failed to fetch dynamically imported module/i;

function isStaleChunk(message) {
  return STALE_CHUNK.test(String(message || ""));
}

/** At most one recovery a minute, so a file genuinely gone cannot loop. */
const RELOAD_KEY = "alyeska:stale-build-reload";
const RELOAD_GAP_MS = 60000;

/**
 * Fetch the page again, once.
 *
 * The tap that failed went nowhere, so there is nothing on screen worth
 * preserving and a reload puts the tester on the current build without asking
 * them to understand any of the above. Two guards keep that from becoming its
 * own bug: a reload is only attempted once a minute, because if the file is
 * missing rather than renamed the reload will fail the same way and a loop is
 * worse than a broken tap; and nothing is reloaded out from under somebody who
 * is in the middle of typing, because losing a half-written message to Aly to
 * fix a problem they never saw is not a repair.
 */
function recoverFromStaleBuild() {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_GAP_MS) return;
    const focused = document.activeElement;
    const typing =
      focused &&
      (focused.isContentEditable ||
        ((focused.tagName === "INPUT" || focused.tagName === "TEXTAREA") &&
          String(focused.value || "").length > 0));
    if (typing) return;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
    // A beat, so the report above is on the wire before the page goes.
    window.setTimeout(() => window.location.reload(), 300);
  } catch {
    /* a browser that will not keep a flag is not one to reload in a loop */
  }
}
