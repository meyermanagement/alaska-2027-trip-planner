/**
 * The National Weather Service, for the days it covers.
 *
 * The models this app blends are the raw ingredients of an American forecast, not
 * the forecast. In the United States a meteorologist at a local office looks at
 * those same runs every morning, knows what the Missouri valley does to an August
 * afternoon, and publishes a number. On the Sunday before the Des Moines horse
 * show the office in Johnston, Iowa said 93 for the Thursday while the raw models
 * ranged from 88 to 102. Nine models blended put it at 94. The office was closer
 * to the middle than any single model and it is the number the family would see
 * on any American weather app, on the local news, or on a sign at the fairground.
 * So where the office has an opinion, that is the number the app shows.
 *
 * Three things this deliberately does not do. It does not replace sunrise and
 * sunset, which the Weather Service does not publish and which are astronomy
 * rather than forecasting. It does not replace the model spread, because "the
 * models disagree by fourteen degrees" is still true and still worth saying even
 * when a forecaster has picked a number out of that range. And it does not touch
 * anywhere outside the coverage area -- Curacao, Vancouver, a ship in the Inside
 * Passage past the border -- where the blend remains the whole answer.
 *
 * The service asks for a User-Agent identifying the caller and rate-limits rather
 * than requiring a key, and it publishes an availability caveat: this is a public
 * good, not an SLA. Every failure path here returns null and leaves the blended
 * forecast standing.
 */

const POINTS = "https://api.weather.gov/points";

/** The service wants to know who is calling. */
const UA = "alyeska-travel-planner (+https://alyeskaai.vercel.app)";

/**
 * Boxes worth asking about.
 *
 * Not a border -- a cheap way to avoid a round trip that will certainly 404.
 * Generous on purpose: the service covers coastal waters and territorial seas, so
 * an Alaskan cruise a few miles offshore is inside these and gets an answer, while
 * the Caribbean and the middle of the Pacific never leave the sandbox. Anything
 * that slips through gets a 404 and falls back, which is correct if wasteful.
 */
const BOXES = [
  [24.4, -125.0, 49.0, -66.9], // the lower forty-eight, stopping at the border
  [49.0, -95.2, 49.4, -94.9], // the Northwest Angle, which is above that line
  [51.0, -180.0, 72.0, -129.0], // Alaska, including the Panhandle and the Aleutians
  [18.8, -160.3, 22.3, -154.7], // Hawaii
  [17.8, -68.0, 18.6, -64.5], // Puerto Rico and the Virgin Islands
];

/** Whether this point is somewhere the Weather Service forecasts. */
export function coveredByNws(lat, lon) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return false;
  return BOXES.some(
    ([s, w, n, e]) => lat >= s && lat <= n && lon >= w && lon <= e,
  );
}

/**
 * What the sky is doing, from the words the forecaster wrote.
 *
 * The service publishes a short phrase -- "Chance Showers And Thunderstorms",
 * "Mostly Sunny" -- and, deprecated but still present, an icon URL. There is no
 * WMO code, and the rest of this app draws its glyphs from WMO codes, so the
 * phrase is mapped back onto one. Order matters: a thunderstorm mentioned
 * anywhere in a phrase outranks the cloud cover it is also describing, because
 * "Partly Sunny then Chance Thunderstorms" is a day you plan around the storm.
 */
const PHRASES = [
  // Precipitation first, all of it, because "Partly Sunny then Chance
  // Thunderstorms" is a day you plan around the storm and not around the sunshine
  // in front of it.
  [/blizzard|blowing snow/i, 75],
  [/thunder|tstorm/i, 95],
  [/freezing rain|freezing drizzle|ice storm/i, 67],
  [/sleet|ice pellets|wintry mix|rain and snow|snow and rain/i, 68],
  [/heavy snow/i, 75],
  [/snow shower|flurr/i, 85],
  [/snow/i, 73],
  [/hail/i, 96],
  [/heavy rain|downpour/i, 82],
  [/shower/i, 80],
  [/rain/i, 63],
  [/drizzle/i, 51],
  [/fog|mist/i, 45],
  [/haze|smoke/i, 45],
  // Then cloud cover, most cloud first: "Mostly Cloudy" contains the word cloudy
  // and would otherwise be caught by the generic rule and lose the distinction.
  [/partly cloudy|partly sunny/i, 2],
  [/mostly cloudy/i, 3],
  [/cloudy|overcast/i, 3],
  [/mostly sunny/i, 1],
  [/sunny|clear|fair/i, 0],
  [/hot|heat/i, 0],
  [/wind/i, 1],
];

/**
 * The office's own phrase, in the app's sentence case.
 *
 * Worth carrying rather than flattening into this app's vocabulary. The Des Moines
 * office wrote "Slight Chance Showers And Thunderstorms" for the Thursday of the
 * horse show; the nearest code in the WMO list is plain "Thunderstorms", which is
 * a different Thursday -- one you cancel a class over rather than one you keep an
 * eye on. The hedge is the forecast. The code is kept for the glyph, because a
 * picture cannot say "slight chance" and an emoji of a storm is the right picture
 * either way.
 */
export function phraseSaid(text) {
  const said = String(text || "").trim();
  if (!said) return null;
  return said.charAt(0).toUpperCase() + said.slice(1).toLowerCase();
}

/** A WMO code for a Weather Service phrase, or null if it says nothing about sky. */
export function codeFromPhrase(text) {
  const said = String(text || "");
  if (!said) return null;
  for (const [re, code] of PHRASES) if (re.test(said)) return code;
  return null;
}

/**
 * Heat index, by the Weather Service's own formula.
 *
 * Their hourly feed gives temperature, humidity and wind but no apparent
 * temperature, and the blended forecast's apparent temperature comes from a
 * different set of models, so mixing them would put a "feels like" from one
 * source beside a temperature from another. This is the Rothfusz regression the
 * service publishes, with the two low-humidity and cool-humid adjustments, and
 * the simple-average shortcut below 80F where the regression is not used.
 *
 * @param t   temperature, Fahrenheit
 * @param rh  relative humidity, percent
 */
export function heatIndex(t, rh) {
  if (!Number.isFinite(t) || !Number.isFinite(rh)) return null;
  const simple = 0.5 * (t + 61 + (t - 68) * 1.2 + rh * 0.094);
  if ((simple + t) / 2 < 80) return simple;

  let hi =
    -42.379 +
    2.04901523 * t +
    10.14333127 * rh -
    0.22475541 * t * rh -
    0.00683783 * t * t -
    0.05481717 * rh * rh +
    0.00122874 * t * t * rh +
    0.00085282 * t * rh * rh -
    0.00000199 * t * t * rh * rh;
  if (rh < 13 && t >= 80 && t <= 112)
    hi -= ((13 - rh) / 4) * Math.sqrt((17 - Math.abs(t - 95)) / 17);
  else if (rh > 85 && t >= 80 && t <= 87)
    hi += ((rh - 85) / 10) * ((87 - t) / 5);
  return hi;
}

/** Wind chill, the service's formula, only where it is defined. */
export function windChill(t, mph) {
  if (!Number.isFinite(t) || !Number.isFinite(mph)) return null;
  if (t > 50 || mph < 3) return null;
  const v = Math.pow(mph, 0.16);
  return 35.74 + 0.6215 * t - 35.75 * v + 0.4275 * t * v;
}

/** What the air does to a person: heat index when warm, wind chill when cold. */
export function feelsLike(t, rh, mph) {
  if (!Number.isFinite(t)) return null;
  if (t <= 50) {
    const chill = windChill(t, mph);
    return chill === null ? t : chill;
  }
  const hi = heatIndex(t, rh);
  return hi === null ? t : hi;
}

/** Celsius to Fahrenheit, for the dewpoint the service reports in metric. */
function toF(c) {
  return Number.isFinite(c) ? c * 1.8 + 32 : null;
}

/** Relative humidity from temperature and dewpoint, both Fahrenheit. */
function humidityFrom(tF, dpF) {
  if (!Number.isFinite(tF) || !Number.isFinite(dpF)) return null;
  const t = (tF - 32) / 1.8;
  const d = (dpF - 32) / 1.8;
  const e = (x) => 6.112 * Math.exp((17.67 * x) / (x + 243.5));
  return Math.max(0, Math.min(100, (e(d) / e(t)) * 100));
}

/** "13 mph" or "8 to 15 mph" -> a number. The high end, since gusts matter. */
function mphOf(said) {
  const nums = String(said || "").match(/\d+/g);
  if (!nums) return null;
  return Math.max(...nums.map(Number));
}

/** "2026-09-03T15:00:00-05:00" -> "2026-09-03", in the forecast's own local time. */
function localDate(iso) {
  return String(iso || "").slice(0, 10);
}

/** "2026-09-03T15:00:00-05:00" -> "15:00". */
function localHm(iso) {
  return String(iso || "").slice(11, 16);
}

/** One request, JSON or null. Never throws: weather is a nice-to-have. */
async function ask(url, signal, revalidate) {
  try {
    const res = await fetch(url, {
      signal,
      headers: { "User-Agent": UA, Accept: "application/geo+json" },
      next: { revalidate },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

/**
 * The office's forecast for a point, in this app's shape.
 *
 * Three requests: the grid the point falls in, then that grid's twelve-hourly
 * forecast and its hourly one. The grid lookup is cached for a month because a
 * point does not move between grid squares; the forecasts for half an hour, like
 * the blended ones.
 *
 * @returns { office, days, hours } or null. Days carry high, low, words, glyph
 *   and rain chance -- no sunrise, no spread, nothing this source does not know.
 */
export async function fetchNws(lat, lon, { signal } = {}) {
  if (!coveredByNws(lat, lon)) return null;

  const point = await ask(
    `${POINTS}/${lat.toFixed(4)},${lon.toFixed(4)}`,
    signal,
    2592000,
  );
  const p = point?.properties;
  if (!p?.forecast || !p?.forecastHourly) return null;

  const [forecast, hourly] = await Promise.all([
    ask(p.forecast, signal, 1800),
    ask(p.forecastHourly, signal, 1800),
  ]);
  return shapeNws({ point, forecast, hourly });
}

/**
 * The three responses, turned into this app's shape. Pure, so a recorded morning
 * in Iowa can be a test fixture rather than a live request.
 *
 * @returns { office, timezone, days, hours } or null. Days carry high, low, words,
 *   glyph and rain chance -- no sunrise, no spread, nothing this source does not
 *   know.
 */
export function shapeNws({ point, forecast, hourly } = {}) {
  const p = point?.properties;
  const periods = forecast?.properties?.periods;
  if (!Array.isArray(periods) || periods.length === 0) return null;

  // --- the hours ------------------------------------------------------------
  //
  // The hourly feed starts at the current hour, so today is always a partial day
  // here. That is fine for the hours themselves -- nobody needs this morning's
  // temperature at lunchtime -- and the day's high and low come from the
  // twelve-hourly periods below, which do not have that hole.
  const hours = [];
  for (const h of hourly?.properties?.periods || []) {
    const temp = Number(h.temperature);
    if (!Number.isFinite(temp)) continue;
    // Number(undefined) is NaN rather than nullish, so ?? would not fall through
    // here: the humidity has to be tested before the dewpoint is reached for.
    const reported = Number(h.relativeHumidity?.value);
    const rh = Number.isFinite(reported)
      ? reported
      : humidityFrom(temp, toF(Number(h.dewpoint?.value)));
    const wind = mphOf(h.windSpeed);
    hours.push({
      date: localDate(h.startTime),
      hm: localHm(h.startTime),
      temp: Math.round(temp),
      feels: Math.round(feelsLike(temp, rh, wind) ?? temp),
      rainChance: Number.isFinite(Number(h.probabilityOfPrecipitation?.value))
        ? Math.round(Number(h.probabilityOfPrecipitation.value))
        : null,
      wind: Number.isFinite(wind) ? Math.round(wind) : null,
      code: codeFromPhrase(h.shortForecast),
      shortForecast: h.shortForecast || null,
    });
  }

  // --- the days -------------------------------------------------------------
  //
  // The service publishes days as two periods: a daytime one carrying the high
  // and a night one carrying the low, where "Thursday Night" is the night that
  // starts on Thursday evening and its low usually lands on Friday morning. That
  // is the convention every American forecast uses -- "Thursday: 93, low 73" --
  // so it is kept rather than recomputed into calendar-day minimums, which would
  // print a low the family would not recognize from any other forecast.
  const byDate = new Map();
  for (const per of periods) {
    const date = localDate(per.startTime);
    if (!date) continue;
    const t = Number(per.temperature);
    if (!Number.isFinite(t)) continue;
    const row = byDate.get(date) || {
      date,
      high: null,
      low: null,
      code: null,
      shortForecast: null,
      rainChance: null,
    };
    const rain = Number(per.probabilityOfPrecipitation?.value);
    if (Number.isFinite(rain))
      row.rainChance = Math.max(row.rainChance ?? 0, Math.round(rain));
    if (per.isDaytime) {
      row.high =
        row.high === null ? Math.round(t) : Math.max(row.high, Math.round(t));
      // The day's words come from the daylight period. A family reads a forecast
      // to decide what to do between breakfast and dinner.
      row.code = codeFromPhrase(per.shortForecast);
      row.shortForecast = per.shortForecast || null;
    } else {
      row.low =
        row.low === null ? Math.round(t) : Math.min(row.low, Math.round(t));
      // A night-only day -- the first day when it is already evening, or the last
      // one in range -- still deserves its sky rather than nothing.
      if (row.code === null) {
        row.code = codeFromPhrase(per.shortForecast);
        row.shortForecast = per.shortForecast || null;
      }
    }
    byDate.set(date, row);
  }

  const days = [...byDate.values()].sort((a, b) =>
    a.date.localeCompare(b.date),
  );
  if (days.length === 0) return null;

  return {
    office: p?.gridId || null,
    timezone: p?.timeZone || null,
    days,
    hours,
  };
}

/**
 * Forecasts for several points at once, in the order they were given.
 *
 * There is no multi-point endpoint, so this is a fan-out: up to three requests
 * per point, all in parallel, and each point failing on its own. Four points is
 * the app's ceiling for a single day, which keeps this at a dozen requests
 * against a service that asks for politeness rather than a key.
 */
export async function fetchNwsAll(points = [], { signal } = {}) {
  return Promise.all(
    (points || []).map((p) =>
      p && Number.isFinite(p.lat) && Number.isFinite(p.lon)
        ? fetchNws(p.lat, p.lon, { signal })
        : Promise.resolve(null),
    ),
  );
}
