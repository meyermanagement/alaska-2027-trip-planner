import {
  TIMING_LABELS,
  homeToday,
  isPastTrip,
  parseDate,
  priorityOf,
  priorityRank,
} from "./format";

/**
 * Most tasks never get an explicit due date. What they do have is a stage — book
 * now, a month out, the week before — and that is already a date once you know
 * when the trip starts. Reminders works one out so every task can be placed on a
 * calendar, and always says plainly when the date was inferred rather than set.
 */
const TIMING_OFFSET_DAYS = {
  now: 0,
  month_before: -30,
  week_before: -7,
  day_before: -1,
  travel_day: 0,
  before_trip: -14,
};

// Today where the family lives, not where the server happens to be running. This
// used to read the machine's own clock, which is UTC on Vercel, so from seven in
// the evening in Missouri onwards every screen drawn on the server thought it was
// tomorrow -- tasks went overdue early, and the header disagreed with the
// itinerary, which works its date out in the browser. See HOME_ZONE in format.js.
export function todayISO() {
  return homeToday();
}

function isoOf(date) {
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${date.getFullYear()}-${m}-${d}`;
}

export function shiftDays(iso, days) {
  const date = parseDate(iso);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return isoOf(date);
}

/**
 * When a task wants doing. An explicit due date always wins. Otherwise the
 * stage is measured back from the first day of the trip, except "Book now",
 * which means today whatever the trip dates say.
 */
export function dueInfo(task, trip, today = todayISO()) {
  if (task.due_date) {
    return { date: task.due_date, exact: true, note: null };
  }
  const timing = task.timing || "now";
  const label = TIMING_LABELS[timing] || TIMING_LABELS.now;
  if (timing === "now") {
    return { date: today, exact: false, note: label };
  }
  const start = trip?.start_date;
  const offset = TIMING_OFFSET_DAYS[timing];
  if (!start || offset === undefined) {
    return { date: null, exact: false, note: label };
  }
  return { date: shiftDays(start, offset), exact: false, note: label };
}

/**
 * The other direction: a stage that fits a date the user actually named.
 *
 * A task can say when it wants doing in one of two ways — a stage measured back
 * from the trip, or a date on the calendar. Only one of them can be true, so the
 * stage is worked out from the date rather than asked for twice, and the Tasks
 * tab can keep grouping by stage without a dated task landing in the wrong pile.
 */
export function timingForDate(iso, trip, today = todayISO()) {
  const when = parseDate(iso);
  if (!when) return null;
  const start = trip?.start_date;
  if (!start) {
    // No trip dates to measure against, so all that is left is how soon it is.
    return iso <= shiftDays(today, 30) ? "now" : "before_trip";
  }
  if (iso >= start) return "travel_day";
  if (iso === shiftDays(start, -1)) return "day_before";
  if (iso >= shiftDays(start, -7)) return "week_before";
  if (iso >= shiftDays(start, -30)) return "month_before";
  // Months ahead of the trip: something to get on with rather than a stage.
  return "now";
}

/**
 * How a date reads to someone glancing at a list. Late is said as late, and the
 * next two days are said in words, because "Fri, Aug 28" makes you count and
 * "Due tomorrow" does not.
 */
export function dueWording(iso, today = todayISO()) {
  if (!iso) return null;
  if (iso < today) return { text: "Overdue", late: true };
  if (iso === today) return { text: "Due today", late: false, soon: true };
  if (iso === shiftDays(today, 1))
    return { text: "Due tomorrow", late: false, soon: true };
  return {
    text: null,
    late: false,
    soon: iso <= shiftDays(today, 7),
  };
}

export const DUE_BUCKETS = [
  { id: "overdue", label: "Overdue" },
  { id: "week", label: "Next 7 days" },
  { id: "month", label: "Next 30 days" },
  { id: "later", label: "Later" },
  { id: "none", label: "No date yet" },
];

export function bucketOf(dueDate, today = todayISO()) {
  if (!dueDate) return "none";
  if (dueDate < today) return "overdue";
  if (dueDate <= shiftDays(today, 7)) return "week";
  if (dueDate <= shiftDays(today, 30)) return "month";
  return "later";
}

/**
 * The when filters are windows rather than single buckets: asking for the next
 * seven days shows anything already overdue too, since an outstanding task does
 * not stop mattering because its date has gone by.
 */
export const DUE_FILTERS = [
  { id: "all", label: "All" },
  { id: "overdue", label: "Overdue" },
  { id: "week", label: "Next 7 days" },
  { id: "month", label: "Next 30 days" },
];

export function matchesDueFilter(bucket, filter) {
  if (filter === "all") return true;
  if (filter === "overdue") return bucket === "overdue";
  if (filter === "week") return ["overdue", "week"].includes(bucket);
  if (filter === "month") return ["overdue", "week", "month"].includes(bucket);
  return true;
}

/**
 * Urgent first, then by date, then by the order the trip itself keeps. Tasks
 * with no date at all sit behind the dated ones inside their group.
 */
export function sortReminders(rows) {
  return rows
    .map((row, i) => [row, i])
    .sort((a, b) => {
      const [x, xi] = a;
      const [y, yi] = b;
      return (
        priorityRank(x.task) - priorityRank(y.task) ||
        (x.due.date || "9999-12-31").localeCompare(
          y.due.date || "9999-12-31",
        ) ||
        xi - yi
      );
    })
    .map(([row]) => row);
}

export function isHigh(task) {
  return priorityOf(task) === "high";
}

/**
 * What the Reminders badge in the menu counts: open tasks on trips still to
 * come that are either already past due or marked high priority. It is
 * deliberately the same test the page itself highlights, so the number on the
 * menu and the red rows on the page always agree.
 */
export function countNeedingAttention(rows, today = todayISO()) {
  return (rows || []).filter((row) => {
    const trip = row.trip || row.trips;
    if (!trip || isPastTrip(trip)) return false;
    if (priorityOf(row) === "high") return true;
    return bucketOf(dueInfo(row, trip, today).date, today) === "overdue";
  }).length;
}
