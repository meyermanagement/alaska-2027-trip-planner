"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  buildIcs,
  googleUrl,
  icsFilename,
  outlookUrl,
  whenLabel,
} from "@/lib/calendar";

/**
 * "Add to calendar", wherever your calendar happens to be. Google and Outlook
 * get a prefilled link that opens in a new tab; everyone else gets the .ics
 * file, which Apple Calendar, Outlook on a desktop and every other calendar
 * will open and file away. Nothing is connected and nothing is synced — this
 * hands the event over once, on purpose, so a plan in this app never quietly
 * rewrites what is on someone's real calendar.
 *
 * Pass a single `event` for one thing, or a list of `events` to hand over a
 * whole trip at once (a file is the only sensible way to do many at a time).
 */
export default function AddToCalendar({
  event,
  events,
  label = "Add to calendar",
  title,
  compact = false,
  className = "",
}) {
  const list = events || (event ? [event] : []);
  const single = !events && event ? event : null;
  const [open, setOpen] = useState(false);
  // The menu is drawn straight into the body at a fixed position rather than
  // inside the row: task lists clip their contents to keep their rounded
  // corners, and a menu nested inside one would be cut off at the row edge.
  const [at, setAt] = useState(null);
  const wrap = useRef(null);
  const button = useRef(null);

  const place = useCallback(() => {
    const rect = button.current?.getBoundingClientRect();
    if (!rect) return;
    const width = 240;
    const left = Math.max(
      8,
      Math.min(rect.right - width, window.innerWidth - width - 8),
    );
    const openUp = rect.bottom + 220 > window.innerHeight;
    setAt({
      left,
      top: openUp ? undefined : rect.bottom + 6,
      bottom: openUp ? window.innerHeight - rect.top + 6 : undefined,
      width,
    });
  }, []);

  useEffect(() => {
    if (!open) return undefined;
    place();
    const onMove = () => place();
    window.addEventListener("resize", onMove);
    window.addEventListener("scroll", onMove, true);
    return () => {
      window.removeEventListener("resize", onMove);
      window.removeEventListener("scroll", onMove, true);
    };
  }, [open, place]);

  useEffect(() => {
    if (!open) return undefined;
    function onDown(e) {
      const inMenu = e.target?.closest?.('[role="menu"]');
      if (inMenu) return;
      if (wrap.current && !wrap.current.contains(e.target)) setOpen(false);
    }
    function onKey(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!list.length) return null;

  function download() {
    const name = title || single?.title || "Alyeska";
    const ics = buildIcs(list, name);
    const url = URL.createObjectURL(
      new Blob([ics], { type: "text/calendar;charset=utf-8" }),
    );
    const a = document.createElement("a");
    a.href = url;
    a.download = icsFilename(name);
    document.body.appendChild(a);
    a.click();
    a.remove();
    // Give the browser a moment to start the download before the URL dies.
    setTimeout(() => URL.revokeObjectURL(url), 4000);
    setOpen(false);
  }

  const items = [
    single && {
      key: "google",
      label: "Google Calendar",
      href: googleUrl(single),
    },
    single && {
      key: "outlook",
      label: "Outlook.com",
      href: outlookUrl(single, "live"),
    },
    single && {
      key: "office",
      label: "Outlook at work",
      href: outlookUrl(single, "office"),
    },
    {
      key: "ics",
      label: single ? "Apple Calendar or other (.ics)" : "Download .ics file",
      onClick: download,
    },
  ].filter(Boolean);

  return (
    <div ref={wrap} className={`no-print relative ${className}`}>
      <button
        ref={button}
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        title={single ? `Add “${single.title}” to your calendar` : label}
        className={
          compact
            ? "flex items-center gap-1 rounded-full border border-[var(--line)] px-2 py-1.5 text-[0.68rem] font-semibold text-ink-soft transition hover:border-teal hover:text-teal sm:px-2.5 sm:py-1"
            : "btn btn-ghost inline-flex items-center gap-1.5"
        }
      >
        <CalendarIcon
          className={compact ? "h-4 w-4 sm:h-3.5 sm:w-3.5" : "h-4 w-4"}
        />
        {/* On a phone the rows are tight, so the small button is the icon alone. */}
        {compact ? <span className="hidden sm:inline">Calendar</span> : label}
        <span className={compact ? "sr-only" : "sr-only"}>
          {compact ? "Add to calendar" : ""}
          {single ? ` — ${whenLabel(single)}` : ` — ${list.length} events`}
        </span>
      </button>

      {open &&
        at &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            role="menu"
            style={{
              position: "fixed",
              left: at.left,
              top: at.top,
              bottom: at.bottom,
              width: at.width,
            }}
            className="z-50 overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-[0_10px_30px_rgba(20,32,30,0.16)]"
          >
            <p className="border-b border-sand px-3.5 py-2 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-faint">
              {single ? whenLabel(single) : `${list.length} dated entries`}
            </p>
            {items.map((item) =>
              item.href ? (
                <a
                  key={item.key}
                  role="menuitem"
                  href={item.href}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => setOpen(false)}
                  className="block px-3.5 py-2.5 text-left text-sm text-ink transition hover:bg-sand"
                >
                  {item.label}
                </a>
              ) : (
                <button
                  key={item.key}
                  role="menuitem"
                  type="button"
                  onClick={item.onClick}
                  className="block w-full px-3.5 py-2.5 text-left text-sm text-ink transition hover:bg-sand"
                >
                  {item.label}
                </button>
              ),
            )}
          </div>,
          document.body,
        )}
    </div>
  );
}

function CalendarIcon({ className }) {
  return (
    <svg
      viewBox="0 0 20 20"
      className={className}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="3" y="4.6" width="14" height="12.4" rx="2.2" />
      <path d="M3 8.4h14M7.2 3.2v2.6M12.8 3.2v2.6" />
    </svg>
  );
}
