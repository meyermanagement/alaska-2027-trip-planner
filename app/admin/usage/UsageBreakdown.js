import PageHeader from "@/components/PageHeader";

/**
 * What the model bill went on, by the part of the app that asked.
 *
 * Every call the app makes to a model now writes a row saying which feature
 * asked, which model answered, and what Google counted. This reads those rows
 * back the way the question is actually asked: not "how many calls were there"
 * but "which screen is the money", and then, inside that, "why".
 *
 * The second half is the part worth having. Ask Aly is not one call per question
 * -- a single turn can run the answer, a retry after a malformed reply, the cards
 * under it, the reasons beside them, and a title for the conversation. Pro tips
 * looks like one press and is five steps plus a facts lookup that goes stale
 * every week. An area's total is a number; its steps are the explanation, and
 * the explanation is what a decision gets made from. So each area opens.
 *
 * Tokens and calls only. No dollar figures anywhere on this screen: the rows hold
 * what was counted, not what was charged, and prices change per model, per tier
 * and per whether a cached prefix was hit. A number here that looked like an
 * invoice and was not would be worse than no number, because it would be used.
 *
 * Nothing here is a chart from a library. A share of a total is a bar, which is
 * a div with a width, and the app has no chart dependency to spend on this.
 */

const WINDOWS = [7, 30, 90];

/** 1,284,003 rather than 1284003, and 0 rather than a dash. */
function count(value) {
  return Number(value || 0).toLocaleString("en-US");
}

/** Big token counts said short, because seven digits in a table cell is noise. */
function tokens(value) {
  const n = Number(value || 0);
  if (n >= 1_000_000)
    return `${(n / 1_000_000).toFixed(n >= 10_000_000 ? 0 : 1)}M`;
  if (n >= 10_000) return `${Math.round(n / 1000)}k`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

function share(part, whole) {
  if (!whole) return 0;
  return Math.round((Number(part || 0) / whole) * 1000) / 10;
}

function seconds(ms) {
  if (ms === null || ms === undefined) return "\u2013";
  const n = Number(ms);
  if (!Number.isFinite(n)) return "\u2013";
  return n >= 1000 ? `${(n / 1000).toFixed(1)}s` : `${Math.round(n)}ms`;
}

/** The share bar. Hidden from a screen reader, which is given the figure. */
function Bar({ percent }) {
  return (
    <span
      aria-hidden="true"
      className="mt-1 block h-1 w-full overflow-hidden rounded-full bg-sand"
    >
      <span
        className="block h-full rounded-full bg-teal"
        style={{ width: `${Math.max(percent, percent > 0 ? 1.5 : 0)}%` }}
      />
    </span>
  );
}

function Figure({ label, value, note }) {
  return (
    <div className="card p-4">
      <div className="text-xs uppercase tracking-wide text-ink-faint">
        {label}
      </div>
      <div className="mt-1 font-display text-2xl font-semibold text-ink">
        {value}
      </div>
      {note ? <div className="mt-0.5 text-xs text-ink-soft">{note}</div> : null}
    </div>
  );
}

export default function UsageBreakdown({
  days = 30,
  areas = [],
  models = [],
  daily = [],
  totals,
  keyMissing = false,
}) {
  const grand = totals?.totalTokens || 0;
  const busiest = daily.reduce(
    (most, one) => Math.max(most, Number(one.total_tokens || 0)),
    0,
  );

  return (
    <main className="screen px-5 pb-16 pt-7">
      <PageHeader
        title="Usage"
        subtitle="What the app spent on AI models, by the part of it that asked. Counts and tokens as the model reported them, never a price: what a token costs depends on the model and the tier, and a figure here that looked like the invoice would be trusted like one."
        above={
          <a href="/admin" className="text-sm text-ink-soft hover:text-ink">
            &larr; Admin
          </a>
        }
      />

      {/* The window, as links rather than a control, so the range survives a
          refresh and can be sent to somebody. */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs uppercase tracking-wide text-ink-faint">
          Window
        </span>
        {WINDOWS.map((span) => (
          <a
            key={span}
            href={`/admin/usage?days=${span}`}
            aria-current={span === days ? "page" : undefined}
            className={
              span === days
                ? "rounded-full border border-teal bg-teal px-2.5 py-1 text-sm font-medium text-white"
                : "rounded-full border border-[var(--line)] px-2.5 py-1 text-sm text-ink-soft transition hover:border-[var(--line-hover)] hover:text-ink"
            }
          >
            {span} days
          </a>
        ))}
      </div>

      {keyMissing ? (
        <p className="card mt-6 p-4 text-sm text-ink-soft">
          This screen reads every account&rsquo;s calls, which needs the service
          key. It is not set on this deployment, so there is nothing to show.
          That is not an empty month; it is no way to ask.
        </p>
      ) : !areas.length ? (
        <div className="card mt-6 p-5">
          <p className="font-semibold text-ink">
            Nothing recorded in the last {days} days.
          </p>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">
            Counting began on the seventeenth of September, so a longer window
            partly covers days when nothing was being written down. If
            today&rsquo;s calls are missing too, remember the recorder fails
            quietly on purpose, since it must never block an answer. In that
            case the thing to check is whether the calls are happening at all.
          </p>
        </div>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Figure label="Calls" value={count(totals.calls)} />
            <Figure
              label="Tokens"
              value={tokens(grand)}
              note={`${count(grand)} counted`}
            />
            <Figure
              label="Thinking"
              value={`${share(totals.thinkingTokens, grand)}%`}
              note="of every token, spent before a word was written"
            />
            <Figure
              label="Wasted"
              value={count(totals.failed)}
              note={
                totals.failed
                  ? "calls that were billed and came back unusable"
                  : "no call came back unusable"
              }
            />
          </div>

          {/* Day by day, so a spike has a date on it. Days with no calls are
              absent from the rollup rather than zero, and are drawn as gaps. */}
          {daily.length > 1 ? (
            <section className="card mt-4 p-4">
              <h2 className="text-xs uppercase tracking-wide text-ink-faint">
                Tokens by day
              </h2>
              <ol className="mt-3 flex h-16 items-end gap-[2px]">
                {daily.map((one) => (
                  <li
                    key={one.day}
                    title={`${one.day}: ${count(one.total_tokens)} tokens over ${count(one.calls)} calls`}
                    className="flex-1 rounded-sm bg-teal/70"
                    style={{
                      height: `${Math.max(
                        busiest
                          ? (Number(one.total_tokens || 0) / busiest) * 100
                          : 0,
                        2,
                      )}%`,
                    }}
                  />
                ))}
              </ol>
              <div className="mt-2 flex justify-between text-xs text-ink-faint">
                <span>{daily[0]?.day}</span>
                <span>{daily[daily.length - 1]?.day}</span>
              </div>
            </section>
          ) : null}

          <h2 className="mt-8 font-display text-xl font-semibold text-ink">
            By feature
          </h2>
          <p className="mt-1 max-w-prose text-sm text-ink-soft">
            Ordered by tokens rather than by calls, because one call carrying
            the whole tool schema and a hundred one-line calls are not the same
            spending. Open a row to see the separate calls it is made of.
          </p>

          <ul className="mt-4 space-y-2">
            {areas.map((area) => {
              const percent = share(area.totalTokens, grand);
              return (
                <li key={area.id} className="card p-0">
                  <details className="[&[open]_.caret]:rotate-90">
                    <summary className="cursor-pointer list-none p-4">
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="flex min-w-0 items-baseline gap-2">
                          {/* The only sign the row opens. A drawer with no
                              mark on it is a card that happens to react. */}
                          <svg
                            viewBox="0 0 12 12"
                            aria-hidden="true"
                            className="caret mt-1 h-3 w-3 shrink-0 self-start text-ink-faint transition-transform"
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
                          <span className="min-w-0">
                            <span className="block font-semibold text-ink">
                              {area.label}
                            </span>
                            <span className="mt-0.5 block text-sm text-ink-soft">
                              {count(area.calls)}{" "}
                              {area.calls === 1 ? "call" : "calls"}
                              {area.steps.length > 1
                                ? ` across ${area.steps.length} steps`
                                : ""}
                              {area.failed
                                ? ` · ${count(area.failed)} wasted`
                                : ""}
                              {area.searches
                                ? ` · ${count(area.searches)} searches`
                                : ""}
                            </span>
                          </span>
                        </span>
                        <span className="shrink-0 text-right">
                          <span className="block font-display text-lg font-semibold text-ink">
                            {tokens(area.totalTokens)}
                          </span>
                          <span className="block text-xs text-ink-faint">
                            {percent}% of all
                          </span>
                        </span>
                      </div>
                      <Bar percent={percent} />
                    </summary>

                    <div className="border-t border-[var(--line)] px-4 pb-4 pt-3">
                      <ul className="space-y-3">
                        {area.steps.map((step) => (
                          <li key={step.key}>
                            <div className="flex items-baseline justify-between gap-4">
                              <span className="min-w-0 text-sm text-ink">
                                {step.label}
                              </span>
                              <span className="shrink-0 text-sm text-ink-soft">
                                {tokens(step.totalTokens)}
                              </span>
                            </div>
                            <div className="mt-0.5 text-xs text-ink-faint">
                              {count(step.calls)}{" "}
                              {step.calls === 1 ? "call" : "calls"} ·{" "}
                              {tokens(step.promptTokens)} asked ·{" "}
                              {tokens(step.thinkingTokens)} thinking ·{" "}
                              {tokens(step.replyTokens)} answered ·{" "}
                              {seconds(step.msMedian)} typical
                              {step.failed
                                ? ` · ${count(step.failed)} wasted`
                                : ""}
                            </div>
                            <div className="mt-0.5 text-xs text-ink-faint">
                              {step.models.join(", ")} · {step.key}
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </details>
                </li>
              );
            })}
          </ul>

          {models.length ? (
            <>
              <h2 className="mt-8 font-display text-xl font-semibold text-ink">
                By model
              </h2>
              <p className="mt-1 max-w-prose text-sm text-ink-soft">
                The same calls, counted by which model answered them. A model
                with a share of the tokens far above its share of the calls is
                the one to look at first when a cheaper one would have done.
              </p>
              <ul className="mt-4 space-y-2">
                {models.map((model) => (
                  <li
                    key={model.model}
                    className="card flex items-baseline justify-between gap-4 p-4"
                  >
                    <span className="min-w-0">
                      <span className="block font-medium text-ink">
                        {model.model}
                      </span>
                      <span className="mt-0.5 block text-sm text-ink-soft">
                        {count(model.calls)}{" "}
                        {model.calls === 1 ? "call" : "calls"} ·{" "}
                        {seconds(model.ms_median)} typical
                        {model.failed ? ` · ${count(model.failed)} wasted` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block font-display text-lg font-semibold text-ink">
                        {tokens(model.total_tokens)}
                      </span>
                      <span className="block text-xs text-ink-faint">
                        {share(model.total_tokens, grand)}% of all
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}
    </main>
  );
}
