import Link from "next/link";

// The home screen with nothing on the calendar.
//
// This is the screen a household sees the week after a trip ends, and the one a
// new family sees on their second visit -- so it cannot be an empty state in the
// usual sense, a shrug with a button on it. What the app holds even with no trip
// booked is a list of places somebody wanted, the months they said those places
// work, the fares it is watching for, and a record of where they have already
// been. That is enough to be useful, and the invitation at the top is the only
// thing on the screen that asks for anything.
//
// The ask is a week, not a destination. A family that knew where they were going
// would have made the trip; what they usually know is that the first week of
// March is free.

/** The crossing behind the invitation: the app's own mark, drawn once, going somewhere. */
function Crossing() {
  return (
    <svg
      className="pointer-events-none absolute inset-0 h-full w-full"
      viewBox="0 0 1000 240"
      preserveAspectRatio="xMaxYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M300 212 C 470 196, 600 150, 720 122 S 900 70, 990 40"
        fill="none"
        stroke="var(--aurora-north-tick, #7fe3c4)"
        strokeOpacity="0.5"
        strokeWidth="2.5"
        strokeDasharray="7 9"
      />
      <circle cx="720" cy="122" r="5.5" fill="var(--aurora-north-tick, #7fe3c4)" />
    </svg>
  );
}

/** The invitation: one question, and the three doors out of it. */
function Invitation({ knows }) {
  return (
    <section className="card on-photo relative overflow-hidden border-transparent p-0">
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(160deg, #111d26, #15303d 48%, var(--teal, #1b5a4c))",
        }}
        aria-hidden="true"
      />
      <Crossing />
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(100deg, rgba(9,16,20,.72) 0 46%, rgba(9,16,20,0) 78%)",
        }}
        aria-hidden="true"
      />
      <div className="relative p-5">
        <div className="text-xs font-semibold uppercase tracking-[0.12em] opacity-80">
          Where to next
        </div>
        <h2 className="font-display mt-1.5 max-w-lg text-2xl font-semibold">
          Tell Aly a week you could get away, and she&rsquo;ll build the trip
          around it
        </h2>
        {knows && <p className="mt-1.5 max-w-lg text-sm opacity-90">{knows}</p>}
        <div className="mt-4 flex flex-wrap gap-2">
          <Link className="btn btn-primary" href="/trips/new">
            Start a trip
          </Link>
          <Link className="btn btn-ghost" href="/someday">
            Open the someday list
          </Link>
          <Link className="btn btn-ghost" href="/reviews">
            Log a past trip
          </Link>
        </div>
      </div>
    </section>
  );
}

/** Saved places whose season comes round next, with the months they ticked. */
function InSeason({ season }) {
  if (!season?.rows?.length) return null;
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-ink">{season.heading}</h2>
      <ul className="mt-2">
        {season.rows.map((row, i) => (
          <li
            key={row.id}
            className={`py-2.5 ${i > 0 ? "border-t border-line" : ""}`}
          >
            <span className="block text-xs font-semibold uppercase tracking-wide text-teal">
              {row.months}
            </span>
            <span className="mt-0.5 block min-w-0">
              <span className="block text-sm font-medium text-ink">{row.place}</span>
              {row.why && (
                <span className="mt-0.5 block text-xs text-ink-soft">{row.why}</span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link className="btn btn-primary" href={season.planHref}>
          Plan one of these
        </Link>
        {season.more > 0 && (
          <Link className="btn btn-ghost" href="/someday">
            See all {season.total}
          </Link>
        )}
      </div>
    </section>
  );
}

/** What the app is holding onto while nothing is booked. */
function Watching({ watching }) {
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-ink">What Aly is watching for you</h2>
      <div className="mt-2 flex flex-wrap gap-2">
        {watching.chips.map((chip) => (
          <span key={chip.label} className="chip chip-shade">
            <strong className="font-semibold">{chip.count}</strong> {chip.label}
          </span>
        ))}
      </div>
      <p className="mt-2.5 text-sm text-ink-soft">{watching.sentence}</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <Link className="btn btn-ghost" href="/inbox">
          Forward a fare
        </Link>
        <Link className="btn btn-ghost" href="/wallet">
          Wallet
        </Link>
      </div>
    </section>
  );
}

/** Where the family has already been, and which of those Aly learned nothing from. */
function TripLog({ log }) {
  if (!log.length) return null;
  return (
    <section className="card p-4">
      <h2 className="text-sm font-semibold text-ink">From the trip log</h2>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        {log.map((row) => (
          <div key={row.id} className="min-w-0">
            <Link
              className="block text-sm font-medium text-ink underline decoration-line-strong underline-offset-2"
              href={row.href}
            >
              {row.name}
              {row.when ? ` · ${row.when}` : ""}
            </Link>
            <p className="mt-0.5 text-xs text-ink-soft">{row.note}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function NowEmpty({ knows = null, season = null, watching, log = [] }) {
  return (
    <div className="mb-7 grid gap-3">
      <Invitation knows={knows} />
      <div className="grid items-start gap-3 md:grid-cols-2">
        {season && <InSeason season={season} />}
        {watching && <Watching watching={watching} />}
      </div>
      <TripLog log={log} />
    </div>
  );
}
