/**
 * What the sky is doing where the family is, hour by hour.
 *
 * Open-Meteo, because it needs no key and no account. That matters more than it
 * sounds: a weather feature behind a key nobody has enabled is a feature that
 * ships broken, and this one has to work on the first morning of a trip without
 * anybody setting anything up.
 *
 * Two things are asked for and both are used. The day's shape -- high, low,
 * sunrise, sunset, chance of rain -- goes at the top of the day. The hourly series
 * is matched to each timed item, because "62 and raining at eight" is advice about
 * the excursion and a daily average is not.
 *
 * The forecast is resolved in the destination's own timezone, which the service
 * works out from the coordinates. The app otherwise only knows home's zone and the
 * device's, and neither is the right answer for what time the sun sets in Sitka.
 */

const ENDPOINT = "https://api.open-meteo.com/v1/forecast";

/**
 * WMO weather codes, in words, with something to draw.
 *
 * The service returns a number. Left as a number it is useless to a reader, and
 * the mapping is the sort of thing that gets guessed at wrongly, so it lives in
 * one place.
 */
export const WMO = {
  0: ["Clear", "\u2600\ufe0f"],
  1: ["Mostly clear", "\ud83c\udf24\ufe0f"],
  2: ["Partly cloudy", "\u26c5"],
  3: ["Overcast", "\u2601\ufe0f"],
  45: ["Fog", "\ud83c\udf2b\ufe0f"],
  48: ["Freezing fog", "\ud83c\udf2b\ufe0f"],
  51: ["Light drizzle", "\ud83c\udf26\ufe0f"],
  53: ["Drizzle", "\ud83c\udf26\ufe0f"],
  55: ["Heavy drizzle", "\ud83c\udf27\ufe0f"],
  56: ["Freezing drizzle", "\ud83c\udf27\ufe0f"],
  57: ["Freezing drizzle", "\ud83c\udf27\ufe0f"],
  61: ["Light rain", "\ud83c\udf26\ufe0f"],
  63: ["Rain", "\ud83c\udf27\ufe0f"],
  65: ["Heavy rain", "\ud83c\udf27\ufe0f"],
  66: ["Freezing rain", "\ud83c\udf27\ufe0f"],
  67: ["Freezing rain", "\ud83c\udf27\ufe0f"],
  71: ["Light snow", "\ud83c\udf28\ufe0f"],
  73: ["Snow", "\ud83c\udf28\ufe0f"],
  75: ["Heavy snow", "\u2744\ufe0f"],
  77: ["Snow grains", "\ud83c\udf28\ufe0f"],
  80: ["Showers", "\ud83c\udf26\ufe0f"],
  81: ["Showers", "\ud83c\udf27\ufe0f"],
  82: ["Heavy showers", "\u26c8\ufe0f"],
  85: ["Snow showers", "\ud83c\udf28\ufe0f"],
  86: ["Snow showers", "\u2744\ufe0f"],
  95: ["Thunderstorms", "\u26c8\ufe0f"],
  96: ["Thunderstorms with hail", "\u26c8\ufe0f"],
  99: ["Thunderstorms with hail", "\u26c8\ufe0f"],
};

/** Words and a glyph for a WMO code. Never returns nothing to draw. */
export function describeCode(code) {
  const hit = WMO[Number(code)];
  if (hit) return { said: hit[0], glyph: hit[1] };
  return { said: "Unsettled", glyph: "\ud83c\udf25\ufe0f" };
}

/**
 * Fetch a forecast for a point.
 *
 * @param lat, lon  the destination, not the device -- the day is planned where
 *   the items are.
 * @param days      how many days out, capped at the service's useful range.
 * @returns { timezone, days: [...], hours: [...] } or null when the service is
 *   unreachable. Null on purpose: a day view with no weather is a day view, and a
 *   thrown error would take the whole screen down over a nice-to-have.
 */
export async function fetchForecast(lat, lon, { days = 3, signal } = {}) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

  const url =
    `${ENDPOINT}?latitude=${lat.toFixed(4)}&longitude=${lon.toFixed(4)}` +
    "&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset" +
    "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch" +
    `&timezone=auto&forecast_days=${Math.min(Math.max(days, 1), 7)}`;

  let raw;
  try {
    const res = await fetch(url, { signal, next: { revalidate: 1800 } });
    if (!res.ok) return null;
    raw = await res.json();
  } catch {
    return null;
  }
  return shape(raw);
}

/** The service's parallel arrays, turned into rows that can be read. */
export function shape(raw) {
  if (!raw || !raw.daily || !raw.hourly) return null;

  const d = raw.daily;
  const days = (d.time || []).map((date, i) => {
    const { said, glyph } = describeCode(d.weather_code?.[i]);
    return {
      date,
      said,
      glyph,
      high: round(d.temperature_2m_max?.[i]),
      low: round(d.temperature_2m_min?.[i]),
      rainChance: round(d.precipitation_probability_max?.[i]),
      // "2026-08-29T06:12" -> "06:12"
      sunrise: String(d.sunrise?.[i] || "").slice(11, 16) || null,
      sunset: String(d.sunset?.[i] || "").slice(11, 16) || null,
    };
  });

  const h = raw.hourly;
  const hours = (h.time || []).map((stamp, i) => {
    const { said, glyph } = describeCode(h.weather_code?.[i]);
    return {
      date: String(stamp).slice(0, 10),
      hm: String(stamp).slice(11, 16),
      said,
      glyph,
      temp: round(h.temperature_2m?.[i]),
      feels: round(h.apparent_temperature?.[i]),
      rainChance: round(h.precipitation_probability?.[i]),
      wind: round(h.wind_speed_10m?.[i]),
    };
  });

  return { timezone: raw.timezone || null, days, hours };
}

/** The day's shape, or null when the forecast does not reach that far. */
export function dayOf(forecast, date) {
  return (forecast?.days || []).find((d) => d.date === date) || null;
}

/**
 * The forecast for a particular hour of a particular day.
 *
 * Rounds to the nearest hour rather than the one before, because a 7:50 dinner is
 * better described by eight o'clock. Returns null rather than the closest
 * available hour when the day is not covered -- a temperature from the wrong day
 * presented as this one's is worse than a blank.
 */
export function hourOf(forecast, date, time) {
  const t = String(time || "").slice(0, 5);
  if (!forecast || !date || !/^\d{2}:\d{2}$/.test(t)) return null;
  const mins = Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
  const nearest = Math.round(mins / 60);
  // 24:00 is tomorrow's midnight; the last hour of the day is the honest answer.
  const hour = String(Math.min(nearest, 23)).padStart(2, "0") + ":00";
  return (
    (forecast.hours || []).find((r) => r.date === date && r.hm === hour) || null
  );
}

/**
 * The one line worth saying about a day's weather before anybody asks.
 *
 * Only mentions rain when it is likely enough to change what you carry, and wind
 * when it is enough to be felt. A band that says "10% chance of rain" every day
 * teaches people to stop reading it.
 */
export function daySaid(day) {
  if (!day) return null;
  const bits = [day.said];
  if (day.high !== null && day.low !== null)
    bits.push(`${day.high}\u00b0 / ${day.low}\u00b0`);
  if (day.rainChance !== null && day.rainChance >= 30)
    bits.push(`${day.rainChance}% chance of rain`);
  return bits.join(" \u00b7 ");
}

function round(n) {
  return Number.isFinite(n) ? Math.round(n) : null;
}
