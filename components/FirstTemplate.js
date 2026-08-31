"use client";

import { useState } from "react";
import { ASK_ALY_EVENT } from "@/components/AskAlyTrigger";
import { TEMPLATES_FOCUS } from "@/lib/agent/context";
import {
  FIRST_NAME,
  TEMPLATE_EXAMPLES,
  fromTripRequest,
  sourceLine,
  suggestName,
  templateRequest,
} from "@/lib/packing/newTemplate";

/**
 * What the Packing templates screen says when there are none.
 *
 * It used to say one sentence: there are no packing templates saved yet, create
 * a trip and Aly will build one. Both halves of that were a dead end. Creating a
 * trip builds a packing list out of the templates, so with none it builds an
 * empty one; and "ask her to start a packing template" left the person to work
 * out, on their own, what a packing template is for and what belongs on one.
 * This is the screen where a family has the least idea what the app wants from
 * them, and it was the screen doing the least to say.
 *
 * So it asks. Either they describe the list, or they point at a trip they have
 * already packed for and it is copied off that -- which is the better door of
 * the two whenever it is available, because a list that came out of a real
 * suitcase beats a list somebody typed from memory.
 *
 * Nothing here writes. Both doors end in a sentence sent to Aly, and the list
 * arrives as a change to approve like any other.
 */
export default function FirstTemplate({ trips = [] }) {
  const [mode, setMode] = useState(null);
  const [name, setName] = useState(FIRST_NAME);
  const [about, setAbout] = useState("");
  const [tripId, setTripId] = useState(trips[0]?.id || null);

  const trip = trips.find((t) => t.id === tripId) || null;
  const described = templateRequest({ name, about, first: true });
  const copied = fromTripRequest({ trip, name, first: true });

  function ask(text) {
    if (!text) return;
    window.dispatchEvent(
      new CustomEvent(ASK_ALY_EVENT, {
        detail: { seed: text, autoSend: true, focus: TEMPLATES_FOCUS },
      }),
    );
  }

  return (
    <section className="card p-6">
      <h2 className="font-display text-xl font-semibold">
        You have no packing templates yet
      </h2>
      <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">
        A packing template is a list the app keeps for you, and every new trip
        is built from the ones that apply. The first one is the base: the things
        you take whatever you are doing. Until it exists, a new trip starts with
        an empty packing list.
      </p>

      {mode === null && (
        <div className="mt-5 flex flex-wrap gap-2">
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => setMode("describe")}
          >
            Describe the first one
          </button>
          {trips.length > 0 && (
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setMode("trip")}
            >
              Use a trip you have already packed for
            </button>
          )}
        </div>
      )}

      {mode === null && trips.length === 0 && (
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          Nothing has been packed on a trip yet, so there is no list to copy
          from. Describing it is the way in.
        </p>
      )}

      {mode !== null && (
        <div className="mt-5">
          <label className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            What to call it
          </label>
          <input
            className="field mt-1.5"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={FIRST_NAME}
          />
        </div>
      )}

      {mode === "describe" && (
        <div className="mt-4">
          <label className="block text-xs font-semibold uppercase tracking-wide text-ink-soft">
            What goes on it
          </label>
          <textarea
            className="field mt-1.5 text-base leading-relaxed"
            rows={5}
            value={about}
            onChange={(e) => setAbout(e.target.value)}
            placeholder={TEMPLATE_EXAMPLES[0]}
          />
          <p className="mt-2 text-xs leading-relaxed text-ink-soft">
            Say it in a sentence — Aly works out the individual items and asks
            about anything she is unsure of. For example: {TEMPLATE_EXAMPLES[1]}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!described}
              onClick={() => ask(described)}
            >
              Ask Aly to build it
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setMode(null)}
            >
              Back
            </button>
          </div>
        </div>
      )}

      {mode === "trip" && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-ink-soft">
            Copy from
          </p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {trips.map((t) => {
              const on = t.id === tripId;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTripId(t.id);
                    if (!name.trim()) setName(suggestName(t, true));
                  }}
                  className={`rounded-xl border px-3 py-2 text-left text-sm transition ${
                    on
                      ? "border-teal bg-teal-soft/50"
                      : "border-[var(--line)] bg-white hover:border-teal/40"
                  }`}
                >
                  <span className="block font-semibold">{t.name}</span>
                  <span className="mt-0.5 block text-xs text-ink-soft">
                    {sourceLine(t)}
                  </span>
                </button>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-ink-soft">
            Aly reads that trip’s own packing list and builds the template from
            it. The trip keeps everything it has.
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={!copied}
              onClick={() => ask(copied)}
            >
              Ask Aly to build it
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => setMode(null)}
            >
              Back
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
