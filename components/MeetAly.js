"use client";

import { useState } from "react";
import { Housing, Needle } from "@/components/CompassLoader";
import {
  DEMO_FAMILIES,
  DEMO_QUESTION,
  DEMO_DESTINATION,
} from "@/lib/welcome/meetAlyDemo";
import { ALY_ABILITIES } from "@/lib/welcome/alyAbilities";

/**
 * Meet Aly -- the first screen a brand-new primary sees.
 *
 * A one-paragraph introduction in Aly's voice, a short list of what she looks
 * after besides the itinerary, a live demonstration of the one thing she does
 * that a search box cannot (give different answers to different families), and
 * a small "ask her something else" box that runs the same demonstration on the
 * primary's own question.
 *
 * The list of abilities comes before the demonstration on purpose. A family
 * that reads only the demonstration concludes this is a cleverer way to get
 * trip ideas, and then finds the wallet, the packing lists, the budget, the
 * reminders and the on-trip answers by accident weeks later.
 *
 * The demo pair is fixed strings so the first screen paints instantly and
 * never fails. The optional live box below is the model doing the same
 * job in front of the primary, on demand, so what looked like polish is
 * proven to be real.
 *
 * The copy here is deliberately thin. The screen has to argue that Aly is
 * not a search box, and the demonstration is the argument -- so anything
 * that says in prose what the two columns already show is cut, including
 * the sentence that used to tell people to compare them. A screen that
 * both shows and explains gets read as an explanation and skipped.
 *
 * onContinue is the escape hatch: the button below moves the primary to
 * the next screen (the welcome form in real mode, back to the practice
 * hub in practice mode). The component itself does not know which one.
 */
export default function MeetAly({
  onContinue,
  continueLabel = "Take me in",
  practice = false,
}) {
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [answer, setAnswer] = useState(null);
  const [error, setError] = useState("");

  async function ask() {
    const q = question.trim();
    if (!q || q.length < 3 || busy) return;
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      const res = await fetch("/api/welcome/meet-aly-demo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: q }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error || "Aly did not reply this time.");
        setBusy(false);
        return;
      }
      setAnswer({ answers: data.answers || {}, question: q });
      setBusy(false);
    } catch {
      setError("That did not go through. Try again in a moment.");
      setBusy(false);
    }
  }

  return (
    <div className="space-y-8">
      {practice && <p className="section-label text-ink-soft">Practice</p>}

      <header className="space-y-4">
        <div className="flex items-start gap-4">
          <span
            className="inline-flex h-14 w-14 shrink-0 items-center justify-center text-teal"
            aria-hidden="true"
          >
            <svg viewBox="0 0 32 32" className="h-14 w-14">
              <Housing />
              <Needle spin={false} />
            </svg>
          </span>
          <div>
            <p className="section-label text-ink-soft">Meet Aly</p>
            <h1 className="mt-1 font-display text-3xl font-semibold leading-tight">
              Hi -- I'm Aly.
            </h1>
          </div>
        </div>
        <p className="text-base leading-relaxed text-ink">
          I look after your family's travel -- the trip itself, and everything
          around it. I remember who you travel with, what you like, and what you
          skip, so my answers fit you and not a generic traveler.
        </p>
        <p className="text-sm leading-relaxed text-ink-soft">
          What you tell me stays on your family's file, never sold. You can read
          or delete any of it on the Family and Preferences pages.
        </p>
      </header>

      {/* What she does besides plan the days. Seven short lines, no icons and
          no links: nothing here is tappable yet because the family has no
          account, and a row that looks like a button and does nothing is worse
          than a row that plainly reads as a sentence. */}
      <section
        aria-labelledby="meet-aly-abilities-heading"
        className="space-y-3"
      >
        <h2
          id="meet-aly-abilities-heading"
          className="font-display text-lg font-semibold text-ink"
        >
          What I look after
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {ALY_ABILITIES.map((a, i) => (
            <article
              key={a.key}
              // An odd number of cards leaves a hole at the end of a two-column
              // grid, so the last one takes the whole row instead of sitting
              // beside nothing.
              className={`rounded-xl border border-sand-deep bg-white p-4 ${
                i === ALY_ABILITIES.length - 1 && ALY_ABILITIES.length % 2
                  ? "sm:col-span-2"
                  : ""
              }`}
            >
              {/* Spelled out rather than section-label: that rule is unlayered
                  in globals.css and would win over the teal. */}
              <p className="text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-teal">
                {a.heading}
              </p>
              <p className="mt-1.5 text-sm leading-relaxed text-ink-soft">
                {a.body}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="meet-aly-demo-heading"
        className="rounded-2xl border border-sand-deep bg-sand-soft/60 p-5"
      >
        <div className="mb-4">
          <p className="section-label text-ink-soft">
            The same question, four families
          </p>
          <h2
            id="meet-aly-demo-heading"
            className="mt-1 font-display text-lg font-semibold text-ink"
          >
            &ldquo;{DEMO_QUESTION}&rdquo; &mdash; {DEMO_DESTINATION}
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {DEMO_FAMILIES.map((f) => (
            <article
              key={f.key}
              className="flex flex-col gap-2 rounded-xl border border-sand-deep bg-white p-4"
            >
              <p className="section-label text-ink-soft">{f.heading}</p>
              <ul className="space-y-0.5 text-xs text-ink-soft">
                {f.facts.map((fact) => (
                  <li key={fact}>&middot; {fact}</li>
                ))}
              </ul>
              <p className="mt-1 border-t border-sand-deep pt-3 text-sm leading-relaxed text-ink">
                {f.answer}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        aria-labelledby="meet-aly-ask-heading"
        className="space-y-3 rounded-2xl border border-sand-deep bg-white p-5"
      >
        <div>
          <h2
            id="meet-aly-ask-heading"
            className="font-display text-lg font-semibold text-ink"
          >
            Ask something of your own
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            She answers once for each of the same four families.
          </p>
        </div>
        <label htmlFor="meet-aly-question" className="sr-only">
          Your question
        </label>
        <textarea
          id="meet-aly-question"
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          rows={2}
          maxLength={240}
          placeholder={`e.g. "Where should we eat on a Friday night in Paris?"`}
          className="w-full rounded-lg border border-sand-deep bg-sand-soft/40 p-3 text-sm text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={ask}
            disabled={busy || question.trim().length < 3}
            className="btn btn-primary whitespace-nowrap px-4 py-2 text-sm"
          >
            {busy ? "Aly is thinking..." : "Ask Aly"}
          </button>
          {error && <p className="text-xs text-terra-deep">{error}</p>}
        </div>

        {answer && (
          <div className="grid gap-4 pt-2 md:grid-cols-2">
            {DEMO_FAMILIES.map((f) => (
              <article
                key={f.key}
                className="rounded-xl border border-sand-deep bg-sand-soft/50 p-4 text-sm leading-relaxed text-ink"
              >
                <p className="section-label text-ink-soft">{f.heading}</p>
                <p className="mt-2 whitespace-pre-wrap">
                  {answer.answers[f.key] || "(no answer this time)"}
                </p>
              </article>
            ))}
          </div>
        )}
      </section>

      <div className="flex flex-wrap gap-2 border-t border-sand-deep pt-5">
        <button
          type="button"
          onClick={onContinue}
          className="btn btn-primary whitespace-nowrap px-4 py-2 text-sm"
        >
          {continueLabel}
        </button>
      </div>
    </div>
  );
}
