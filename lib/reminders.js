import {
  TIMING_LABELS,
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

export function todayISO() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return isoOf(now);
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
