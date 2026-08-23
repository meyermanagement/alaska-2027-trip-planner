export const STATUS_STYLES = {
  confirmed: { label: "Confirmed", cls: "bg-teal-soft text-teal" },
  planned: { label: "Planned", cls: "bg-glacier/10 text-glacier" },
  optional: { label: "Option", cls: "bg-sand-deep text-ink-soft" },
  needs_booking: { label: "Needs booking", cls: "bg-amber/15 text-amber" },
  cancelled: { label: "Cancelled", cls: "bg-rose/10 text-rose" },
};

export const CATEGORY_ICONS = {
  flight: "✈️",
  lodging: "🏨",
  cruise: "🚢",
  excursion: "🥾",
  dining: "🍽️",
  transport: "🚐",
  activity: "📍",
  note: "📝",
};

export const TIMING_LABELS = {
  now: "Book now",
  month_before: "A month out",
  week_before: "Week before",
  day_before: "Day before",
  travel_day: "Travel day",
  before_trip: "Before the trip",
};

export const TIMING_ORDER = [
  "now",
  "month_before",
  "week_before",
  "day_before",
  "travel_day",
  "before_trip",
];

export function assigneeColor(name) {
  switch ((name || "").toLowerCase()) {
    case "mark":
      return "bg-glacier/12 text-glacier";
    case "steph":
      return "bg-rose/12 text-rose";
    case "veda":
      return "bg-[#7c3aed]/12 text-[#6d28d9]";
    case "steph & veda":
      return "bg-rose/12 text-rose";
    default:
      return "bg-teal-soft text-teal";
  }
}

/** Parses a plain YYYY-MM-DD without timezone drift. */
export function parseDate(value) {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function formatDay(value) {
  const date = parseDate(value);
  if (!date) return "Unscheduled";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function formatShortDay(value) {
  const date = parseDate(value);
  if (!date) return "TBD";
  return date.toLocaleDateString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
  });
}

export function formatRange(start, end) {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return "Dates to be set";
  const sameYear = a.getFullYear() === b.getFullYear();
  const left = a.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
  });
  const right = b.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
  return `${left} – ${right}`;
}

export function formatTime(value) {
  if (!value) return null;
  const [h, m] = value.split(":").map(Number);
  const date = new Date(2000, 0, 1, h, m);
  return date
    .toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })
    .replace(":00", "");
}

export function daysUntil(value) {
  const target = parseDate(value);
  if (!target) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}
