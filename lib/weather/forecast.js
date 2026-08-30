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

/**
 * Forecasts for several points in one call.
 *
 * Open-Meteo takes comma-separated coordinates and answers with an array in the
 * same order, which is what makes per-item weather affordable: a day that runs
 * from Denali to Anchorage is two points and still one request. A single point
 * comes back as a bare object rather than a one-element array, so both shapes
 * are handled -- that difference is the whole reason this is not a loop over
 * fetchForecast.
 *
 * @returns an array the same length as `points`, holding a shaped forecast or
 *   null per point. Never throws and never returns short: the day view lines up
 *   items against this by index.
 */
export async function fetchForecasts(points = [], { days = 3, signal } = {}) {
  const usable = points.filter(
    (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lon),
  );
  if (usable.length === 0) return points.map(() => null);
  if (usable.length !== points.length)
    // Mixed good and bad points would put the answers out of step with the
    // items. One bad coordinate is a bug worth failing loudly-quietly on.
    return points.map(() => null);

  const lats = points.map((p) => p.lat.toFixed(4)).join(",");
  const lons = points.map((p) => p.lon.toFixed(4)).join(",");
  const url =
    `${ENDPOINT}?latitude=${lats}&longitude=${lons}` +
    "&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code" +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset" +
    "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch" +
    `&timezone=auto&forecast_days=${Math.min(Math.max(days, 1), 7)}`;

  let raw;
  try {
    const res = await fetch(url, { signal, next: { revalidate: 1800 } });
    if (!res.ok) return points.map(() => null);
    raw = await res.json();
  } catch {
    return points.map(() => null);
  }
  const list = Array.isArray(raw) ? raw : [raw];
  return points.map((_, i) => shape(list[i]) || null);
}

/**
 * Which points to ask about for a day, and which one belongs to each item.
 *
 * Everything within `nearKm` of a point already on the list shares that point's
 * forecast, because the sky does not change across a town and a request per
 * dinner reservation would. Anything further away earns its own -- a day that
 * starts in Denali and ends in Anchorage is 240 miles and two different
 * afternoons, and reporting one for the other is exactly the sort of confident
 * wrong answer this app is not allowed to give.
 *
 * The first point is always the day's anchor, so the band at the top of the day
 * keeps the forecast it has always had.
 *
 * @param items   the day's rows, in order
 * @param points  Map of item id -> { lat, lon }
 * @param opts.nearKm  how far counts as the same weather
 * @param opts.max     how many requests one day is worth
 * @returns { points: [{lat, lon}], byItem: Map(itemId -> index) }. Items with no
 *   coordinates, and items past the cap, are absent from the map rather than
 *   pointed at somebody else's weather.
 */
export function weatherPoints(
  items = [],
  points = new Map(),
  { nearKm = 12, max = 4 } = {},
) {
  const out = [];
  const byItem = new Map();
  for (const item of items) {
    const p = points.get(item?.id);
    if (!p || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) continue;
    let found = out.findIndex((q) => kmApart(q, p) <= nearKm);
    if (found === -1) {
      if (out.length >= max) continue;
      out.push({ lat: p.lat, lon: p.lon });
      found = out.length - 1;
    }
    byItem.set(item.id, found);
  }
  return { points: out, byItem };
}

/**
 * Kilometres between two points, near enough for "is this the same weather".
 *
 * Deliberately local rather than imported from the routing module: this file has
 * no other dependency, and a weather lookup should not be able to break because
 * something changed about journeys.
 */
function kmApart(a, b) {
  const R = 6371;
  const rad = (n) => (n * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
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
 * The forecast for one hour, in one line, for the item that happens then.
 *
 * The same restraint as the day line. A number nobody acts on is noise, and a
 * line saying "8% chance of rain" under every dinner teaches people to stop
 * reading the one that says 80%. So the temperature and the sky are always said,
 * and everything else earns its place: what it feels like only when that is a
 * different answer from what it is, rain only when it is likely enough to change
 * what you carry, wind only when it is enough to be felt.
 *
 * Returns null rather than a partial line when there is no temperature and no
 * description, because "60% chance of rain" on its own is a riddle.
 */
export function hourSaid(hour) {
  if (!hour) return null;
  const bits = [];
  const has = (n) => n !== null && n !== undefined;
  if (has(hour.temp)) bits.push(`${hour.temp}\u00b0`);
  if (hour.said) bits.push(hour.said.toLowerCase());
  if (bits.length === 0) return null;
  if (
    has(hour.feels) &&
    has(hour.temp) &&
    Math.abs(hour.feels - hour.temp) >= 5
  )
    bits.push(`feels like ${hour.feels}\u00b0`);
  if (has(hour.rainChance) && hour.rainChance >= 30)
    bits.push(`${hour.rainChance}% chance of rain`);
  if (has(hour.wind) && hour.wind >= 15) bits.push(`wind ${hour.wind} mph`);
  return bits.join(" \u00b7 ");
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

/**
 * The same day, minus the numbers, for the places that show the high and the low
 * themselves.
 *
 * The band above the day prints the temperatures in bold and then a sentence, so
 * handing it the full line printed them twice -- "54 deg / 38 deg  Cloudy with
 * showers, 54 deg / 38 deg, 60% chance of rain". This is the same line with the
 * numbers left for the caller to print.
 */
export function dayWithoutNumbers(day) {
  if (!day) return null;
  const bits = [];
  if (day.said) bits.push(day.said);
  if (day.rainChance !== null && day.rainChance >= 30)
    bits.push(`${day.rainChance}% chance of rain`);
  return bits.join(" \u00b7 ") || null;
}

/**
 * The wind, when it is enough to be worth a picture.
 *
 * The text mentions wind from 15 mph, which is the point at which it changes how
 * a jacket behaves. A symbol is a louder thing than a clause, so it waits for 25,
 * where it changes whether you take the boat trip. Null below that: a breeze
 * drawn on every line teaches people to stop looking at the one that means it.
 */
export function windGlyph(wind) {
  if (!Number.isFinite(Number(wind))) return null;
  return Number(wind) >= 25 ? "\ud83d\udca8" : null;
}

/**
 * How much to trust a forecast this far out, said out loud.
 *
 * A day summary holds its shape across about a week, and an hourly series does
 * not, which is why the per-item lines stop after tomorrow. But "holds its shape"
 * is not "is right", and a high and a low printed with no distance attached read
 * exactly as confident on day six as on day one. So the distance is part of the
 * sentence, and it gets less certain as it gets further away.
 *
 * Null for today and tomorrow, which have the real thing, and null past seven
 * days, where the service is describing a climate rather than a week.
 */
export function hedgeSaid(daysOut) {
  if (!Number.isFinite(daysOut)) return null;
  if (daysOut < 2 || daysOut > 7) return null;
  if (daysOut <= 3) return `${daysOut} days out, so the shape of the day.`;
  if (daysOut <= 5) return `${daysOut} days out, so a hint. It will move.`;
  return `${daysOut} days out, which is barely more than a guess.`;
}

function round(n) {
  return Number.isFinite(n) ? Math.round(n) : null;
}
