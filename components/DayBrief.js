"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ASK_ALY_EVENT } from "./AskAlyTrigger";
import { readStored } from "./WhereIAm";
import { minutesUntil, untilSaid } from "@/lib/day/phase";
import WaysThere from "./WaysThere";
import { distanceSaid } from "@/lib/travel/route";
import { formatTime } from "@/lib/format";

/**
 * The band above a day, when the family is living that day.
 *
 * Three jobs, in the order they matter at eight in the morning: what is next and
 * when to leave, what the sky is doing, and a place to ask. Everything in it is
 * allowed to be missing -- a forecast the service would not give up, a next item
 * with no time, a day nobody has researched -- and the band still stands.
 */

const TODAY_FOCUS = "today";

/** The forecast, in one line, with the numbers first because that is what is read. */
function Weather({ weather }) {
  if (!weather) return null;
  return (
    <p className="flex flex-wrap items-baseline gap-x-2 text-sm text-ink-soft">
      <span className="tabular font-semibold text-ink">
        {Math.round(weather.high)}&deg; / {Math.round(weather.low)}&deg;
      </span>
      <span>{weather.said}</span>
    </p>
  );
}

export default function DayBrief({
  tripId,
  date,
  isToday,
  next,
  nowHM,
  weather,
  nextLeg = null,
  pending,
  onResearch,
  researching,
  researchError,
  readOnly = false,
}) {
  const [asking, setAsking] = useState("");
  const [here, setHere] = useState(null);
  const box = useRef(null);

  // Where they said they are, if they ever said. The location control lives in
  // the chat panel and writes to session storage, so this is a read of what a
  // previous question already established rather than a fresh ask -- the day view
  // does not prompt for a position it can do without. Read again when the tab
  // comes back, because setting a position in the drawer and returning here is
  // exactly how it changes.
  useEffect(() => {
    const read = () => setHere(readStored());
    read();
    const onShow = () => {
      if (!document.hidden) read();
    };
    document.addEventListener("visibilitychange", onShow);
    window.addEventListener("focus", read);
    return () => {
      document.removeEventListener("visibilitychange", onShow);
      window.removeEventListener("focus", read);
    };
  }, []);

  const ask = useCallback((text) => {
    const said = String(text || "").trim();
    if (!said) return;
    window.dispatchEvent(
      new CustomEvent(ASK_ALY_EVENT, {
        detail: { seed: said, autoSend: true, focus: TODAY_FOCUS },
      }),
    );
    setAsking("");
  }, []);

  // "in 40 min" while that is a useful thing to say, and a clock time once the gap
  // is long enough that counting minutes stops meaning anything.
  const until =
    isToday && next
      ? untilSaid(
          minutesUntil(next, { nowHM }),
          next.start_time ? formatTime(next.start_time) : null,
        )
      : null;

  return (
    <section className="no-print mb-3 rounded-2xl border border-teal/25 bg-teal/[0.04] px-4 py-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-[0.72rem] font-semibold uppercase tracking-[0.1em] text-teal">
          {isToday ? "Today" : "This day"}
        </p>
        <Weather weather={weather} />
      </div>

      {/* What is next, said as a gap rather than a clock time, because "in 40
          minutes" is the thing a person acts on. */}
      {until && (
        <p className="mt-1.5 text-sm text-ink">
          <span className="font-semibold">{next.title}</span> {until}
        </p>
      )}
      {/* And how to get there, with the ways ordered by distance, by whether
          transit is any good here, and by what the family wrote down. Only for the
          next thing: the whole day's worth of this would be a timetable. */}
      {next && nextLeg?.options?.length > 0 && (
        <WaysThere
          options={nextLeg.options}
          title={nextLeg.fromHere ? "From where you are" : "Getting there"}
          distance={distanceSaid(nextLeg)}
        />
      )}

      {isToday && !next && (
        <p className="mt-1.5 text-sm text-ink-soft">
          Nothing left on the schedule today.
        </p>
      )}

      {/* One way in, not two. There used to be a second control beside this box
          that opened the drawer with nothing typed in it, and it was the weaker
          of the pair: the same conversation is one tap away on the floating
          button, and asking a question here opens that drawer anyway. Two
          controls that end in the same place, on the band that is supposed to be
          about the next hour, cost a decision and bought nothing. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            ask(asking);
          }}
          className="flex min-w-[13rem] flex-1 items-center gap-2"
        >
          <input
            ref={box}
            value={asking}
            onChange={(e) => setAsking(e.target.value)}
            placeholder="Ask about today…"
            aria-label="Ask Aly about today"
            className="min-w-0 flex-1 rounded-full border border-[var(--line)] bg-white px-3.5 py-1.5 text-sm placeholder:text-ink-faint focus:border-teal focus:outline-none"
          />
          <button
            type="submit"
            disabled={!asking.trim()}
            className="btn btn-primary shrink-0 px-3.5 py-1.5 text-sm disabled:opacity-50"
          >
            Ask
          </button>
        </form>
      </div>

      {/* The three questions people actually have, so the box is not a blank
          page. Kept to things this day can answer. */}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {[
          here ? "Somewhere to eat near me" : "Somewhere to eat near here",
          "How do we get to the next thing?",
          "What should we wear today?",
        ].map((q) => (
          <button
            key={q}
            type="button"
            onClick={() => ask(q)}
            className="rounded-full border border-teal/25 bg-white px-3 py-1 text-[0.72rem] font-semibold text-teal hover:border-teal"
          >
            {q}
          </button>
        ))}
      </div>

      {/* Research is offered rather than silent, so a day with nothing found does
          not look like a day nobody looked at. Offered to a secondary traveler on
          the same terms: what it writes is advice about items that already exist,
          not a change to the plan, and a day they cannot get advice about is not
          the same day. */}
      {pending > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-2 text-[0.78rem] text-ink-soft">
          {researching ? (
            <span>Aly is looking into {pending === 1 ? "it" : "the day"}…</span>
          ) : (
            <>
              <span>
                {pending === 1
                  ? "One thing today has not been looked into."
                  : `${pending} things today have not been looked into.`}
              </span>
              <button
                type="button"
                onClick={onResearch}
                className="font-semibold text-teal underline decoration-teal/30 underline-offset-4 hover:decoration-teal"
              >
                Look into today
              </button>
            </>
          )}
        </p>
      )}
      {researchError && (
        <p className="mt-1.5 text-[0.78rem] text-rose">{researchError}</p>
      )}
    </section>
  );
}
