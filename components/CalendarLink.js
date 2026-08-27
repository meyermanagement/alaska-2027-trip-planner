"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * "Put all of this in my calendar."
 *
 * Not an export, a subscription. A downloaded file is right once and wrong the
 * moment a flight time changes, whereas a subscription URL is added to Google
 * Calendar or Apple Calendar once and re-read on their own schedule for as long
 * as the trip lasts. Every dated task, every itinerary item and a band across
 * each trip, kept current without anybody remembering to export again.
 *
 * The URL is the credential, because the thing reading it is a calendar app and
 * calendar apps cannot sign in. So it says so plainly, and starting a new one is
 * one press away — which is also how you switch the old one off.
 */
export default function CalendarLink() {
  const [url, setUrl] = useState(null);
  const [asked, setAsked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [problem, setProblem] = useState("");

  useEffect(() => {
    let alive = true;
    fetch("/api/calendar/link")
      .then((res) => (res.ok ? res.json() : {}))
      .then((body) => {
        if (!alive) return;
        setUrl(body?.url || null);
        setAsked(true);
      })
      .catch(() => alive && setAsked(true));
    return () => {
      alive = false;
    };
  }, []);

  const make = useCallback(async (rotate) => {
    setBusy(true);
    setProblem("");
    setCopied(false);
    try {
      const res = await fetch("/api/calendar/link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rotate: Boolean(rotate) }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error || "");
      setUrl(body?.url || null);
    } catch (err) {
      setProblem(err?.message || "Could not make a calendar link.");
    }
    setBusy(false);
  }, []);

  const copy = useCallback(async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setProblem("Copying did not work — select the address and copy it.");
    }
  }, [url]);

  if (!asked) return null;

  return (
    <section className="card no-print mb-5 p-5" aria-label="Calendar">
      <h2 className="text-[0.7rem] font-bold uppercase tracking-[0.09em] text-ink-soft">
        In your calendar
      </h2>
      <p className="mt-2 text-[0.88rem] leading-relaxed text-ink-soft">
        Every dated task, every booking with a date, and a band across each trip,
        as a calendar you subscribe to once. Google Calendar, Apple Calendar and
        Outlook all re-read it on their own, so a time that changes here changes
        there.
      </p>

      {url ? (
        <>
          <p className="mt-3 break-all rounded-xl border border-[var(--line)] bg-white/70 p-3 font-mono text-[0.76rem] text-ink-soft">
            {url}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="btn-primary px-4 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em]"
            >
              {copied ? "Copied" : "Copy the address"}
            </button>
            <a
              href={url}
              className="btn-ghost px-4 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em]"
            >
              Download once
            </a>
            <button
              type="button"
              onClick={() => make(true)}
              disabled={busy}
              className="px-3 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-ink-faint underline decoration-transparent underline-offset-2 hover:text-ink-soft hover:decoration-ink-faint disabled:opacity-50"
            >
              {busy ? "Working…" : "Start a new address"}
            </button>
          </div>
          <p className="mt-3 text-[0.78rem] leading-relaxed text-ink-faint">
            Anyone with this address can read the calendar, so treat it like a
            key rather than a link. In Google Calendar it goes under Other
            calendars, From URL; on an iPhone it is Calendar, Add account, Other,
            Add subscribed calendar. Starting a new address switches every
            existing subscription off.
          </p>
        </>
      ) : (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => make(false)}
            disabled={busy}
            className="btn-primary px-4 py-1.5 text-[0.72rem] font-semibold uppercase tracking-[0.06em] disabled:opacity-50"
          >
            {busy ? "Working…" : "Make a calendar address"}
          </button>
        </div>
      )}

      {problem ? (
        <p role="alert" className="mt-2 text-[0.82rem] text-rose">
          {problem}
        </p>
      ) : null}
    </section>
  );
}
