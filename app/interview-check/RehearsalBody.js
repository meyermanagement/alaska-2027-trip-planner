"use client";

import { useEffect, useRef, useState } from "react";
import { slotLabel } from "@/lib/travelers/slots";

// How the interview is opened. The same words the Get to know button sends, so
// what happens here is what happens there.
function opener(name, self) {
  return self
    ? "Get to know me. Ask me the next thing you need."
    : `Get to know ${name}. Ask the next thing you need, and I will answer for ${name} or hand her the phone.`;
}

function Chips({ label, slots, tone }) {
  if (!slots || slots.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1">
      <span className="text-ink-soft">{label}</span>
      {slots.map((slot) => (
        <span
          key={slot}
          className="rounded-full px-1.5 py-0.5 text-[11px]"
          style={{ background: tone }}
        >
          {slotLabel(slot)}
        </span>
      ))}
    </span>
  );
}

/** Where the person stands after everything answered so far. */
function Standing({ standing, count }) {
  if (!standing) return null;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
      <span className="font-semibold text-ink">{standing.known}% known</span>
      <Chips
        label="answered"
        slots={standing.settled}
        tone="var(--color-teal-soft)"
      />
      <Chips
        label="asked"
        slots={standing.asking}
        tone="var(--color-sand-deep)"
      />
      <Chips
        label="left alone"
        slots={standing.skipped}
        tone="var(--color-sand-deep)"
      />
      {typeof count === "number" && count > 0 && (
        <span className="text-ink-soft">
          {count} {count === 1 ? "answer" : "answers"} so far
        </span>
      )}
    </div>
  );
}

/** One save, in the words the family would understand it by. */
function Call({ call }) {
  const a = call.args || {};
  const refused = Boolean(call.refused);
  const title =
    call.name === "add_preference"
      ? "Would save a preference"
      : call.name === "record_household_fact"
        ? "Would save a fact"
        : call.name === "set_slot_status"
          ? a.status === "skipped"
            ? "Would stop asking this"
            : "Would mark this answered"
          : call.name;
  return (
    <div
      className={`rounded-lg border p-2.5 text-xs ${
        refused ? "border-rose/40 bg-rose/5" : "border-teal/30 bg-teal/[0.04]"
      }`}
    >
      <p className="font-semibold text-ink">
        {title}
        {a.slot ? ` · ${slotLabel(a.slot)}` : ""}
      </p>
      {a.body && <p className="mt-1 text-ink">{a.body}</p>}
      {a.reason && <p className="mt-1 text-ink-soft">Because: {a.reason}</p>}
      {a.note && <p className="mt-1 text-ink-soft">Note: {a.note}</p>}
      {refused && (
        <p className="mt-1 font-semibold text-rose">Refused. {call.refused}</p>
      )}
    </div>
  );
}

/**
 * One exchange, in the order it happened.
 *
 * A turn is your answer, then what that answer would have been written down as,
 * then the next question. It was laid out the other way round at first -- the
 * question at the top of the card and the answer beneath it -- and that reads as
 * an answer to a question it comes before.
 */
function Turn({ turn, index, showSaid }) {
  return (
    <section className="card mt-4 p-4">
      {/* Turn one has no answer in it: what was "said" there is the app's own
          opening line, not anything the family typed. */}
      {showSaid && (
        <>
          <p className="section-label">Your answer</p>
          <p className="mt-1 rounded-lg bg-sand/60 p-2.5 text-sm text-ink">
            {turn.said}
          </p>
        </>
      )}
      {turn.calls?.length > 0 && (
        <div className={showSaid ? "mt-3 space-y-2" : "space-y-2"}>
          <p className="section-label">What that would have written down</p>
          {turn.calls.map((call, i) => (
            <Call call={call} key={i} />
          ))}
        </div>
      )}
      <div
        className={
          showSaid || turn.calls?.length
            ? "mt-3 border-t border-[var(--line)] pt-3"
            : ""
        }
      >
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <p className="section-label">Question {index}</p>
          <p className="text-[11px] text-ink-soft">
            {[
              turn.model,
              turn.seconds ? `${turn.seconds}s` : null,
              turn.handed
                ? `about ${slotLabel(turn.handed).toLowerCase()}`
                : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>
        <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink">
          {turn.reply}
        </p>
        {turn.wordless && (
          <p className="mt-1.5 text-xs text-rose">
            Those are not her words. The model came back with nothing at all,
            twice, and the line above is what the app says when it has lost a
            turn.
          </p>
        )}
        {!turn.wordless && !turn.reply.includes("?") && (
          <p className="mt-1.5 text-xs text-amber">
            No question in it, so nothing was marked as asked.
          </p>
        )}
        {turn.askedAgain && (
          <p className="mt-1.5 text-xs text-ink-soft">
            Came back as cards alone; the words above are the second attempt.
          </p>
        )}
        {turn.failed && <p className="mt-2 text-xs text-rose">{turn.failed}</p>}
      </div>
    </section>
  );
}

/**
 * An interview you answer yourself, that saves nothing.
 *
 * Aly asks with the real prompt, the real context and the real model, and every
 * save she attempts is shown where it happens instead of being written down. So
 * the questions can be read as questions -- are they the right ones, in the right
 * order, in words a twelve-year-old would answer -- and the saves can be read as
 * saves, without spending anybody's real file to find out.
 */
export default function RehearsalBody({ people = [], me = null }) {
  const [travelerId, setTravelerId] = useState(people[0]?.id || "");
  const [turns, setTurns] = useState([]);
  const [carried, setCarried] = useState(null);
  const [standing, setStanding] = useState(null);
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);
  const box = useRef(null);

  const person = people.find((p) => p.id === travelerId) || null;
  const first = person ? person.name.split(" ")[0] : "";
  const self = Boolean(person && me && person.id === me);
  const started = turns.length > 0;
  const waiting = started && !done;

  useEffect(() => {
    if (waiting && !busy) box.current?.focus();
  }, [waiting, busy, turns.length]);

  async function send(said) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/interview/rehearse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          travelerId,
          said,
          history: turns.flatMap((t) => [
            { role: "user", text: t.said },
            { role: "assistant", text: t.reply },
          ]),
          carried: carried || {},
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || "That did not work.");
      setTurns((all) => [...all, data.turn]);
      setCarried(data.carried);
      setStanding(data.standing);
      setAnswer("");
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function restart() {
    setTurns([]);
    setCarried(null);
    setStanding(null);
    setAnswer("");
    setError(null);
    setDone(false);
  }

  const wrote = carried || { preferences: [], facts: [] };
  const savedCount =
    (wrote.preferences?.length || 0) + (wrote.facts?.length || 0);

  return (
    <>
      {!started && (
        <div className="card mt-5 p-4">
          <label
            className="block text-sm font-semibold text-ink"
            htmlFor="who-answers"
          >
            Who is answering
          </label>
          <select
            id="who-answers"
            className="field mt-1.5"
            value={travelerId}
            onChange={(e) => setTravelerId(e.target.value)}
          >
            {people.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
          <p className="mt-3 text-sm text-ink-soft">
            Aly will ask one question at a time, starting from what she already
            knows about {self ? "you" : first}. Answer in your own words.
            Nothing you say here is saved.
          </p>
          <button
            type="button"
            className="btn btn-primary mt-3"
            disabled={busy || !travelerId}
            onClick={() => send(opener(first, self))}
          >
            {busy ? "Aly is thinking…" : "Ask me the first question"}
          </button>
          {error && <p className="mt-2 text-sm text-rose">{error}</p>}
        </div>
      )}

      {started && (
        <div className="card mt-5 p-4">
          <p className="section-label">
            {self ? "Where you stand" : `Where ${first} stands`}
          </p>
          <div className="mt-1.5">
            <Standing standing={standing} count={turns.length - 1} />
          </div>
          <p className="mt-2 text-sm text-ink-soft">
            {savedCount === 0
              ? "Nothing would have been written yet."
              : `${savedCount} ${
                  savedCount === 1 ? "thing" : "things"
                } would have been written. None of it was.`}
            {standing?.open?.length > 0 && (
              <>
                {" "}
                Still nothing on{" "}
                {standing.open
                  .slice(0, 5)
                  .map((slot) => slotLabel(slot).toLowerCase())
                  .join(", ")}
                {standing.open.length > 5
                  ? `, and ${standing.open.length - 5} more`
                  : ""}
                .
              </>
            )}
          </p>
          {done && (
            <p className="mt-2 text-sm text-ink-soft">
              To do this for real, press Get to know {self ? "me" : first} on
              the Family screen.
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {!done && (
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={() => setDone(true)}
                disabled={busy}
              >
                That is enough
              </button>
            )}
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={restart}
              disabled={busy}
            >
              Start again
            </button>
          </div>
        </div>
      )}

      {turns.map((turn, i) => (
        <Turn key={i} turn={turn} index={i + 1} showSaid={i > 0} />
      ))}

      {waiting && (
        <div className="card mt-4 p-4">
          <label
            className="block text-sm font-semibold text-ink"
            htmlFor="your-answer"
          >
            Your answer
          </label>
          <textarea
            id="your-answer"
            ref={box}
            className="field mt-1.5 min-h-[90px]"
            value={answer}
            placeholder="Say it the way you would say it out loud."
            onChange={(e) => setAnswer(e.target.value)}
            onKeyDown={(e) => {
              if (
                e.key === "Enter" &&
                (e.metaKey || e.ctrlKey) &&
                answer.trim()
              )
                send(answer.trim());
            }}
          />
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busy || !answer.trim()}
              onClick={() => send(answer.trim())}
            >
              {busy ? "Aly is thinking…" : "Answer"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() => send("Skip this one, I don't care.")}
            >
              Skip this one
            </button>
          </div>
          {error && <p className="mt-2 text-sm text-rose">{error}</p>}
        </div>
      )}
    </>
  );
}
