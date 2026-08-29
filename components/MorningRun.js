import { runStatus, lastTest, OK, QUIET, EARLY } from "@/lib/tasks/runs";
import { HOME_ZONE } from "@/lib/format";

/**
 * Whether this morning's reminder email actually went out, said on the screen the
 * email is about.
 *
 * This exists because of a morning where a task was due, the server had every
 * setting it needed, and nothing arrived — and there was no way to tell from the
 * app whether the send had failed or the scheduler had never called at all. The
 * two have completely different fixes and the app was silent about both.
 *
 * Deliberately quiet when there is nothing wrong. On a normal morning it is one
 * grey line saying the email went out, because a green banner every day is a
 * banner nobody reads on the day it turns red. It raises its voice for exactly
 * two situations: a run that failed, and a run that never happened after the hour
 * it was due.
 */
export default function MorningRun({ runs, today, dueCount = 0, hour }) {
  const status = runStatus({
    runs,
    today,
    dueCount,
    ...(hour === undefined ? {} : { hour }),
  });
  const test = lastTest(runs);
  const calm =
    status.state === OK || status.state === QUIET || status.state === EARLY;

  return (
    <section
      className={
        calm
          ? "mb-5 text-xs leading-relaxed text-ink-faint"
          : "mb-5 rounded-xl border border-amber/50 bg-amber/10 p-3 text-sm leading-relaxed"
      }
      aria-live="polite"
    >
      <p className={calm ? "" : "font-semibold"}>
        {status.ranAt && calm
          ? `${withoutStop(status.headline)} at ${clockAt(status.ranAt)}.`
          : status.headline}
      </p>
      {status.detail && (
        <p className={calm ? "mt-0.5" : "mt-1 text-ink-soft"}>
          {status.detail}
        </p>
      )}
      {!calm && test && (
        // The evidence that separates the two fixes. If a test send worked, the
        // mailer is fine and the scheduler is the problem; if it failed with the
        // same words, the mailer is the problem and the scheduler is innocent.
        <p className="mt-1 text-ink-soft">
          {test.ok
            ? `A test email was sent successfully at ${clockAt(test.ranAt)}, so the mailer itself works — this is the scheduled job, not the email.`
            : test.nothing
              ? `The last test found nothing of yours due, so it proved nothing either way.`
              : `The last test was refused too: ${test.error}`}
        </p>
      )}
      {!calm && (
        <p className="mt-1 text-ink-soft">
          You can send yourself a copy from the Family tab to see whether the
          email works at all.
        </p>
      )}
    </section>
  );
}

/**
 * The clock at home, not on the server and not in the reader's browser. A run
 * recorded at 12:02 UTC happened at seven in the morning in Missouri, and seven in
 * the morning is the only version of that fact anybody wants read back to them.
 */
function clockAt(iso) {
  const when = new Date(iso);
  if (Number.isNaN(when.getTime())) return "an unknown time";
  return new Intl.DateTimeFormat("en-US", {
    timeZone: HOME_ZONE,
    hour: "numeric",
    minute: "2-digit",
  }).format(when);
}

/**
 * The headline is a finished sentence, because most of the time it is read on its
 * own. When the time is added to the end of it, the full stop in the middle has to
 * come off — "went out to 1 person. at 7:02 AM." is the sort of thing nobody
 * notices while writing it and everybody notices while reading it.
 */
function withoutStop(sentence) {
  return sentence.replace(/\.$/, "");
}
