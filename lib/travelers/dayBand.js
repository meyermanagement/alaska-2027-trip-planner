// The day band: the hours a family's day actually runs.
//
// The interview used to ask when the good part of the day happens and offer
// five named answers -- dawn, mid-morning, midday, afternoon, evening. Every
// one of them was a guess at a number the family already knows. A household
// that is out the door at 6:45 and finished by 8 in the evening is not "an
// early riser" in any useful sense; it is a family whose day runs 6:45 to 8,
// and that is a thing Aly can plan against without translating it first. So
// the question now takes two hours instead of one word, and everything
// downstream that needs a coarse answer derives it here rather than asking
// the family to round for us.
//
// Minutes from midnight, because that is the only representation where a
// comparison is a comparison and an hour past midnight is not smaller than
// the evening it belongs to. The band runs from 5 in the morning to 1 the
// next morning: 5 is early enough for a sunrise family, and 25 (1 am) is late
// enough for a household whose day genuinely ends after midnight without
// offering an hour nobody means.

export const BAND_MIN = 300; // 5:00 am
export const BAND_MAX = 1500; // 1:00 am, the next day
export const BAND_STEP = 30; // half hours; a finer grain is false precision
// The shortest day the band will describe. Four hours is not a rule about how
// long a family may be out -- it is the point below which the answer stops
// being a day and starts being an appointment, and a two-handle control with
// no minimum lets a stray drag collapse the band to nothing.
export const BAND_MIN_SPAN = 240;
// Where the handles sit before anybody touches them: 8 in the morning to 10 at
// night. Deliberately an unremarkable day rather than a flattering one, so a
// family that drags neither handle has still told us something true, and the
// ones who do drag are correcting a plain default rather than arguing with a
// suggestion.
export const BAND_DEFAULT = { start: 480, end: 1320 };

/**
 * A minute count as a family would say it out loud -- "7:30 am", "9 pm",
 * "noon", "midnight", "12:30 am".
 *
 * Whole hours drop the ":00" because "8 am" is what somebody says and "8:00
 * am" is what a form says. Noon and midnight are named rather than numbered
 * for the same reason.
 */
export function formatClock(minutes) {
  const total = Math.round(Number(minutes) || 0);
  const wrapped = ((total % 1440) + 1440) % 1440;
  if (wrapped === 0) return "midnight";
  if (wrapped === 720) return "noon";
  const hour24 = Math.floor(wrapped / 60);
  const minute = wrapped % 60;
  const suffix = hour24 < 12 ? "am" : "pm";
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12;
  return minute === 0
    ? `${hour12} ${suffix}`
    : `${hour12}:${String(minute).padStart(2, "0")} ${suffix}`;
}

/**
 * The band as one short phrase: "7:30 am to 9 pm".
 *
 * This is the note stored on the slot row and the answer stored on the
 * preference row, which is why it has to read like something a person wrote.
 * A row holding `{"start":450,"end":1260}` is a row Aly cannot say out loud.
 */
export function bandSentence(band) {
  const clean = normalizeBand(band);
  if (!clean) return null;
  return `${formatClock(clean.start)} to ${formatClock(clean.end)}`;
}

/** "7:30 am" -> 450. Returns null on anything it cannot read. */
export function parseClock(text) {
  const raw = String(text || "")
    .trim()
    .toLowerCase();
  if (!raw) return null;
  if (raw === "midnight") return 0;
  if (raw === "noon") return 720;
  const match = raw.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)$/);
  if (!match) return null;
  const hour12 = Number(match[1]);
  const minute = Number(match[2] || 0);
  if (hour12 < 1 || hour12 > 12 || minute > 59) return null;
  const base = hour12 % 12;
  return (match[3] === "pm" ? base + 12 : base) * 60 + minute;
}

/**
 * Read a stored band back out of the note it was written as -- "7:30 am to 9
 * pm" -> { start: 450, end: 1260 }.
 *
 * An end earlier in the clock than the start is read as the next morning,
 * which is how "9 pm to midnight" and "10 am to 12:30 am" both come back as
 * bands that move forwards. Returns null when the note is not a band at all,
 * which is what a family's own typed answer looks like.
 */
export function parseBandNote(note) {
  const parts = String(note || "").split(/\s+to\s+/i);
  if (parts.length !== 2) return null;
  const start = parseClock(parts[0]);
  let end = parseClock(parts[1]);
  if (start === null || end === null) return null;
  if (end <= start) end += 1440;
  return normalizeBand({ start, end });
}

/**
 * Clamp a band into the shape the question offers: inside the range, on the
 * half hour, and at least BAND_MIN_SPAN long. Returns null when either handle
 * is missing or unreadable, so a caller can tell "no answer" from "an answer
 * that needed tidying".
 */
export function normalizeBand(band) {
  const rawStart = Number(band?.start);
  const rawEnd = Number(band?.end);
  if (!Number.isFinite(rawStart) || !Number.isFinite(rawEnd)) return null;
  const snap = (value) => Math.round(value / BAND_STEP) * BAND_STEP;
  let start = Math.min(
    Math.max(snap(rawStart), BAND_MIN),
    BAND_MAX - BAND_MIN_SPAN,
  );
  let end = Math.min(
    Math.max(snap(rawEnd), BAND_MIN + BAND_MIN_SPAN),
    BAND_MAX,
  );
  if (end - start < BAND_MIN_SPAN) end = start + BAND_MIN_SPAN;
  if (end > BAND_MAX) {
    end = BAND_MAX;
    start = end - BAND_MIN_SPAN;
  }
  return { start, end };
}

// The coarse answers the inference rules were written against, kept as labels
// so the sentence explaining a worked-out answer still reads like English --
// "You said dawn, before anyone else is up" -- now that the family says an
// hour instead of picking one of these.
export const BAND_BUCKETS = [
  { value: "dawn", label: "your day starts at dawn" },
  { value: "morning", label: "your day starts mid-morning" },
  { value: "midday", label: "your day starts around midday" },
  { value: "afternoon", label: "your day starts in the afternoon" },
  { value: "evening", label: "the good part of your day is the evening" },
];

/**
 * The coarse bucket a band falls in, for the inference rules and the running
 * summary. Derived rather than stored: the band is the answer, and a second
 * copy of it in a column would be the thing that goes stale.
 *
 * The start hour decides it, with one exception. A family that gets going at
 * eleven and is still out at midnight is an evening household whichever
 * threshold their start lands in, and the old evening rules -- the ones that
 * read "an empty city is a wasted city" -- were written about exactly them.
 */
export function bandBucket(band) {
  const clean = normalizeBand(band);
  if (!clean) return null;
  const { start, end } = clean;
  if (end >= 1380 && start >= 600) return "evening";
  if (start <= 390) return "dawn";
  if (start <= 570) return "morning";
  if (start <= 690) return "midday";
  if (start <= 870) return "afternoon";
  return "evening";
}

/** The bucket's label, for the sentence that explains a derived answer. */
export function bandBucketLabel(value) {
  return BAND_BUCKETS.find((b) => b.value === value)?.label || "";
}
