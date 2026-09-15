// How long the drive is, in the words people use for it.
//
// Nobody says "one hundred and fifty minutes to Chicago". They say two and a
// half hours, or 2:30, or "about 2.5". The column is minutes because that is the
// only form arithmetic can be done on, so this is the pair of functions that
// stands between the family and the column: one reads whatever they typed, the
// other says it back the way they would.
//
// Kept apart from the reference list on purpose. This module is imported by the
// form in the browser, and the airport list is ninety kilobytes of data the form
// has no use for.

/**
 * Minutes, from however somebody wrote a drive down.
 *
 * Understands a bare number as minutes under three hours' worth and as hours
 * above it -- "20" is twenty minutes, "2" is two hours, because nobody drives to
 * an airport for two minutes and plenty drive for two hours. Anything with a
 * unit, a colon or a decimal point is read literally, which is the escape hatch
 * for the one family who really does live twenty minutes from the runway and
 * wants to write "20 min" to be sure.
 *
 * Returns null when there is nothing usable, which is a blank column rather than
 * a zero: not knowing the drive and the drive being nothing are different facts.
 */
export function driveMinutesFrom(text) {
  const said = typeof text === "string" ? text.trim().toLowerCase() : "";
  if (!said) return null;

  // 1:30, 2:05
  const clock = said.match(/^(\d{1,2}):([0-5]\d)$/);
  if (clock) return Number(clock[1]) * 60 + Number(clock[2]);

  // 2 hr 15, 2h15, 1 hour 5 min
  const both = said.match(
    /^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)\s*(\d+)\s*(?:m|min|mins|minute|minutes)?$/,
  );
  if (both) return Math.round(Number(both[1]) * 60 + Number(both[2]));

  // 2 hours, 2.5h
  const hours = said.match(/^(\d+(?:\.\d+)?)\s*(?:h|hr|hrs|hour|hours)$/);
  if (hours) return Math.round(Number(hours[1]) * 60);

  // 45 minutes
  const mins = said.match(/^(\d+)\s*(?:m|min|mins|minute|minutes)$/);
  if (mins) return Number(mins[1]);

  const bare = said.match(/^(\d+(?:\.\d+)?)$/);
  if (bare) {
    const n = Number(bare[1]);
    if (!Number.isFinite(n) || n < 0) return null;
    // A decimal is hours whatever its size: "1.5" is never ninety seconds.
    if (!Number.isInteger(n)) return Math.round(n * 60);
    return n <= 12 ? n * 60 : n;
  }

  return null;
}

/**
 * "20 min", "2 hr", "2 hr 30 min", or an empty string when nobody has said.
 *
 * Both units are named whenever both are present. "2 hr 30" is how a person
 * writing it down in a hurry would put it, and the parser above accepts that,
 * but read back to somebody it is a number without a unit on it -- the box on
 * the Family page shows this string, so the minutes say what they are.
 */
export function driveSaid(minutes) {
  const n = Number(minutes);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 60) return `${Math.round(n)} min`;
  const hours = Math.floor(n / 60);
  const rest = Math.round(n % 60);
  return rest ? `${hours} hr ${rest} min` : `${hours} hr`;
}

/**
 * The household's airports as one sentence.
 *
 * Home base first and named as such, then the rest in order of the drive, so the
 * line reads the way the decision gets made: this is the one we use, and these
 * are the two we would consider for a big enough saving.
 */
export function airportsSaid(rows = []) {
  const kept = rows.filter((row) => row && row.code);
  if (!kept.length) return "";
  const sorted = [...kept].sort(
    (a, b) =>
      Number(Boolean(b.is_primary)) - Number(Boolean(a.is_primary)) ||
      (a.drive_minutes ?? 99999) - (b.drive_minutes ?? 99999) ||
      a.code.localeCompare(b.code),
  );
  return sorted
    .map((row) => {
      const drive = driveSaid(row.drive_minutes);
      const parts = [drive, row.is_primary ? "home base" : ""].filter(Boolean);
      return parts.length ? `${row.code} (${parts.join(", ")})` : row.code;
    })
    .join(", ");
}
