"use client";

import { useState } from "react";
import Link from "next/link";
import TripBackdrop from "@/components/TripBackdrop";
import { departureSaid, opensByDefault } from "@/lib/now/home";
import { formatRange } from "@/lib/format";

// The top of the home screen: the trip being lived, and the trips about to be.
//
// Both are plates rather than rows because this is the first thing anybody sees
// when they open the app, and because the question they answer -- what is today,
// what is next -- is the reason the screen leads. What separates them is weight,
// not kind: the day you are in gets a panel with the plan printed in it, and a
// departure gets one line until you ask for more.
//
// A stacked departure is folded on purpose. A family can have three trips inside
// a fortnight and none of them is today's work, so the fold is what keeps the
// screen honest about the difference. The exception is written down in
// opensByDefault: a trip leaving inside two days is opened for you, because
// "home Sunday, gone Monday" is precisely the evening where the next trip's
// packing is tonight's job.

/** The plan for today, printed inside the plate that is about today. */
function Plan({ plan }) {
  if (!plan?.length) return null;
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-white/15 bg-white/10">
      {plan.map((item, i) => (
        <div
          key={item.id}
          className={`flex gap-3 px-3.5 py-2.5 ${i > 0 ? "border-t border-white/10" : ""}`}
        >
          <div className="w-16 shrink-0 text-sm font-semibold">
            {item.when || "All day"}
          </div>
          <div className="min-w-0">
            <div className="text-sm font-medium">{item.title}</div>
            {item.where && (
              <div className="text-xs opacity-80">{item.where}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** One fact about a trip, said as a line rather than a chip. */
function Lines({ card }) {
  const lines = [];
  if (card.packing > 0) {
    lines.push(
      card.packed >= card.packing
        ? "Packing is done"
        : `${card.packed} of ${card.packing} packed`,
    );
  }
  if (card.todo > 0) lines.push(`${card.todo} still to do`);
  if (!lines.length) return null;
  return <p className="mt-2 text-sm font-medium opacity-95">{lines.join(" · ")}</p>;
}

function Meter({ done, total, invert = false }) {
  if (!total) return null;
  const pct = Math.min(100, Math.round((done / total) * 100));
  return (
    <div
      className={`mt-2 h-1.5 w-full max-w-xs overflow-hidden rounded-full ${invert ? "bg-white/25" : "bg-sand-deep"}`}
      role="img"
      aria-label={`${done} of ${total} packed`}
    >
      <div
        className={`h-full rounded-full ${invert ? "bg-white" : "bg-teal"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/**
 * The trip being lived today. Day N of M, what is on, and the two places worth
 * going from here. The whole plate is not one link: it carries buttons, because
 * on a trip day the thing you want is a specific part of the trip, not its
 * front page.
 */
function TodayPlate({ card }) {
  return (
    <section className="trip-plate plate-invert card on-photo border-transparent">
      <TripBackdrop trip={card.trip} shape="head" plain />
      <div className="relative p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          {card.dayNumber ? (
            <span className="chip chip-accent">
              Day {card.dayNumber}
              {card.dayCount ? ` of ${card.dayCount}` : ""}
            </span>
          ) : (
            <span className="chip chip-accent">Happening now</span>
          )}
          <span className="text-sm font-semibold uppercase tracking-wide opacity-90">
            {card.name}
            {card.destination ? ` · ${card.destination}` : ""}
          </span>
        </div>
        <h2 className="font-display mt-3 text-2xl font-semibold">Today</h2>
        <Plan plan={card.plan} />
        {!card.plan?.length && (
          <p className="mt-2 text-sm opacity-90">
            Nothing is on the plan for today.
          </p>
        )}
        <Lines card={card} />
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="btn btn-primary" href={card.href}>
            Open the day
          </Link>
          <Link className="btn btn-ghost" href={card.packingHref}>
            {card.packing > 0
              ? `Packing · ${card.packed} of ${card.packing}`
              : "Packing"}
          </Link>
          {card.todo > 0 && (
            <Link className="btn btn-ghost" href={card.tasksHref}>
              {card.todo} to do
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * The next departure, when nothing is happening today. Same plate, different
 * question: how close it is and how far along the packing got.
 */
function DeparturePlate({ card }) {
  return (
    <section className="trip-plate plate-invert card on-photo border-transparent">
      <TripBackdrop trip={card.trip} shape="head" plain />
      <div className="relative p-5">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="chip chip-accent">{departureSaid(card.days)}</span>
          <span className="text-sm font-semibold opacity-90">
            {formatRange(card.start_date, card.end_date)}
          </span>
        </div>
        <h2 className="font-display mt-3 text-2xl font-semibold">{card.name}</h2>
        <p className="mt-0.5 text-sm font-medium opacity-95">
          {[card.going?.join(", "), card.destination].filter(Boolean).join(" · ")}
        </p>
        <Lines card={card} />
        <Meter done={card.packed} total={card.packing} invert />
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="btn btn-primary" href={card.packingHref}>
            {card.packing > 0 && card.packed >= card.packing
              ? "Check the packing"
              : "Open packing"}
          </Link>
          <Link className="btn btn-ghost" href={card.href}>
            Trip plan
          </Link>
          {card.todo > 0 && (
            <Link className="btn btn-ghost" href={card.tasksHref}>
              {card.todo} to do
            </Link>
          )}
        </div>
      </div>
    </section>
  );
}

/**
 * A departure stacked under whatever leads the screen. One line shut: the name,
 * how close it is, and the shortest true sentence about what is outstanding.
 */
function StackedTrip({ card }) {
  const [open, setOpen] = useState(opensByDefault(card.days));
  const shut = [];
  if (card.packing === 0) shut.push("No packing list yet");
  else if (card.packed === 0) shut.push("Packing not started");
  else if (card.packed >= card.packing) shut.push("Packing is done");
  else shut.push(`${card.packed} of ${card.packing} packed`);
  if (card.todo > 0) shut.push(`${card.todo} to do before you go`);

  return (
    <div className="card overflow-hidden p-0">
      <button
        type="button"
        onClick={() => setOpen((was) => !was)}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="emoji-badge shrink-0" aria-hidden="true">
          {card.trip.cover_emoji}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-semibold text-ink">{card.name}</span>
            <span className="chip chip-shade">{departureSaid(card.days)}</span>
          </span>
          <span className="mt-0.5 block text-sm text-ink-soft">
            {shut.join(" · ")}
          </span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-teal">
          {open ? "Less" : "More"}
        </span>
      </button>
      {open && (
        <div className="border-t border-line px-4 py-3.5">
          <p className="text-sm text-ink-soft">
            {formatRange(card.start_date, card.end_date)}
            {card.destination ? ` · ${card.destination}` : ""}
            {card.going?.length ? ` · ${card.going.join(", ")}` : ""}
          </p>
          <Meter done={card.packed} total={card.packing} />
          {card.tasks?.length > 0 && (
            <ul className="mt-3 grid gap-1.5">
              {card.tasks.map((task) => (
                <li key={task.id} className="flex gap-2 text-sm text-ink">
                  <span
                    className="mt-[0.45rem] h-1.5 w-1.5 shrink-0 rounded-full bg-amber"
                    aria-hidden="true"
                  />
                  <span>
                    {task.title}
                    {task.due ? (
                      <span className="text-ink-soft"> · {task.due}</span>
                    ) : null}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-3.5 flex flex-wrap gap-2">
            <Link className="btn btn-primary" href={card.packingHref}>
              Open packing
            </Link>
            <Link className="btn btn-ghost" href={card.href}>
              Trip plan
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function NowTrips({ current = [], soon = [] }) {
  if (!current.length && !soon.length) return null;
  // What leads: the day being lived, or -- with nothing on today -- the closest
  // departure, promoted out of the stack so the screen is never led by a fold.
  const lead = current.length ? null : soon[0];
  const stacked = current.length ? soon : soon.slice(1);

  return (
    <div className="mb-7 grid gap-3">
      {current.map((card) => (
        <TodayPlate key={card.id} card={card} />
      ))}
      {lead && <DeparturePlate card={lead} />}
      {stacked.length > 0 && (
        <>
          <h2 className="mt-1 text-xs font-semibold uppercase tracking-wide text-ink-faint">
            Next up
          </h2>
          {stacked.map((card) => (
            <StackedTrip key={card.id} card={card} />
          ))}
        </>
      )}
    </div>
  );
}
