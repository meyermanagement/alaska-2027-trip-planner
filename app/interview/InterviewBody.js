"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import CompassLoader from "@/components/CompassLoader";
import { INTERVIEW_QUESTIONS, questionFor } from "@/lib/travelers/interview";
import {
  personalizationContext,
  personalizeReasons,
} from "@/lib/travelers/interviewPersonalize";
import { inferAnswer } from "@/lib/travelers/interviewInference";
import { summaryForAnswer } from "@/lib/travelers/runningSummary";
import { patchRun, runToStandIn } from "@/lib/practice/session";
import {
  resolveStandIn,
  standInPetsRows,
  standInTravelers,
} from "@/lib/practice/standIn";

// The minimum a Compass loader is on screen between questions. The write and
// the next-question calculation take a few hundred milliseconds; anything
// shorter than this reads as instant-jarring rather than as a beat of thought,
// so the wait is held to at least this long even when the network is faster.
const HOLD_MS = 520;

/**
 * The display string for the practice-mode Recap and for anywhere else in
 * the UI that wants a single sentence for the whys plus own-words. Chips
 * are joined with a space so they read as one thought; own-words is added
 * after them so the primary's own writing stays distinct from the chips
 * they tapped.
 *
 * Returns null when there is nothing to show, so Recap can hide the row
 * cleanly without an empty bullet.
 */
function buildReasonDisplay(whys, ownWords) {
  const chipsLine = (whys || []).filter(Boolean).join(" ");
  const own = (ownWords || "").trim();
  const parts = [chipsLine, own].filter(Boolean);
  return parts.length ? parts.join(" ") : null;
}

// The blank fields for a question with no prior answer.
//
// `whys` is the list of picked reason chips on an options question. Each
// tapped chip is one entry in the list, verbatim. `ownWords` is the free-text
// box under the chips, kept separate from `text` because on option questions
// `text` is the Something-else field (used only when the choice is 'other')
// and would fight the own-words box if the two shared one string. Both stay
// empty by default and reset on advance() and back() from the prior answer.
const BLANK_FIELDS = {
  choice: "",
  text: "",
  whys: [],
  ownWords: "",
  moments: [""],
};

/**
 * The three form fields (choice, text, moments) that should paint onto the
 * screen for `question`, given the primary's `priorAnswer` for it (or null if
 * they have never answered this question).
 *
 * Both back() and advance() call this so an already-answered question looks
 * the same whether the primary arrived by stepping back to revise or by
 * stepping forward after Save-and-continue. Two paths, one shape.
 *
 * For options questions the recorded pick is the option's label (that is
 * what the answer endpoint stores in the body), so the option value is
 * looked up by matching the label back. A pick with no matching label is
 * treated as a Something-else answer -- the label lookup failed because the
 * primary typed their own words rather than picking a card. The typed words
 * live in `picked` for Something-else answers and in `reason` for reason-
 * chip answers, and are pulled into the text field accordingly.
 *
 * For moments questions the recorded pick is the array of moment strings.
 * One extra blank slot is kept at the end so there is always somewhere to
 * type without hunting for an add button, matching the shape MomentsPanel
 * expects.
 *
 * For text questions the recorded pick is a single string that goes back
 * into the text field.
 *
 * A missing `priorAnswer` yields the blank fields the form starts with.
 */
function fieldsForAnswer(question, priorAnswer) {
  if (!priorAnswer || !question) return BLANK_FIELDS;
  if (question.kind === "options") {
    const opt = (question.options || []).find(
      (o) => o.label === priorAnswer.picked,
    );
    const priorWhys = Array.isArray(priorAnswer.whys) ? priorAnswer.whys : [];
    const priorOwnWords =
      typeof priorAnswer.ownWords === "string" ? priorAnswer.ownWords : "";
    return {
      choice: opt ? opt.value : priorAnswer.picked ? "other" : "",
      // `text` is the Something-else field. It carries the primary's typed
      // alternative when they picked "other", and stays blank otherwise --
      // the own-words box for a normal pick lives on `ownWords`.
      text: opt
        ? ""
        : typeof priorAnswer.picked === "string"
          ? priorAnswer.picked
          : "",
      whys: opt ? priorWhys : [],
      ownWords: opt ? priorOwnWords : "",
      moments: [""],
    };
  }
  if (question.kind === "moments") {
    const list = Array.isArray(priorAnswer.picked) ? priorAnswer.picked : [];
    return {
      choice: "",
      text: "",
      whys: [],
      ownWords: "",
      moments: list.length ? [...list, ""] : [""],
    };
  }
  // text
  return {
    choice: "",
    text: typeof priorAnswer.picked === "string" ? priorAnswer.picked : "",
    whys: [],
    ownWords: "",
    moments: [""],
  };
}

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
export default function InterviewBody({
  mode,
  startSlot,
  startIndex,
  total,
  context,
  aboutMePriors,
  priorAnswers = null,
  destination = null,
}) {
  const router = useRouter();
  const [slot, setSlot] = useState(startSlot);
  const [index, setIndex] = useState(startIndex);
  const [choice, setChoice] = useState("");
  const [text, setText] = useState("");
  const [whys, setWhys] = useState([]);
  const [ownWords, setOwnWords] = useState("");
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
  // Whether the primary has touched the choice on the current question. A
  // worked-out answer arrives pre-picked, and the difference between agreeing
  // with it and picking the same option by hand is the difference between
  // 'derived' and 'said' in the travel file, so it has to be tracked rather
  // than guessed from the value.
  const [touched, setTouched] = useState(false);

  // Everything already answered, whether in this sitting or a previous one, in
  // the shape the inference rules read. In-session answers win over the ones
  // loaded from the server, so stepping back and changing an answer changes
  // what gets worked out from it.
  const priorMap = useMemo(() => {
    const base = { ...(priorAnswers || {}) };
    for (const answer of answers) {
      if (!answer?.slot) continue;
      const question = questionFor(answer.slot);
      const opt = (question?.options || []).find(
        (o) => o.label === answer.picked,
      );
      base[answer.slot] = {
        value: opt?.value || null,
        whys: answer.whys || [],
      };
    }
    return base;
  }, [priorAnswers, answers]);

  // What the interview can work out about the question it is about to put.
  // Null means it genuinely does not know and should ask cold.
  const inferred = useMemo(() => inferAnswer(slot, priorMap), [slot, priorMap]);

  // Practice mode writes no preference rows, so without this the answers a
  // person gives here would die with the component and the proof screen two
  // steps later would compare against the built-in stand-in preferences
  // rather than the ones they just chose. Mirroring the whole array on every
  // change -- rather than appending on each save -- means stepping back and
  // changing an answer corrects the run too, since `answers` already keeps
  // exactly one record per slot.
  useEffect(() => {
    if (mode !== "practice") return;
    patchRun({ answers });
  }, [answers, mode]);

  // Who the reason chips talk about. Real mode is handed the family read from
  // the database and nothing here touches it.
  //
  // Practice mode arrives with the built-in stand-in family, because the server
  // cannot see sessionStorage and rendering the real family for even one frame
  // is the bug this fixes. Once mounted, whatever was typed on the practice
  // welcome screen takes over, so the questions ask about that family's
  // children and animals by name. Read after mount rather than during render
  // so the server and client first paints agree.
  const [live, setLive] = useState(context);
  useEffect(() => {
    if (mode !== "practice") return;
    const typed = runToStandIn();
    if (!typed) return;
    const standIn = resolveStandIn(typed);
    setLive(
      personalizationContext({
        travelers: standInTravelers(standIn),
        pets: standInPetsRows(standIn),
      }),
    );
  }, [mode]);
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

  // Move to a specific next slot and repaint the form for it. If the primary
  // has already answered that slot earlier this session (which happens after
  // a Back-then-Save-and-continue revision), pre-fill the fields from the
  // recorded answer so the question does not read as "start over". If it has
  // not been answered yet, the fields land blank the way they always did.
  //
  // The pre-fill mirrors what back() does for the previous question, on
  // purpose: an answered question should look answered no matter which
  // direction the primary arrived from.
  const advance = useCallback(
    (nextSlot) => {
      if (!nextSlot) {
        setDone(true);
        return;
      }
      const nextIndex = INTERVIEW_QUESTIONS.findIndex(
        (q) => q.slot === nextSlot,
      );
      const nextQuestion = INTERVIEW_QUESTIONS[nextIndex] || null;
      setSlot(nextSlot);
      setIndex(nextIndex >= 0 ? nextIndex : index + 1);
      // Read the local answers map with a functional updater so a record just
      // written by submit() in the same click is visible, then paint the
      // fields for the incoming slot. Blank when nothing is on file; the
      // prior pick, otherwise.
      setAnswers((prior) => {
        const priorAnswer = prior.find((a) => a.slot === nextSlot);
        const fields = fieldsForAnswer(nextQuestion, priorAnswer);
        setChoice(fields.choice);
        setText(fields.text);
        setWhys(fields.whys);
        setOwnWords(fields.ownWords);
        setMoments(fields.moments);
        return prior;
      });
      setError(null);
    },
    [index],
  );

  // Arriving at a question means nothing has been touched on it yet, whether
  // or not anything was worked out for it.
  useEffect(() => {
    setTouched(false);
  }, [slot]);

  // A worked-out answer arrives with its option already picked, so agreeing is
  // one tap on Save and continue rather than a pick and then a tap. Applied
  // once per question: if the primary picks something else, this must not put
  // the inference back on the next render.
  const preFilledFor = useRef(null);
  useEffect(() => {
    if (!inferred) return;
    if (preFilledFor.current === slot) return;
    preFilledFor.current = slot;
    setChoice(inferred.value);
    setTouched(false);
  }, [inferred, slot]);

  // A question is only "worked out" while the pre-picked option is still the
  // one showing and nothing has been touched. Changing the answer and changing
  // it back counts as saying it, which is the honest reading.
  // The About-you paragraph is a more direct source than anything worked out
  // from other answers -- the primary wrote the sentence themselves -- so when
  // that card is already explaining this question, the worked-out card stays
  // out of the way rather than stacking a second explanation above the same
  // prompt. The pick still stands; only the second card is suppressed.
  const aboutMeCovers = Boolean(aboutMePriors && aboutMePriors[slot]);
  const confirmingInference = Boolean(
    inferred && !touched && choice === inferred.value,
  );

  // Every choice the primary makes by hand, so the pre-picked option can stop
  // claiming to be worked out the moment they disagree with it.
  const pickChoice = useCallback((value) => {
    setTouched(true);
    setChoice(value);
  }, []);

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
    // Whys and own-words only apply to a normal option pick. Something-else
    // (choice === "other") sends its typed alternative on `text`, not chips,
    // and the interview UI doesn't offer chips on that path.
    const cleanedWhys =
      question.kind === "options" && choice && choice !== "other"
        ? whys.map((w) => (w || "").trim()).filter(Boolean)
        : [];
    const cleanedOwnWords =
      question.kind === "options" && choice && choice !== "other"
        ? ownWords.trim()
        : "";
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
      // `reason` is a display-only string kept for Recap (practice mode) so
      // the recap shows the whys and own-words together on one line. The
      // server no longer reads it; the answer route writes whys and own-
      // words as their own preference rows.
      reason: buildReasonDisplay(cleanedWhys, cleanedOwnWords),
      whys: cleanedWhys,
      ownWords: cleanedOwnWords,
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
              whys: cleanedWhys,
              ownWords: cleanedOwnWords,
              // Tells the answer route this was worked out from earlier
              // answers and agreed to rather than said outright, so the
              // preference row is stored as derived and carries the sentence
              // explaining where it came from.
              derived: confirmingInference,
              derivedBecause: confirmingInference ? inferred.because : null,
            }),
          });
      if (res.ok) remember();
      return res.ok;
    } catch {
      return false;
    }
  }, [
    choice,
    confirmingInference,
    hasAnswer,
    inferred,
    mode,
    moments,
    ownWords,
    question,
    slot,
    text,
    whys,
  ]);

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
      const fields = fieldsForAnswer(previous, previousAnswer);
      setChoice(fields.choice);
      setText(fields.text);
      setWhys(fields.whys);
      setOwnWords(fields.ownWords);
      setMoments(fields.moments);
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

      // Build the local-memory record once, in the same shape saveCurrent
      // uses, so both modes hand the same object to `remember()` below.
      // Real mode needs it too: without a local record, hitting Back after
      // Save-and-continue lands on an empty form because the pre-fill has
      // nothing to read.
      const opt = (question.options || []).find((o) => o.value === choice);
      // Same rule as saveCurrent: whys and own-words are option-pick-only.
      const cleanedWhys =
        action !== "skip" &&
        question.kind === "options" &&
        choice &&
        choice !== "other"
          ? whys.map((w) => (w || "").trim()).filter(Boolean)
          : [];
      const cleanedOwnWords =
        action !== "skip" &&
        question.kind === "options" &&
        choice &&
        choice !== "other"
          ? ownWords.trim()
          : "";
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
            : buildReasonDisplay(cleanedWhys, cleanedOwnWords),
        whys: cleanedWhys,
        ownWords: cleanedOwnWords,
      };
      // Replace any previous record for the same slot so back-then-forward
      // (or answer-then-back-then-revise) never leaves two rows for the
      // same question.
      const remember = () =>
        setAnswers((prior) => {
          const kept = prior.filter((a) => a.slot !== slot);
          return [...kept, record];
        });

      // Practice mode: record locally, wait the same beat, advance.
      if (mode === "practice") {
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
        remember();
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
                whys: cleanedWhys,
                ownWords: cleanedOwnWords,
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
        // Persist the same record shape locally so a later Back finds the
        // pick without another round trip. Only on success -- a failed save
        // has nothing worth remembering.
        remember();
        const wait = Math.max(0, HOLD_MS - (Date.now() - started));
        setTimeout(() => {
          setLoading(false);
          if (payload?.complete) {
            setDone(true);
            // The interview earns itself in front of the primary on the very
            // next screen: /interview/proof runs the same real question about
            // their upcoming trip twice, once with the answers folded in and
            // once without, so the ten questions they just answered become
            // a difference they can read. From there /welcome/after-interview
            // carries them onward to the trip builder.
            router.push("/interview/proof");
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
      ownWords,
      question,
      router,
      slot,
      text,
      whys,
    ],
  );

  // Practice-mode recap: shown after the last question in place of the card.
  if (done && mode === "practice") {
    return <Recap answers={answers} />;
  }

  const summaryLines = answers
    .map((a) => ({ slot: a.slot, text: summaryForAnswer(a, destination) }))
    .filter((row) => row.text);

  return (
    <div className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-10 lg:grid-cols-[minmax(0,42rem)_minmax(0,20rem)]">
      <div className="flex min-h-[70vh] w-full flex-col items-center justify-center">
        <p className="section-label mb-2 self-start text-ink-soft">
          Question {index + 1} of {total}
        </p>

        {loading ? (
          <div className="flex min-h-[320px] flex-col items-center justify-center gap-4 text-teal">
            <CompassLoader size={72} label="Working on the next question." />
            <p className="text-sm text-ink-soft">One moment.</p>
          </div>
        ) : (
          <div className="w-full">
            {/* One-time honesty note above the FIRST question only. The
              interview writes to a person's travel file and Aly plans
              against it later, so a chip picked because it sounded nice
              rather than because it is true will narrow the recommendations
              in ways nobody wanted. The rule is short here so it can be read
              once and remembered: only tick what is actually true, short
              answers are fine, and an over-restrictive answer can taper
              Aly's suggestions enough that a later recommendation is off. */}
            {index === 0 && (
              <div
                role="note"
                className="mb-6 rounded-2xl border border-sand-deep bg-sand-soft/60 px-4 py-3 text-sm leading-relaxed text-ink-soft"
              >
                <p className="font-display text-ink">
                  Only tick what is actually true.
                </p>
                <p className="mt-1">
                  Short answers are fine. A blank is fine. If you pick something
                  too specific because it sounded good, Aly will plan around it
                  and a later suggestion might come back a little off.
                </p>
              </div>
            )}
            {aboutMePriors && aboutMePriors[slot] && (
              <div className="mb-4 rounded-2xl border border-teal/30 bg-teal-soft/25 px-4 py-3 text-sm leading-relaxed text-ink-soft">
                <p className="font-display text-ink">
                  You mentioned this on About you.
                </p>
                <p className="mt-1 italic">
                  &ldquo;{aboutMePriors[slot].quote}&rdquo;
                </p>
                <p className="mt-2">
                  Aly is already planning around it. Confirm below or{" "}
                  <a
                    href="/about-you"
                    className="text-teal underline underline-offset-4"
                  >
                    change it on About you
                  </a>
                  .
                </p>
              </div>
            )}
            {/* A question the earlier answers already settle. The option is
              picked below, so agreeing is one tap on Save and continue, and
              the sentence says what it was worked out from -- an inference
              nobody can see the basis of is just a guess with confidence.
              Hidden the moment the primary touches the choice, because from
              then on the screen is showing their answer rather than ours. The
              two strengths get different words: a near-certain link says the
              answer, a reasonable one asks. */}
            {confirmingInference && !aboutMeCovers && (
              <div className="mb-4 rounded-2xl border border-teal/30 bg-teal-soft/25 px-4 py-3 text-sm leading-relaxed text-ink-soft">
                <p className="font-display text-ink">
                  {inferred.strength === "sure"
                    ? "You have already answered this one."
                    : "This one Aly can probably guess."}
                </p>
                <p className="mt-1">{inferred.because}</p>
                <p className="mt-2">
                  {inferred.strength === "sure"
                    ? "So it is picked below. Save and continue to agree, or pick another if we have it wrong."
                    : "So it is picked below as a guess. Save and continue to agree, or pick another if we have it wrong."}
                </p>
              </div>
            )}
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
                    onClick={() => pickChoice(opt.value)}
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
                  onClick={() => pickChoice("other")}
                  aria-pressed={choice === "other"}
                  className={`rounded-2xl border p-4 text-left transition ${
                    choice === "other"
                      ? "border-teal bg-teal-soft/50 shadow-sm"
                      : "border-sand-deep bg-white hover:border-teal/50"
                  }`}
                >
                  <p className="font-display text-lg text-ink">
                    Something else
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">
                    In your own words.
                  </p>
                </button>
                {choice && choice !== "other" && (
                  <WhyPanel
                    choice={choice}
                    question={question}
                    whys={whys}
                    setWhys={setWhys}
                    ownWords={ownWords}
                    setOwnWords={setOwnWords}
                    cache={suggestionCache}
                    context={live}
                  />
                )}
                {choice === "other" && (
                  <div className="mt-6">
                    <label
                      htmlFor="interview-other-text"
                      className="mb-2 block text-sm text-ink-soft"
                    >
                      Say what fits better.
                    </label>
                    <textarea
                      id="interview-other-text"
                      rows={4}
                      value={text}
                      onChange={(e) => setText(e.target.value)}
                      placeholder={
                        question.otherPlaceholder ||
                        "In your own words, what actually fits you."
                      }
                      className="w-full rounded-2xl border border-sand-deep bg-white p-3 text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
                    />
                  </div>
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
                  {question.kind === "moments"
                    ? "None to add"
                    : "Skip this one"}
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
      {summaryLines.length > 0 && (
        <aside className="hidden self-start rounded-2xl border border-sand-deep bg-sand-soft/60 p-4 lg:sticky lg:top-4 lg:block">
          <p className="section-label text-ink-soft">What Aly now knows</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            One line every time you answer. This is what she'll do because of
            it.
          </p>
          <div className="mt-3 space-y-2">
            {summaryLines.map((row) => (
              <p
                key={row.slot}
                className="rounded-lg border border-sand-deep bg-white p-3 text-sm leading-relaxed text-ink"
              >
                {row.text}
              </p>
            ))}
          </div>
        </aside>
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

// Client-side twin of the server's signatureOf in
// app/api/interview/suggest/route.js. Same intent: two chips that only differ
// by punctuation, pronoun choice, filler verbs, or boilerplate endings plan
// the same day, so they are one chip. Kept in sync with the server so a
// primary chip and an otherReasons chip that say the same thing in different
// words are not both drawn, and so a stale cached follow-up cannot pass the
// client's dedupe even if it slipped past the server's.
function signatureOf(value) {
  return String(value || "")
    .toLowerCase()
    .replace(
      /\b(we|the family|the kids|our family)\s+(?:would\s+(?:rather|prefer)|prefer(?:red)?\s+to|like(?:d)?\s+to|love\s+to|want\s+to|need\s+to|have\s+to|tend\s+to|try\s+to|are\s+going\s+to|are\s+used\s+to|end\s+up|always|usually|often|sometimes|mostly|never|rarely)\b/g,
      "$1",
    )
    .replace(/\b(?:we|us|our|ours|the family|our family)\b/g, "we")
    .replace(
      /\b(?:the kids|the children|our kids|our children|the boys|the girls)\b/g,
      "kids",
    )
    .replace(
      /\b(?:in general|most of the time|most days|most trips|on trips|when we travel|either way|no matter what|for us|for our family|as a rule|as a family)\b/g,
      " ",
    )
    .replace(
      /\b(?:really|actually|honestly|simply|just|kind of|sort of|a bit)\b/g,
      " ",
    )
    .replace(/[^a-z0-9\s]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function WhyPanel({
  choice,
  question,
  whys,
  setWhys,
  ownWords,
  setOwnWords,
  cache,
  context,
}) {
  // Whys are chips only; own-words is a separate box below the chips. The
  // Something-else branch never renders this panel -- the caller shows a
  // plain textarea for that case -- so this component only handles a real
  // option pick.
  // The base suggestions ship with the question, hand-written in a family
  // voice. personalizeReasons swaps the stock "the kids" and "we" tokens for
  // the family's actual names when we know them, so the chip reads as if Aly
  // knew who she was writing to rather than a stock questionnaire. Called on
  // every render because the chip list is small; there is no cost worth
  // memoizing over.
  const primary = (() => {
    const opt = (question.options || []).find((o) => o.value === choice);
    const raw = (opt && opt.reasons) || [];
    return personalizeReasons(raw, context);
  })();

  const activeSet = new Set((whys || []).map((s) => (s || "").toLowerCase()));
  // Which primary chips are actually picked, in the order they were picked --
  // so "More" starts with follow-ups to the FIRST pick and appends the next
  // pick's follow-ups below, rather than shuffling the order on each re-render.
  const pickedPrimary = (whys || []).filter((l) =>
    primary.some((p) => p.toLowerCase() === (l || "").toLowerCase()),
  );

  // Track pending fetches and generated pools by cache key. State is used
  // rather than a plain ref for the visible pool so the panel re-renders
  // when a fetch resolves; the ref is the durable session cache.
  const [pool, setPool] = useState(() => ({}));
  const [pendingKeys, setPendingKeys] = useState(() => new Set());

  // v3 keys start with a version tag so old cached entries generated before
  // the prompt was tightened don't survive across page loads or refreshes.
  // Bump when the /api/interview/suggest prompt changes materially. v3 is
  // the variations-over-rephrasings rewrite of the follow-up prompt paired
  // with the redundancy filter on the server.
  const keyFor = useCallback(
    (chip) => `v3::${question.slot}::${choice}::${chip.toLowerCase()}`,
    [question.slot, choice],
  );

  // When a base chip is picked, ensure we have follow-ups for it. Read from
  // the session cache first; only fetch when it is genuinely absent.
  useEffect(() => {
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
  // top of the row. Everything is deduped by SIGNATURE against the primary
  // row and each other (so near-duplicates that differ only in punctuation
  // or pronouns are caught, not just exact matches), and capped at
  // MORE_CAP so the row does not run away. Picked chips are NOT filtered
  // out so a wrong tap can be untapped.
  const more = (() => {
    // Seed the dedupe set with the primary row's signatures only. Picked
    // chips are NOT added to the seen set, so a chip that got tapped in
    // More stays visible in More and can be untapped from the same place
    // it was tapped -- the same behavior the primary row already has
    // (tapping a primary chip does not remove it from the primary row).
    // The chip's picked state is drawn on the chip itself; that is
    // enough to show it is on. Removing a picked chip from the row was
    // the reason a wrong tap could not be undone.
    const seen = new Set();
    for (const s of primary) {
      const sig = signatureOf(s);
      if (sig) seen.add(sig);
    }
    const out = [];
    for (const r of personalizeReasons(question.otherReasons || [], context)) {
      if (out.length >= MORE_CAP) return out;
      const sig = signatureOf(r);
      if (!sig || seen.has(sig)) continue;
      seen.add(sig);
      out.push(r);
    }
    for (const chip of pickedPrimary) {
      const k = keyFor(chip);
      const generated = cache.current.get(k) || pool[k] || [];
      for (const g of generated) {
        if (!g) continue;
        const sig = signatureOf(g);
        if (!sig || seen.has(sig)) continue;
        seen.add(sig);
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
    const key = chip.toLowerCase();
    setWhys((prev) => {
      const current = Array.isArray(prev) ? prev : [];
      const has = current.some((l) => (l || "").toLowerCase() === key);
      if (has) return current.filter((l) => (l || "").toLowerCase() !== key);
      return [...current, chip];
    });
  }

  function Chip({ chip }) {
    const on = activeSet.has(chip.toLowerCase());
    // text-left because a browser button centers its text by default, and a
    // reason long enough to wrap to a second line inside the chip would then
    // be centered while the same reason on one line was flush left. The chip
    // is the same reason either way and should read the same way either way.
    return (
      <button
        type="button"
        onClick={() => toggle(chip)}
        aria-pressed={on}
        className={
          on
            ? "rounded-full border border-teal bg-teal-soft/60 px-3 py-1.5 text-left text-sm text-ink shadow-sm"
            : "rounded-full border border-sand-deep bg-white px-3 py-1.5 text-left text-sm text-ink-soft transition hover:border-teal/60 hover:text-ink"
        }
      >
        {chip}
      </button>
    );
  }

  return (
    <div className="mt-4 rounded-2xl border border-teal/30 bg-teal-soft/25 p-4">
      <p className="font-display text-lg text-ink">Why? (Optional.)</p>
      <p className="mt-1 text-sm text-ink-soft">
        Tap any that fit. Each one gets saved as its own line on your
        Preferences page.
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
      <div className="mt-4">
        <label
          htmlFor="interview-own-words"
          className="section-label text-ink-soft"
        >
          Anything to add, in your own words
        </label>
        <textarea
          id="interview-own-words"
          rows={3}
          value={ownWords || ""}
          onChange={(e) => setOwnWords(e.target.value)}
          placeholder="Add a sentence about your reason, if you want."
          className="mt-2 w-full rounded-2xl border border-sand-deep bg-white p-3 text-ink placeholder:text-ink-faint focus:border-teal focus:outline-none"
        />
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
        <a href="/interview-check/proof" className="btn btn-primary">
          Continue to the proof screen
        </a>
        <a href="/interview-check" className="btn btn-ghost">
          Back to practice
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
// short strip of example chips sits underneath for somebody who freezes at the
// question, showing the kind of thing that belongs in the box; they are not
// tappable, because the answer has to be the family's own memory.
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

      {/* Chip-shaped, and deliberately not tappable. A favorite moment is the
          family's own memory, so pasting one of these in verbatim would put a
          stranger's sentence on the person's page and teach Aly something that
          never happened -- which is why there is no onClick here and these are
          spans rather than buttons.

          They keep the chip shape because that is what tells somebody at a
          glance that these are specimens of the answer rather than instructions
          about it: a run of short rounded phrases reads as "things of the kind
          you are being asked for" in a way that a bulleted list of sentences
          does not. The border is dashed and there is no hover state, so the
          shape says sample and the surface says do not press. */}
      {examples.length > 0 && (
        <div className="mt-1">
          <p className="section-label text-ink-soft">
            The kind of thing that goes here
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {examples.map((line) => (
              <span
                key={line}
                className="rounded-full border border-dashed border-sand-deep bg-white/60 px-3 py-1.5 text-left text-sm text-ink-soft"
              >
                {line}
              </span>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-faint">
            Examples, not options. Yours should be your own.
          </p>
        </div>
      )}
    </div>
  );
}
