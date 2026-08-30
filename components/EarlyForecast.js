"use client";

import { useEffect, useState } from "react";
import {
  dayWithoutNumbers,
  hedgeSaid,
  sourceSaid,
} from "@/lib/weather/forecast";

/**
 * What the sky is expected to do on a day further out than tomorrow.
 *
 * The day view briefs today and the day after it properly -- an hourly forecast
 * under each item, a journey to the next thing, whatever has been researched.
 * None of that is worth doing for a day six days away: past about two days an
 * hourly series is describing a mood rather than a morning.
 *
 * A day's high, low and one sentence does survive the week, though, and it is
 * worth knowing on the Wednesday you are deciding whether to book the boat. So
 * this is that, and only that: no journeys, no advice, no model. It says how far
 * out it is looking as part of the sentence, because a high and a low printed
 * with no distance attached read exactly as confident on day six as on day one.
 *
 * Silent whenever there is nothing honest to say -- a day past the forecast's
 * reach, a day with no located items, a service that is down. A trip planned a
 * year out is almost entirely made of such days, and "no idea yet" is better said
 * by an empty space than by a number somebody might pack for.
 */
export default function EarlyForecast({ tripId, date, today }) {
  const [weather, setWeather] = useState(null);

  const daysOut = daysBetween(today, date);
  const hedge = hedgeSaid(daysOut);

  useEffect(() => {
    // Not asked at all when there would be nothing to print: no request for the
    // days the day view already covers, and none for a date the service cannot
    // reach.
    if (!tripId || !date || !hedge) {
      setWeather(null);
      return;
    }
    let live = true;
    setWeather(null);
    (async () => {
      try {
        const res = await fetch(
          `/api/forecast?trip=${encodeURIComponent(tripId)}&date=${encodeURIComponent(date)}`,
        );
        if (!res.ok) return;
        const data = await res.json();
        // A late answer for a day nobody is looking at any more is not an answer.
        if (live && data.date === date) setWeather(data.weather || null);
      } catch {
        /* the day still renders; this line is an extra */
      }
    })();
    return () => {
      live = false;
    };
  }, [tripId, date, hedge]);

  if (!hedge || !weather) return null;
  const rest = dayWithoutNumbers(weather);
  const has = weather.high !== null && weather.low !== null;
  if (!has && !rest) return null;

  return (
    <p className="no-print mb-3 flex flex-wrap items-baseline gap-x-2 gap-y-0.5 rounded-2xl border border-dashed border-[var(--line)] bg-sand/50 px-4 py-2 text-sm text-ink-soft">
      {weather.glyph && (
        <span aria-hidden="true" className="text-lg leading-none">
          {weather.glyph}
        </span>
      )}
      {has && (
        <span className="tabular font-semibold text-ink">
          {Math.round(weather.high)}&deg; / {Math.round(weather.low)}&deg;
        </span>
      )}
      {rest && <span>{rest}</span>}
      <span className="text-ink-faint">{hedge}</span>
      {sourceSaid(weather) && (
        <span className="text-xs text-ink-faint">
          <span aria-hidden="true">via </span>
          <span className="sr-only">forecast from the </span>
          {sourceSaid(weather)}
        </span>
      )}
    </p>
  );
}

/**
 * Whole days from one plain date to another.
 *
 * Both are YYYY-MM-DD read at noon UTC, which is the same trick the rest of the
 * app uses to keep a date from drifting a day when the clock and the calendar
 * disagree about which one they belong to.
 */
function daysBetween(from, to) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(from || ""))) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(to || ""))) return null;
  const a = Date.parse(`${from}T12:00:00Z`);
  const b = Date.parse(`${to}T12:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.round((b - a) / 86400000);
}
