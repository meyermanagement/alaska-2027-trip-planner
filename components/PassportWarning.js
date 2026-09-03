import Link from "next/link";
import WarningTask from "./WarningTask";
import { formatDayYear } from "@/lib/format";

// Every date in this panel is an expiry or a deadline being weighed against one,
// so they are all said the same way and none of them arrive as 2027-05-01. The
// fallback keeps a date the app cannot parse visible rather than blank: a
// passport line with no date at all is worse than an ugly one.
const said = (value) => formatDayYear(value) || String(value || "");

/**
 * The band that says a passport is going to be a problem.
 *
 * Deliberately the loudest thing in the app: solid rose, full width, directly
 * under the header on every screen. That is not decoration. The six-month rule is
 * a trap precisely because nothing looks wrong — the passport is valid for every
 * single day of the trip, so every check anyone would think to make comes back
 * clean, and the problem only appears at a desk at the airport. A quiet warning
 * about a quiet problem is no warning at all.
 *
 * No dismiss button, and that is on purpose. There is nothing here to weigh up,
 * and the band is not stored anywhere: it is worked out from the passport dates
 * and the return date every time a page is drawn, so putting the new expiry date
 * in on the Family tab makes it disappear by itself. A dismiss button would only
 * let it be hidden while still being true.
 */
export default function PassportWarning({ warnings = [], compact = true }) {
  if (!warnings.length) return null;

  // Two at most in the band. Somebody with three trips in trouble needs the
  // Family tab, not a taller band — and a band that grows without limit is a band
  // that pushes the app off the screen.
  const lead = warnings.slice(0, 2);
  const rest = warnings.length - lead.length;

  return (
    <section
      aria-label="Passport warning"
      className="no-print border-b border-rose/40 bg-rose text-on-accent"
    >
      <div className="mx-auto max-w-5xl px-5 py-3">
        <ul className="space-y-1.5">
          {lead.map((warning) => (
            <li
              key={warning.tripId}
              className="text-[0.92rem] leading-snug sm:flex sm:items-baseline sm:gap-2"
            >
              <span className="mr-2 whitespace-nowrap text-[0.68rem] font-bold uppercase tracking-[0.09em] opacity-90">
                {warning.severity === "expired"
                  ? "Expires too soon"
                  : warning.severity === "short"
                    ? "Six-month rule"
                    : "No passport on file"}
              </span>
              <span className="font-semibold">{warning.headline}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-[0.82rem]">
          {rest > 0 ? (
            <span className="mr-2 opacity-90">
              And {rest} more {rest === 1 ? "trip" : "trips"}.
            </span>
          ) : null}
          {compact ? (
            <Link
              href="/family"
              className="font-semibold underline decoration-white/60 underline-offset-2 hover:decoration-white"
            >
              Check the passports
            </Link>
          ) : null}
        </p>
      </div>
    </section>
  );
}

/**
 * The same warnings on the Family tab, where there is room to name everybody and
 * say what to do about it. Shown above the list of people, because the list is
 * where the fix goes in.
 */
export function PassportWarningPanel({ warnings = [] }) {
  if (!warnings.length) return null;

  return (
    <section aria-label="Passport warnings" className="mb-6 space-y-3">
      {warnings.map((warning) => (
        <div
          key={warning.tripId}
          className="rounded-2xl border border-rose/40 bg-rose/8 p-5"
        >
          <p className="text-[0.7rem] font-bold uppercase tracking-[0.09em] text-rose">
            {warning.tripName}
          </p>
          <h3 className="mt-1 font-display text-lg font-semibold leading-snug text-ink">
            {warning.headline}
          </h3>
          <ul className="mt-3 space-y-1.5 text-sm text-ink-soft">
            {warning.expired.map((person) => (
              <li key={`e-${person.name}`}>
                <strong className="font-semibold text-ink">
                  {person.name}
                </strong>{" "}
                — expires {said(person.expiry)}, before you are home on{" "}
                {said(warning.returnDate)}.
              </li>
            ))}
            {warning.short.map((person) => (
              <li key={`s-${person.name}`}>
                <strong className="font-semibold text-ink">
                  {person.name}
                </strong>{" "}
                — expires {said(person.expiry)}. {warning.where} wants it valid
                until {said(warning.mustLastUntil)}.
              </li>
            ))}
            {warning.missing.map((person) => (
              <li key={`m-${person.name}`}>
                <strong className="font-semibold text-ink">
                  {person.name}
                </strong>{" "}
                — no passport recorded. Add the expiry date below and it will be
                watched from then on.
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[0.82rem] leading-relaxed text-ink-soft">
            Renewals are quoted in weeks rather than days, and the six-month
            window is checked by the airline at check-in as well as at the
            border, so it is worth doing long before it feels urgent.
          </p>
          {/* A warning says something is wrong; a task is the app agreeing to
              keep saying so every morning until it is not. Worth being able to
              ask for, because a passport renewal is measured in weeks. */}
          <WarningTask tripId={warning.tripId} />
        </div>
      ))}
    </section>
  );
}
