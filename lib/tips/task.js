// Turning a tip or a warning into something the app will chase.
//
// A tip and a task do different jobs. A tip is something worth knowing, and being
// done with one is quiet: you clear it, it goes to the cleared list, and it never
// speaks again unless you fetch it back. A task is the opposite —
// it is the app agreeing to nag you, it turns up in the morning email, and it
// stays until somebody ticks it off.
//
// So "make a task from this" is the bridge between the two, and the interesting
// part is the date. A tip that says booking opens on 17 November already knows
// when it wants doing, and that date belongs in the task's due date so the email
// says it on the morning it matters and every morning after. A tip with no date
// gets a stage instead, because a checklist of forty undated tasks all shouting
// daily is how a useful email becomes a filtered one.
//
// Pure: a row in, the shape of a task out. No database, no clock beyond the date
// it is handed.

import { formatDayYear, formatFullDay } from "../format";

const iso = (value) => (typeof value === "string" ? value.slice(0, 10) : "");
const trim = (value, max) =>
  typeof value === "string" ? value.trim().slice(0, max) : "";

/** A sentence, with a full stop if it needs one. */
function sentence(text) {
  const raw = trim(text, 500);
  if (!raw) return "";
  return /[.!?]$/.test(raw) ? raw : `${raw}.`;
}

/**
 * The task one tip becomes.
 *
 * @param {object} tip     a pro_tips row
 * @param {object} input
 * @param {string} input.today  ISO date
 * @returns {object|null}  a predeparture_tasks row without its family id
 */
export function taskFromTip(tip, { today = "" } = {}) {
  const title = trim(tip?.title, 140);
  if (!title) return null;

  const actBy = iso(tip?.act_by);
  const dated = /^\d{4}-\d{2}-\d{2}$/.test(actBy) && (!today || actBy >= today);
  const urgency = tip?.urgency || "whenever";

  const detail = [
    sentence(tip?.body),
    tip?.because ? `Why this applies: ${sentence(tip.because)}` : "",
    // A date that has already gone still explains the task, so it is said in
    // words rather than set as a deadline that reads as already missed.
    !dated && actBy
      ? `The tip named ${formatFullDay(actBy) || actBy}, which has passed.`
      : "",
    "Added from a pro tip.",
    ...sourceLines(tip?.sources),
  ]
    .filter(Boolean)
    .join("\n\n")
    .slice(0, 2000);

  return {
    trip_id: tip?.trip_id || null,
    title,
    detail,
    assignee: "Shared",
    // A date if the tip had one worth keeping. When there is one it is the only
    // thing that decides when the task speaks -- dueOn() reads due_date and
    // returns before it ever looks at the stage.
    due_date: dated ? actBy : null,
    // The stage is written either way, and this used to be the bug. It was set to
    // null for a dated task on the reasoning that a task's "when" comes from one
    // or the other, which is true of how the task is read and false of how it is
    // stored: timing is NOT NULL in the database with a default of before_trip,
    // and an explicit null does not fall back to a default -- it is refused. So
    // every tip with a date in the future, which is every tip anybody actually
    // wants to be reminded of, failed to become a task at all.
    //
    // It is harmless to write, because a dated task never consults it. It is
    // better than a placeholder, because the day somebody clears the date off one
    // of these by hand, the stage underneath is the one the tip's own urgency
    // implied rather than whatever the column happened to default to.
    timing:
      urgency === "now"
        ? "now"
        : urgency === "soon"
          ? "month_before"
          : "before_trip",
    priority: urgency === "now" ? "high" : "normal",
    is_done: false,
  };
}

function sourceLines(sources) {
  const rows = Array.isArray(sources) ? sources.slice(0, 3) : [];
  return rows
    .map((source) => {
      const url = trim(source?.url || source?.uri, 300);
      if (!url) return "";
      const label = trim(source?.title, 90);
      return label ? `${label} — ${url}` : url;
    })
    .filter(Boolean);
}

/**
 * The task one passport warning becomes.
 *
 * Warnings are worked out fresh on every page load and are not stored, so this
 * takes the computed warning rather than a row. The task it makes is deliberately
 * a "now" task at high priority: a passport that will not survive the six-month
 * rule is the one thing in this app that is worth saying every single morning
 * until it is dealt with.
 *
 * @param {object} warning  one entry from passportWarnings()
 * @returns {object|null}
 */
export function taskFromWarning(warning) {
  if (!warning?.tripId) return null;
  const expired = warning.expired || [];
  const short = warning.short || [];
  const missing = warning.missing || [];
  const renewing = [...expired, ...short];
  if (!renewing.length && !missing.length) return null;

  const names = (rows) => rows.map((row) => row.name).filter(Boolean);
  const trip = trim(warning.tripName, 60) || "the trip";

  // Renewing is the real job when there is one. When every person is simply
  // unrecorded, the job is finding the passport rather than replacing it, and
  // saying "renew" would send somebody to a government website for nothing.
  const who = renewing.length ? names(renewing) : names(missing);
  const whoSaid =
    who.length === 1
      ? `${who[0]}'s passport`
      : who.length === 2
        ? `${who[0]} and ${who[1]}'s passports`
        : "the passports";
  const title = renewing.length
    ? `Renew ${whoSaid} before ${trip}`
    : `Find ${whoSaid} and record the expiry before ${trip}`;

  const lines = [];
  lines.push(
    `${warning.where || "Where you are going"} wants a passport valid until ${formatDayYear(warning.mustLastUntil) || warning.mustLastUntil}, six months past your ${formatDayYear(warning.returnDate) || warning.returnDate} return.`,
  );
  for (const person of expired) {
    lines.push(
      `${person.name} — expires ${formatDayYear(person.expiry) || person.expiry}, before you are home. This one has to be renewed.`,
    );
  }
  for (const person of short) {
    lines.push(
      `${person.name} — expires ${formatDayYear(person.expiry) || person.expiry}, which is inside the six-month window.`,
    );
  }
  for (const person of missing) {
    lines.push(
      `${person.name} — no passport recorded. Put the expiry date on the Family tab and this will check itself from then on.`,
    );
  }
  lines.push(
    "Renewals are quoted in weeks rather than days, and the window is checked at check-in as well as at the border.",
  );

  return {
    trip_id: warning.tripId,
    title: title.slice(0, 140),
    detail: lines.join("\n").slice(0, 2000),
    assignee: "Shared",
    due_date: null,
    // Not a stage that waits: this one belongs in tomorrow's email.
    timing: "now",
    priority: "high",
    is_done: false,
  };
}
