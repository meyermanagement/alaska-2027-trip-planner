"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import CompassLoader from "@/components/CompassLoader";
import { INTERVIEW_QUESTIONS, questionFor } from "@/lib/travelers/interview";

// The minimum a Compass loader is on screen between questions. The write and
// the next-question calculation take a few hundred milliseconds; anything
// shorter than this reads as instant-jarring rather than as a beat of thought,
// so the wait is held to at least this long even when the network is faster.
const HOLD_MS = 520;

/**
 * The interview screen, in either of two modes:
 *
 *   real       Each answer POSTs to /api/interview/answer and writes to the
 *              database. After the last question the primary is redirected to
 *              the trip builder with a seeded opener.
 *
 *   practice   Nothing writes. Answers accumulate in local state and after the
 *              last question the recap replaces the card so somebody
 *              rehearsing can see what would have been saved.
 *
 * The two modes share the same UI so the practice interview does not lie about
 * what the real one feels like.
 */
export default function InterviewBody({ mode, startSlot, startIndex, total }) {
  const router = useRouter();
  const [slot, setSlot] = useState(startSlot);
  const [index, setIndex] = useState(startIndex);
  const [choice, setChoice] = useState("");
  const [text, setText] = useState("");
  // The moments panel keeps its own list rather than reusing `text`, because
  // the shape is different: several rows the primary can add and remove
  // rather than a single field. One blank slot is kept at the end at all
  // times so there is always somewhere to type without hunting for an add
  // button.
  const [moments, setMoments] = useState([""]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [answers, setAnswers] = useState([]); // practice mode only
  const [done, setDone] = useState(false);
  const focusRef = useRef(null);

  // Focus the first option (or the text field) as each new question arrives,
  // so somebody who wants to answer with the keyboard can tab straight in.
  useEffect(() => {
    if (loading || done) return;
    focusRef.current?.focus?.();
  }, [slot, loading, done]);

  const question = questionFor(slot);

  const advance = useCallback(
    (nextSlot) => {
      if (!nextSlot) {
        setDone(true);
        return;
      }
      const nextIndex = INTERVIEW_QUESTIONS.findIndex(
        (q) => q.slot === nextSlot,
      );
      setSlot(nextSlot);
      setIndex(nextIndex >= 0 ? nextIndex : index + 1);
      setChoice("");
      setText("");
      setMoments([""]);
      setError(null);
    },
    [index],
  );

  const submit = useCallback(
    async (action) => {
      if (loading) return;
      setLoading(true);
      setError(null);

      const started = Date.now();

      // The moments panel is a different shape from the other questions -- a
      // list of favorite moments, not a single choice -- and writes through a
      // different route. Cleaning the list here (empty rows dropped, order
      // preserved) is done once and reused for both practice recording and
      // the real POST.
      const isMoments = question.kind === "moments";
      const cleanedMoments = isMoments
        ? moments.map((m) => m.trim()).filter(Boolean)
        : [];

      // Practice mode: record locally, wait the same beat, advance.
      if (mode === "practice") {
        const opt = (question.options || []).find((o) => o.value === choice);
        const record = {
          slot,
          label: question.label,
          kind: question.kind,
          action,
          picked:
            action === "skip"
              ? null
              : isMoments
                ? cleanedMoments.length > 0
                  ? cleanedMoments
                  : null
                : question.kind === "text"
                  ? text.trim() || null
                  : choice === "other"
                    ? text.trim() || null
                    : opt
                      ? opt.label
                      : null,
          reason:
            action === "skip"
              ? null
              : question.kind === "options" && choice !== "other" && text.trim()
                ? text.trim()
                : null,
        };
        // Options questions still need a real pick before Save; moments and
        // text panels can save blank (both are treated as "asked and passed").
        if (
          action !== "skip" &&
          !record.picked &&
          question.kind === "options"
        ) {
          setLoading(false);
          setError("Pick one of the two, or type what fits better.");
          return;
        }
        setAnswers((a) => [...a, record]);
        const nextIndex = index + 1;
        const nextSlot =
          nextIndex < INTERVIEW_QUESTIONS.length
            ? INTERVIEW_QUESTIONS[nextIndex].slot
            : null;
        const wait = Math.max(0, HOLD_MS - (Date.now() - started));
        setTimeout(() => {
          setLoading(false);
          advance(nextSlot);
        }, wait);
        return;
      }

      // Real mode: write, then advance to the server-returned next slot.
      try {
        const res = isMoments
          ? await fetch("/api/interview/moments", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                action,
                moments: action === "skip" ? [] : cleanedMoments,
              }),
            })
          : await fetch("/api/interview/answer", {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({
                slot,
                action,
                choice: action === "skip" ? null : choice,
                text: action === "skip" ? null : text,
              }),
            });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          const wait = Math.max(0, HOLD_MS - (Date.now() - started));
          setTimeout(() => {
            setLoading(false);
            setError(
              payload?.error || "That answer could not be saved. Try again.",
            );
          }, wait);
          return;
        }
        const wait = Math.max(0, HOLD_MS - (Date.now() - started));
        setTimeout(() => {
          setLoading(false);
          if (payload?.complete) {
            setDone(true);
            // The whole reason the family answers this is to plan a trip. Land
            // them at the trip builder rather than back on Family, so the
            // momentum of the interview earns itself a next step.
            router.push("/trips/new");
            return;
          }
          advance(payload?.nextSlot || null);
        }, wait);
      } catch {
        const wait = Math.max(0, HOLD_MS - (Date.now() - started));
        setTimeout(() => {
          setLoading(false);
          setError("Something on our end got in the way. Try again.");
        }, wait);
      }
    },
    [
      advance,
      choice,
      index,
      loading,
      mode,
      moments,
      question,
      router,
      slot,
      text,
    ],
  );

  // Practice-mode recap: shown after the last question in place of the card.
  if (done && mode === "practice") {
    return <Recap answers={answers} />;
  }

  return (
    <div className="mx-auto flex min-h-[70vh] w-full max-w-2xl flex-col items-center justify-center px-4 py-10">
      <p className="section-label mb-2 self-start text-ink-soft">
        Question {index + 1} of {total}
        {mode === "practice" && " · Practice"}
      </p>

      {loading ? (
        <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-teal">
          <CompassLoader size={72} label="Working on the next question." />
          <p className="text-sm text-ink-soft">One moment.</p>
        </div>
      ) : (
        <div className="w-full">
          <h1 className="font-display text-2xl leading-snug text-ink sm:text-3xl">
            {question.prompt}
          </h1>

          {question.help && (
            <p className="mt-3 text-sm text-ink-soft">{question.help}</p>
          )}

          {question.kind === "options" ? (
            <div className="mt-6 flex flex-col gap-3">
              {question.options.map((opt, i) => (
                <button
                  key={opt.value}
                  type="button"
                  ref={i === 0 ? focusRef : null}
                  onClick={() => setChoice(opt.value)}
                  className={`rounded-2xl border p-4 text-left transition ${
                    choice === opt.value
                      ? "border-teal bg-teal-soft/50 shadow-sm"
                      : "border-sand-deep bg-white hover:border-teal/50"
                  }`}
                >
                  <p className="font-display text-lg text-ink">{opt.label}</p>
                  {opt.detail && (
                    <p className="mt-1 text-sm text-ink-soft">{opt.detail}</p>
                  )}
                </button>
              ))}
              <button
                type="button"
                onClick={() => setChoice("other")}
                className={`rounded-2xl border p-4 text-left transition ${
                  choice === "other"
                    ? "border-teal bg-teal-soft/50 shadow-sm"
                    : "border-sand-deep bg-white hover:border-teal/50"
                }`}
              >
                <p className="font-display text-lg text-ink">Something else</p>
                <p className="mt-1 text-sm text-ink-soft">In your own words.</p>
              </button>
              {choice && (
                <ReasonChips
                  choice={choice}
                  question={question}
                  onPick={(chip) => setText(chip)}
                />
              )}
              <textarea
                rows={3}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={
                  choice === "other"
                    ? "What fits better?"
                    : "Anything to add about why? (Optional.)"
                }
                className="mt-1 w-full rounded-2xl border border-sand-deep bg-white p-3 text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
              />
            </div>
          ) : question.kind === "moments" ? (
            <MomentsPanel
              moments={moments}
              setMoments={setMoments}
              examples={question.examples || []}
              placeholder={question.placeholder || ""}
              focusRef={focusRef}
            />
          ) : (
            <div className="mt-6">
              <textarea
                ref={focusRef}
                rows={5}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={question.placeholder || ""}
                className="w-full rounded-2xl border border-sand-deep bg-white p-3 text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
              />
            </div>
          )}

          {error && (
            <p className="mt-3 text-sm text-rose" role="alert">
              {error}
            </p>
          )}

          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => submit("skip")}
              className="text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
            >
              {question.kind === "moments" ? "None to add" : "Skip this one"}
            </button>
            <button
              type="button"
              onClick={() => submit("answer")}
              disabled={
                question.kind === "options"
                  ? !choice || (choice === "other" && !text.trim())
                  : false
              }
              className="btn btn-primary"
            >
              {index + 1 === total ? "Save and finish" : "Save and continue"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// A small row of reason chips under the option buttons. Each chip is a short
// plausible sentence the primary might have typed themselves; tapping one drops
// it into the reason box, where it can be sent as-is or edited. Which chips
// show depends on which option is picked -- the reasons for "packed" are not
// the reasons for "one thing" -- and picking Something else swaps in a
// separate set that fits the trade-off the whole question is about.
function ReasonChips({ choice, question, onPick }) {
  const list = (() => {
    if (choice === "other") return question.otherReasons || [];
    const opt = (question.options || []).find((o) => o.value === choice);
    return (opt && opt.reasons) || [];
  })();
  if (list.length === 0) return null;
  return (
    <div className="mt-2">
      <p className="section-label text-ink-soft">Suggestions</p>
      <div className="mt-1 flex flex-wrap gap-2">
        {list.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => onPick(chip)}
            className="rounded-full border border-sand-deep bg-white px-3 py-1.5 text-sm text-ink-soft transition hover:border-teal/60 hover:text-ink"
          >
            {chip}
          </button>
        ))}
      </div>
    </div>
  );
}

function Recap({ answers }) {
  const answered = answers.filter((a) => a.action !== "skip");
  const skipped = answers.filter((a) => a.action === "skip");

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-10">
      <p className="section-label text-ink-soft">Practice interview</p>
      <h1 className="mt-1 font-display text-3xl text-ink">
        What Aly would have learned
      </h1>
      <p className="mt-2 text-ink-soft">
        Nothing was saved. This is what would have been written down if this had
        been the real interview.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-xl text-ink">
          Answered ({answered.length})
        </h2>
        {answered.length === 0 ? (
          <p className="mt-2 text-ink-soft">Nothing answered.</p>
        ) : (
          <ul className="mt-3 space-y-3">
            {answered.map((a) => (
              <li
                key={a.slot}
                className="rounded-2xl border border-sand-deep bg-white p-4"
              >
                <p className="section-label text-ink-soft">{a.label}</p>
                {Array.isArray(a.picked) ? (
                  <ul className="mt-1 space-y-1 text-ink">
                    {a.picked.map((line, i) => (
                      <li key={i} className="before:mr-2 before:content-['•']">
                        {line}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-1 text-ink">{a.picked}</p>
                )}
                {a.reason && (
                  <p className="mt-1 text-sm text-ink-soft">
                    Reason: {a.reason}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      {skipped.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl text-ink">
            Skipped ({skipped.length})
          </h2>
          <ul className="mt-3 space-y-2 text-ink-soft">
            {skipped.map((a) => (
              <li key={a.slot}>{a.label}</li>
            ))}
          </ul>
        </section>
      )}

      <div className="mt-10 flex flex-wrap items-center gap-2">
        <a href="/interview-check" className="btn btn-primary">
          Back to practice
        </a>
        <a href="/family" className="btn btn-ghost">
          Back to Family
        </a>
      </div>
      <p className="mt-6 text-xs text-ink-soft">
        Aly also asks about the shape of the household on the welcome form and
        for a paragraph on each person on About you. Both can be rehearsed from
        the practice hub.
      </p>
    </div>
  );
}

// The moments panel is a short vertical list of textareas the primary can fill
// in in any order. A blank row is always kept at the bottom so there is always
// somewhere to type without hunting for an add button, and each non-empty row
// gets a small remove control so a stray line does not have to be saved. A
// short strip of example chips seeds the box for somebody who freezes at the
// question -- tapping one appends it to the first empty row rather than
// overwriting whatever the primary has already typed.
//
// The panel keeps its state at the parent level (`moments` on InterviewBody),
// which is why setMoments is passed in rather than kept here. That way the
// cleaned list is available to the submit function without needing a ref, and
// advancing to the next question (which resets moments to [""]) does not leave
// stale rows behind if the primary comes back to a fresh interview.
function MomentsPanel({
  moments,
  setMoments,
  examples,
  placeholder,
  focusRef,
}) {
  const updateRow = (i, value) => {
    setMoments((rows) => {
      const next = rows.slice();
      next[i] = value;
      // Keep one blank row at the end so there is always somewhere to type.
      // A user who fills in the last row should see an empty one appear.
      if (i === next.length - 1 && value.trim()) {
        next.push("");
      }
      return next;
    });
  };

  const removeRow = (i) => {
    setMoments((rows) => {
      const next = rows.filter((_, idx) => idx !== i);
      // Never let the list go empty; keep one blank row so the panel does not
      // collapse to a heading with no field under it.
      if (next.length === 0 || next[next.length - 1].trim()) {
        next.push("");
      }
      return next;
    });
  };

  const addExample = (line) => {
    setMoments((rows) => {
      const next = rows.slice();
      // Find the first empty row and drop the example there. If every row is
      // full, append a new one with the example so nothing already typed gets
      // stomped.
      const emptyAt = next.findIndex((r) => !r.trim());
      if (emptyAt === -1) {
        next.push(line);
        next.push("");
      } else {
        next[emptyAt] = line;
        // If that was the trailing blank row, add a fresh blank after it.
        if (emptyAt === next.length - 1) next.push("");
      }
      return next;
    });
  };

  return (
    <div className="mt-6 flex flex-col gap-3">
      {moments.map((row, i) => (
        <div key={i} className="flex items-start gap-2">
          <textarea
            ref={i === 0 ? focusRef : null}
            rows={2}
            value={row}
            onChange={(e) => updateRow(i, e.target.value)}
            placeholder={i === 0 ? placeholder : "Another moment. (Optional.)"}
            className="w-full rounded-2xl border border-sand-deep bg-white p-3 text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
            aria-label={`Favorite moment ${i + 1}`}
          />
          {row.trim() && (
            <button
              type="button"
              onClick={() => removeRow(i)}
              className="mt-2 shrink-0 text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
              aria-label={`Remove favorite moment ${i + 1}`}
            >
              Remove
            </button>
          )}
        </div>
      ))}

      {examples.length > 0 && (
        <div className="mt-1">
          <p className="section-label text-ink-soft">Suggestions</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {examples.map((line) => (
              <button
                key={line}
                type="button"
                onClick={() => addExample(line)}
                className="rounded-full border border-sand-deep bg-white px-3 py-1.5 text-sm text-ink-soft transition hover:border-teal/60 hover:text-ink"
              >
                {line}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
