import Link from "next/link";
import TripBackdrop from "@/components/TripBackdrop";
import { formatRange, formatShortDay } from "@/lib/format";
import { countdownSaid } from "@/lib/now/ahead";
import { DateWhy } from "./DateWhy";

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
            <DateWhy
              title={row.title}
              href={row.href}
              scope={row.scope}
              why={row.why}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * One saved place, chosen rather than listed: the one whose season comes round
 * soonest, with the months the family themselves ticked.
 *
 * No heading over it. "Worth doing now" was the app grading its own suggestion,
 * and on a screen whose first line reads NOW, "now" means due today -- which a
 * season next June is not. The card's own first line says where it came from,
 * and the why says which season, so the heading only repeated them.
 *
 * Two lines under the name, and they answer different questions. The first is
 * why the app is raising this place today -- the season, always, because that is
 * what put it above everything else on the list. The second is the family's own
 * note about the place, if they wrote one. The note used to stand in for the
 * reason whenever it existed, which left the card looking like it had chosen a
 * place for reasons of its own.
 */
function WorthDoing({ pick }) {
  if (!pick) return null;
  return (
    <section className="card p-4">
      <div className="text-xs font-semibold uppercase tracking-wide text-teal">
        From your bucket list
      </div>
      <h3 className="font-display mt-1 text-lg font-semibold text-ink">
        {pick.title}
      </h3>
      <p className="mt-1 text-sm text-ink-soft">{pick.why}</p>
      {pick.note ? (
        <p className="mt-1 text-sm italic text-ink-faint">{pick.note}</p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <Link className="btn btn-primary" href={pick.planHref}>
          Plan this trip
        </Link>
        <Link className="btn btn-ghost" href="/someday">
          Open the bucket list
        </Link>
      </div>
    </section>
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
