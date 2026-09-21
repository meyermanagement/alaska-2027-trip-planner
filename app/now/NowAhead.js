import Link from "next/link";
import TripBackdrop from "@/components/TripBackdrop";
import { formatRange, formatShortDay } from "@/lib/format";
import { countdownSaid } from "@/lib/now/ahead";

// The home screen when the next trip is still weeks out.
//
// The plate keeps the photograph, because the trip is the thing being looked
// forward to, and trades today's plan for a countdown and the next few dated
// things the trip needs. Under it the dates run together in one band across
// every trip, because a family does not think in trips when something is running
// out -- they think in the order the dates land.
//
// What is deliberately not here: the packing meter, today's plan and the
// location prompt. None of them is a true answer two months out, and a screen
// that shows "0 of 0 packed" for November in September has taught somebody to
// ignore it.

/** The next few dated things one trip needs, printed inside its own plate. */
function Needs({ tasks }) {
  if (!tasks?.length) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-white/15 bg-white/10">
      <div className="px-3.5 pt-2.5 text-xs font-semibold uppercase tracking-wide opacity-80">
        What this trip needs next
      </div>
      {tasks.map((task, i) => (
        <div
          key={task.id}
          className={`flex gap-3 px-3.5 py-2.5 ${i > 0 ? "border-t border-white/10" : ""}`}
        >
          <div className="w-28 shrink-0 text-sm font-semibold">
            {task.on ? formatShortDay(task.on) : "No date"}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">{task.title}</div>
            {task.why && <div className="text-xs opacity-80">{task.why}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

/** The trip being looked forward to: how far off it is, and what it needs next. */
function CountdownPlate({ card }) {
  return (
    <section className="trip-plate plate-invert card on-photo border-transparent">
      <TripBackdrop trip={card.trip} shape="head" plain />
      <div className="relative p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="chip chip-accent">{countdownSaid(card.days)}</span>
          <span className="text-sm font-semibold opacity-90">
            {formatRange(card.start_date, card.end_date)}
          </span>
        </div>
        <div className="mt-3 flex items-start justify-between gap-4">
          <div className="min-w-0">
            <h2 className="font-display text-2xl font-semibold">{card.name}</h2>
            <p className="mt-0.5 text-sm font-medium opacity-95">
              {[card.going?.join(", "), card.destination]
                .filter(Boolean)
                .join(" · ")}
            </p>
          </div>
          <div className="shrink-0 text-right leading-none">
            <div className="font-display text-4xl font-semibold tabular-nums">
              {card.days}
            </div>
            <div className="text-xs font-semibold uppercase tracking-wide opacity-80">
              {card.days === 1 ? "day" : "days"}
            </div>
          </div>
        </div>
        <Needs tasks={card.needs} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="btn btn-primary" href={card.href}>
            Open the trip
          </Link>
          {card.todo > 0 && (
            <Link className="btn btn-ghost" href={card.tasksHref}>
              {card.todo} still to do
            </Link>
          )}
          <Link className="btn btn-ghost" href={card.budgetHref}>
            Budget
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Every date in view, across every trip, in the order they land. */
function DatesBand({ dates }) {
  if (!dates.length) return null;
  return (
    <section className="card overflow-hidden p-0">
      <h2 className="flex items-center justify-between gap-3 border-b border-line bg-sand/60 px-4 py-2.5 text-sm font-semibold text-ink">
        <span>Dates that will not wait</span>
        <span className="rounded-full bg-amber px-2 py-0.5 text-xs font-semibold text-white">
          {dates.length}
        </span>
      </h2>
      <ul>
        {dates.map((row, i) => (
          <li
            key={row.id}
            className={`flex gap-3 px-4 py-3 ${i > 0 ? "border-t border-line" : ""}`}
          >
            <span className="w-24 shrink-0 text-sm font-semibold text-rose">
              {formatShortDay(row.on)}
            </span>
            <span className="min-w-0 flex-1">
              {/* The trip drops under the line rather than beside it on a narrow
                  screen: a name and a title competing for the same row leaves
                  one word per line. */}
              <span className="flex flex-wrap items-baseline justify-between gap-x-3">
                <span className="text-sm font-medium text-ink">
                  {row.href ? (
                    <Link className="underline decoration-line-strong underline-offset-2" href={row.href}>
                      {row.title}
                    </Link>
                  ) : (
                    row.title
                  )}
                </span>
                {row.scope && (
                  <span className="text-xs text-ink-soft">{row.scope}</span>
                )}
              </span>
              {row.why && (
                <span className="mt-0.5 block text-xs text-ink-soft">{row.why}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One thing worth doing, chosen rather than listed: the saved place whose season
 * comes round soonest, with the months the family themselves ticked.
 */
function WorthDoing({ pick }) {
  if (!pick) return null;
  return (
    <>
      <h2 className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-soft">
        Worth doing now
      </h2>
      <section className="card p-4">
        <div className="text-xs font-semibold uppercase tracking-wide text-teal">
          From your someday list
        </div>
        <h3 className="font-display mt-1 text-lg font-semibold text-ink">
          {pick.title}
        </h3>
        <p className="mt-1 text-sm text-ink-soft">{pick.why}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Link className="btn btn-primary" href={pick.planHref}>
            Plan this trip
          </Link>
          <Link className="btn btn-ghost" href="/someday">
            Open the someday list
          </Link>
        </div>
      </section>
    </>
  );
}

export default function NowAhead({ card, dates = [], pick = null }) {
  if (!card && !dates.length && !pick) return null;
  return (
    <div className="mb-7 grid gap-3">
      {card && <CountdownPlate card={card} />}
      <DatesBand dates={dates} />
      <WorthDoing pick={pick} />
    </div>
  );
}
