"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import CompassLoader from "@/components/CompassLoader";

/**
 * The after-interview onboarding client.
 *
 * On mount, fetches Aly's per-trip notes -- one short paragraph per real
 * upcoming trip -- and paints them as cards. Below the cards is the
 * ask-once box: the primary types a real question and Aly answers it
 * using the same real family context she'll use forever after. Continue
 * lands the primary at their trip index.
 *
 * Kept separate from the moments/next-steps chain because that chain
 * belongs to secondary travelers, and this screen is only for primaries
 * who have just finished the ten-question interview.
 */
export default function AfterInterviewClient({
  demo = false,
  backHref = null,
} = {}) {
  const router = useRouter();
  const [notesLoading, setNotesLoading] = useState(true);
  const [notes, setNotes] = useState([]);
  const [notesError, setNotesError] = useState("");
  const [q, setQ] = useState("");
  const [answering, setAnswering] = useState(false);
  const [answered, setAnswered] = useState(null);
  const [askError, setAskError] = useState("");
  const composerRef = useRef(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/interview/aly-notes", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ demo }),
    })
      .then((r) => r.json().catch(() => null))
      .then((json) => {
        if (cancelled) return;
        if (!json?.ok) {
          setNotesError("The trip notes didn't come through.");
          setNotesLoading(false);
          return;
        }
        setNotes(json.notes || []);
        setNotesLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setNotesError("The trip notes didn't come through.");
        setNotesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [demo]);

  async function askAly(e) {
    e.preventDefault();
    if (!q.trim() || answering) return;
    setAnswering(true);
    setAskError("");
    setAnswered(null);
    try {
      const r = await fetch("/api/interview/ask-once", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q.trim(), demo }),
      });
      const json = await r.json().catch(() => null);
      if (!json?.ok) {
        setAskError(json?.error || "Aly didn't answer that one.");
      } else {
        setAnswered({ question: json.question, answer: json.answer });
      }
    } catch {
      setAskError("Aly didn't answer that one. Try again in a moment.");
    } finally {
      setAnswering(false);
    }
  }

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <p className="section-label text-ink-soft">
          {demo ? "Practice \u00b7 After the interview" : "You're in"}
        </p>
        <h1 className="font-display text-3xl font-semibold leading-tight">
          Here's what Aly already put on your trips.
        </h1>
        {demo && (
          <p className="rounded-2xl border border-sand-deep bg-sand-soft/60 p-3 text-xs italic text-ink-soft">
            You're in practice. The trip cards below are for a stand-in
            family (a couple with a nine-year-old and two tentative trips)
            so nothing on your own file is used or changed.
          </p>
        )}
        <p className="text-base leading-relaxed text-ink-soft">
          You just answered ten questions. Aly took each one and rolled it
          into your real upcoming trips. These aren't examples. They're
          your trips, on the calendar, changed by what you said.
        </p>
      </header>

      <section aria-labelledby="trips-heading" className="space-y-3">
        <h2 id="trips-heading" className="font-display text-xl text-ink">
          What Aly is doing on each of your trips
        </h2>

        {notesLoading && (
          <div className="flex min-h-[180px] flex-col items-center justify-center gap-3 text-teal">
            <CompassLoader size={56} label="Aly is reading each trip against your answers." />
            <p className="text-sm text-ink-soft">
              One trip at a time. Won't be long.
            </p>
          </div>
        )}

        {!notesLoading && notesError && (
          <p className="rounded-2xl border border-terra-deep/50 bg-terra-soft/40 p-4 text-sm text-ink">
            {notesError}
          </p>
        )}

        {!notesLoading && !notesError && notes.length === 0 && (
          <p className="rounded-2xl border border-sand-deep bg-sand-soft/60 p-4 text-sm text-ink-soft">
            No trips on the calendar yet. Your answers are saved and will
            shape the first trip you plan.
          </p>
        )}

        {!notesLoading && !notesError && notes.length > 0 && (
          <div className="grid gap-3 md:grid-cols-2">
            {notes.map((note) => (
              <article
                key={note.trip_id}
                className="rounded-2xl border border-sand-deep bg-white p-4"
              >
                <header className="mb-2">
                  <p className="font-display text-lg font-semibold text-ink">
                    {note.name}
                  </p>
                  {(note.start_date || note.destination) && (
                    <p className="text-xs italic text-ink-soft">
                      {[note.destination, note.start_date]
                        .filter(Boolean)
                        .join(" \u00b7 ")}
                    </p>
                  )}
                </header>
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">
                  {note.text || "Aly is still thinking about this one."}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <section
        aria-labelledby="ask-heading"
        className="space-y-3 border-t border-sand-deep pt-6"
      >
        <h2 id="ask-heading" className="font-display text-xl text-ink">
          Ask Aly one real question before you go in.
        </h2>
        <p className="text-sm text-ink-soft">
          Anything about any trip. She has your family, your dates, and
          everything you just told her. This is a plain preview of what
          asking Aly feels like once you're in the app.
        </p>

        <form onSubmit={askAly} className="space-y-2">
          <textarea
            ref={composerRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="What should we pack for our first night's dinner?"
            rows={3}
            className="w-full rounded-2xl border border-sand-deep bg-white p-3 text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
            aria-label="Ask Aly a real question"
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="submit"
              disabled={!q.trim() || answering}
              className="btn btn-primary px-4 py-2 text-sm disabled:opacity-50"
            >
              {answering ? "Aly is thinking..." : "Ask Aly"}
            </button>
            {answered && (
              <button
                type="button"
                onClick={() => {
                  setAnswered(null);
                  setQ("");
                  composerRef.current?.focus();
                }}
                className="text-sm text-ink-soft underline underline-offset-4"
              >
                Ask another
              </button>
            )}
          </div>
        </form>

        {askError && (
          <p className="rounded-2xl border border-terra-deep/50 bg-terra-soft/40 p-3 text-sm text-ink">
            {askError}
          </p>
        )}

        {answering && (
          <div className="flex min-h-[100px] items-center justify-center text-teal">
            <CompassLoader size={44} label="Aly is answering." />
          </div>
        )}

        {answered && !answering && (
          <article className="rounded-2xl border-2 border-teal bg-teal-soft/30 p-4">
            <p className="section-label text-teal">You asked</p>
            <p className="mt-1 text-sm italic text-ink">
              &ldquo;{answered.question}&rdquo;
            </p>
            <p className="section-label mt-4 text-teal">Aly says</p>
            <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-ink">
              {answered.answer}
            </p>
          </article>
        )}
      </section>

      <div className="flex flex-wrap items-center gap-3 border-t border-sand-deep pt-5">
        <button
          type="button"
          onClick={() =>
            router.push(demo ? backHref || "/interview-check" : "/trips")
          }
          className="btn btn-primary px-4 py-2 text-sm"
        >
          {demo ? "Back to practice" : "Take me to my trips"}
        </button>
        <p className="text-xs italic text-ink-soft">
          Aly is right there in every trip. Ask her anything, any time.
        </p>
      </div>
    </div>
  );
}
