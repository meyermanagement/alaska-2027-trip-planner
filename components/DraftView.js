"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { formatRange, formatFullDay } from "@/lib/format";
import {
  BASICS,
  basicValue,
  basicsProgress,
  draftSuggestions,
  nextBasic,
  whenText,
} from "@/lib/trips/basics";
import { ASK_ALY_EVENT } from "./AskAlyTrigger";
import AskAlyDrawer from "./AskAlyDrawer";
import PromoteDraft from "./PromoteDraft";

/**
 * A draft, shown as the thing it actually is.
 *
 * Until now a draft was the trip screen with a banner on it: the same white cards,
 * the same tabs, the same confident heading over a place nobody had committed to.
 * That screen is built to answer "what is happening on this trip" -- and a draft's
 * honest answer to almost all of it is "nothing yet", which made the page read as
 * a trip that had gone wrong rather than an idea that was going fine.
 *
 * So this is a different screen. Sand instead of white, dashed instead of solid,
 * no countdown, and the six components as the main content rather than an
 * afterthought -- because on a draft, what is still blank IS the subject. Each
 * blank card asks its question and hands it to Aly; each answered one shows what
 * she recorded and offers to change it.
 *
 * Nothing here writes to the trip except the move to Upcoming. Every change goes
 * through Aly, which is both the point of the app and the only way a vague answer
 * like "probably fly into Kona" ever lands in a field.
 */
export default function DraftView({
  trip,
  itinerary = [],
  tasks = [],
  packing = [],
  travelers = [],
  going = [],
  today,
}) {
  const router = useRouter();
  const [asked, setAsked] = useState(null);

  const progress = useMemo(() => basicsProgress(trip), [trip]);
  const next = useMemo(() => nextBasic(trip), [trip]);
  const suggestions = useMemo(
    () => draftSuggestions(trip, { itinerary, tasks, packing }),
    [trip, itinerary, tasks, packing],
  );

  function ask(seed) {
    const text = String(seed || "").trim();
    if (!text) return;
    setAsked(text);
    window.dispatchEvent(
      new CustomEvent(ASK_ALY_EVENT, {
        detail: { seed: text, autoSend: true },
      }),
    );
  }

  // Who is on it, by name. A draft usually has nobody on the roster yet, and
  // saying so is more useful than an empty row.
  const goingNames = travelers
    .filter((t) => going.includes(t.id))
    .map((t) => t.name);

  // The days, only as a loose list. A draft's itinerary is a sketch, so it is
  // grouped by date and left flat rather than being given the real day view --
  // times, statuses and confirmation numbers are detail this screen is
  // deliberately not about.
  const days = useMemo(() => {
    const byDate = new Map();
    for (const item of itinerary) {
      const key = item.item_date || "unscheduled";
      if (!byDate.has(key)) byDate.set(key, []);
      byDate.get(key).push(item);
    }
    return [...byDate.entries()].sort((a, b) => {
      if (a[0] === "unscheduled") return 1;
      if (b[0] === "unscheduled") return -1;
      return a[0].localeCompare(b[0]);
    });
  }, [itinerary]);

  const when = whenText(trip);
  const approximate = Boolean(trip?.dates_approximate);
  const openTasks = tasks.filter((t) => !t.is_done);

  return (
    <main className="mx-auto max-w-4xl px-5 pb-24 pt-6">
      {/* The header. Dashed, sand, and it says "draft" before it says the name,
          because that is the one thing somebody arriving here needs to know. */}
      <header className="rounded-3xl border-2 border-dashed border-[var(--line-strong)] bg-sand/70 p-5 sm:p-7">
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 rounded-full bg-amber/20 px-2.5 py-1 text-xs font-bold uppercase tracking-wide text-ink">
            <span aria-hidden="true">✎</span> Draft
          </span>
          <span className="text-xs text-ink-soft">
            An idea being worked out. Nothing here is on the family calendar.
          </span>
        </div>

        <h1 className="mt-3 font-display text-3xl font-semibold leading-tight sm:text-4xl">
          {trip?.name || "Untitled trip"}
        </h1>

        <p className="mt-1.5 text-sm text-ink-soft">
          {trip?.destination || "Where is still undecided"}
        </p>

        {/* When, said the way the family said it. A range they never settled is
            never printed in the same words as one they did -- that is how an
            estimate turns into a departure date nobody chose. */}
        <div className="mt-3.5 flex flex-wrap items-center gap-2">
          {when ? (
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-semibold ${
                approximate || !trip?.start_date
                  ? "border border-amber/40 bg-amber/15 text-ink"
                  : "border border-[var(--line)] bg-white text-ink"
              }`}
            >
              {when}
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-dashed border-[var(--line-strong)] px-3 py-1.5 text-sm text-ink-soft">
              No dates yet — that is fine
            </span>
          )}
          {(approximate || (trip?.date_note && trip?.start_date)) && (
            <span className="text-xs leading-relaxed text-ink-soft">
              Approximate.{" "}
              {trip?.start_date && trip?.end_date
                ? `Penciled in as ${formatRange(trip.start_date, trip.end_date)}.`
                : ""}{" "}
              Nothing counts down to a draft.
            </span>
          )}
        </div>

        {trip?.summary && (
          <p className="mt-3.5 max-w-2xl text-sm leading-relaxed text-ink-soft">
            {trip.summary}
          </p>
        )}

        {/* How far along the baseline is. A bar, not a score: six of six is not a
            requirement, it is just the point at which nothing is missing. */}
        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
              {progress.answered} of {progress.total} sketched in
            </p>
            {progress.complete ? (
              <PromoteDraft
                trip={trip}
                hasPacking={packing.length > 0}
                onDone={() => router.refresh()}
              />
            ) : (
              <p className="text-xs text-ink-soft">
                {next ? `Next: ${next.label.toLowerCase()}` : ""}
              </p>
            )}
          </div>
          <div
            className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-sand-deep"
            role="img"
            aria-label={`${progress.answered} of ${progress.total} basics answered`}
          >
            <div
              className="h-full rounded-full bg-teal transition-all"
              style={{
                width: `${Math.round((progress.answered / progress.total) * 100)}%`,
              }}
            />
          </div>
          {progress.complete && (
            <p className="mt-2 text-xs leading-relaxed text-teal">
              All six have an answer.{" "}
              {trip?.start_date && trip?.end_date
                ? approximate
                  ? "Move it across whenever you are ready — the penciled-in dates become the real ones, so settle them with Aly first if they are still a guess."
                  : "Move it across whenever you are ready."
                : "It needs a first and last day before it can move across — ask Aly to work the dates out."}
            </p>
          )}
        </div>

        {goingNames.length > 0 && (
          <p className="mt-4 text-xs text-ink-soft">
            Going: {goingNames.join(", ")}
          </p>
        )}
      </header>

      {/* The six. This is the screen's subject, not a sidebar. */}
      <section className="mt-7">
        <h2 className="font-display text-xl font-semibold">
          What this trip is made of
        </h2>
        <p className="mt-1 text-sm text-ink-soft">
          Six rough answers make a trip. Press one and Aly will work it out with
          you — details come later.
        </p>

        <ul className="mt-4 grid gap-3 sm:grid-cols-2">
          {BASICS.map((basic) => {
            const value = basicValue(trip, basic.id);
            const answered = Boolean(String(value || "").trim());
            return (
              <li
                key={basic.id}
                className={`flex flex-col justify-between rounded-2xl border p-4 ${
                  answered
                    ? "border-[var(--line)] bg-white"
                    : "border-2 border-dashed border-[var(--line-strong)] bg-sand/40"
                }`}
              >
                <div className="min-w-0">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
                    {basic.label}
                  </p>
                  {answered ? (
                    <p className="mt-1.5 text-sm leading-relaxed text-ink">
                      {value}
                    </p>
                  ) : (
                    <>
                      <p className="mt-1.5 text-sm font-semibold leading-snug text-ink">
                        {basic.question}
                      </p>
                      <p className="mt-1 text-xs leading-relaxed text-ink-soft">
                        {basic.why}
                      </p>
                    </>
                  )}
                </div>
                <div className="mt-3">
                  <button
                    type="button"
                    className={
                      answered
                        ? "text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                        : "btn btn-primary w-full px-3 py-1.5 text-xs sm:w-auto"
                    }
                    onClick={() =>
                      ask(
                        answered
                          ? `On this trip, ${basic.label.toLowerCase()} is currently "${value}". I want to change it.`
                          : basic.ask,
                      )
                    }
                  >
                    {answered ? "Change with Aly" : "Answer with Aly"}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </section>

      {/* What to do next, worked out from the draft rather than from a fixed list.
          Every one of these is a sentence handed straight to Aly. */}
      {suggestions.length > 0 && (
        <section className="mt-8">
          <h2 className="font-display text-xl font-semibold">
            Ideas from here
          </h2>
          <ul className="mt-3 grid gap-2.5 sm:grid-cols-2">
            {suggestions.map((s) => (
              <li key={s.id}>
                <button
                  type="button"
                  onClick={() => ask(s.seed)}
                  className="w-full rounded-2xl border border-[var(--line)] bg-white p-3.5 text-left transition hover:border-teal/50"
                >
                  <span className="block text-sm font-semibold text-ink">
                    {s.label}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-ink-soft">
                    {s.why}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* The timeline, loose. Grouped by day, no times, and every day carries a
          way to change it -- which on a draft is the only thing anybody wants to
          do to a day. */}
      <section className="mt-8">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="font-display text-xl font-semibold">
            How the days look
          </h2>
          <button
            type="button"
            className="text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
            onClick={() =>
              ask(
                itinerary.length
                  ? "Walk through the days on this trip with me and suggest what to change."
                  : "Sketch out a rough day-by-day for this trip. Keep it loose — I will move things around.",
              )
            }
          >
            {itinerary.length ? "Rework the days with Aly" : "Sketch the days"}
          </button>
        </div>

        {days.length === 0 ? (
          <p className="mt-3 rounded-2xl border-2 border-dashed border-[var(--line-strong)] bg-sand/40 p-5 text-sm leading-relaxed text-ink-soft">
            Nothing on the days yet. That is normal for a draft — once there is
            a place and roughly a when, Aly can put a shape to it in one go, and
            then it is yours to argue with.
          </p>
        ) : (
          <ol className="mt-3 space-y-2.5">
            {days.map(([date, items]) => (
              <li
                key={date}
                className="rounded-2xl border border-dashed border-[var(--line-strong)] bg-white/60 p-3.5"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm font-semibold text-ink">
                    {date === "unscheduled"
                      ? "Not on a day yet"
                      : formatFullDay(date) || date}
                    {approximate && date !== "unscheduled" && (
                      <span className="ml-1.5 text-xs font-normal text-ink-soft">
                        (approximate)
                      </span>
                    )}
                  </p>
                  <button
                    type="button"
                    className="text-xs font-semibold text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
                    onClick={() =>
                      ask(
                        `On this trip, change ${
                          date === "unscheduled"
                            ? "the things that are not on a day yet"
                            : `what we have on ${formatFullDay(date) || date}`
                        }.`,
                      )
                    }
                  >
                    Change this day
                  </button>
                </div>
                <ul className="mt-2 space-y-1">
                  {items.map((item) => (
                    <li
                      key={item.id}
                      className="flex items-start gap-2 text-sm leading-relaxed text-ink-soft"
                    >
                      <span
                        aria-hidden="true"
                        className="mt-[0.5rem] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint"
                      />
                      <span className="min-w-0">
                        <span className="text-ink">{item.title}</span>
                        {item.status === "optional" && (
                          <span className="ml-1.5 text-xs text-ink-faint">
                            idea
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </section>

      {/* Everything else that exists on this trip, as one line each rather than
          as tabs. A draft with three tasks does not need a tab for them, and the
          real trip screen is where they belong once it is a real trip. */}
      <section className="mt-8 rounded-2xl border border-[var(--line)] bg-white p-4">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint">
          Also on this draft
        </h2>
        <dl className="mt-2.5 grid gap-2 sm:grid-cols-3">
          <div>
            <dt className="text-xs text-ink-soft">To sort out</dt>
            <dd className="text-sm font-semibold text-ink">
              {openTasks.length
                ? `${openTasks.length} ${openTasks.length === 1 ? "thing" : "things"}`
                : "Nothing yet"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">Packing list</dt>
            <dd className="text-sm font-semibold text-ink">
              {packing.length
                ? `${packing.length} ${packing.length === 1 ? "item" : "items"}`
                : "Once it is a trip"}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-soft">On the days</dt>
            <dd className="text-sm font-semibold text-ink">
              {itinerary.length
                ? `${itinerary.length} ${itinerary.length === 1 ? "item" : "items"}`
                : "Nothing yet"}
            </dd>
          </div>
        </dl>
        {openTasks.length > 0 && (
          <ul className="mt-3 space-y-1 border-t border-[var(--line)] pt-3">
            {openTasks.slice(0, 4).map((task) => (
              <li
                key={task.id}
                className="text-sm leading-relaxed text-ink-soft"
              >
                {task.task}
                {task.due_date && (
                  <span className="ml-1.5 text-xs text-ink-faint">
                    by {formatFullDay(task.due_date) || task.due_date}
                  </span>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="mt-3 text-xs leading-relaxed text-ink-soft">
          Once this moves to Upcoming trips it gets the full trip screen — the
          day-by-day with times and confirmations, the packing list you can
          check off, and the pre-trip checklist. The packing list waits for that
          on purpose: while the dates and the destination are still moving,
          anything worked out now would only be worked out again.
        </p>
      </section>

      {asked && (
        <p className="sr-only" role="status">
          Asked Aly: {asked}
        </p>
      )}

      <AskAlyDrawer trip={trip} onRefresh={() => router.refresh()} />
    </main>
  );
}
