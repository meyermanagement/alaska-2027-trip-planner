"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

import CompassLoader from "@/components/CompassLoader";
import {
  INTERVIEW_QUESTIONS,
  questionFor,
  optionLabels,
} from "@/lib/travelers/interview";
import {
  personalizationContext,
  personalizeReasons,
} from "@/lib/travelers/interviewPersonalize";
import { suggestionKey, whysAfterUntick } from "@/lib/travelers/interviewChips";
import {
  BAND_MIN,
  BAND_MAX,
  BAND_STEP,
  BAND_MIN_SPAN,
  bandSentence,
  formatClock,
  normalizeBand,
  parseBandNote,
} from "@/lib/travelers/dayBand";
import { inferAnswer } from "@/lib/travelers/interviewInference";
import { summaryForAnswer } from "@/lib/travelers/runningSummary";
import { patchRun, readRun, runToStandIn } from "@/lib/practice/session";
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
// The two shapes whose answer is a list of option values rather than one:
// the ranked question, where the order carries the answer, and the multi
// questions, where the ticks do and the first one decides whose reason chips
// are offered.
const LIST_KINDS = ["rank", "multi"];

const BLANK_FIELDS = {
  choice: "",
  text: "",
  whys: [],
  ownWords: "",
  moments: [""],
  order: [],
  // The day band's two hours, or null on every other question. Null rather
  // than the question's default so the form can tell "nothing on file" from
  // "the family agreed with the default", which is the difference between a
  // question that still needs answering and one that has been answered.
  band: null,
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
      order: [],
    };
  }
  // A ranked answer, and a multi answer, are both recorded as a list of
  // option LABELS -- ordered on the ranked question, in the order they were
  // tapped on a multi one, where only the first tap means anything.
  //
  // same way moments records a list of strings, and is read back to option
  // values here. A label that no longer matches any option -- the question
  // was reworded since the answer was given -- is dropped rather than
  // guessed at, which can leave a shorter order or none at all. That is the
  // same rule the single-pick branch above follows, and for the same reason:
  // a control claiming somebody ranked something they never saw is worse
  // than a control that asks again.
  if (question.kind === "rank" || question.kind === "multi") {
    const labels = Array.isArray(priorAnswer.picked) ? priorAnswer.picked : [];
    const values = [];
    for (const label of labels) {
      const opt = (question.options || []).find((o) => o.label === label);
      if (opt && !values.includes(opt.value)) values.push(opt.value);
    }
    return {
      choice: "",
      text: "",
      whys: Array.isArray(priorAnswer.whys) ? priorAnswer.whys : [],
      ownWords:
        typeof priorAnswer.ownWords === "string" ? priorAnswer.ownWords : "",
      moments: [""],
      order: values,
    };
  }
  // A band answer is recorded as the phrase it was saved as -- "7:30 am to 9
  // pm" -- and read back into two handles here. A phrase that no longer parses
  // leaves the handles at the default, the same rule the option branches
  // follow: asking again beats showing an answer nobody gave.
  if (question.kind === "band") {
    return {
      ...BLANK_FIELDS,
      band:
        typeof priorAnswer.picked === "string"
          ? parseBandNote(priorAnswer.picked)
          : null,
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
      order: [],
    };
  }
  // text
  return {
    choice: "",
    text: typeof priorAnswer.picked === "string" ? priorAnswer.picked : "",
    whys: [],
    ownWords: "",
    moments: [""],
    order: [],
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
  // The tapped option values, for the two shapes that collect more than one:
  // the ranked question, where the order is the answer, and the multi ones,
  // where it is a set and only the first tap is privileged (it decides which
  // option's reason chips are offered). One state rather than two because the
  // shape is the same -- a list of option values in the order they were
  // tapped -- and every save path, every Back, and every pre-fill would
  // otherwise be written twice.
  const [order, setOrder] = useState([]);
  // The day band's hours, null until the family moves a handle or an earlier
  // answer is read back in. The control shows the question's default while
  // this is null, and Save stays out of reach until it is not: a family that
  // never touched the handles has not told us their hours, and writing eight
  // in the morning to ten at night because that is where the control opened
  // would be the app answering its own question.
  const [band, setBand] = useState(null);
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
      // A ranked answer's first place is the value the inference rules read:
      // "they protect the room first" is the same claim the single-pick
      // version of this question used to make, and the rules downstream were
      // written against that claim.
      const pickedLabel = Array.isArray(answer.picked)
        ? answer.picked[0]
        : answer.picked;
      const opt = (question?.options || []).find(
        (o) => o.label === pickedLabel,
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

  // What the About-you paragraph already settles about this question, checked
  // against the options this question actually offers. A prior whose value is
  // not one of them -- a model that answered with a label, a question whose
  // options were reworded since the paragraph was read -- is dropped rather
  // than pre-picking nothing and leaving a card claiming otherwise.
  // Practice runs on the same paragraph, read from the practice run rather
  // than the database. Nothing was saved when it was typed, so nothing was
  // extracted then either; the route below reads the paragraph and returns the
  // priors without storing anything. Fetched once per mount, because the
  // paragraph cannot change while the interview is on screen.
  const [practicePriors, setPracticePriors] = useState(null);
  useEffect(() => {
    if (mode !== "practice") return;
    const paragraph = (readRun()?.aboutMe || "").trim();
    if (!paragraph) return;
    let live = true;
    (async () => {
      try {
        const res = await fetch("/api/about-you/priors", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ paragraph }),
        });
        if (!res.ok) return;
        const json = await res.json();
        if (live && json?.priors && typeof json.priors === "object") {
          setPracticePriors(json.priors);
        }
      } catch {
        // A rehearsal that cannot reach the model asks its questions cold.
      }
    })();
    return () => {
      live = false;
    };
  }, [mode]);

  const priorsInPlay =
    mode === "practice" ? practicePriors || {} : aboutMePriors;

  const aboutMePrior = useMemo(() => {
    const prior = priorsInPlay && priorsInPlay[slot];
    if (!prior?.value) return null;
    const question = questionFor(slot);
    if (question?.kind !== "options" && !LIST_KINDS.includes(question?.kind))
      return null;
    const opt = (question.options || []).find((o) => o.value === prior.value);
    if (!opt) return null;
    return { ...prior, label: opt.label };
  }, [priorsInPlay, slot]);

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
        setOrder(fields.order);
        setBand(fields.band);
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

  // A question the app already knows the answer to arrives with its option
  // picked, so agreeing is one tap on Save and continue rather than a pick and
  // then a tap. Two sources, in order: the About-you paragraph, where the
  // primary wrote the answer in their own words, and then anything worked out
  // from earlier answers in this interview.
  //
  // Each source is applied once per question, so a primary who picks something
  // else does not have the pre-pick put back on the next render. They are
  // tracked apart because the paragraph can land late -- in practice mode it
  // arrives from a fetch after the first question is already on screen -- and
  // when it does it is allowed to replace an untouched worked-out pick. It is
  // never allowed to replace an answer somebody gave: touched, or a pick
  // restored by stepping back to a question already answered, both stand.
  const preFilledFor = useRef(null);
  const aboutFilledFor = useRef(null);
  useEffect(() => {
    if (!inferred?.value) return;
    if (preFilledFor.current === slot) return;
    preFilledFor.current = slot;
    if (LIST_KINDS.includes(questionFor(slot)?.kind)) {
      // A worked-out answer on a ranked or multi question arrives as one
      // value and nothing else, because that is all the rules claim to know:
      // first place, or one thing they would book. The rest of the list stays
      // empty for the primary to fill in or leave alone.
      setOrder((current) => (current.length ? current : [inferred.value]));
    } else {
      setChoice((current) => current || inferred.value);
    }
    setTouched(false);
  }, [inferred, slot]);
  useEffect(() => {
    if (!aboutMePrior?.value) return;
    if (aboutFilledFor.current === slot) return;
    if (touched) return;
    aboutFilledFor.current = slot;
    if (LIST_KINDS.includes(questionFor(slot)?.kind)) {
      setOrder((current) =>
        !current.length ||
        (current.length === 1 && current[0] === inferred?.value)
          ? [aboutMePrior.value]
          : current,
      );
    } else {
      setChoice((current) =>
        !current || current === inferred?.value ? aboutMePrior.value : current,
      );
    }
  }, [aboutMePrior, inferred, slot, touched]);

  // A question is only "worked out" while the pre-picked option is still the
  // one showing and nothing has been touched. Changing the answer and changing
  // it back counts as saying it, which is the honest reading.
  // The About-you paragraph is a more direct source than anything worked out
  // from other answers -- the primary wrote the sentence themselves -- so when
  // that card is already explaining this question, the worked-out card stays
  // out of the way rather than stacking a second explanation above the same
  // prompt. The pick still stands; only the second card is suppressed.
  const aboutMeCovers = Boolean(aboutMePrior);
  // The one answer both the pre-fill cards and the reason chips talk about.
  // On a ranked question that is whatever sits in first place, on a multi one
  // the first thing tapped -- the reasons for protecting the room, or for
  // booking the rental, are the reasons that pick carries -- and on every
  // other question it is simply the pick.
  const pickedValue =
    question?.kind === "rank" || question?.kind === "multi"
      ? order[0] || ""
      : choice;

  const confirmingAboutMe = Boolean(
    aboutMePrior && !touched && pickedValue === aboutMePrior.value,
  );
  const confirmingInference = Boolean(
    inferred &&
    !touched &&
    !confirmingAboutMe &&
    pickedValue === inferred.value,
  );

  // Every choice the primary makes by hand, so the pre-picked option can stop
  // claiming to be worked out the moment they disagree with it.
  const pickChoice = useCallback((value) => {
    setTouched(true);
    setChoice(value);
  }, []);

  // Tap to add, tap again to take back out. On the ranked question the list
  // is the answer, so a tap appends and stamps the next number and removing
  // one moves everything below it up a place; nothing is dragged, so the
  // control works with a thumb, a keyboard and a screen reader alike, which a
  // drag handle on a phone does not.
  //
  // On a multi question the same list is a set with a cap. At the cap a tap on
  // an unticked card does nothing rather than silently dropping the oldest
  // tick: a control that quietly changes an answer somebody already gave is
  // worse than one that declines and says why, and the panel says why
  // directly under the cards.
  //
  // Taking a tick back also takes back the reasons that belonged to it. The
  // chips a family taps are saved as their own preference rows, so a reason
  // tapped under the rental would otherwise still be written after the rental
  // was unticked -- a line on the Preferences page explaining an answer the
  // family no longer gives. Only reasons that trace to the removed option and
  // to none of the remaining ticks are dropped; a chip both ticked options
  // happen to carry stays, and the question's neutral chips belong to no
  // option and are never touched.
  //
  // Aly's follow-ups are pruned with them: a follow-up was generated from one
  // hand-written chip and is reachable only while that chip is on screen, so
  // it goes when its parent does. The ranked question is not pruned because it
  // shows no chips at all; if one ever does, first place changing would need
  // the same treatment.
  const toggleTapped = useCallback(
    (value) => {
      setTouched(true);
      const cap = question?.kind === "multi" ? question.max || 0 : 0;
      if (order.includes(value) && question?.kind === "multi") {
        setWhys((prev) =>
          whysAfterUntick({
            question,
            removed: value,
            remaining: order.filter((v) => v !== value),
            whys: prev,
            context: live,
            cacheGet: (key) => suggestionCache.current.get(key),
          }),
        );
      }
      setOrder((current) => {
        if (current.includes(value)) return current.filter((v) => v !== value);
        if (cap && current.length >= cap) return current;
        return [...current, value];
      });
    },
    [question, order, live],
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
    // One ranked item is an answer. Somebody who taps the room and stops has
    // told us the thing that matters most, and refusing to save until all
    // four are ordered would be asking them to invent three opinions.
    if (question?.kind === "rank" || question?.kind === "multi") {
      return order.length > 0;
    }
    if (question?.kind === "band") {
      return Boolean(normalizeBand(band));
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
    const isRank = question.kind === "rank";
    const isMulti = question.kind === "multi";
    const isBand = question.kind === "band";
    const isList = isRank || isMulti;
    const pickedLabels = isList ? optionLabels(question, order) : [];
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
    const wantsWhys = isBand
      ? Boolean(band)
      : isList
        ? order.length > 0
        : question.kind === "options" && choice && choice !== "other";
    const cleanedWhys = wantsWhys
      ? whys.map((w) => (w || "").trim()).filter(Boolean)
      : [];
    const cleanedOwnWords = wantsWhys ? ownWords.trim() : "";
    const record = {
      slot,
      label: question.label,
      kind: question.kind,
      action: "answer",
      picked: isBand
        ? bandSentence(band)
        : isList
          ? pickedLabels.length > 0
            ? pickedLabels
            : null
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
              // The ranked order, best-protected first, as option values,
              // sent only by the money question. The ticked options, in the
              // order they were tapped, sent only by the multi questions.
              // Every other question sends both empty and the route ignores
              // them.
              order: isRank ? order : [],
              picks: isMulti ? order : [],
              // The two hours, sent only by the day band. The route stores the
              // phrase it derives from them, never these numbers, so the row
              // reads as an answer rather than as a pair of integers.
              band: isBand ? normalizeBand(band) : null,
              whys: cleanedWhys,
              ownWords: cleanedOwnWords,
              // Tells the answer route this was worked out from earlier
              // answers and agreed to rather than said outright, so the
              // preference row is stored as derived and carries the sentence
              // explaining where it came from.
              // A pick agreed to rather than made counts as derived either
              // way; only the sentence differs, because "you wrote this" and
              // "we worked this out" are not the same claim about the file.
              derived: confirmingInference || confirmingAboutMe,
              derivedBecause: confirmingAboutMe
                ? `You said it on About you: “${aboutMePrior.quote}”`
                : confirmingInference
                  ? inferred.because
                  : null,
            }),
          });
      if (res.ok) remember();
      return res.ok;
    } catch {
      return false;
    }
  }, [
    aboutMePrior,
    band,
    choice,
    confirmingAboutMe,
    confirmingInference,
    hasAnswer,
    inferred,
    mode,
    moments,
    order,
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
        setError("I could not save that answer. Try again.");
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
      setOrder(fields.order);
      setBand(fields.band);
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
      const isRank = question.kind === "rank";
      const isMulti = question.kind === "multi";
      const isBand = question.kind === "band";
      const isList = isRank || isMulti;
      const pickedLabels =
        isList && action !== "skip" ? optionLabels(question, order) : [];
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
      const wantsWhys =
        action !== "skip" &&
        (isBand
          ? Boolean(band)
          : isList
            ? order.length > 0
            : question.kind === "options" && choice && choice !== "other");
      const cleanedWhys = wantsWhys
        ? whys.map((w) => (w || "").trim()).filter(Boolean)
        : [];
      const cleanedOwnWords = wantsWhys ? ownWords.trim() : "";
      const record = {
        slot,
        label: question.label,
        kind: question.kind,
        action,
        picked:
          action === "skip"
            ? null
            : isBand
              ? bandSentence(band)
              : isList
                ? pickedLabels.length > 0
                  ? pickedLabels
                  : null
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
          (question.kind === "options" || isList)
        ) {
          setLoading(false);
          setError(
            isRank
              ? "Tap at least one of these in the order you would protect it."
              : isMulti
                ? "Tick at least one of these."
                : "Pick one of these, or type what fits better.",
          );
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
                order: action === "skip" || !isRank ? [] : order,
                picks: action === "skip" || !isMulti ? [] : order,
                band: isBand ? normalizeBand(band) : null,
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
              payload?.error || "I could not save that answer. Try again.",
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
            // a difference they can read. From there the button on the proof
            // screen carries them into the trip builder.
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
          setError("Something on my end got in the way. Try again.");
        }, wait);
      }
    },
    [
      advance,
      band,
      choice,
      index,
      loading,
      mode,
      moments,
      order,
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
            <CompassLoader size={72} label="Working out what to ask next." />
            <p className="text-sm text-ink-soft">One moment.</p>
          </div>
        ) : (
          <div className="w-full">
            {/* No standing honesty note above the first question. There used
              to be one -- "Only tick what is actually true", with a paragraph
              about over-specific answers -- and it was wrong in two ways at
              once. It appeared above the pace question, which is a single pick
              with nothing to tick, so the one instruction it gave described a
              control that was not on the screen. And where ticking is real the
              multi panel already says it under the cards, live, with the count
              and with the better version of the warning: what you leave out I
              will not lead with, rather than rule out. A preamble that repeats
              a contextual line is the copy people learn to skip, and it pushed
              the actual question five lines down a phone. The guidance stays;
              it lives where the ticking happens. */}
            {aboutMePrior && (
              <div className="mb-4 rounded-2xl border border-teal/30 bg-teal-soft/25 px-4 py-3 text-sm leading-relaxed text-ink-soft">
                <p className="font-display text-ink">
                  You told me this on About you.
                </p>
                <p className="mt-1 italic">
                  &ldquo;{aboutMePrior.quote}&rdquo;
                </p>
                <p className="mt-2">
                  {question?.kind === "rank"
                    ? `So I have put ${aboutMePrior.label} first below. Save and continue to agree, tap another card to put it first, or `
                    : question?.kind === "multi"
                      ? `So I have ticked ${aboutMePrior.label} below. Save and continue to agree, tick another that is also true, or `
                      : `So I have picked ${aboutMePrior.label} below. Save and continue to agree, pick another if I have it wrong, or `}
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
                    : "I think I can guess this one."}
                </p>
                <p className="mt-1">{inferred.because}</p>
                <p className="mt-2">
                  {question?.kind === "rank"
                    ? inferred.strength === "sure"
                      ? "So I have put it first below. Save and continue to agree, or tap the cards in the order you would actually protect them."
                      : "So I have put it first below as a guess. Save and continue to agree, or tap the cards in the order you would actually protect them."
                    : question?.kind === "multi"
                      ? inferred.strength === "sure"
                        ? "So I have ticked it below. Save and continue to agree, or tick whichever ones are actually true."
                        : "So I have ticked it below as a guess. Save and continue to agree, or tick whichever ones are actually true."
                      : inferred.strength === "sure"
                        ? "So I have picked it below. Save and continue to agree, or pick another if I have it wrong."
                        : "So I have picked it below as a guess. Save and continue to agree, or pick another if I have it wrong."}
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
            ) : question.kind === "rank" ? (
              <div className="mt-6 flex flex-col gap-3">
                <RankPanel
                  question={question}
                  order={order}
                  onTap={toggleTapped}
                  clearRank={() => {
                    setTouched(true);
                    setOrder([]);
                  }}
                />
                {pickedValue && (
                  <WhyPanel
                    choice={pickedValue}
                    question={question}
                    whys={whys}
                    setWhys={setWhys}
                    ownWords={ownWords}
                    setOwnWords={setOwnWords}
                    cache={suggestionCache}
                    context={live}
                  />
                )}
              </div>
            ) : question.kind === "multi" ? (
              <div className="mt-6 flex flex-col gap-3">
                <MultiPanel
                  question={question}
                  order={order}
                  onTap={toggleTapped}
                />
                {pickedValue && (
                  <WhyPanel
                    choice={pickedValue}
                    choices={order}
                    question={question}
                    whys={whys}
                    setWhys={setWhys}
                    ownWords={ownWords}
                    setOwnWords={setOwnWords}
                    cache={suggestionCache}
                    context={live}
                  />
                )}
              </div>
            ) : question.kind === "band" ? (
              <div className="mt-6 flex flex-col gap-3">
                <DayBandPanel
                  question={question}
                  band={band}
                  onChange={(next) => {
                    setTouched(true);
                    setBand(next);
                  }}
                />
                <WhyPanel
                  choice=""
                  question={question}
                  whys={whys}
                  setWhys={setWhys}
                  ownWords={ownWords}
                  setOwnWords={setOwnWords}
                  cache={suggestionCache}
                  context={live}
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
                    : LIST_KINDS.includes(question.kind)
                      ? order.length === 0
                      : question.kind === "band"
                        ? !band
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
          <p className="section-label text-ink-soft">What I know so far</p>
          <p className="mt-1 text-xs leading-relaxed text-ink-soft">
            One line every time you answer, saying what I will do about it.
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

// How many hand-written chips the primary row shows at once. One option's
// worth is three, so a single pick is never trimmed; a question that takes
// three ticks would otherwise reach nine chips, which on a phone is nine
// stacked lines between the question and the box where the family types the
// part the chips cannot say. The share is split evenly across the ticks
// rather than taken off the top, so the last option ticked is represented
// instead of scrolled away.
const PRIMARY_CAP = 6;

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

// Counts read as words in a sentence, because "2 ordered" in the middle of a
// line of prose reads like a field value rather than something Aly said.
const COUNT_WORDS = ["none", "one", "two", "three", "four", "five"];

// The same count word, capitalized, for the places where it opens a sentence.
// Both list panels say "Two ticked" and "Two ordered" at the start of their
// status line, and a lowercase word there reads like the line lost its first
// half. Mid-sentence uses COUNT_WORDS directly.
function countWordCap(n) {
  const word = COUNT_WORDS[n] || String(n);
  return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
}

// The multi questions -- where the family sleeps, what the family eats --
// where a single pick was making people lie. A household that books a hotel
// in a city and a rental by the sea has two answers, and a week of dinners is
// a rotation rather than one kind of restaurant.
//
// Ticks rather than numbers, because unlike the money question the order here
// means nothing to the answer. It means one thing to the screen: the first
// card tapped is the one whose reasons open underneath, so the drawer is one
// drawer instead of three.
//
// The cap is the point of the shape. Without it a family ticks everything and
// the answer says nothing, so at the cap the untapped cards go quiet and stop
// responding rather than silently pushing out an earlier tick -- a control
// that changes an answer somebody already gave, without being asked, is worse
// than one that declines. The line under the cards says which it is doing.
function MultiPanel({ question, order, onTap }) {
  const options = question.options || [];
  const max = question.max || options.length;
  const picked = order.filter((value) =>
    options.some((o) => o.value === value),
  );
  const atCap = picked.length >= max;
  const remaining = Math.max(0, max - picked.length);

  return (
    <div>
      <ul className="flex list-none flex-col gap-3 p-0">
        {options.map((opt) => {
          const isPicked = picked.includes(opt.value);
          const isQuiet = atCap && !isPicked;
          return (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => onTap(opt.value)}
                aria-pressed={isPicked}
                aria-disabled={isQuiet}
                aria-label={
                  isPicked
                    ? `${opt.label}, ticked. Tap to take it out.`
                    : isQuiet
                      ? `${opt.label}. Take one of the others out first.`
                      : `${opt.label}. Tap to tick it.`
                }
                className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
                  isPicked
                    ? "border-teal bg-teal-soft/50 shadow-sm"
                    : isQuiet
                      ? "border-sand-deep bg-white opacity-50"
                      : "border-sand-deep bg-white hover:border-teal/50"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border font-display text-sm ${
                    isPicked
                      ? "border-teal bg-teal text-white"
                      : "border-sand-deep text-ink-faint"
                  }`}
                >
                  {isPicked ? "✓" : ""}
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-lg text-ink">
                    {opt.label}
                  </span>
                  {opt.detail && (
                    <span className="mt-1 block text-sm text-ink-soft">
                      {opt.detail}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-3 text-sm text-ink-soft" aria-live="polite">
        {picked.length === 0
          ? `Tick the ones that are actually true, up to ${COUNT_WORDS[max] || max}.`
          : atCap
            ? `${countWordCap(picked.length)} ticked, which is as many as I can use here. Tap one to take it out and swap it.`
            : `${countWordCap(picked.length)} ticked, and room for ${COUNT_WORDS[remaining] || remaining} more. What you leave out I will not lead with, rather than rule out.`}
      </p>
    </div>
  );
}

// The ranking control, used by the money question and nothing else.
//
// Tap-in-order rather than drag. Dragging is the control this question keeps
// suggesting to people -- the answer really is an order, and an order looks
// like something you should be able to shove around -- but a drag is the
// least reachable control there is: it needs a pointer that stays down, it
// has no keyboard equivalent without writing one, and touch drag on iOS
// Safari is not the same feature as the drag-and-drop the desktop browsers
// implement. Tapping in order costs one tap per card, works with a thumb, a
// keyboard and a screen reader alike, and is undoable one card at a time.
//
// Numbers, not arrows: the card carries the place it is in, so the order is
// readable without counting down the column. Tapping a numbered card removes
// it and the cards below it move up, which is the only edit anybody wants
// from a four-item list -- a "move up one" affordance on a list this short is
// three controls where one will do.
//
// A card left untapped is unranked, and the panel says so under the list
// rather than letting the blank space imply "last". That distinction is the
// reason this question stopped being a single pick.
// The day band. Two handles on one track: the hour the family is out the door
// and the hour their day is over.
//
// The readout above the track is the answer in words -- "7:30 am to 9 pm" --
// because that is what gets saved, and a control whose stored answer the user
// never sees is a control they cannot check. The hour it says out loud is the
// hour on the row.
//
// Neither handle can cross the other, and neither can push the day below the
// question's minimum span. That used to be enforced by narrowing each input's
// own bounds -- the start input's max was the end minus the span -- which was
// wrong in a way that only shows up when you drag it: a native range thumb
// sits at (value - min) / (max - min) of its track, so moving one handle
// changed the OTHER input's range and slid its thumb across the screen while
// the hour it stood for never moved. Both handles appeared to move whichever
// one you dragged.
//
// So both inputs now run the full width of the day, and the span is enforced
// in the change handler by clamping: drag the end handle down into the start
// and it stops four hours away from it, with the start handle left exactly
// where it was. One handle moves, and it is the one under the finger.
function DayBandPanel({ question, band, onChange }) {
  const min = question.min ?? BAND_MIN;
  const max = question.max ?? BAND_MAX;
  const step = question.step ?? BAND_STEP;
  const span = question.minSpan ?? BAND_MIN_SPAN;
  const value = normalizeBand(band) || normalizeBand(question.default);
  const { start, end } = value;
  const pct = (minutes) => ((minutes - min) / (max - min)) * 100;
  // A native range thumb travels between half a thumb-width from each end of
  // the input, not the full width, so a filled segment placed at a plain
  // percentage of the track drifts away from the handle it is supposed to
  // start at -- outside it near the ends, which reads as a rendering fault.
  // These two offsets put the segment on the same travel the thumbs are on.
  const THUMB = 28;
  const railLeft = (minutes) =>
    `calc(${pct(minutes)}% - ${(pct(minutes) / 100) * THUMB - THUMB / 2}px)`;
  const railRight = (minutes) => {
    const rest = 100 - pct(minutes);
    return `calc(${rest}% - ${(rest / 100) * THUMB - THUMB / 2}px)`;
  };
  const hours = (end - start) / 60;
  // The marks under the track. Four is enough to read the scale by and few
  // enough to keep their labels off each other at 320px.
  const marks = [min, 720, 1080, max];

  return (
    <div className="mt-6">
      <p className="font-display text-2xl text-ink">
        {formatClock(start)} <span className="text-ink-soft">to</span>{" "}
        {formatClock(end)}
      </p>
      <p className="mt-1 text-sm text-ink-soft">
        {hours % 1 === 0 ? hours : hours.toFixed(1)} hours
        {question.hint ? ` \u00b7 ${question.hint}` : ""}
      </p>

      <div className="relative mt-5 h-11">
        <div className="absolute inset-x-0 top-1/2 h-2 -translate-y-1/2 rounded-full bg-sand-deep/70" />
        <div
          className="absolute top-1/2 h-2 -translate-y-1/2 rounded-full bg-teal"
          style={{ left: railLeft(start), right: railRight(end) }}
        />
        <input
          type="range"
          className="band-input"
          min={min}
          max={max}
          step={step}
          value={start}
          onChange={(e) =>
            onChange({
              start: Math.min(Number(e.target.value), end - span),
              end,
            })
          }
          aria-label={question.startLabel || "The day starts"}
          aria-valuetext={formatClock(start)}
        />
        <input
          type="range"
          className="band-input"
          min={min}
          max={max}
          step={step}
          value={end}
          onChange={(e) =>
            onChange({
              start,
              end: Math.max(Number(e.target.value), start + span),
            })
          }
          aria-label={question.endLabel || "The day ends"}
          aria-valuetext={formatClock(end)}
        />
      </div>

      {/* The marks are placed on the same travel as the handles rather than
          spread evenly, because evenly spaced marks put noon a third of the way
          along a band that runs from five in the morning to one at night, and a
          scale that lies about where noon is makes the handles look wrong. */}
      <div className="relative mt-2 h-4 text-xs text-ink-faint">
        {marks.map((mark) => (
          <span
            key={mark}
            className="absolute -translate-x-1/2 whitespace-nowrap"
            style={{ left: railLeft(mark) }}
          >
            {formatClock(mark)}
          </span>
        ))}
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <p className="rounded-xl border border-sand-deep bg-white p-3 text-sm text-ink-soft">
          <span className="block text-xs uppercase tracking-wide text-ink-faint">
            {question.startLabel || "The day starts"}
          </span>
          <span className="mt-1 block font-display text-lg text-ink">
            {formatClock(start)}
          </span>
        </p>
        <p className="rounded-xl border border-sand-deep bg-white p-3 text-sm text-ink-soft">
          <span className="block text-xs uppercase tracking-wide text-ink-faint">
            {question.endLabel || "The day ends"}
          </span>
          <span className="mt-1 block font-display text-lg text-ink">
            {formatClock(end)}
          </span>
        </p>
      </div>
    </div>
  );
}

function RankPanel({ question, order, onTap, clearRank }) {
  const options = question.options || [];
  const ranked = order.filter((value) =>
    options.some((o) => o.value === value),
  );
  const unranked = options.filter((o) => !ranked.includes(o.value));

  return (
    <div>
      <ol className="flex list-none flex-col gap-3 p-0">
        {options.map((opt) => {
          const place = ranked.indexOf(opt.value);
          const isRanked = place >= 0;
          return (
            <li key={opt.value}>
              <button
                type="button"
                onClick={() => onTap(opt.value)}
                aria-pressed={isRanked}
                aria-label={
                  isRanked
                    ? `${opt.label}, number ${place + 1}. Tap to take it out of the order.`
                    : `${opt.label}. Tap to put it next in the order.`
                }
                className={`flex w-full items-start gap-3 rounded-2xl border p-4 text-left transition ${
                  isRanked
                    ? "border-teal bg-teal-soft/50 shadow-sm"
                    : "border-sand-deep bg-white hover:border-teal/50"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-display text-sm ${
                    isRanked
                      ? "border-teal bg-teal text-white"
                      : "border-sand-deep text-ink-faint"
                  }`}
                >
                  {isRanked ? place + 1 : ""}
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-lg text-ink">
                    {opt.label}
                  </span>
                  {opt.detail && (
                    <span className="mt-1 block text-sm text-ink-soft">
                      {opt.detail}
                    </span>
                  )}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-ink-soft">
        <p aria-live="polite">
          {ranked.length === 0
            ? "Nothing ordered yet. Tap the one you would protect first."
            : unranked.length === 0
              ? "All four ordered. Tap a card to take it back out."
              : `${countWordCap(ranked.length)} ordered. I will treat the ${
                  unranked.length === 1
                    ? "other one"
                    : `other ${COUNT_WORDS[unranked.length] || unranked.length}`
                } as no strong feeling, not as last.`}
        </p>
        {ranked.length > 0 && (
          <button
            type="button"
            onClick={clearRank}
            className="underline underline-offset-4 hover:text-ink"
          >
            Start the order again
          </button>
        )}
      </div>
    </div>
  );
}

function WhyPanel({
  choice,
  choices,
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
  //
  // `choice` is the one answer the chips used to hang off. On a question that
  // takes several ticks, `choices` carries all of them in tick order and every
  // ticked option contributes its own reasons: a family that ticked the rental
  // and the hotel has two reasons to explain, and showing only the first one's
  // chips told them the second tick did not count. Deduped by SIGNATURE across
  // ticks, because two options on the same question can carry reasons that
  // plan the same day in different words, and the same chip twice in one row
  // reads like a bug.
  //
  // The base suggestions ship with the question, hand-written in a family
  // voice. personalizeReasons swaps the stock "the kids" and "we" tokens for
  // the family's actual names when we know them, so the chip reads as if Aly
  // knew who she was writing to rather than a stock questionnaire.
  //
  // The owner map records which ticked option each chip came from, so a
  // follow-up request asks about the right option rather than about whichever
  // one happened to be ticked first.
  const { primary, chipOwners } = useMemo(() => {
    const chosen = (
      Array.isArray(choices) && choices.length > 0 ? choices : [choice]
    ).filter(Boolean);
    const share = Math.max(
      1,
      Math.ceil(PRIMARY_CAP / Math.max(1, chosen.length)),
    );
    const seen = new Set();
    const list = [];
    const owners = new Map();
    for (const value of chosen) {
      const opt = (question.options || []).find((o) => o.value === value);
      let taken = 0;
      for (const chip of personalizeReasons(
        (opt && opt.reasons) || [],
        context,
      )) {
        if (taken >= share) break;
        const sig = signatureOf(chip);
        if (!sig || seen.has(sig)) continue;
        seen.add(sig);
        list.push(chip);
        owners.set(chip.toLowerCase(), value);
        taken += 1;
      }
    }
    return { primary: list, chipOwners: owners };
  }, [question, choices, choice, context]);

  // A question can ship with no reason chips at all -- the money question does,
  // because chips on an ordered answer would look like they explained the whole
  // order. That question still wants the own-words box, so the panel drops to
  // the box alone rather than disappearing, and drops the chip instructions
  // with it: there is nothing left to tap.
  const hasChips = primary.length > 0;

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

  const keyFor = useCallback(
    (chip) => suggestionKey(question.slot, chip),
    [question.slot],
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
              // The option this chip belongs to, which on a several-tick
              // question is not always the first one ticked.
              choice: chipOwners.get(chip.toLowerCase()) || choice,
              chip,
              // Every chip already on screen, so a follow-up cannot arrive
              // saying what the row beside it says. The server only knows the
              // reasons of one option; the row can be showing three options'
              // worth.
              showing: primary,
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
  }, [
    pickedPrimary,
    pendingKeys,
    cache,
    choice,
    chipOwners,
    primary,
    keyFor,
    question.slot,
  ]);

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
      {hasChips && (
        <p className="mt-1 text-sm text-ink-soft">
          Tap any that fit. I save each one as its own line on your Preferences
          page.
        </p>
      )}
      {hasChips && (
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
      <div className={hasChips ? "mt-4" : "mt-3"}>
        <label
          htmlFor="interview-own-words"
          className={hasChips ? "section-label text-ink-soft" : "sr-only"}
        >
          Anything to add, in your own words
        </label>
        <textarea
          id="interview-own-words"
          rows={3}
          value={ownWords || ""}
          onChange={(e) => setOwnWords(e.target.value)}
          placeholder={
            hasChips
              ? "Add a sentence about your reason, if you want."
              : "A sentence about why, if you want. I save it as its own line on your Preferences page."
          }
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
        What I would have learned
      </h1>
      <p className="mt-2 text-ink-soft">
        Nothing was saved. This is what I would have written down if that had
        been the real interview.
      </p>

      <section className="mt-8">
        <h2 className="font-display text-xl text-ink">
          Answered ({answered.length})
        </h2>
        {answered.length === 0 ? (
          <p className="mt-2 text-ink-soft">You answered nothing.</p>
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
                      <li key={i} className="flex gap-2">
                        {/* A ranked answer is a sequence, so the recap has to
                          number it. Moments are a set and take a bullet. */}
                        <span className="text-ink-soft">
                          {a.kind === "rank" ? `${i + 1}.` : "\u2022"}
                        </span>
                        <span>{line}</span>
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
        I also ask about the shape of the household on the welcome form, and for
        a paragraph about each person on About you. You can rehearse both from
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
