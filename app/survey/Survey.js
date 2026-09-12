"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  NOT_USED,
  SURVEY_SECTIONS,
  SURVEY_TOTAL,
  answeredCount,
  sectionProgress,
} from "@/lib/beta/survey";

/**
 * The beta survey, saved as it is typed.
 *
 * There is no Submit that the answers depend on. Every field writes itself
 * within a second of being touched, the whole sheet is still there next week,
 * and the button at the bottom only says "I am done for now" -- because a
 * twenty-six question survey that loses an hour of typing to a closed tab is a
 * survey that gets answered once, badly, by whoever is most patient.
 *
 * What gets sent is the field that changed, never the whole sheet. Two tabs open
 * on this page cannot have the second one overwrite the first one's paragraph
 * with an empty box, and a save that fails costs one answer rather than all of
 * them. Failures are said out loud and retried on the next keystroke; nothing is
 * dropped quietly, because an answer somebody typed and believes was kept is
 * worse than one they can see was not.
 */

// Long enough that typing a sentence is one save rather than forty, short enough
// that closing the laptop mid-thought does not lose the thought.
const QUIET_MS = 900;

export default function Survey({ initialAnswers, initialSubmittedAt }) {
  const [answers, setAnswers] = useState(initialAnswers || {});
  const [submittedAt, setSubmittedAt] = useState(initialSubmittedAt || null);
  const [state, setState] = useState("idle"); // idle | saving | saved | error
  const [sending, setSending] = useState(false);

  // What has changed but not yet been written. A ref rather than state: it is
  // read by a timer and by the page-hidden handler, neither of which should
  // redraw anything, and both of which need the newest value rather than the one
  // captured when the timer was set.
  const pending = useRef({});
  const timer = useRef(null);

  const flush = useCallback(async ({ keepalive = false } = {}) => {
    const batch = pending.current;
    if (!Object.keys(batch).length) return;
    pending.current = {};
    setState("saving");
    try {
      const res = await fetch("/api/beta/survey", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: batch }),
        keepalive,
      });
      if (!res.ok) throw new Error("save failed");
      setState("saved");
    } catch {
      // Put them back so the next keystroke, or the next press of Save now,
      // carries them again. Merged underneath anything typed since, because what
      // was typed since is newer.
      pending.current = { ...batch, ...pending.current };
      setState("error");
    }
  }, []);

  const queue = useCallback(
    (id, value) => {
      setAnswers((current) => {
        const next = { ...current };
        if (value === "" || value === null || value === undefined)
          delete next[id];
        else next[id] = value;
        return next;
      });
      // An empty string is how the route is told to forget an answer, so a
      // cleared box has to be sent rather than skipped.
      pending.current = { ...pending.current, [id]: value ?? "" };
      setState("saving");
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => flush(), QUIET_MS);
    },
    [flush],
  );

  // Anything still waiting when the tab is hidden or the page is left goes now.
  // visibilitychange rather than beforeunload, which phones do not reliably fire;
  // keepalive so the request outlives the page.
  useEffect(() => {
    function onHide() {
      if (document.visibilityState === "hidden") {
        if (timer.current) clearTimeout(timer.current);
        flush({ keepalive: true });
      }
    }
    document.addEventListener("visibilitychange", onHide);
    return () => {
      document.removeEventListener("visibilitychange", onHide);
      if (timer.current) clearTimeout(timer.current);
      flush({ keepalive: true });
    };
  }, [flush]);

  const answered = useMemo(() => answeredCount(answers), [answers]);

  async function saveNow() {
    if (timer.current) clearTimeout(timer.current);
    await flush();
  }

  async function markDone() {
    setSending(true);
    if (timer.current) clearTimeout(timer.current);
    await flush();
    try {
      const res = await fetch("/api/beta/survey", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers: {}, submit: true }),
      });
      if (!res.ok) throw new Error("submit failed");
      const json = await res.json();
      setSubmittedAt(json?.submittedAt || new Date().toISOString());
      setState("saved");
    } catch {
      setState("error");
    } finally {
      setSending(false);
    }
  }

  return (
    <div>
      <SaveLine
        state={state}
        answered={answered}
        submittedAt={submittedAt}
        onRetry={saveNow}
      />

      <div className="mt-6 space-y-8">
        {SURVEY_SECTIONS.map((section) => {
          const progress = sectionProgress(section, answers);
          return (
            <section key={section.key} className="card p-5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <h2 className="font-display text-xl font-semibold">
                  {section.title}
                </h2>
                <p className="text-xs tabular text-ink-soft">
                  {progress.answered} of {progress.total} answered
                </p>
              </div>
              {section.blurb && (
                <p className="mt-2 text-sm leading-relaxed text-ink-soft">
                  {section.blurb}
                </p>
              )}

              <div className="mt-5 space-y-6">
                {section.questions.map((question) => (
                  <Question
                    key={question.id}
                    question={question}
                    value={answers[question.id]}
                    onChange={(value) => queue(question.id, value)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={markDone}
          disabled={sending}
          className="btn btn-primary"
        >
          {submittedAt ? "Send the changes" : "I am done for now"}
        </button>
        <p className="text-xs leading-relaxed text-ink-soft">
          {answered} of {SURVEY_TOTAL} answered. Everything above is already
          saved — this only tells us it is worth another read.
        </p>
      </div>
    </div>
  );
}

/**
 * Whether the last keystroke is safely away.
 *
 * Sticky at the top of the page rather than beside each field: a survey that
 * saves itself has to say so somewhere the eye can find without hunting, and
 * twenty-six little ticks is noise. It says the count too, because on a sheet
 * this long "how much is left" is the other question people have.
 */
function SaveLine({ state, answered, submittedAt, onRetry }) {
  const words = {
    idle: "Saved as you go",
    saving: "Saving…",
    saved: "Saved",
    error: "That last answer did not save",
  };
  const tone = state === "error" ? "text-rose" : "text-ink-soft";

  return (
    <div className="sticky top-0 z-10 -mx-5 border-b border-[var(--line)] bg-sand/95 px-5 py-2.5 backdrop-blur">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <p className={`text-xs font-semibold ${tone}`}>
          {words[state]}
          {state === "error" && (
            <button
              type="button"
              onClick={onRetry}
              className="ml-2 underline underline-offset-2"
            >
              Try again
            </button>
          )}
        </p>
        <p className="text-xs tabular text-ink-soft">
          {answered} of {SURVEY_TOTAL}
          {submittedAt ? " · sent" : ""}
        </p>
      </div>
    </div>
  );
}

function Question({ question, value, onChange }) {
  return (
    <div>
      <p className="text-sm font-semibold leading-snug">{question.prompt}</p>
      {question.hint && (
        <p className="mt-1 text-xs leading-relaxed text-ink-soft">
          {question.hint}
        </p>
      )}
      <div className="mt-2.5">
        {question.kind === "scale" && (
          <Scale question={question} value={value} onChange={onChange} />
        )}
        {question.kind === "choice" && (
          <Choices question={question} value={value} onChange={onChange} />
        )}
        {question.kind === "money" && (
          <Money value={value} onChange={onChange} prompt={question.prompt} />
        )}
        {question.kind === "text" && (
          <Words value={value} onChange={onChange} prompt={question.prompt} />
        )}
      </div>
    </div>
  );
}

/**
 * One to five, with both ends said in words.
 *
 * Numbered rather than starred. Stars are already the app's mark for rating a
 * place you went to, and a star here would read as an opinion of the question
 * rather than an answer to it. The words under the ends are the whole point: a
 * three means nothing unless it is known what a one and a five were.
 *
 * Pressing the number already chosen clears it, which is the only way back to no
 * opinion once one has been given -- the same rule the stars follow.
 */
function Scale({ question, value, onChange }) {
  const chosen = typeof value === "number" ? value : 0;
  const unused = value === NOT_USED;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => {
          const on = chosen === n;
          return (
            <button
              key={n}
              type="button"
              aria-pressed={on}
              aria-label={`${n} out of 5`}
              onClick={() => onChange(on ? "" : n)}
              className={`tabular min-h-11 min-w-11 rounded-full border text-sm font-semibold transition ${
                on
                  ? "border-teal bg-teal text-on-accent"
                  : "border-[var(--line)] bg-white text-ink-soft hover:border-teal/40 hover:text-teal"
              }`}
            >
              {n}
            </button>
          );
        })}
        {question.unused && (
          <button
            type="button"
            aria-pressed={unused}
            onClick={() => onChange(unused ? "" : NOT_USED)}
            className={`ml-1 min-h-11 rounded-full border px-3.5 text-sm transition ${
              unused
                ? "border-teal bg-teal text-on-accent"
                : "border-[var(--line)] bg-white text-ink-soft hover:border-teal/40 hover:text-teal"
            }`}
          >
            Not used it
          </button>
        )}
      </div>
      <div className="mt-1.5 flex max-w-[17rem] justify-between text-[0.7rem] text-ink-soft">
        <span>{question.low}</span>
        <span>{question.high}</span>
      </div>
    </div>
  );
}

/** One of a fixed list, as pills a thumb can hit. */
function Choices({ question, value, onChange }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {question.options.map((option) => {
        const on = value === option;
        return (
          <button
            key={option}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? "" : option)}
            className={`min-h-11 rounded-full border px-3.5 text-left text-sm leading-snug transition ${
              on
                ? "border-teal bg-teal text-on-accent"
                : "border-[var(--line)] bg-white text-ink-soft hover:border-teal/40 hover:text-teal"
            }`}
          >
            {option}
          </button>
        );
      })}
    </div>
  );
}

/**
 * A price, as text.
 *
 * Deliberately not a number field. "10-15", "about $12", "nothing" and "less
 * than I pay for one streaming service" are all honest answers to what something
 * is worth, and a number input refuses three of them. The desk pulls a figure out
 * where there is one and shows the words either way.
 */
function Money({ value, onChange, prompt }) {
  return (
    <label className="flex max-w-xs items-center gap-2">
      <span className="sr-only">{prompt}</span>
      <span aria-hidden="true" className="text-sm font-semibold text-ink-soft">
        $
      </span>
      <input
        type="text"
        inputMode="text"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder="12, 10-15, or nothing"
        className="field text-sm"
      />
    </label>
  );
}

function Words({ value, onChange, prompt }) {
  return (
    <label className="block">
      <span className="sr-only">{prompt}</span>
      <textarea
        rows={3}
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        className="field text-sm leading-relaxed"
      />
    </label>
  );
}
