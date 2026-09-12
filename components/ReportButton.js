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
 * Where it sits: the bottom left corner, and small enough to be a mark rather
 * than a control -- an icon, no label, a third of the size of the two discs. It
 * is not part of the app's own furniture and should not look like it is; a tester
 * learns where it is on the first day and everybody else never sees it. On the
 * screens that carry the menu bar the compass already has that corner, so the
 * icon sits directly above it. On the onboarding screens, where nothing else
 * floats, it takes the corner itself.
 *
 * It moves out of the way for the menu, whose compass grows a search pill up
 * through that space, and for the phone keyboard, which would otherwise leave it
 * stranded on top of the keys.
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

  // Is the menu bar down there too? The compass stands in this corner on every
  // screen that has the bar, so the icon lifts above it rather than landing on
  // it. On the onboarding screens, where the bar is absent on purpose, it stays
  // in the corner.
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
      className={`no-print pointer-events-none fixed inset-x-0 bottom-0 z-30 px-4 transition-transform duration-200 ${
        menuOpen || keyboardOpen ? "translate-y-[250%]" : ""
      }`}
      style={{
        paddingBottom: crowded
          ? /* Sitting in the same row as the compass rather than stacked above
               it, and lifted the fourteen points that center a twenty-eight
               point disc against a fifty-six point one, so the two read as one
               pair on one line. */
            "calc(max(1rem, calc(env(safe-area-inset-bottom) + 0.4rem)) + 0.875rem)"
          : "max(1.35rem, calc(env(safe-area-inset-bottom) + 0.75rem))",
      }}
    >
      {/* The same centered column the menu bar uses, so on a wide screen the
          icon lands beside the compass rather than out at the window's edge
          while the compass sits where the column starts. When the compass is
          down there, the flag is pushed clear of its fifty-six points and
          given a gap: beside the compass, not above it, because two discs on
          one line read as one corner of the screen and a disc floating over
          another reads as something that came loose. */}
      <div
        className="mx-auto flex w-full max-w-5xl justify-start"
        style={{ paddingLeft: crowded ? "4.125rem" : undefined }}
      >
        <button
          type="button"
          onClick={() => {
            window.dispatchEvent(
              new CustomEvent(FEEDBACK_EVENT, { detail: { kind: "problem" } }),
            );
          }}
          aria-label="Report an issue"
          title="Report an issue"
          /* Sized against the compass beside it rather than against the thumb: at
           twenty-eight points this is a mark on the screen, which is what was
           asked for and what keeps it from reading as a fourth thing the app
           wants you to press. */
          className="pointer-events-auto inline-flex h-7 w-7 items-center justify-center rounded-full border border-[var(--disc-edge)] bg-[var(--disc-face)] text-rose shadow-[var(--disc-shadow)] transition hover:border-[var(--line-strong)] active:translate-y-px"
        >
          <FlagIcon className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

/* A flag, because the two icons already at the bottom of the screen are a
   compass and a speech bubble, and a flag is the one shape that reads as
   somebody marking a spot rather than the app offering a feature. */
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
      {/* Nudged onto the middle of the viewBox: the two paths together run from
          five to fourteen across and four to twenty-one down, so drawn as
          written the flag sits left of center and low inside a round button.
          Two and a half points right, half a point up puts its own middle on
          the circle's. */}
      <g transform="translate(2.5, -0.5)">
        <path d="M5 21V4" />
        <path d="M5 4h9l-1.2 3.4L14 11H5" />
      </g>
    </svg>
  );
}
