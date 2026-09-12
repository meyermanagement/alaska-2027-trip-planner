"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

import { FEEDBACK_EVENT, MENU_EVENT } from "@/lib/feedback/shared";
import useSoftKeyboard from "./useSoftKeyboard";

/**
 * The one control a tester needs on every screen: something is wrong here.
 *
 * It is deliberately not the Contact Us row in the menu. A bug is noticed while
 * you are looking at it, and a report that costs two taps and a menu is a report
 * that gets put off until the thing you meant to say has gone. So it sits on the
 * screen, small and out of the way, and it is on the onboarding screens too --
 * where the compass and Ask Aly are both absent on purpose, and where a first-run
 * problem is exactly the kind nobody is ever in a position to describe later.
 *
 * Only for the beta. The button is a beta instrument, so it is drawn only for
 * people in the beta -- see app/api/beta/tester/route.js, which is the only thing
 * that can answer that, because the table it reads is not readable from a
 * browser. The answer is remembered for the browser session, so it costs one
 * request per visit rather than one per screen.
 *
 * Where it sits: bottom center, in the gap between the compass on the left and
 * Ask Aly on the right. It is smaller than either, because it is not part of the
 * app's own furniture and should not look like it is. It moves out of the way for
 * the menu, which grows a search pill through that gap, and for the phone
 * keyboard, which would otherwise leave it stranded on top of the keys.
 */

// One answer per browser session. sessionStorage rather than a state variable
// because every client navigation remounts this, and a fresh request on every
// screen change to learn something that cannot change mid-session is waste.
const CACHE_KEY = "alyeska-beta-tester";

export default function ReportButton() {
  const pathname = usePathname() || "";
  const [tester, setTester] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [crowded, setCrowded] = useState(false);
  const keyboardOpen = useSoftKeyboard();

  useEffect(() => {
    let alive = true;

    let remembered = null;
    try {
      remembered = window.sessionStorage.getItem(CACHE_KEY);
    } catch {
      // Private browsing, or storage turned off. Ask again, that is all.
    }
    if (remembered === "1" || remembered === "0") {
      setTester(remembered === "1");
      return undefined;
    }

    (async () => {
      try {
        const res = await fetch("/api/beta/tester", { cache: "no-store" });
        if (!res.ok) return;
        const json = await res.json();
        if (!alive) return;
        const yes = Boolean(json?.tester);
        setTester(yes);
        try {
          window.sessionStorage.setItem(CACHE_KEY, yes ? "1" : "0");
        } catch {
          // As above.
        }
      } catch {
        // Offline, or signed out. No button, no complaint.
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  // Narrow enough for the bar's two discs to matter. Matches the app's own `sm`
  // breakpoint, above which the gap between them is most of the screen.
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(max-width: 639px)");
    const read = () => setNarrow(query.matches);
    read();
    query.addEventListener("change", read);
    return () => query.removeEventListener("change", read);
  }, []);

  // Is the menu bar down there too? On a phone the compass and Ask Aly leave a
  // gap of about a hundred and fifty points between them, and this pill is a
  // hundred and thirty wide -- it fits, but only just, and a control with five
  // points of air either side of it looks like a mistake. So when the bar is
  // present on a narrow screen the pill sits above it instead of squeezing
  // between. On the onboarding screens, where the bar is absent on purpose, it
  // stays at the bottom where the thumb is.
  useEffect(() => {
    setCrowded(Boolean(document.querySelector("[data-navbar]")));
  }, [pathname]);

  useEffect(() => {
    function onMenu(event) {
      setMenuOpen(Boolean(event?.detail?.open));
    }
    window.addEventListener(MENU_EVENT, onMenu);
    return () => window.removeEventListener(MENU_EVENT, onMenu);
  }, []);

  if (!tester) return null;

  return (
    <div
      /* Takes no presses itself, so the strip of screen either side of the pill
         still belongs to whatever is underneath it. */
      className={`no-print pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 transition-transform duration-200 ${
        menuOpen || keyboardOpen ? "translate-y-[200%]" : ""
      }`}
      style={{
        paddingBottom:
          crowded && narrow
            ? "max(5.75rem, calc(env(safe-area-inset-bottom) + 5.25rem))"
            : "max(1.35rem, calc(env(safe-area-inset-bottom) + 0.75rem))",
      }}
    >
      <button
        type="button"
        onClick={() => {
          window.dispatchEvent(
            new CustomEvent(FEEDBACK_EVENT, { detail: { kind: "problem" } }),
          );
        }}
        className="pointer-events-auto inline-flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full border border-[var(--disc-edge)] bg-[var(--disc-face)] px-3 text-xs font-semibold text-ink shadow-[var(--disc-shadow)] transition hover:border-[var(--line-strong)] active:translate-y-px"
      >
        <FlagIcon className="h-3.5 w-3.5 shrink-0 text-rose" />
        Report an issue
      </button>
    </div>
  );
}

/* A small flag, because the two icons already at the bottom of the screen are a
   compass and a speech bubble and a third round face would read as a third piece
   of the app rather than a note left on it. */
function FlagIcon({ className = "" }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      <path d="M5 21V4" />
      <path d="M5 4h9l-1.2 3.4L14 11H5" />
    </svg>
  );
}
