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
      // A muted plum rather than a screen violet, so it belongs on paper. It
      // is a token now rather than two literal hexes, because on a dark skin a
      // plum picked for cream paper disappears into the page.
      return "bg-plum/12 text-plum";
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

/**
 * A span of minutes said the way a person says it.
 *
 * The drive from home to a horse show in Iowa is 315 minutes, and "315 min
 * travel" is a number you have to do arithmetic on before it means anything --
 * five and a quarter hours is a morning gone, which is the thing being decided.
 * Under an hour stays in minutes, because "0 hr 18 min" is worse than "18 min",
 * and a whole number of hours drops the trailing zero.
 */
export function durationSaid(minutes) {
  // Number(null) is 0 and Number("") is 0, and a missing travel time printed as
  // "0 min" is the same lie in smaller type as printing a guessed one.
  if (minutes === null || minutes === undefined || minutes === "") return null;
  const n = Math.round(Number(minutes));
  if (!Number.isFinite(n) || n < 0) return null;
  if (n < 60) return `${n} min`;
  const h = Math.floor(n / 60);
  const m = n % 60;
  return m === 0 ? `${h} hr` : `${h} hr ${m} min`;
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

/** Whole days from one date to another, or null if that is not a forward span. */
export function daySpan(start, end) {
  const a = parseDate(start);
  const b = parseDate(end);
  if (!a || !b) return null;
  const days = Math.round((b - a) / 86400000);
  return days >= 0 ? days : null;
}

/**
 * Moving a start date should move what it started. Given the old pair and the
 * new start, this returns the end date that keeps the same length.
 *
 * `minSpan` is how short the thing is allowed to be: one night for a stay,
 * because you cannot check in and out on the same day, and zero for a trip,
 * because a day trip is a real trip. When there is no end date to carry, only
 * something with a minimum length gets one invented for it — a trip has no
 * knowable duration, so its end stays empty until someone says otherwise.
 */
export function carryEnd(prevStart, prevEnd, nextStart, minSpan = 0) {
  if (!nextStart) return prevEnd;
  const span = daySpan(prevStart, prevEnd);
  if (span !== null) return addDays(nextStart, Math.max(span, minSpan));
  // There is no length to carry. Invent one only where a minimum exists, and
  // otherwise leave the end alone — unless it now falls before the start, which
  // is not a range at all, so it comes up to meet it.
  const floor = addDays(nextStart, minSpan);
  if (!prevEnd) return minSpan > 0 ? floor : "";
  return prevEnd < floor ? floor : prevEnd;
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
 * The countdown as a person would say it.
 *
 * "1 days away" is the giveaway that a number was dropped into a sentence
 * without being read back. And the two closest answers are not really counts at
 * all: the day a trip starts is today and the day before it is tomorrow, which is
 * how anybody would say it out loud and how it is understood at a glance.
 *
 * Returns "" for the days that have already gone, so the caller can hide the chip
 * on the same test that decides its words.
 */
export function countdownSaid(days) {
  if (!Number.isFinite(days) || days < 0) return "";
  if (days === 0) return "Today";
  if (days === 1) return "Tomorrow";
  return `${days} days away`;
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
 * The family's own clock, and the reason there is a constant for it.
 *
 * A server has no idea what day it is where the family lives. Vercel runs in UTC,
 * so from seven in the evening in Missouri onwards `new Date()` on the server is
 * already tomorrow — which put the header a day ahead of the itinerary, since the
 * itinerary works its date out in the browser and the browser is in the right
 * place. A day out is not cosmetic here: it decides whether a trip has started,
 * whether a task is overdue, and which day of an itinerary you are shown.
 *
 * The rest of the app had already settled on this zone — the calendar feed writes
 * it into every event, and Aly is told the date in it — so it is written down once
 * here and everything reads it from the same line. It is a single family's app; if
 * that ever stops being true this becomes a column on the family.
 */
export const HOME_ZONE = "America/Chicago";

/**
 * Today where the family lives, as YYYY-MM-DD. Same answer on the server and in
 * the browser, which is the whole point.
 */
export function homeToday(now = new Date()) {
  // en-CA formats as YYYY-MM-DD, which is the shape every date in this app is in.
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: HOME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * The hour of the day where the family lives, 0-23. Same answer on the server and
 * in the browser, for the same reason homeToday() is.
 *
 * Needed because "no morning email yet" is only worth saying after the hour the
 * morning email runs at. On the server the plain clock reads UTC, which at half
 * past midnight at home is already tomorrow lunchtime -- and a warning that
 * depends on the hour must not depend on where the code happened to run.
 */
export function homeHour(now = new Date()) {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: HOME_ZONE,
    hour: "2-digit",
    hour12: false,
  }).format(now);
  // Midnight comes back as "24" from some implementations of this formatter.
  return Number(hour) % 24;
}

/**
 * The time of day where the family lives, as "HH:MM". Same answer on the server and
 * in the browser, for the same reason homeHour() is.
 *
 * Used to tell the assistant which itinerary items have already happened. The
 * screens ask the device instead, because somebody standing in Ketchikan wants
 * their own evening -- so on a trip far from home these two can disagree for a few
 * hours. Home is the only clock the server has.
 */
export function homeHM(now = new Date()) {
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: HOME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    })
      .format(now)
      // Midnight can come back as "24:05" from some implementations.
      .replace(/^24:/, "00:")
  );
}

/** The last day of a trip: its end date, or its start when it is one day long. */
export function lastDayOf(trip) {
  return trip?.end_date || trip?.start_date || "";
}

/**
 * A trip is finished once its last day has gone by, or once someone marks it
 * complete or archived by hand.
 */
export function isPastTrip(trip, todayISO) {
  if (!trip) return false;
  if (isDraftTrip(trip)) return false;
  if (["complete", "archived"].includes(trip.status)) return true;
  const today = todayISO || homeToday();
  return (lastDayOf(trip) || "9999-12-31") < today;
}

/**
 * A trip is happening right now: today falls on or between its first and last
 * day. A one-day trip is current on its one day, which is why the end date falls
 * back to the start rather than to nothing.
 *
 * Deliberately the same three exclusions as isPastTrip, so that no trip can be
 * two things at once: a draft is an idea and does not start just because a date
 * it carries has arrived, and a trip somebody marked complete has been declared
 * over by a person, which beats the arithmetic. Together with isPastTrip and
 * isDraftTrip this partitions every trip into exactly one of four states, which
 * is what lets the Trips screen show it in exactly one place.
 */
export function isCurrentTrip(trip, todayISO) {
  if (!trip) return false;
  if (isDraftTrip(trip)) return false;
  if (["complete", "archived"].includes(trip.status)) return false;
  if (!trip.start_date) return false;
  const today = todayISO || homeToday();
  return trip.start_date <= today && today <= lastDayOf(trip);
}

/**
 * Which day of the trip today is: `{ day: 3, of: 11 }`, counting the first day
 * as day one because that is how anybody on a trip counts. Null when the trip is
 * not happening today, or has no length to count against.
 */
/**
 * The date on the machine this is running on, in its own zone.
 *
 * Only meaningful in a browser, where it says what day it is where the person is
 * standing. On the server it is the date in UTC and means nothing, which is why
 * nothing may call it during a render.
 */
export function localToday(now = new Date()) {
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
    now.getDate(),
  ).padStart(2, "0")}`;
}

/**
 * The day somebody is actually living, for a screen about a trip.
 *
 * Home is the default and has to be, because it is the only answer the server can
 * give and the first frame has to match. But home is wrong in the place that
 * matters most: Alaska is four hours behind Missouri, so from eight in the evening
 * in Ketchikan the family's home zone has already turned over to tomorrow, and an
 * itinerary that jumped to tomorrow's tour while you were still eating dinner
 * would be worse than useless.
 *
 * So the device's own date wins, but only when it names a day of this trip. That
 * proviso is what makes it safe: a wrong clock, a phone left on another zone
 * after a flight home, or somebody reading the Alaska plans from Missouri in
 * December cannot drag the screen to a day that is not part of the trip. It can
 * only ever choose between two days the trip actually has.
 */
export function livedDay(homeDate, deviceDate, dayKeys) {
  if (!deviceDate || deviceDate === homeDate) return homeDate;
  return (dayKeys || []).includes(deviceDate) ? deviceDate : homeDate;
}

/**
 * Which day of an itinerary to open on.
 *
 * Today, whenever today is one of the trip's days -- somebody opening a trip they
 * are in the middle of is asking what is happening now, not what happened on the
 * first morning.
 *
 * One rule covers the rest without asking what state the trip is in. The next day
 * that has not passed is the answer, which for a trip that has not started yet is
 * its first day, and for a trip that is over is nothing, so it falls back to the
 * first day. The middle case is the one worth having: a trip whose days come from
 * its bookings can have a gap where today should be, and landing on day one of a
 * trip you are standing in the middle of is the wrong answer for the same reason
 * every time.
 *
 * `keys` must be sorted dates, YYYY-MM-DD. Returns null when there are none, so
 * the caller decides what an itinerary with no days at all should show.
 */
export function openingDay(keys, today) {
  const days = (keys || []).filter((k) => /^\d{4}-\d{2}-\d{2}$/.test(k));
  if (days.length === 0) return null;
  if (!today) return days[0];
  if (days.includes(today)) return today;
  return days.find((k) => k > today) || days[0];
}

export function tripDayNumber(trip, todayISO) {
  const today = todayISO || homeToday();
  if (!isCurrentTrip(trip, today)) return null;
  const day = daySpan(trip.start_date, today);
  const total = daySpan(trip.start_date, lastDayOf(trip));
  if (day === null || total === null) return null;
  return { day: day + 1, of: total + 1 };
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

/**
 * Weekday, month, day and year — for a date being read as a deadline.
 *
 * A pro tip is prose, and 2026-08-29 in the middle of a sentence reads like a
 * serial number rather than a Saturday. The year is kept because a booking
 * window can easily open in a different year from the trip it belongs to.
 */
export function formatFullDay(value) {
  const date = parseDate(value);
  // parseDate hands back a Date built from NaN when the string is not a date at
  // all, and that object is truthy: without this the tip would read "opens
  // Invalid Date".
  if (!date || Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });
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
