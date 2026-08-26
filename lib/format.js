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

// How urgent a task is. Normal is the quiet default: it earns no chip, so the
// list only draws the eye to the things that are genuinely out of the ordinary.
export const PRIORITY_LABELS = {
  high: "High",
  normal: "Normal",
  low: "Low",
};

export const PRIORITY_ORDER = ["high", "normal", "low"];

const PRIORITY_RANK = { high: 0, normal: 1, low: 2 };

export function priorityOf(task) {
  const value = (task?.priority || "").toLowerCase();
  return PRIORITY_LABELS[value] ? value : "normal";
}

export function priorityRank(task) {
  return PRIORITY_RANK[priorityOf(task)] ?? 1;
}

// Every task says where it stands, but a word on a pill for all 41 of them is
// noise. Priority is shown as three little bars instead — three lit for high,
// two for normal, one for low — so the level is a shape you can run your eye
// down rather than something to read. The bars carry the words for anyone using
// a screen reader, and the count of lit bars means the level survives print and
// tells apart to anyone who does not see the reds from the greys.
const PRIORITY_METERS = {
  high: {
    label: "High priority",
    lit: 3,
    on: "bg-rose",
    off: "bg-rose/20",
    text: "text-rose",
  },
  normal: {
    label: "Normal priority",
    lit: 2,
    on: "bg-ink-soft/70",
    off: "bg-[var(--line-strong)]",
    text: "text-ink-soft",
  },
  low: {
    label: "Low priority",
    lit: 1,
    on: "bg-ink-soft/40",
    off: "bg-[var(--line)]",
    text: "text-ink-soft",
  },
};

export function priorityMeter(task) {
  return PRIORITY_METERS[priorityOf(task)];
}

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

/**
 * Categories that occupy a stretch of days rather than a moment. A hotel is
 * booked from a check-in to a check-out, and a cruise runs from sailing to
 * disembarkation, so both are offered a second date. Everything else — a
 * flight, a dinner, a tour — happens on one day and is left alone.
 */
export const SPANNING_CATEGORIES = ["lodging", "cruise"];

export function isSpanning(category) {
  return SPANNING_CATEGORIES.includes(category);
}

/** What the second date is called, in the words that category actually uses. */
export function endDateLabel(category) {
  return category === "cruise" ? "Last day" : "Check out";
}

/**
 * A stay only counts as a range when the second date is genuinely later. An
 * end date equal to the start is treated as no range at all, so a stray value
 * can never produce a zero-night stay.
 */
export function stayNights(start, end) {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return 0;
  const nights = Math.round((b - a) / 86400000);
  return nights > 0 ? nights : 0;
}

/** A date shifted by whole days, still as YYYY-MM-DD. */
export function addDays(iso, days) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Nobody checks into a hotel and leaves the same day, so the earliest a stay
 * can end is the morning after it began. This is both the floor the date picker
 * enforces and the value it opens on.
 */
export function earliestEnd(start) {
  return start ? addDays(start, 1) : "";
}

/** "Thu, Aug 5 → Sun, Aug 8" — no year, because the day rail already says it. */
export function formatStayRange(start, end) {
  if (!stayNights(start, end)) return formatShortDay(start);
  return `${formatShortDay(start)} → ${formatShortDay(end)}`;
}

/** "3 nights", or "1 night". Cruises count nights the same way. */
export function formatNights(start, end) {
  const n = stayNights(start, end);
  if (!n) return null;
  return `${n} ${n === 1 ? "night" : "nights"}`;
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

/**
 * A draft is an idea the family is still working out. It is deliberately
 * outside the upcoming/past split: a draft can carry dates that have already
 * gone by without being treated as a trip they took, and it never counts as
 * the next trip. It leaves Drafts when someone presses "Move to upcoming".
 */
export function isDraftTrip(trip) {
  return trip?.status === "draft";
}

/**
 * A trip is finished once its last day has gone by, or once someone marks it
 * complete or archived by hand.
 */
export function isPastTrip(trip, todayISO) {
  if (!trip) return false;
  if (isDraftTrip(trip)) return false;
  if (["complete", "archived"].includes(trip.status)) return true;
  const today = todayISO || new Date().toISOString().slice(0, 10);
  return (trip.end_date || trip.start_date || "9999-12-31") < today;
}

/** Travel documents we keep numbers for, in the order they matter to us. */
export const DOC_TYPES = [
  { value: "passport", label: "Passport", icon: "🛂" },
  { value: "passport_card", label: "Passport card", icon: "🪪" },
  { value: "global_entry", label: "Global Entry", icon: "🌐" },
  { value: "known_traveler", label: "Known Traveler Number", icon: "🔢" },
  { value: "tsa_precheck", label: "TSA PreCheck", icon: "✈️" },
  { value: "clear", label: "CLEAR", icon: "👁️" },
  { value: "nexus", label: "NEXUS", icon: "🍁" },
  { value: "sentri", label: "SENTRI", icon: "🚗" },
  { value: "drivers_license", label: "Driver's license", icon: "🪪" },
  { value: "real_id", label: "REAL ID", icon: "🪪" },
  { value: "visa", label: "Visa", icon: "📄" },
  { value: "vaccination", label: "Vaccination record", icon: "💉" },
  { value: "insurance", label: "Travel insurance", icon: "🛡️" },
  { value: "frequent_flyer", label: "Frequent flyer", icon: "🎫" },
  { value: "hotel_loyalty", label: "Hotel loyalty", icon: "🏨" },
  { value: "other", label: "Other", icon: "📎" },
];

export function docType(value) {
  return (
    DOC_TYPES.find((d) => d.value === value) || {
      value: "other",
      label: "Other",
      icon: "📎",
    }
  );
}

/** Whole months from today until a date. Negative once it has passed. */
export function monthsUntil(value) {
  const target = parseDate(value);
  if (!target) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((target - today) / (86400000 * 30.44));
}

/** Month, day and year — for anything with an expiration date. */
export function formatDayYear(value) {
  const date = parseDate(value);
  if (!date) return "";
  return date.toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}
