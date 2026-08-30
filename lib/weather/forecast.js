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
 * The models asked, every time.
 *
 * Asking Open-Meteo without naming a model gets "best_match", which at any given
 * point is one model. On the last Sunday in August it had Thursday 3 September in
 * Altoona, Iowa at 102 degrees, and 106 for the Tuesday before -- which would beat
 * the state record for September. The European model said 88 for that Thursday.
 * The number was never a bug in the arithmetic here; it was one model running hot,
 * printed as though it were the weather.
 *
 * Three models was the first fix and it was not enough: with the American model at
 * 102 and the German at 98 against the European at 88, the middle of the three was
 * 98, while the National Weather Service office in Des Moines -- the people who
 * actually forecast that county -- said 93. Nine models from eight services put
 * the middle at 94.
 *
 * A median over this many is the specific defence against the failure that started
 * it: one service can be fifteen degrees out and move the answer by nothing, where
 * an average would carry a ninth of that error onto the screen, and one model
 * carried all of it.
 *
 * KNMI, DMI and MET Norway return the identical number outside Europe, being the
 * same underlying run, so only one of them is here -- three copies of one model
 * would be three votes for it. They all arrive in one request, so the cost is a
 * larger response and no extra round trip.
 */
export const MODELS = [
  "ecmwf_ifs025", // ECMWF, Reading
  "gfs_seamless", // NOAA, the model that said 102
  "icon_seamless", // DWD, Offenbach
  "gem_seamless", // Environment Canada
  "jma_seamless", // Japan Meteorological Agency
  "ukmo_seamless", // Met Office, Exeter
  "knmi_seamless", // KNMI, standing in for the Nordic trio as well
  "meteofrance_seamless", // Meteo-France
  "cma_grapes_global", // China Meteorological Administration
];

/** How far apart the models have to be before the day admits it, in degrees. */
export const SPREAD_SAID_AT = 8;

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
  const [one] = await fetchForecasts([{ lat, lon }], { days, signal });
  return one ?? null;
}

/**
 * The URL for one of the two requests.
 *
 * @param coords  "lat1,lat2" and "lon1,lon2", already fixed to four decimals
 * @param models  which models to ask
 * @param hourly  whether to ask for the hourly series at all
 */
function forecastUrl(coords, models, { days, hourly }) {
  return (
    `${ENDPOINT}?latitude=${coords.lats}&longitude=${coords.lons}` +
    (hourly
      ? "&hourly=temperature_2m,apparent_temperature,precipitation_probability,wind_speed_10m,weather_code"
      : "") +
    "&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset" +
    "&temperature_unit=fahrenheit&wind_speed_unit=mph&precipitation_unit=inch" +
    `&timezone=auto&forecast_days=${Math.min(Math.max(days, 1), 7)}` +
    `&models=${models.join(",")}`
  );
}

/** One request, or null if it does not come back. Never throws. */
async function ask(url, signal) {
  try {
    const res = await fetch(url, { signal, next: { revalidate: 1800 } });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
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

  const coords = {
    lats: points.map((p) => p.lat.toFixed(4)).join(","),
    lons: points.map((p) => p.lon.toFixed(4)).join(","),
  };

  // One request, one panel of models, both blocks.
  //
  // The tempting version of this asks nine models for the day and three for the
  // hours, since the hourly arrays are most of the bytes. It was written that
  // way first and then thrown out: the day band read 94 while three o'clock that
  // same afternoon read 95, because a median over nine models and a median over
  // three are different statistics and neither is wrong. A reader does not know
  // that and should not have to. So the same models answer both, and a day's high
  // and the hours inside it are the same panel's opinion.
  const raw = await ask(
    forecastUrl(coords, MODELS, { days, hourly: true }),
    signal,
  );
  if (!raw) return points.map(() => null);

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

/**
 * Which models actually answered, for one block of the response.
 *
 * With `models=` set, every field arrives suffixed -- `temperature_2m_max_ecmwf_ifs025`
 * -- and a model with no data for this point is simply absent. Without it, fields
 * are bare. Both shapes are read, so a recorded response from before this change,
 * or a service that ignores the parameter, still produces a forecast instead of a
 * blank screen.
 *
 * Returns the suffixes to look for, or [""] meaning "the plain field".
 */
function modelsIn(block, field) {
  const found = MODELS.filter((m) => Array.isArray(block?.[`${field}_${m}`]));
  if (found.length) return found.map((m) => `_${m}`);
  return Array.isArray(block?.[field]) ? [""] : [];
}

/** Every model's number for one field at one index, outliers included. */
function valuesAt(block, field, suffixes, i) {
  const out = [];
  for (const sfx of suffixes) {
    const v = block?.[`${field}${sfx}`]?.[i];
    // Null is how the service says "this model has nothing for that hour", and
    // Number(null) is 0, which would drag a median down by thirty degrees and
    // report a spread of ninety. Checked before converting, not after.
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (Number.isFinite(n)) out.push(n);
  }
  return out;
}

/**
 * The middle number, which is the whole point.
 *
 * With two models it is their average, because there is no middle and picking one
 * would be a coin toss dressed up as a forecast.
 */
function median(list) {
  if (!list.length) return null;
  const sorted = [...list].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** The median of what the models said for one field, rounded for reading. */
function agreed(block, field, suffixes, i) {
  return round(median(valuesAt(block, field, suffixes, i)));
}

/**
 * Which model to take the unaveragable things from.
 *
 * A weather code cannot be averaged -- the mean of "clear" and "thunderstorm" is
 * not a sky -- and neither can a sunrise be usefully blended. So they come from
 * whichever model landed nearest the agreed temperature, which keeps the words
 * and the numbers describing the same day rather than one model's rain over
 * another model's warmth.
 */
function nearestModel(block, field, suffixes, i, target) {
  if (target === null || suffixes.length < 2) return suffixes[0] ?? "";
  let best = suffixes[0] ?? "";
  let bestGap = Infinity;
  for (const sfx of suffixes) {
    const v = block?.[`${field}${sfx}`]?.[i];
    if (v === null || v === undefined || v === "") continue;
    const n = Number(v);
    if (!Number.isFinite(n)) continue;
    const gap = Math.abs(n - target);
    if (gap < bestGap) {
      bestGap = gap;
      best = sfx;
    }
  }
  return best;
}

/** The service's parallel arrays, turned into rows that can be read. */
export function shape(raw) {
  // Either block alone is a usable answer now: the wide request asks for days
  // without hours, and a shaped response with no hours is still a day band.
  if (!raw || (!raw.daily && !raw.hourly)) return null;

  const d = raw.daily || {};
  const dHigh = modelsIn(d, "temperature_2m_max");
  const dLow = modelsIn(d, "temperature_2m_min");
  const dRain = modelsIn(d, "precipitation_probability_max");
  const dCode = modelsIn(d, "weather_code");
  const dRise = modelsIn(d, "sunrise");
  const dSet = modelsIn(d, "sunset");

  const days = (d.time || []).map((date, i) => {
    const highs = valuesAt(d, "temperature_2m_max", dHigh, i);
    const high = round(median(highs));
    // The words come from whichever model is closest to the agreed high.
    const pick = nearestModel(d, "temperature_2m_max", dHigh, i, high);
    const codeKey = dCode.includes(pick) ? pick : (dCode[0] ?? "");
    const { said, glyph } = describeCode(d[`weather_code${codeKey}`]?.[i]);
    const riseKey = dRise.includes(pick) ? pick : (dRise[0] ?? "");
    const setKey = dSet.includes(pick) ? pick : (dSet[0] ?? "");
    return {
      date,
      said,
      glyph,
      high,
      low: agreed(d, "temperature_2m_min", dLow, i),
      rainChance: agreed(d, "precipitation_probability_max", dRain, i),
      // "2026-08-29T06:12" -> "06:12"
      sunrise: String(d[`sunrise${riseKey}`]?.[i] || "").slice(11, 16) || null,
      sunset: String(d[`sunset${setKey}`]?.[i] || "").slice(11, 16) || null,
      // How far apart the models were about the high, and how many spoke. Null
      // rather than 0 when only one answered: no disagreement and no agreement
      // are different things, and printing "they agree" on the strength of a
      // single model is the confident wrong answer all over again.
      spread:
        highs.length > 1
          ? round(Math.max(...highs) - Math.min(...highs))
          : null,
      models: highs.length,
    };
  });

  const h = raw.hourly || {};
  const hTemp = modelsIn(h, "temperature_2m");
  const hFeels = modelsIn(h, "apparent_temperature");
  const hRain = modelsIn(h, "precipitation_probability");
  const hWind = modelsIn(h, "wind_speed_10m");
  const hCode = modelsIn(h, "weather_code");

  const hours = (h.time || []).map((stamp, i) => {
    const temp = agreed(h, "temperature_2m", hTemp, i);
    const pick = nearestModel(h, "temperature_2m", hTemp, i, temp);
    const codeKey = hCode.includes(pick) ? pick : (hCode[0] ?? "");
    const { said, glyph } = describeCode(h[`weather_code${codeKey}`]?.[i]);
    return {
      date: String(stamp).slice(0, 10),
      hm: String(stamp).slice(11, 16),
      said,
      glyph,
      temp,
      feels: agreed(h, "apparent_temperature", hFeels, i),
      rainChance: agreed(h, "precipitation_probability", hRain, i),
      wind: agreed(h, "wind_speed_10m", hWind, i),
    };
  });

  // A response whose blocks are present but empty is nothing to draw, so it is
  // null like an unreachable service rather than an object that lies about
  // having a forecast in it.
  if (days.length === 0 && hours.length === 0) return null;

  return { timezone: raw.timezone || null, days, hours };
}

/**
 * When the forecasts do not agree, said out loud.
 *
 * Eight degrees is the line. Below it the models are doing what models do and
 * saying so would be noise on every day of every trip. At or above it the middle
 * number is holding together two genuinely different Thursdays, and a family
 * deciding what to pack deserves to know that rather than to be told 98 in the
 * same voice the app uses for tomorrow.
 */
export function spreadSaid(day) {
  const spread = Number(day?.spread);
  if (!Number.isFinite(spread) || spread < SPREAD_SAID_AT) return null;
  return `forecasts differ by ${Math.round(spread)}\u00b0`;
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
  const disagreement = spreadSaid(day);
  if (disagreement) bits.push(disagreement);
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
  // Said here as well as in daySaid, because this is the line the band above a
  // day actually prints, and that band is where the 102 was read.
  const disagreement = spreadSaid(day);
  if (disagreement) bits.push(disagreement);
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
