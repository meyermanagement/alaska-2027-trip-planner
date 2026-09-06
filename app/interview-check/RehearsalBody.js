"use client";

import { useState } from "react";
import { slotLabel } from "@/lib/travelers/slots";

// The answers the first real run used, so the page opens on something worth
// pressing rather than an empty box. They are deliberately awkward: one is a
// refusal, one is "both, honestly", and one answers a question that was not
// asked -- which is how the faults were found in the first place.
const SUGGESTED = [
  "Aly, get to know me. Ask me something.",
  "I like one big thing in the morning and then nothing. Because if we do three things I stop caring about the third one and I just want to go back to the room.",
  "Definitely the water. Snorkeling, or anything where I can see fish. I would rather do that than look at a building.",
  "Both honestly. An empty beach early is the best, but I also like it when there are people around later.",
  "I get seasick on small boats unless I take the medicine before. No allergies.",
  "Pizza, obviously. And ice cream. I do not want to try weird food on vacation.",
  "Skip this one, I don't care.",
];

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

function Standing({ standing }) {
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
        label="stopped asking"
        slots={standing.skipped}
        tone="color-mix(in srgb, var(--color-rose) 14%, white)"
      />
    </div>
  );
}

function Call({ call }) {
  const args = call.args || {};
  return (
    <div
      className={`rounded-lg border p-2.5 text-xs ${
        call.refused
          ? "border-rose/40 bg-rose/5"
          : "border-teal/30 bg-teal/[0.04]"
      }`}
    >
      <p className="font-semibold text-ink">
        {call.name === "add_preference"
          ? "Saved a preference"
          : call.name === "record_household_fact"
            ? "Saved a fact about the person"
            : call.name === "set_slot_status"
              ? "Stopped asking a question"
              : call.name}
        {args.slot ? ` · ${slotLabel(args.slot)}` : ""}
      </p>
      {args.body && <p className="mt-1 text-ink">{args.body}</p>}
      {args.reason && (
        <p className="mt-1 text-ink-soft">Because: {args.reason}</p>
      )}
      {args.note && <p className="mt-1 text-ink-soft">Note: {args.note}</p>}
      {call.refused && (
        <p className="mt-1 font-semibold text-rose">Refused. {call.refused}</p>
      )}
    </div>
  );
}

function Turn({ turn, n }) {
  return (
    <section className="card p-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="section-label">Turn {n}</p>
        <p className="text-[11px] text-ink-soft">
          {turn.model || "no model"} · {turn.seconds}s · {turn.contextChars}{" "}
          characters of context · {turn.toolCount} tools
          {turn.handed ? ` · handed ${slotLabel(turn.handed)}` : ""}
        </p>
      </div>
      <p className="mt-2 rounded-lg bg-sand/60 p-2.5 text-sm text-ink">
        {turn.said}
      </p>
      {turn.failed ? (
        <p className="mt-2 rounded-lg border border-rose/40 bg-rose/5 p-2.5 text-sm text-rose">
          {turn.failed}
        </p>
      ) : turn.reply ? (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-ink">
          {turn.reply}
        </p>
      ) : (
        // The fault worth shouting about: cards with nothing said above them is
        // a child being shown a form and asked nothing.
        <p className="mt-2 rounded-lg border border-rose/40 bg-rose/5 p-2.5 text-sm font-semibold text-rose">
          Said nothing at all. Whoever is answering would see cards and no
          question.
        </p>
      )}
      {turn.reply && !turn.reply.includes("?") && (
        <p className="mt-1.5 text-xs text-amber">
          No question in that reply, so nothing was written down as asked.
        </p>
      )}
      {turn.askedAgain && (
        <p className="mt-1.5 text-xs text-ink-soft">
          Came back as cards alone; the words above are the second attempt.
        </p>
      )}
      {turn.calls.length > 0 && (
        <div className="mt-2.5 space-y-2">
          {turn.calls.map((call, i) => (
            <Call key={i} call={call} />
          ))}
        </div>
      )}
      <div className="mt-3 border-t border-sand-deep/50 pt-2">
        <Standing standing={turn.after} />
      </div>
    </section>
  );
}

export default function RehearsalBody({ travelers }) {
  const [who, setWho] = useState(travelers[0]?.id || "");
  const [text, setText] = useState(SUGGESTED.join("\n"));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);

  const answers = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/interview/rehearse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ travelerId: who, answers }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body?.error || "The run did not finish.");
      setResult(body);
    } catch (e) {
      setError(e.message || "The run did not finish.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <div className="card mt-5 p-4">
        <label className="block text-sm font-semibold text-ink" htmlFor="who">
          Who is answering
        </label>
        <select
          id="who"
          className="field mt-1.5"
          value={who}
          onChange={(e) => setWho(e.target.value)}
        >
          {travelers.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <label
          className="mt-4 block text-sm font-semibold text-ink"
          htmlFor="answers"
        >
          Their answers, one per line
        </label>
        <p className="mt-0.5 text-xs text-ink-soft">
          Each line is one turn. Aly sees the previous turns, so an answer can
          contradict the one above it.
        </p>
        <textarea
          id="answers"
          className="field mt-1.5 min-h-[220px] font-mono text-xs leading-relaxed"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={run}
            disabled={busy || !who || answers.length === 0}
          >
            {busy
              ? `Running ${answers.length} turns…`
              : `Run ${answers.length} turns`}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => setText(SUGGESTED.join("\n"))}
            disabled={busy}
          >
            Put the suggested answers back
          </button>
        </div>
        {busy && (
          <p className="mt-2 text-xs text-ink-soft">
            Each turn is a real model call against the whole family&apos;s
            record, so this takes about {answers.length * 6} seconds. Nothing is
            saved.
          </p>
        )}
        {error && (
          <p className="mt-2 rounded-lg border border-rose/40 bg-rose/5 p-2.5 text-sm text-rose">
            {error}
          </p>
        )}
      </div>

      {result && (
        <>
          <div className="card mt-5 p-4">
            <p className="section-label">Where {result.person.name} ended up</p>
            <div className="mt-1.5">
              <Standing standing={result.standing} />
            </div>
            <p className="mt-2 text-sm text-ink-soft">
              {result.written.preferences.length} preferences and{" "}
              {result.written.facts.length} facts would have been written,
              across {result.turns.length} turns.{" "}
              {result.standing.open.length > 0
                ? `Still nothing on ${result.standing.open
                    .map((s) => slotLabel(s).toLowerCase())
                    .join(", ")}.`
                : "Nothing left open."}
            </p>
            <p className="mt-2 text-xs text-ink-soft">
              None of it was saved. To conduct this for real, press Get to know
              somebody on their card on the Family screen.
            </p>
          </div>
          <div className="mt-4 space-y-4">
            {result.turns.map((turn, i) => (
              <Turn key={i} turn={turn} n={i + 1} />
            ))}
          </div>
        </>
      )}
    </>
  );
}
