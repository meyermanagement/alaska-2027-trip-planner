"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "@/components/LinkPending";
import { elapsedSaid } from "@/lib/agent/waiting";

/**
 * Aly saying what a bucket-list place would actually be like for this household.
 *
 * A wish list is a column of place names, and a name is the least useful thing to
 * look at when choosing what to do next. This answers the four things the name
 * cannot: what it costs to fly there from their own airports, what the days are
 * really like measured against what they have written down about themselves, how
 * far ahead it has to be booked, and what would quietly rule it out.
 *
 * Under that is a list of things to consider, each drawn from something the
 * family has written down about themselves with a sentence on how this place sits
 * against it. There is no grade and no score. A machine telling a family that
 * somewhere on their own wish list is probably not for them is answering a
 * question nobody asked, and a number behind that verdict only invites the one
 * question it cannot answer. The lines are the answer, and somebody who disagrees
 * can disagree with a line rather than with a verdict.
 *
 * Asked, never automatic, exactly like the months question beside it. A grounded
 * look costs most of a minute and money, and a screen of eleven places would spend
 * both eleven times over for a family who wanted to know about one.
 */

/** Four honest things to say while a grounded look runs, and no fifth. */
const LINES = [
  [0, "Reading up on what this place is like"],
  [8, "Pricing it from your airports"],
  [26, "Still going. Grounded answers can take most of a minute"],
  [55, "This is longer than usual. It may come back as an error"],
];

function waitLine(seconds) {
  let said = LINES[0][1];
  for (const [at, text] of LINES) if (seconds >= at) said = text;
  return said;
}

/** What each of the four is for, in the order they change a decision. */
const HEADS = {
  cost: "Getting there",
  like: "What it is actually like",
  book: "How far ahead",
  stop: "What would rule it out",
};

const MATCH = {
  yes: { mark: "\u2713", said: "Lines up", tone: "text-teal" },
  no: { mark: "\u2717", said: "Collides", tone: "text-rose" },
  unsure: { mark: "\u2013", said: "Cannot tell", tone: "text-ink-faint" },
};

/**
 * What the shut band says there is inside it: the length of the list, and
 * deliberately nothing about how it came out. A count of the lines is a fact
 * about the answer; a count of the ones that line up is a score, and a score is
 * what this stopped keeping. Worked out here rather than read off the stored
 * panel, so a row answered while this still kept a score gets the right line.
 */
function considerSaid(checks) {
  if (!checks.length) return "";
  return checks.length === 1
    ? "1 thing to consider"
    : `${checks.length} things to consider`;
}

function saidWhen(value) {
  const at = value ? new Date(value) : null;
  if (!at || Number.isNaN(at.getTime())) return "";
  return at.toLocaleDateString("en-US", { month: "long", year: "numeric" });
}

export default function PlaceExpect({ row }) {
  const [busy, setBusy] = useState(false);
  // Shut by default, because a stored answer is four cards deep and a screen of
  // eleven places would be a page you scroll past rather than read. An answer
  // just asked for opens itself: somebody who waited most of a minute for it
  // should not then have to press a second time to see what they paid for.
  const [open, setOpen] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState(null);
  const alive = useRef(true);

  // Set on the way in as well as cleared on the way out. A one-shot cleanup is
  // enough in production and wrong in development, where effects are mounted
  // twice on purpose: the first cleanup would latch this false and every answer
  // after it would be thrown away as arriving after the screen had gone.
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  useEffect(() => {
    if (!busy) return undefined;
    setSeconds(0);
    const at = Date.now();
    const tick = window.setInterval(
      () => setSeconds(Math.floor((Date.now() - at) / 1000)),
      1000,
    );
    return () => window.clearInterval(tick);
  }, [busy]);

  async function ask() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/someday/expect", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ placeId: row.id }),
      });
      const json = await res.json().catch(() => ({}));
      if (!alive.current) return;
      if (!res.ok) {
        setError(json?.error || "That did not come back. Try it again.");
        return;
      }
      setFresh(json);
      setOpen(true);
    } catch {
      if (alive.current) setError("That did not come back. Try it again.");
    } finally {
      if (alive.current) setBusy(false);
    }
  }

  // The answer just given wins over the one on the row, because the row was
  // written by the same request and a page that has not been reloaded still
  // carries the older props.
  const panel =
    fresh || (row.expect?.tips || row.expect?.checks ? row.expect : null);
  const sources = Array.isArray(fresh ? fresh.sources : row.expect_sources)
    ? (fresh ? fresh.sources : row.expect_sources)
        .filter((one) => one?.url)
        .slice(0, 4)
    : [];
  const when = saidWhen(fresh ? fresh.saidAt : row.expect_said_at);
  const tips = Array.isArray(panel?.tips) ? panel.tips : [];
  const checks = Array.isArray(panel?.checks) ? panel.checks : [];
  const consider = considerSaid(checks);

  return (
    <div>
      {busy ? (
        <p className="inline-flex flex-wrap items-center gap-2 text-sm text-ink-soft">
          <Spinner className="h-4 w-4 text-teal" />
          <span aria-live="polite">{waitLine(seconds)}</span>
          {seconds >= 3 ? (
            <span className="tabular text-xs text-ink-faint" aria-hidden="true">
              {elapsedSaid(seconds)}
            </span>
          ) : null}
        </p>
      ) : (
        <button
          type="button"
          className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
          onClick={ask}
        >
          {panel ? "Ask what to expect again" : "What should we expect?"}
        </button>
      )}

      {/*
       * Ask again, on its own, names neither the question it asks nor what
       * pressing it costs. Somebody arriving at a place they asked about weeks
       * ago has no way to tell what would be asked again. So the label repeats
       * the question it is asking, and this line says what it reads, what it
       * replaces and roughly how long it takes.
       */}
      {panel && !busy ? (
        <p className="mt-1 text-xs leading-relaxed text-ink-faint">
          Aly rereads your notes, how you like to travel and any fares you have
          been sent, then replaces the answer below. Takes about a minute.
        </p>
      ) : null}

      {error ? <p className="mt-2 text-sm text-rose">{error}</p> : null}

      {panel ? (
        <details
          open={open}
          onToggle={(event) => setOpen(event.currentTarget.open)}
          className="mt-2 rounded-xl border border-[var(--line)] bg-sand/60 [&[open]>summary>svg]:rotate-90"
        >
          {/*
           * What the band says while it is shut: that there is an answer here,
           * and how many things it found for them to think about. Not how it came
           * out. The arrow is matched with a child selector so that nothing
           * nested inside can pick the rule up.
           */}
          <summary className="flex cursor-pointer list-none items-baseline gap-2 p-3 text-sm">
            <svg
              viewBox="0 0 12 12"
              className="mt-1 h-3 w-3 shrink-0 self-start text-ink-faint transition-transform"
              aria-hidden="true"
            >
              <path
                d="M4 2.5L8 6L4 9.5"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-medium text-ink">
              What to expect
              {consider ? (
                <span className="font-normal text-ink-soft">
                  {" \u00b7 "}
                  {consider}
                </span>
              ) : null}
            </span>
          </summary>

          <div className="px-3 pb-3">
            {panel.searched === false ? (
              <p className="mb-2 text-sm text-ink-faint">
                I could not search for this one, so what follows is general
                rather than checked.
              </p>
            ) : null}

            {tips.length ? (
              <ul className="space-y-2">
                {tips.map((tip) => (
                  <li
                    key={tip.kind}
                    className="rounded-lg border border-[var(--line)] bg-white p-3"
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.09em] text-ink-faint">
                      {HEADS[tip.kind] || "Worth knowing"}
                    </p>
                    <p className="mt-1 text-sm leading-relaxed text-ink">
                      {tip.body}
                    </p>
                  </li>
                ))}
              </ul>
            ) : null}

            {checks.length ? (
              <div className="mt-3">
                {/*
                 * Out in the open rather than behind a second drawer. This is the
                 * part that is about them rather than about the place, which makes
                 * it the part worth reading, and a thing worth reading does not go
                 * in a drawer inside a drawer.
                 */}
                <p className="text-xs font-semibold uppercase tracking-[0.09em] text-ink-faint">
                  Things to consider
                </p>
                <ul className="mt-2 space-y-1.5">
                  {checks.map((check) => {
                    const tone = MATCH[check.match] || MATCH.unsure;
                    return (
                      <li key={check.about} className="flex gap-1.5 text-sm">
                        <span
                          className={`w-3 shrink-0 leading-relaxed ${tone.tone}`}
                          aria-hidden="true"
                        >
                          {tone.mark}
                        </span>
                        <span className="leading-relaxed">
                          <span className="font-medium text-ink">
                            {check.about}
                          </span>
                          <span className="sr-only">{`: ${tone.said}. `}</span>
                          <span className="text-ink-soft">
                            {" \u2014 "}
                            {check.because}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ) : null}

            <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs text-ink-faint">
              {when ? <span>Aly, {when}</span> : <span>Aly</span>}
              {sources.map((source) => (
                <a
                  key={source.url}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                >
                  {source.title || "Source"}
                </a>
              ))}
            </p>
          </div>
        </details>
      ) : null}
    </div>
  );
}
