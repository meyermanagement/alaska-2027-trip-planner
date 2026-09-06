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
  // In-session record of what has been answered this run. Practice mode
  // reads it to build the recap; real mode reads it to pre-fill fields when
  // the primary steps back to a question they already answered, so an
  // answered question never looks empty. Real mode does not read the server
  // for prior answers between questions, so this is the memory that lets
  // Back-then-Save-and-continue keep the current question's answer visible.
  const [answers, setAnswers] = useState([]);
  const [done, setDone] = useState(false);
  const focusRef = useRef(null);
  // Session cache for Aly-generated follow-up chips. Keyed by
  // `${slot}::${choice}::${chip}` (all lowercase); value is the array of
  // suggestion strings returned by /api/interview/suggest. Held in a ref so
  // repeated taps on the same chip -- including tapping OFF and back ON --
  // never re-hit the model within one session. A refresh of the interview
  // clears the cache, which is fine: the primary answers 10 questions and
  // moves on, so the cache lifetime maps to a real session.
  const suggestionCache = useRef(new Map());
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
    // Scroll the window back to the top so the new prompt is the first thing
    // in view, even if the last question had a long Why panel below the fold.
    if (typeof window !== "undefined") {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    }
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

  // Whether the current form has something worth saving before leaving the
  // question. Options questions need a choice (either one of the two, or
  // Something else with text); moments questions need at least one non-empty
  // row; text questions need any non-whitespace typed. If nothing is filled
  // in, going Back is treated as a bare navigation -- no save, no error, no
  // wasted round trip.
  const hasAnswer = (() => {
    if (question?.kind === "options") {
      if (!choice) return false;
      if (choice === "other") return text.trim().length > 0;
      return true;
    }
    if (question?.kind === "moments") {
      return moments.some((m) => (m || "").trim().length > 0);
    }
    if (question?.kind === "text") {
      return text.trim().length > 0;
    }
    return false;
  })();

  // Save the current form as the answer to the current question. Reused by
  // Save-and-continue (advance=true) and by Back (advance=false, called only
  // when the primary typed or picked something before hitting Back). Returns
  // true on a successful save, false on validation or network failure so the
  // caller can decide whether to still navigate.
  const saveCurrent = useCallback(async () => {
    if (!hasAnswer) return false;
    const isMoments = question.kind === "moments";
    const cleanedMoments = isMoments
      ? moments.map((m) => m.trim()).filter(Boolean)
      : [];
    // Build the local-memory record once so both modes update `answers` the
    // same way. Real mode also uses it to pre-fill the fields when the
    // primary steps back to this question later in the session.
    const opt = (question.options || []).find((o) => o.value === choice);
    const record = {
      slot,
      label: question.label,
      kind: question.kind,
      action: "answer",
      picked: isMoments
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
        question.kind === "options" && choice !== "other" && text.trim()
          ? text.trim()
          : null,
    };
    // Replace any previous record for this slot rather than double-stack,
    // so back-then-forward does not leave two rows for the same question.
    const remember = () =>
      setAnswers((prior) => {
        const kept = prior.filter((a) => a.slot !== slot);
        return [...kept, record];
      });
    if (mode === "practice") {
      // Practice mode writes only to local memory; the recap reads it.
      remember();
      return true;
    }
    // Real mode writes to the same endpoints as Save and continue, then
    // records the same shape locally so a later Back finds the answer.
    try {
      const res = isMoments
        ? await fetch("/api/interview/moments", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              action: "answer",
              moments: cleanedMoments,
            }),
          })
        : await fetch("/api/interview/answer", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              slot,
              action: "answer",
              choice,
              text,
            }),
          });
      if (res.ok) remember();
      return res.ok;
    } catch {
      return false;
    }
  }, [choice, hasAnswer, mode, moments, question, slot, text]);

  // Go back one question. On the very first question this leaves the
  // interview entirely -- to the practice hub in practice mode, to Family in
  // real mode -- because there is no earlier question to revise.
  //
  // If the primary has typed or picked something on the current question, it
  // is saved first through the same path Save-and-continue uses, so going
  // Back never throws away work. If the save fails on the network, the error
  // shows and the step-back is cancelled -- the primary can retry or edit.
  //
  // In practice mode a step back also pre-fills the previous question's
  // fields with what was picked, so "back" reads as "take that back" rather
  // than "start that question again from scratch". In real mode the previous
  // answer was already saved server-side; the primary sees the question with
  // fresh fields and any new answer overwrites the old one through the same
  // upsert path that wrote it the first time.
  const back = useCallback(async () => {
    if (loading) return;
    // Save first if there's anything on the form. Failures halt the step-back
    // so the primary sees the same familiar error surface as Save-and-continue.
    if (hasAnswer) {
      setLoading(true);
      setError(null);
      const ok = await saveCurrent();
      setLoading(false);
      if (!ok) {
        setError("That answer could not be saved. Try again.");
        return;
      }
    }
    if (index <= 0) {
      router.push(mode === "practice" ? "/interview-check" : "/family");
      return;
    }
    const previousIndex = index - 1;
    const previous = INTERVIEW_QUESTIONS[previousIndex];
    setSlot(previous.slot);
    setIndex(previousIndex);
    setError(null);
    // Look up the previous question's recorded answer -- which may have been
    // just saved a moment ago from this same click -- and pre-fill the
    // fields with what was picked, so the primary can revise rather than
    // retype. The same read applies to both modes so an answered question
    // never looks empty on Back.
    setAnswers((prior) => {
      const previousAnswer = prior.find((a) => a.slot === previous.slot);
      if (previousAnswer) {
        if (previous.kind === "options") {
          const opt = (previous.options || []).find(
            (o) => o.label === previousAnswer.picked,
          );
          setChoice(opt ? opt.value : previousAnswer.picked ? "other" : "");
          setText(
            opt
              ? previousAnswer.reason || ""
              : typeof previousAnswer.picked === "string"
                ? previousAnswer.picked
                : "",
          );
          setMoments([""]);
        } else if (previous.kind === "moments") {
          const list = Array.isArray(previousAnswer.picked)
            ? previousAnswer.picked
            : [];
          setMoments(list.length ? [...list, ""] : [""]);
          setChoice("");
          setText("");
        } else {
          setChoice("");
          setText(
            typeof previousAnswer.picked === "string"
              ? previousAnswer.picked
              : "",
          );
          setMoments([""]);
        }
      } else {
        setChoice("");
        setText("");
        setMoments([""]);
      }
      return prior;
    });
  }, [hasAnswer, index, loading, mode, router, saveCurrent]);

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
          <h1
            className="select-none font-display text-2xl leading-snug text-ink outline-none [outline:none!important] focus:outline-none focus-visible:outline-none sm:text-3xl"
            style={{ outline: "none" }}
          >
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
                  cache={suggestionCache}
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
// with a friendly heading -- "Why? (Optional.)" and "Something else" swaps it
// to "What fits better?". Suggestions are togglable pills that append their
// text to the reason on its own line; tapping again removes just that line,
// so several suggestions can stack into a fuller answer without retyping.
//
// The base suggestions are hand-written and ship with the question. Beyond
// them, the panel asks Aly on the fly for follow-up chips that extend the
// specific base chip the primary just tapped -- "The kids do better when
// they are busy" leads to more kid-energy chips, "We won't be back here for
// a while" leads to more scarcity chips, and so on. Each fetch runs in the
// background against /api/interview/suggest; the results merge into a growing
// pool of extra chips (deduplicated, capped around ten total in the second
// row) that appear under a "More" heading. Pending fetches show a small dot
// placeholder in the same layout so the row is a wait rather than a jump.
//
// Within the More row, the hand-written otherReasons (the neutral third-way
// suggestions that ship with the question) come first, and Aly's tailored
// follow-ups append after them in pick order. That way a chip that just
// arrived from the network does not shove the hand-written suggestions off
// the top of the row -- the anchor stays put, the new material lands at the
// end.
//
// A session-lifetime cache (keyed by slot::choice::chip) means tapping the
// same base chip twice -- or toggling one off and back on -- never re-hits
// the model. The cache lives on the parent InterviewBody's suggestionCache
// ref.
//
// The opposing option's hand-written reasons are still NOT surfaced: they
// argue against the answer just picked, and stacking them into the reason
// would contradict it.
const MORE_CAP = 10;

function WhyPanel({ choice, question, text, setText, cache }) {
  const isOther = choice === "other";
  const primary = (() => {
    if (isOther) return question.otherReasons || [];
    const opt = (question.options || []).find((o) => o.value === choice);
    return (opt && opt.reasons) || [];
  })();

  const lines = text
    .split(/\r?\n/)
    .map((s) => s.trim())
    .filter(Boolean);
  const activeSet = new Set(lines.map((s) => s.toLowerCase()));
  // Which primary chips are actually picked, in the order they were picked --
  // so "More" starts with follow-ups to the FIRST pick and appends the next
  // pick's follow-ups below, rather than shuffling the order on each re-render.
  const pickedPrimary = lines.filter((l) =>
    primary.some((p) => p.toLowerCase() === l.toLowerCase()),
  );

  // Track pending fetches and generated pools by cache key. State is used
  // rather than a plain ref for the visible pool so the panel re-renders
  // when a fetch resolves; the ref is the durable session cache.
  const [pool, setPool] = useState(() => ({}));
  const [pendingKeys, setPendingKeys] = useState(() => new Set());

  // v2 keys start with a version tag so old cached entries generated before
  // the prompt was tightened don't survive across page loads or refreshes.
  // Bump when the /api/interview/suggest prompt changes materially.
  const keyFor = useCallback(
    (chip) => `v2::${question.slot}::${choice}::${chip.toLowerCase()}`,
    [question.slot, choice],
  );

  // When a base chip is picked, ensure we have follow-ups for it. Read from
  // the session cache first; only fetch when it is genuinely absent.
  useEffect(() => {
    if (isOther) return; // Something else has no follow-up model call.
    const missing = pickedPrimary.filter((chip) => {
      const k = keyFor(chip);
      return !cache.current.has(k) && !pendingKeys.has(k);
    });
    if (missing.length === 0) return;
    // Mark all as pending atomically before firing any request so a burst of
    // taps does not double-fire the same key.
    setPendingKeys((prev) => {
      const next = new Set(prev);
      for (const chip of missing) next.add(keyFor(chip));
      return next;
    });
    for (const chip of missing) {
      const k = keyFor(chip);
      (async () => {
        let suggestions = [];
        try {
          const res = await fetch("/api/interview/suggest", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              slot: question.slot,
              choice,
              chip,
            }),
          });
          const data = await res.json();
          if (Array.isArray(data?.suggestions)) suggestions = data.suggestions;
        } catch {
          suggestions = [];
        }
        cache.current.set(k, suggestions);
        setPool((prev) => ({ ...prev, [k]: suggestions }));
        setPendingKeys((prev) => {
          const next = new Set(prev);
          next.delete(k);
          return next;
        });
      })();
    }
  }, [pickedPrimary, pendingKeys, cache, choice, keyFor, question.slot]);

  // Assemble the "More" pool. Hand-written otherReasons come first because
  // they are steady, ship with the question, and act as the anchor of the
  // row -- something to look at while Aly's follow-ups are still being
  // fetched, and something that stays in the same place across taps.
  // Aly's tailored follow-ups (in pick order) append after them, so a chip
  // that just arrived does not shove the hand-written suggestions off the
  // top of the row. Everything is deduped case-insensitively against the
  // primary list and each other, and capped at MORE_CAP so the row does
  // not run away.
  const more = (() => {
    const seen = new Set(primary.map((s) => s.toLowerCase()));
    const out = [];
    for (const r of question.otherReasons || []) {
      if (out.length >= MORE_CAP) return out;
      const kk = r.toLowerCase();
      if (seen.has(kk)) continue;
      seen.add(kk);
      out.push(r);
    }
    for (const chip of pickedPrimary) {
      const k = keyFor(chip);
      const generated = cache.current.get(k) || pool[k] || [];
      for (const g of generated) {
        if (!g) continue;
        const kk = g.toLowerCase();
        if (seen.has(kk)) continue;
        seen.add(kk);
        out.push(g);
        if (out.length >= MORE_CAP) return out;
      }
    }
    return out;
  })();

  const anyPickedPrimary = pickedPrimary.length > 0;
  const anyPending = pickedPrimary.some((chip) =>
    pendingKeys.has(keyFor(chip)),
  );
  const showMoreSection = anyPickedPrimary && (more.length > 0 || anyPending);

  function toggle(chip) {
    const has = activeSet.has(chip.toLowerCase());
    if (has) {
      const next = lines.filter((l) => l.toLowerCase() !== chip.toLowerCase());
      setText(next.join("\n"));
    } else {
      const next = [...lines, chip];
      setText(next.join("\n"));
    }
  }

  function Chip({ chip }) {
    const on = activeSet.has(chip.toLowerCase());
    return (
      <button
        type="button"
        onClick={() => toggle(chip)}
        aria-pressed={on}
        className={
          on
            ? "rounded-full border border-teal bg-teal-soft/60 px-3 py-1.5 text-sm text-ink shadow-sm"
            : "rounded-full border border-sand-deep bg-white px-3 py-1.5 text-sm text-ink-soft transition hover:border-teal/60 hover:text-ink"
        }
      >
        {chip}
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-teal/30 bg-teal-soft/25 p-4">
      <p className="font-display text-lg text-ink">
        {isOther ? "What fits better?" : "Why? (Optional.)"}
      </p>
      {primary.length > 0 && (
        <div className="mt-3">
          <p className="section-label text-ink-soft">Suggestions</p>
          <div className="mt-1 flex flex-wrap gap-2">
            {primary.map((chip) => (
              <Chip key={chip} chip={chip} />
            ))}
          </div>
        </div>
      )}
      {showMoreSection && (
        <div className="mt-3">
          <p className="section-label text-ink-soft">More</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {more.map((chip) => (
              <Chip key={chip} chip={chip} />
            ))}
            {anyPending && (
              <span
                className="inline-flex items-center gap-1 rounded-full border border-dashed border-sand-deep bg-white/60 px-3 py-1.5 text-sm text-ink-soft"
                aria-live="polite"
                aria-label="Loading more suggestions"
              >
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink-soft"></span>
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink-soft [animation-delay:150ms]"></span>
                <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-ink-soft [animation-delay:300ms]"></span>
              </span>
            )}
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
