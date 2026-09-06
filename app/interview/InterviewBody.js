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
  // A screen-reader-only live region that announces the new prompt as each
  // question arrives, so keyboard and assistive-tech users hear the change of
  // question without visible focus moving anywhere on the page. Nothing on
  // the screen accepts programmatic focus on question change: focusing the
  // heading drew a ring around the prompt that read as "this line is
  // selected", and focusing the first option read as "the first choice is
  // selected". The prompt is announced instead of shown as focused.
  const [announced, setAnnounced] = useState("");

  const question = questionFor(slot);

  useEffect(() => {
    if (loading || done) return;
    setAnnounced(question?.prompt || "");
  }, [slot, loading, done, question]);

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

  // Go back one question. On the very first question this leaves the
  // interview entirely -- to the practice hub in practice mode, to Family in
  // real mode -- because there is no earlier question to revise.
  //
  // In practice mode a step back also pops the last answer off the local
  // record and restores whatever the primary had picked, so "back" reads as
  // "take that back" rather than "start that question again from scratch".
  // In real mode the previous answer was already saved server-side; the
  // primary sees the question with fresh fields and any new answer overwrites
  // the old one through the same upsert path that wrote it the first time.
  const back = useCallback(() => {
    if (loading) return;
    if (index <= 0) {
      router.push(mode === "practice" ? "/interview-check" : "/family");
      return;
    }
    const previousIndex = index - 1;
    const previous = INTERVIEW_QUESTIONS[previousIndex];
    setSlot(previous.slot);
    setIndex(previousIndex);
    setError(null);
    if (mode === "practice") {
      // Pop the last recorded answer and, if it was for the question we are
      // stepping back to, pre-fill the fields with what was picked so the
      // primary can revise rather than retype.
      setAnswers((prior) => {
        if (prior.length === 0) return prior;
        const last = prior[prior.length - 1];
        if (last.slot === previous.slot) {
          if (previous.kind === "options") {
            const opt = (previous.options || []).find(
              (o) => o.label === last.picked,
            );
            setChoice(opt ? opt.value : last.picked ? "other" : "");
            setText(
              opt
                ? last.reason || ""
                : typeof last.picked === "string"
                  ? last.picked
                  : "",
            );
            setMoments([""]);
          } else if (previous.kind === "moments") {
            const list = Array.isArray(last.picked) ? last.picked : [];
            setMoments(list.length ? [...list, ""] : [""]);
            setChoice("");
            setText("");
          } else {
            setChoice("");
            setText(typeof last.picked === "string" ? last.picked : "");
            setMoments([""]);
          }
        } else {
          setChoice("");
          setText("");
          setMoments([""]);
        }
        return prior.slice(0, -1);
      });
    } else {
      setChoice("");
      setText("");
      setMoments([""]);
    }
  }, [index, loading, mode, router]);

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
          // If the primary went back and revised an already-answered
          // question, the server's next-unanswered slot would jump past the
          // questions between here and the end -- turning "revise question
          // five" into "skip six through nine". Walk the interview in index
          // order instead: the next question is always the one after the one
          // just answered, regardless of what else is already saved.
          const nextByIndex = INTERVIEW_QUESTIONS[index + 1];
          const nextSlot = nextByIndex
            ? nextByIndex.slot
            : payload?.nextSlot || null;
          advance(nextSlot);
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
          <span aria-live="polite" className="sr-only">
            {announced}
          </span>

          {question.help && (
            <p className="mt-3 text-sm text-ink-soft">{question.help}</p>
          )}

          {question.kind === "options" ? (
            <div className="mt-6 flex flex-col gap-3">
              {question.options.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setChoice(opt.value)}
                  aria-pressed={choice === opt.value}
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
                aria-pressed={choice === "other"}
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
                <WhyPanel
                  choice={choice}
                  question={question}
                  text={text}
                  setText={setText}
                />
              )}
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
            <div className="flex items-center gap-4">
              <button
                type="button"
                onClick={back}
                className="text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
                aria-label={
                  index === 0
                    ? "Leave the interview"
                    : "Go back to the previous question"
                }
              >
                ← Back
              </button>
              <button
                type="button"
                onClick={() => submit("skip")}
                className="text-sm text-ink-soft underline underline-offset-4 hover:text-ink"
              >
                {question.kind === "moments" ? "None to add" : "Skip this one"}
              </button>
            </div>
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

// The "why" panel appears only after the primary has picked an option, so the
// screen before a choice reads as "answer this question" rather than as a wall
// of controls. Once an answer is picked, the panel slides in as a tinted card
// with a friendly heading -- "Why? (Optional.)" -- a row of suggestion chips
// (which chips depend on which option was picked; "Something else" swaps in a
// separate set), and the reason textarea underneath. The tint and the heading
// are the invitation to say a little more, without pretending the field is
// required.
function WhyPanel({ choice, question, text, setText }) {
  const list = (() => {
    if (choice === "other") return question.otherReasons || [];
    const opt = (question.options || []).find((o) => o.value === choice);
    return (opt && opt.reasons) || [];
  })();
  const isOther = choice === "other";
  return (
    <div className="mt-4 rounded-2xl border border-teal/30 bg-teal-soft/25 p-4">
      <p className="font-display text-lg text-ink">
        {isOther ? "What fits better?" : "Why? (Optional.)"}
      </p>
      {list.length > 0 && (
        <div className="mt-3">
          <p className="section-label text-ink-soft">Suggestions</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {list.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => setText(chip)}
                className="rounded-full border border-sand-deep bg-white px-3 py-1.5 text-sm text-ink-soft transition hover:border-teal/60 hover:text-ink"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      )}
      <textarea
        rows={3}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={
          isOther
            ? "In your own words."
            : "A sentence about why, or tap a suggestion above."
        }
        className="mt-3 w-full rounded-2xl border border-sand-deep bg-white p-3 text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
      />
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
