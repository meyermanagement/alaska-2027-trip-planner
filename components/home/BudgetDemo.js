/**
 * The money scene: the Maui example's budget with numbers in it, planned beside
 * actual for each part of the trip, and the question the budget exists to answer
 * next -- which card to put the next booking on -- answered with the three things
 * that decide it: points, perks, and the trip coverage the card carries.
 *
 * Every figure is invented for the example trip and agrees with the rest of the
 * page: the $6,000 week from Building the trip, the $1,880 condo, the 10:40
 * flight that cost more, day four of seven. The cards are described, not named,
 * because a real issuer's benefits are theirs to state and they change.
 */
const LINES = [
  { name: "Flights", planned: 1900, actual: 1964, note: "Booked, the 10:40 flight" },
  { name: "Where you stay", planned: 2000, actual: 1880, note: "Booked, the Kīhei condo" },
  { name: "Car", planned: 450, actual: 412, note: "Booked, paid at pickup" },
  { name: "Food and days out", planned: 1650, actual: 520, note: "So far, day 4 of\u00a07", open: 1610 },
];

const usd = (n) => `$${n.toLocaleString("en-US")}`;

// A booked line is final, so its difference is said now; an open one is
// compared on where it is heading, not on what has been spent so far.
function Diff({ line }) {
  const end = line.open ?? line.actual;
  const d = end - line.planned;
  if (d === 0) return null;
  const over = d > 0;
  return (
    <span className="home-budget-diff" data-over={over ? "true" : undefined}>
      {line.open ? "Heading " : ""}
      {usd(Math.abs(d))} {over ? "over" : "under"}
    </span>
  );
}

const REASONS = [
  ["Perks", "The $120 of travel credit left this year comes off first"],
  ["Points", "3x on the other $220: 660 points, about $10 back"],
  ["Coverage", "Joins the trip’s cancellation and interruption coverage, up to $10,000 a person, with the flights and condo already under it"],
];

export default function BudgetDemo() {
  const planned = LINES.reduce((s, l) => s + l.planned, 0);
  const actual = LINES.reduce((s, l) => s + l.actual, 0);
  const heading = LINES.reduce((s, l) => s + (l.open ?? l.actual), 0);
  return (
    <div className="ma-in card home-trip-example p-5" style={{ animationDelay: "80ms" }}>
      <div className="flex items-baseline justify-between gap-4">
        <p className="font-display text-[17px] font-semibold">Trip budget</p>
        <p className="home-trip-example-badge">Example trip</p>
      </div>

      <div className="home-budget mt-4" role="table" aria-label="Planned and actual cost, by part of the trip">
        <div className="home-budget-row home-budget-head" role="row">
          <span role="columnheader">Maui, 7 days</span>
          <span role="columnheader">Planned</span>
          <span role="columnheader">Actual</span>
        </div>
        {LINES.map((l) => (
          <div key={l.name} className="home-budget-row" role="row">
            <span role="cell" className="min-w-0">
              <span className="block text-[15px] font-semibold">{l.name}</span>
              <span className="block text-[13px] text-ink-soft">
                {l.note} <Diff line={l} />
              </span>
            </span>
            <span role="cell" className="home-budget-num text-ink-soft">{usd(l.planned)}</span>
            <span role="cell" className="home-budget-num">{usd(l.actual)}</span>
          </div>
        ))}
        <div className="home-budget-row home-budget-total" role="row">
          <span role="cell">Total</span>
          <span role="cell" className="home-budget-num">{usd(planned)}</span>
          <span role="cell" className="home-budget-num">{usd(actual)}</span>
        </div>
      </div>
      <p className="mt-2 text-[13px] text-ink-soft">
        On track to finish {usd(planned - heading)} under, with {usd(planned - actual)} left to spend.
      </p>

      <div className="home-trip-example-idea mt-4" data-kind="credit">
        <p className="home-trip-example-kind">Which card for the snorkel boat</p>
        <div className="flex items-baseline justify-between gap-4">
          <p className="text-[15px] font-semibold">Put it on your travel card</p>
          <p className="shrink-0 text-[13px] text-ink-soft">$340</p>
        </div>
        <dl className="mt-2 space-y-1.5 text-[13px] leading-relaxed">
          {REASONS.map(([k, v]) => (
            <div key={k} className="home-budget-reason">
              <dt className="font-semibold">{k}</dt>
              <dd className="text-ink-soft">{v}</dd>
            </div>
          ))}
        </dl>
        <p className="mt-2 text-[13px] text-ink-soft">
          Your airline card earns 1x here and does not cover tours.
        </p>
      </div>
    </div>
  );
}
