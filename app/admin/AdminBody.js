import { saidPlainly } from "@/lib/usage/metrics";
import CodeDesk from "./CodeDesk";

/**
 * What the beta desk draws. Split from the page so the layout can be looked at
 * without a service-role key or a signed-in session, the same way SettingsBody is.
 *
 * The frame is left to the page, unlike Settings, so this file needs nothing
 * from the server and can be rendered on its own with made-up rows while its
 * layout is being worked on.
 *
 * Four things in the order they are wanted: hand somebody the way in, see
 * whether they took it, see what came back broken, then see where the first run
 * loses people. The reports themselves live on the issue log, which is its own
 * page: it is the one part of this screen that grows without limit, and a
 * summary with a way in beats a feed that pushes the funnel off the bottom. The funnel and
 * the question timings are drawn here as plain bars in markup rather than through
 * a chart library — there is no chart dependency in this app and a horizontal bar
 * whose width is a percentage does not need one.
 */

function when(value) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** "home_base" reads as "Home base" on a screen. */
function slotLabel(slot) {
  const words = String(slot || "").replace(/[_-]+/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function Bar({ share, tone = "teal" }) {
  const width = `${Math.max(Math.round((share || 0) * 100), 1)}%`;
  return (
    <div className="mt-1.5 h-2 w-full overflow-hidden rounded-full bg-sand">
      <div
        className={
          tone === "rose"
            ? "h-full rounded-full bg-rose/70"
            : "h-full rounded-full bg-teal"
        }
        style={{ width }}
      />
    </div>
  );
}

/** $12 rather than $12.00, and $12.50 when the halves matter. */
function money(value) {
  if (value === null || value === undefined) return null;
  const whole = Math.round(value * 100) % 100 === 0;
  return `$${whole ? Math.round(value) : value.toFixed(2)}`;
}

export default function AdminBody({
  codes = [],
  issues = null,
  survey = null,
  steps = [],
  questions = [],
  testers = [],
  windowDays = 30,
  keyMissing = false,
}) {
  const slowest = questions.length ? questions[0].medianMs || 1 : 1;
  const reachedTop = steps.length ? steps[0].reached : 0;
  const finished = steps.length ? steps[steps.length - 1].reached : 0;

  return (
    <main className="screen px-5 pb-16 pt-7">
      <h1 className="font-display text-3xl font-semibold">Beta desk</h1>
      <p className="mt-2 max-w-prose text-sm text-ink-soft">
        Invites, and what happens after somebody opens one. Activity covers the
        last {windowDays} days.
      </p>

      {keyMissing && (
        <p className="card mt-5 p-4 text-sm">
          This deployment has no service-role key set, so the desk cannot read
          codes or activity. Everything below will stay empty until it does.
        </p>
      )}

      <div className="mt-7 space-y-10">
        <CodeDesk codes={codes} />

        <section>
          <h2 className="font-display text-xl font-semibold">Issue log</h2>
          <p className="mt-1.5 max-w-prose text-sm text-ink-soft">
            {issues?.total
              ? `${issues.total} ${issues.total === 1 ? "report" : "reports"}, ${issues.waiting} not looked at yet. ${issues.faults} of them the app reported on itself, seen ${issues.times} ${issues.times === 1 ? "time" : "times"}.`
              : "Nothing yet. Reports arrive from the flag inside the app, and faults record themselves."}
          </p>
          {issues?.talk ? (
            <p className="mt-1.5 text-sm text-ink-soft">
              {issues.talk} {issues.talk === 1 ? "wants" : "want"} a
              conversation before any code.
              {issues.maybeFixed
                ? ` ${issues.maybeFixed} may already be fixed.`
                : ""}
            </p>
          ) : null}
          <a href="/admin/issues" className="btn btn-primary btn-sm mt-3">
            Open the issue log
          </a>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">Beta survey</h2>
          <p className="mt-1.5 max-w-prose text-sm text-ink-soft">
            {survey?.started
              ? `${survey.started} ${survey.started === 1 ? "sheet" : "sheets"} with something in ${survey.started === 1 ? "it" : "them"}, ${survey.sent} sent and ${survey.writing} still being written.`
              : "Nobody has answered anything yet. The survey sits under More, and testers can change any answer afterwards."}
          </p>
          {survey?.fair !== null && survey?.fair !== undefined ? (
            <p className="mt-1.5 text-sm text-ink-soft">
              A fair price, in the middle:{" "}
              <span className="tabular font-semibold text-ink">
                {money(survey.fair)}
              </span>{" "}
              a month
              {survey.tooMuch !== null && survey.tooMuch !== undefined
                ? `, and too much at ${money(survey.tooMuch)}.`
                : "."}
            </p>
          ) : null}
          <a href="/admin/survey" className="btn btn-primary btn-sm mt-3">
            Read the answers
          </a>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">
            Where the first run loses people
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            {reachedTop
              ? `${reachedTop} started, ${finished} reached a trip of their own.`
              : "Nothing recorded yet. The first signed-in visit will fill this in."}
          </p>

          <ol className="mt-4 space-y-4">
            {steps.map((step) => (
              <li key={step.key}>
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="text-sm font-semibold">{step.label}</span>
                  <span className="text-xs text-ink-soft">
                    {step.reached} {step.reached === 1 ? "person" : "people"}
                    {step.lost ? ` · ${step.lost} lost here` : ""}
                  </span>
                </div>
                <Bar share={step.share} />
                <div className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-soft">
                  <span>{step.blurb}</span>
                  {step.medianMs && (
                    <span>
                      Typically {saidPlainly(step.medianMs)}, average{" "}
                      {saidPlainly(step.meanMs)}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ol>
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">
            Which question they sit on
          </h2>
          <p className="mt-1.5 text-sm text-ink-soft">
            The interview never changes screens, so each question is timed on
            its own. Longest first.
          </p>
          {questions.length ? (
            <ol className="mt-4 space-y-3">
              {questions.map((one) => (
                <li key={one.slot}>
                  <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                    <span className="text-sm font-semibold">
                      {slotLabel(one.slot)}
                    </span>
                    <span className="text-xs text-ink-soft">
                      {saidPlainly(one.medianMs)} typically · {one.answers}{" "}
                      {one.answers === 1 ? "answer" : "answers"}
                      {one.backs ? ` · ${one.backs} went back` : ""}
                    </span>
                  </div>
                  <Bar
                    share={(one.medianMs || 0) / slowest}
                    tone={
                      one.medianMs && one.medianMs > 90000 ? "rose" : "teal"
                    }
                  />
                </li>
              ))}
            </ol>
          ) : (
            <p className="mt-3 text-sm text-ink-soft">
              No interview answers recorded in this window yet.
            </p>
          )}
        </section>

        <section>
          <h2 className="font-display text-xl font-semibold">
            Everybody with an account
          </h2>
          <ul className="mt-4 space-y-3">
            {testers.map((one) => (
              <li key={one.email || one.createdAt} className="card p-3.5">
                <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                  <span className="min-w-0 break-all text-sm font-semibold">
                    {one.email || "no address on the account"}
                  </span>
                  <span className="text-xs text-ink-soft">
                    {one.lastSignInAt
                      ? `Signed in ${when(one.lastSignInAt)}`
                      : "Never signed in"}
                  </span>
                </div>
                <div className="mt-1 text-xs text-ink-soft">
                  {one.furthest
                    ? `Got as far as ${one.furthest}.`
                    : "No screens recorded."}{" "}
                  {one.lastPath
                    ? `Last on ${one.lastPath}${
                        one.lastSeenAt ? `, ${when(one.lastSeenAt)}` : ""
                      }.`
                    : ""}{" "}
                  {one.views ? `${one.views} screens in the window.` : ""}
                </div>
              </li>
            ))}
            {!testers.length && (
              <li className="text-sm text-ink-soft">
                No accounts to show yet.
              </li>
            )}
          </ul>
        </section>
      </div>
    </main>
  );
}
