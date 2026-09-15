"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  airportsSaid,
  driveMinutesFrom,
  driveSaid,
} from "@/lib/airports/drive";

/**
 * The airports this household leaves from.
 *
 * The home address says where the car starts. This says where the plane does,
 * which is a different fact and not one that can be worked out from the first:
 * the nearest runway to a house in Missouri might be a field with three flights
 * a day, and the airport the family actually uses might be two hours further on.
 * Straight-line distance cannot make that call, so the family makes it.
 *
 * Each airport carries the drive as the family describes it, because they are the
 * ones who have done it in February. The app never fills that in -- it ships a
 * coordinate per airport and knows nothing about roads, and a drive time that was
 * guessed looks exactly like one that was measured.
 *
 * One of them is the home base, which the database insists on: a partial unique
 * index means a second primary is refused rather than quietly accepted, so
 * "which airport is theirs" always has exactly one answer.
 *
 * The suggestions come from the saved home point when there is one, closest
 * first, and the search box is the way in for a household that has not saved an
 * address yet. Nothing is a fare, a route or an airline: an airport being forty
 * miles away does not mean anybody flies from it to anywhere useful, and the card
 * does not pretend otherwise.
 */
export default function HomeAirports({
  familyId,
  airports = [],
  homeLat = null,
  homeLon = null,
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  // The nearest few, fetched once when the card is opened. Server-held, because
  // the reference list is ninety kilobytes and this asks it two questions.
  const [nearby, setNearby] = useState([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState([]);
  // What each row's drive box currently says, keyed by row id, so typing in one
  // does not re-render the others and a blur can tell whether anything changed.
  const [drafts, setDrafts] = useState({});
  const timer = useRef(null);

  const held = new Set(airports.map((row) => row.code));

  useEffect(() => {
    if (!open) return;
    if (!Number.isFinite(homeLat) || !Number.isFinite(homeLon)) return;
    let stop = false;
    fetch(`/api/airports?near=${homeLat},${homeLon}&limit=6`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (!stop && json?.airports) setNearby(json.airports);
      })
      .catch(() => {
        // No suggestions is a quieter failure than a message about it. The
        // search box below still works.
      });
    return () => {
      stop = true;
    };
  }, [open, homeLat, homeLon]);

  // Typed search, debounced. Two characters is the floor the lookup itself
  // enforces, so anything shorter is not worth a request.
  useEffect(() => {
    if (timer.current) clearTimeout(timer.current);
    const q = query.trim();
    if (q.length < 2) {
      setFound([]);
      return;
    }
    timer.current = setTimeout(() => {
      const near =
        Number.isFinite(homeLat) && Number.isFinite(homeLon)
          ? `&near=${homeLat},${homeLon}`
          : "";
      fetch(`/api/airports?q=${encodeURIComponent(q)}${near}&limit=6`)
        .then((res) => (res.ok ? res.json() : null))
        .then((json) => setFound(json?.airports || []))
        .catch(() => setFound([]));
    }, 200);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [query, homeLat, homeLon]);

  async function add(airport) {
    if (held.has(airport.code)) return;
    setBusy(airport.code);
    setError("");
    const { error: dbError } = await supabase.from("home_airports").insert({
      family_id: familyId,
      code: airport.code,
      name: airport.name,
      city: airport.city || null,
      region: airport.region || null,
      lat: Number.isFinite(airport.lat) ? airport.lat : null,
      lon: Number.isFinite(airport.lon) ? airport.lon : null,
      // The first one added is the one they mean, until they say otherwise.
      is_primary: airports.length === 0,
    });
    setBusy("");
    if (dbError) {
      setError(dbError.message);
      return;
    }
    setQuery("");
    setFound([]);
    router.refresh();
  }

  async function drop(row) {
    setBusy(row.id);
    setError("");
    const { error: dbError } = await supabase
      .from("home_airports")
      .delete()
      .eq("id", row.id);
    setBusy("");
    if (dbError) {
      setError(dbError.message);
      return;
    }
    router.refresh();
  }

  /**
   * Make one of them the home base.
   *
   * Two writes in order, and the order is the whole point: the database refuses a
   * second primary, so the one that holds it now has to let go before the new one
   * can take it. Doing it the other way round fails on the index every time.
   */
  async function makePrimary(row) {
    setBusy(row.id);
    setError("");
    const others = airports.filter((a) => a.is_primary && a.id !== row.id);
    for (const other of others) {
      const { error: clearError } = await supabase
        .from("home_airports")
        .update({ is_primary: false })
        .eq("id", other.id);
      if (clearError) {
        setBusy("");
        setError(clearError.message);
        return;
      }
    }
    const { error: dbError } = await supabase
      .from("home_airports")
      .update({ is_primary: true })
      .eq("id", row.id);
    setBusy("");
    if (dbError) {
      setError(dbError.message);
      return;
    }
    router.refresh();
  }

  async function saveDrive(row) {
    const said = drafts[row.id];
    if (said === undefined) return;
    const minutes = driveMinutesFrom(said);
    if (minutes === row.drive_minutes) return;
    setBusy(row.id);
    setError("");
    const { error: dbError } = await supabase
      .from("home_airports")
      .update({ drive_minutes: minutes })
      .eq("id", row.id);
    setBusy("");
    if (dbError) {
      setError(dbError.message);
      return;
    }
    setDrafts((was) => {
      const next = { ...was };
      delete next[row.id];
      return next;
    });
    router.refresh();
  }

  const said = airportsSaid(airports);

  if (!open) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
        {said ? (
          <span>
            Flights are priced from{" "}
            <span className="font-medium text-ink">{said}</span>.
          </span>
        ) : (
          <span>
            No home airports, so a fare has no origin to be judged against.
          </span>
        )}
        <button
          type="button"
          className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
          onClick={() => {
            setError("");
            setOpen(true);
          }}
        >
          {said ? "Change" : "Add one"}
        </button>
      </div>
    );
  }

  const suggestions = (query.trim().length >= 2 ? found : nearby).filter(
    (airport) => !held.has(airport.code),
  );

  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] bg-white p-3">
      <p className="section-label">Airports the household flies from</p>
      <p className="mt-1 text-sm text-ink-soft">
        Which airports a fare has to leave from to be worth anything, and the
        drive time each one costs you. The drive time is yours to say &mdash;
        this app knows where the runways are and nothing about the roads.
      </p>

      {airports.length ? (
        <ul className="mt-3 space-y-2">
          {airports.map((row) => (
            <li
              key={row.id}
              className="flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--line)] pt-2 first:border-0 first:pt-0"
            >
              <span className="font-mono text-base font-semibold text-ink">
                {row.code}
              </span>
              <span className="min-w-0 flex-1 text-sm text-ink-soft">
                <span className="text-ink">{row.name}</span>
                {row.city ? (
                  <>
                    {" "}
                    &middot; {row.city}
                    {row.region ? ` ${row.region}` : ""}
                  </>
                ) : null}
              </span>
              <label className="flex items-center gap-1.5 text-sm text-ink-soft">
                <span className="sr-only">Drive time to {row.code}</span>
                <input
                  className="field w-28"
                  value={
                    drafts[row.id] !== undefined
                      ? drafts[row.id]
                      : driveSaid(row.drive_minutes)
                  }
                  placeholder="Drive time"
                  maxLength={12}
                  onChange={(event) =>
                    setDrafts((was) => ({
                      ...was,
                      [row.id]: event.target.value,
                    }))
                  }
                  onBlur={() => saveDrive(row)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      saveDrive(row);
                    }
                  }}
                />
              </label>
              {row.is_primary ? (
                <span className="chip text-teal">Home base</span>
              ) : (
                <button
                  type="button"
                  className="text-sm text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal disabled:no-underline disabled:opacity-60"
                  disabled={busy === row.id}
                  onClick={() => makePrimary(row)}
                >
                  Make it the home base
                </button>
              )}
              <button
                type="button"
                className="text-sm text-ink-faint underline decoration-[var(--line)] underline-offset-2 hover:text-rose disabled:no-underline disabled:opacity-60"
                disabled={busy === row.id}
                onClick={() => drop(row)}
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="mt-3">
        <label className="sr-only" htmlFor="airport-search">
          Find an airport
        </label>
        <input
          id="airport-search"
          className="field w-full sm:w-[22rem]"
          value={query}
          placeholder="STL, Kansas City, Chicago…"
          maxLength={40}
          onChange={(event) => setQuery(event.target.value)}
        />
        {suggestions.length ? (
          <ul className="mt-2 flex flex-wrap gap-2">
            {suggestions.map((airport) => (
              <li key={airport.code}>
                <button
                  type="button"
                  className="btn btn-ghost whitespace-nowrap text-sm"
                  disabled={busy === airport.code}
                  onClick={() => add(airport)}
                >
                  <span className="font-mono font-semibold">
                    {airport.code}
                  </span>{" "}
                  {airport.city || airport.name}
                  {Number.isFinite(airport.miles) ? (
                    <span className="text-ink-faint">
                      {" "}
                      &middot; {airport.miles} mi
                    </span>
                  ) : null}
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-ink-soft">
            {query.trim().length >= 2
              ? "Nothing by that name with scheduled flights and a three-letter code."
              : Number.isFinite(homeLat)
                ? "Looking for the ones near you…"
                : "Save a home address above and the nearest ones get offered here."}
          </p>
        )}
      </div>

      {error ? <p className="mt-2 text-sm text-rose">{error}</p> : null}

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setOpen(false)}
        >
          Done
        </button>
        <p className="text-xs text-ink-faint">
          The miles are straight lines from your home address, not drives. Write
          the drive time however you say it &mdash; 20 min, 2 hr 30 min, 4:30
          &mdash; and it is read back in hours and minutes.
        </p>
      </div>
    </div>
  );
}
