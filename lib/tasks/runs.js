// Reading the morning run back, hours later, in a sentence.
//
// Kept away from the database and the mailer on purpose, like the rules about who
// owes what: turning "here is a row, here is the clock" into "this is what
// happened to your email this morning" is the part that has to be right, and it
// is the part worth testing on its own.
//
// The distinction the whole file exists for: a morning with no email is one of
// three completely different situations, and until now they all looked the same
// from a chair.
//
//   1. The run happened and there was genuinely nothing due. Nothing is wrong.
//   2. The run happened, something was due, and the send was refused. Something
//      is wrong, and the mailer said what.
//   3. The run never happened at all. Something is wrong somewhere else
//      entirely -- the scheduler, the plan it runs on, the secret it carries --
//      and no amount of staring at the mailer will find it.
//
// Only the third one needs the clock, which is why the hour matters here.

import { formatDay, homeHour, homeToday } from "@/lib/format";

// The run is scheduled for 12:00 UTC, which is 7am at home in summer and 6am in
// winter. Before that hour, silence today means nothing at all -- it has not been
// asked to run yet -- and saying "no run recorded" at half past five in the
// morning would be raising an alarm about the future.
export const RUN_HOUR = 7;

// Vercel does not promise the minute. On the smaller plans a daily cron is
// triggered within the hour it was asked for, and a run that lands at 7:50 is
// working as designed. So nothing is called late until the window has closed.
export const GRACE_HOURS = 2;

export const OK = "ok";
export const QUIET = "quiet";
export const FAILED = "failed";
export const MISSING = "missing";
export const EARLY = "early";

/**
 * Which of the four situations we are in, and how to say it.
 *
 * @param {object} input
 * @param {Array} input.runs        reminder_runs rows, newest first
 * @param {string} [input.today]    YYYY-MM-DD in the household's zone
 * @param {number} [input.hour]     hour of the day at home, 0-23
 * @param {number} [input.dueCount] how many people have work due right now
 * @returns {{state: string, headline: string, detail: string|null, ranAt: string|null, source: string|null}}
 */
export function runStatus({
  runs = [],
  today = homeToday(),
  hour = homeHour(),
  dueCount = 0,
} = {}) {
  // Only the scheduler's runs answer the question "did this morning happen".
  // Somebody pressing the test button proves the mailer works, which is useful
  // and is reported separately, but it is not the morning run and must not be
  // allowed to stand in for one.
  const scheduled = (runs || []).filter((r) => r && r.source !== "test");
  const todays = scheduled.filter((r) => r.ran_for === today);
  const latest = todays[0] || null;

  if (latest) {
    if (latest.failed > 0 || latest.error) {
      return {
        state: FAILED,
        headline: `This morning's email did not go out.`,
        detail:
          latest.error ||
          `${latest.failed} ${latest.failed === 1 ? "person" : "people"} were meant to hear from us and did not.`,
        ranAt: latest.ran_at || null,
        source: latest.source || null,
      };
    }
    if (latest.sent > 0) {
      return {
        state: OK,
        headline: `This morning's email went out to ${countWords(latest.sent, "person", "people")}.`,
        detail: null,
        ranAt: latest.ran_at || null,
        source: latest.source || null,
      };
    }
    return {
      state: QUIET,
      headline: `The morning run happened and there was nothing due, so nobody was emailed.`,
      detail:
        dueCount > 0
          ? // The rules and the screen disagreeing is worth saying out loud
            // rather than smoothing over: one of them is wrong.
            `${countWords(dueCount, "task", "tasks")} ${dueCount === 1 ? "looks" : "look"} due on this screen, though, so the rules and this list do not agree.`
          : null,
      ranAt: latest.ran_at || null,
      source: latest.source || null,
    };
  }

  // Nothing recorded for today. Whether that is a problem depends entirely on
  // what time it is.
  if (hour < RUN_HOUR + GRACE_HOURS) {
    return {
      state: EARLY,
      headline: `This morning's email has not gone out yet. It runs at about ${RUN_HOUR} o'clock.`,
      detail: null,
      ranAt: null,
      source: null,
    };
  }

  const last = scheduled[0] || null;
  return {
    state: MISSING,
    headline: `No morning run happened today.`,
    detail: last
      ? `The last one was on ${formatDay(last.ran_for) || last.ran_for}. Nothing has called the scheduled job since, so no email could have gone out whether or not anything was due.`
      : `The scheduled job has never reported a run. Until it does, no reminder email can arrive however many tasks are due — check the cron job in the hosting dashboard.`,
    ranAt: null,
    source: null,
  };
}

/**
 * The most recent test send, which is the fastest evidence that the mailer itself
 * works. Reported beside the morning run rather than instead of it.
 */
export function lastTest(runs = []) {
  const test = (runs || []).find((r) => r && r.source === "test");
  if (!test) return null;
  return {
    ranAt: test.ran_at || null,
    ok: test.sent > 0 && !test.error,
    error: test.error || null,
    nothing: test.sent === 0 && test.failed === 0 && !test.error,
  };
}

/**
 * What a finished run should be written down as. Pure so the shape of the row is
 * decided in one place and asserted in a test, rather than being built inline in
 * a route where nobody sees it again.
 */
export function runRecord({
  outcome,
  familyId = null,
  source = "cron",
  today = homeToday(),
}) {
  const sent = outcome?.sent || [];
  const failed = outcome?.failed || [];
  return {
    family_id: familyId,
    ran_for: outcome?.today || today,
    source,
    considered: Number(outcome?.considered || 0),
    sent: sent.length,
    failed: failed.length,
    // A run that fell over before it sent anything reports its own error; a run
    // that got as far as the mailer reports the mailer's. Both belong in the same
    // field, because the question being asked of it is the same: why did nothing
    // arrive.
    error:
      outcome?.ok === false
        ? outcome.error || "The run failed."
        : failed[0]?.error || null,
    detail: {
      sent: sent.map((s) => ({ name: s.name || null, count: s.count || 0 })),
      failed: failed.map((f) => ({ error: f.error || null })),
    },
  };
}

function countWords(n, one, many) {
  return `${n} ${n === 1 ? one : many}`;
}
