import {
  NOT_USED,
  SURVEY_SECTIONS,
  SURVEY_TOTAL,
  answeredCount,
  medianDollars,
} from "@/lib/beta/survey";

/**
 * What the beta survey came back with, read two ways on one page.
 *
 * The rollup first, because the numbers are the reason to open this at all: how
 * a question scored across everybody who answered it, and what people said a
 * fair price was. Then the sheets themselves, one per tester, because the
 * sentences are where the actual work comes from and a mean of a five-point
 * scale has never once told anybody what to fix.
 *
 * Split from the page for the same reason the beta desk is: no service-role key
 * and no session needed to look at the layout.
 *
 * Nothing here is a chart from a library. A scale question is a row of five
 * counts and an average, which is a table; the app has no chart dependency and
 * this is not the place to acquire one.
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

/** $12 rather than $12.00, and $12.50 when the halves matter. */
function money(value) {
  if (value === null || value === undefined) return null;
  const whole = Math.round(value * 100) % 100 === 0;
  return `$${whole ? Math.round(value) : value.toFixed(2)}`;
}

/**
 * One scale question across everybody: the average, and where the answers sat.
 *
 * "Never used it" is counted apart rather than as a low score. On the parts
 * section that distinction is the whole point -- a tab nobody has opened is a
 * discovery problem, and a tab everybody opened and rated two is a different
 * problem with a different fix.
 */
function scaleRollup(id, sheets) {
  const values = [];
  let unused = 0;
  for (const sheet of sheets) {
    const value = sheet.answers?.[id];
    if (value === NOT_USED) {
      unused += 1;
      continue;
    }
    const n = Number(value);
    if (Number.isFinite(n) && n >= 1 && n <= 5) values.push(n);
  }
  const spread = [1, 2, 3, 4, 5].map(
    (n) => values.filter((one) => one === n).length,
  );
  const average = values.length
    ? Math.round((values.reduce((sum, n) => sum + n, 0) / values.length) * 10) /
      10
    : null;
  return { average, answered: values.length, unused, spread };
}

function Spread({ spread, answered }) {
  return (
    <div className="mt-1.5 flex gap-1">
      {spread.map((count, index) => {
        const share = answered ? count / answered : 0;
        return (
          <div key={index} className="flex-1">
            <div className="flex h-8 items-end overflow-hidden rounded-sm bg-sand">
              <div
                className="w-full rounded-sm bg-teal"
                style={{ height: `${count ? Math.max(share * 100, 8) : 0}%` }}
              />
            </div>
            <p className="tabular mt-0.5 text-center text-[0.65rem] text-ink-soft">
              {index + 1}
            </p>
          </div>
        );
      })}
    </div>
  );
}

function ScaleRow({ question, sheets }) {
  const { average, answered, unused, spread } = scaleRollup(
    question.id,
    sheets,
  );
  return (
    <div className="border-t border-[var(--line)] pt-3 first:border-0 first:pt-0">
      <p className="text-sm font-medium text-ink">{question.prompt}</p>
      <p className="mt-1 text-[0.78rem] text-ink-soft">
        {answered ? (
          <>
            <span className="tabular font-semibold text-ink">{average}</span> of
            5, from {answered} {answered === 1 ? "answer" : "answers"}
            {unused
              ? `. ${unused} ${unused === 1 ? "has" : "have"} not used it`
              : ""}
          </>
        ) : unused ? (
          `Nobody has used it. ${unused} said so.`
        ) : (
          "Nobody has answered this yet."
        )}
      </p>
      {answered ? <Spread spread={spread} answered={answered} /> : null}
      <p className="mt-1 text-[0.65rem] text-ink-soft">
        1 {question.low} · 5 {question.high}
      </p>
    </div>
  );
}

function ChoiceRow({ question, sheets }) {
  const said = sheets
    .map((sheet) => sheet.answers?.[question.id])
    .filter(Boolean);
  return (
    <div className="border-t border-[var(--line)] pt-3 first:border-0 first:pt-0">
      <p className="text-sm font-medium text-ink">{question.prompt}</p>
      {said.length ? (
        <ul className="mt-1.5 space-y-1">
          {question.options
            .map((option) => ({
              option,
              count: said.filter((one) => one === option).length,
            }))
            .filter((one) => one.count)
            .sort((a, b) => b.count - a.count)
            .map(({ option, count }) => (
              <li key={option} className="flex gap-2 text-[0.78rem]">
                <span className="tabular w-6 shrink-0 font-semibold text-ink">
                  {count}
                </span>
                <span className="text-ink-soft">{option}</span>
              </li>
            ))}
        </ul>
      ) : (
        <p className="mt-1 text-[0.78rem] text-ink-soft">
          Nobody has answered this yet.
        </p>
      )}
    </div>
  );
}

/**
 * A price question: the middle number, and then everybody's own words.
 *
 * The words are shown as well as the median because the question is answered in
 * a text box on purpose. "About 10, but only if it does the flights" is a better
 * answer than 10, and rounding it into a column would throw away the condition
 * that came with it.
 */
function MoneyRow({ question, sheets }) {
  const said = sheets
    .map((sheet) => ({
      email: sheet.email,
      words: sheet.answers?.[question.id],
    }))
    .filter((one) => one.words);
  const middle = medianDollars(said.map((one) => one.words));
  return (
    <div className="border-t border-[var(--line)] pt-3 first:border-0 first:pt-0">
      <p className="text-sm font-medium text-ink">{question.prompt}</p>
      <p className="mt-1 text-[0.78rem] text-ink-soft">
        {said.length ? (
          middle === null ? (
            `${said.length} ${said.length === 1 ? "answer" : "answers"}, none of them a number.`
          ) : (
            <>
              In the middle:{" "}
              <span className="tabular font-semibold text-ink">
                {money(middle)}
              </span>{" "}
              a month, from {said.length}{" "}
              {said.length === 1 ? "answer" : "answers"}.
            </>
          )
        ) : (
          "Nobody has answered this yet."
        )}
      </p>
      {said.length ? (
        <ul className="mt-1.5 space-y-1">
          {said.map((one) => (
            <li key={one.email} className="text-[0.78rem] text-ink-soft">
              <span className="text-ink">{one.words}</span>
              {" · "}
              {one.email}
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function TextRow({ question, sheets }) {
  const said = sheets
    .map((sheet) => ({
      email: sheet.email,
      words: sheet.answers?.[question.id],
    }))
    .filter((one) => one.words);
  return (
    <div className="border-t border-[var(--line)] pt-3 first:border-0 first:pt-0">
      <p className="text-sm font-medium text-ink">{question.prompt}</p>
      {said.length ? (
        <ul className="mt-2 space-y-2.5">
          {said.map((one) => (
            <li key={one.email}>
              <p className="whitespace-pre-line text-[0.85rem] leading-relaxed text-ink">
                {one.words}
              </p>
              <p className="mt-0.5 text-[0.7rem] text-ink-soft">{one.email}</p>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-[0.78rem] text-ink-soft">
          Nobody has written anything here yet.
        </p>
      )}
    </div>
  );
}

function Row({ question, sheets }) {
  if (question.kind === "scale")
    return <ScaleRow question={question} sheets={sheets} />;
  if (question.kind === "choice")
    return <ChoiceRow question={question} sheets={sheets} />;
  if (question.kind === "money")
    return <MoneyRow question={question} sheets={sheets} />;
  return <TextRow question={question} sheets={sheets} />;
}

export default function SurveySheets({ sheets = [], keyMissing = false }) {
  const sent = sheets.filter((one) => one.submittedAt).length;
  const started = sheets.filter((one) => answeredCount(one.answers) > 0);

  return (
    <main className="screen px-5 pb-16 pt-7">
      <p className="text-[0.7rem] font-semibold uppercase tracking-[0.09em] text-ink-soft">
        <a href="/admin" className="hover:text-teal">
          Beta desk
        </a>
      </p>
      <h1 className="font-display mt-1 text-3xl font-semibold">Beta survey</h1>
      <p className="mt-2 max-w-prose text-sm text-ink-soft">
        {keyMissing
          ? "This deployment has no service-role key set, so nothing can be read."
          : started.length
            ? `${started.length} ${started.length === 1 ? "sheet" : "sheets"} with something in ${started.length === 1 ? "it" : "them"}, ${sent} sent. Testers can change any answer at any time, so a sheet is never final.`
            : "Nobody has answered anything yet. The survey sits under More for anybody on a beta code."}
      </p>

      {started.length ? (
        <>
          <div className="mt-7 space-y-10">
            {SURVEY_SECTIONS.map((section) => (
              <section key={section.key}>
                <h2 className="font-display text-xl font-semibold">
                  {section.title}
                </h2>
                <div className="card mt-3 space-y-3 p-4">
                  {section.questions.map((question) => (
                    <Row
                      key={question.id}
                      question={question}
                      sheets={started}
                    />
                  ))}
                </div>
              </section>
            ))}
          </div>

          {/* Who wrote what, and how far they got. The answers themselves are
              already above, grouped by the question they answer, which is the
              way they are actually read -- five people on one problem beats one
              person on five. This is the roll call: who has started, who has
              sent, and who stopped halfway and might want a nudge. */}
          <section className="mt-10">
            <h2 className="font-display text-xl font-semibold">Who answered</h2>
            <ul className="card mt-3 divide-y divide-[var(--line)] p-0">
              {sheets.map((sheet) => {
                const answered = answeredCount(sheet.answers);
                return (
                  <li key={sheet.email} className="px-4 py-3">
                    <p className="text-sm font-medium text-ink">
                      {sheet.email}
                    </p>
                    <p className="mt-0.5 text-[0.78rem] text-ink-soft">
                      <span className="tabular">
                        {answered} of {SURVEY_TOTAL}
                      </span>{" "}
                      answered ·{" "}
                      {sheet.submittedAt
                        ? `sent ${when(sheet.submittedAt)}`
                        : "still being written"}
                      {sheet.updatedAt
                        ? ` · last touched ${when(sheet.updatedAt)}`
                        : ""}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        </>
      ) : null}
    </main>
  );
}
