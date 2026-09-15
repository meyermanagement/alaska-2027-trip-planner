"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Spinner } from "@/components/LinkPending";
import { airportsSaid, driveFromParts, driveParts } from "@/lib/airports/drive";

/**
 * The two boxes a drive time is collected in, in the order they are read.
 *
 * A pair of numbered boxes with their units printed beside them says what may be
 * typed without a sentence explaining it, which one box asking for free text
 * never did: people faced with it wrote 2.5, 2h15 and "about two hours" because
 * nothing on screen told them which was wanted.
 */
const DRIVE_BOXES = [
  { part: "hours", unit: "hr", spoken: "Hours", digits: 2 },
  { part: "mins", unit: "min", spoken: "Minutes", digits: 2 },
];

/** Digits only, so a box cannot hold something the pair cannot add up. */
function onlyDigits(text) {
  return String(text ?? "").replace(/\D+/g, "");
}

/** What a box shows: what is being typed if anything, else what is stored. */
function driveBoxValue(drafts, row, part) {
  const draft = drafts[row.id];
  if (draft && draft[part] !== undefined) return draft[part];
  return driveParts(row.drive_minutes)[part];
}

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
  // What the busy row or pill is actually doing, said in words. A ring on its
  // own tells you something is happening somewhere; removing an airport and
  // saving its drive time are worth telling apart while you wait. The row names
  // the airport already, so the wording does not repeat the code -- with it in,
  // the longest phrase ran off the end of a full row.
  const [doing, setDoing] = useState("");
  const [error, setError] = useState("");
  // The nearest few, fetched once when the card is opened. Server-held, because
  // the reference list is ninety kilobytes and this asks it two questions.
  const [nearby, setNearby] = useState([]);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState([]);
  // What each row's two drive boxes currently say, keyed by row id as
  // { hours, mins } strings, so typing in one row does not re-render the others
  // and a blur can tell whether anything actually changed.
  const [drafts, setDrafts] = useState({});
  const timer = useRef(null);
  // Every write here ends in a server re-render, and the row is not actually
  // finished until that lands: clearing the spinner when the insert returns
  // leaves a card showing the old list with nothing turning on it, which is the
  // moment people press the button a second time. So the refresh runs inside a
  // transition, and the row stays busy until the transition settles.
  const [refreshing, startRefresh] = useTransition();
  const awaitingRefresh = useRef(false);
  const afterward = useRef(null);

  useEffect(() => {
    if (refreshing || !awaitingRefresh.current) return;
    awaitingRefresh.current = false;
    setBusy("");
    setDoing("");
    const after = afterward.current;
    afterward.current = null;
    if (after) after();
  }, [refreshing]);

  /**
   * Hold the busy mark until the page has been re-read, then tidy up.
   *
   * The tidying has to wait too. Clearing the search box the moment the insert
   * returned took the pressed pill off the screen with it, which is exactly the
   * second the ring inside it was there to cover: the card looked idle and
   * unchanged until the new row appeared out of nowhere.
   */
  function settle(after) {
    awaitingRefresh.current = true;
    afterward.current = after || null;
    startRefresh(() => router.refresh());
  }

  function stopBusy() {
    setBusy("");
    setDoing("");
  }

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
    if (busy || held.has(airport.code)) return;
    setBusy(airport.code);
    setDoing(`Adding ${airport.code}`);
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
    if (dbError) {
      stopBusy();
      setError(dbError.message);
      return;
    }
    settle(() => {
      setQuery("");
      setFound([]);
    });
  }

  async function drop(row) {
    if (busy) return;
    setBusy(row.id);
    setDoing("Removing");
    setError("");
    const { error: dbError } = await supabase
      .from("home_airports")
      .delete()
      .eq("id", row.id);
    if (dbError) {
      stopBusy();
      setError(dbError.message);
      return;
    }
    settle();
  }

  /**
   * Make one of them the home base.
   *
   * Two writes in order, and the order is the whole point: the database refuses a
   * second primary, so the one that holds it now has to let go before the new one
   * can take it. Doing it the other way round fails on the index every time.
   */
  async function makePrimary(row) {
    if (busy) return;
    setBusy(row.id);
    setDoing("Making it the home base");
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
    if (dbError) {
      stopBusy();
      setError(dbError.message);
      return;
    }
    settle();
  }

  async function saveDrive(row) {
    const draft = drafts[row.id];
    if (draft === undefined) return;
    const minutes = driveFromParts(draft.hours, draft.mins);
    if (minutes === row.drive_minutes) return;
    setBusy(row.id);
    setDoing("Saving the drive");
    setError("");
    const { error: dbError } = await supabase
      .from("home_airports")
      .update({ drive_minutes: minutes })
      .eq("id", row.id);
    if (dbError) {
      stopBusy();
      setError(dbError.message);
      return;
    }
    setDrafts((was) => {
      const next = { ...was };
      delete next[row.id];
      return next;
    });
    settle();
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
        drive time each one costs you.
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
              <span className="flex shrink-0 items-center gap-2 text-sm text-ink-soft">
                <span className="text-ink-faint">Drive time</span>
                {DRIVE_BOXES.map((box) => (
                  <label key={box.part} className="flex items-center gap-1">
                    <span className="sr-only">
                      {box.spoken} driving to {row.code}
                    </span>
                    <input
                      className="field field-digits"
                      inputMode="numeric"
                      value={driveBoxValue(drafts, row, box.part)}
                      maxLength={box.digits}
                      onChange={(event) =>
                        setDrafts((was) => ({
                          ...was,
                          [row.id]: {
                            ...(was[row.id] ?? driveParts(row.drive_minutes)),
                            [box.part]: onlyDigits(event.target.value),
                          },
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
                    <span>{box.unit}</span>
                  </label>
                ))}
              </span>
              {busy === row.id ? (
                <span className="flex shrink-0 items-center gap-1.5 text-sm text-ink-soft">
                  <Spinner className="h-4 w-4 text-teal" />
                  {doing}&hellip;
                </span>
              ) : (
                <>
                  {row.is_primary ? (
                    <span className="chip text-teal">Home base</span>
                  ) : (
                    <button
                      type="button"
                      className="text-sm text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal disabled:no-underline disabled:opacity-60"
                      disabled={Boolean(busy)}
                      onClick={() => makePrimary(row)}
                    >
                      Make it the home base
                    </button>
                  )}
                  <button
                    type="button"
                    className="text-sm text-ink-faint underline decoration-[var(--line)] underline-offset-2 hover:text-rose disabled:no-underline disabled:opacity-60"
                    disabled={Boolean(busy)}
                    onClick={() => drop(row)}
                  >
                    Remove
                  </button>
                </>
              )}
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
                  className={`btn btn-ghost inline-flex items-center gap-1.5 whitespace-nowrap text-sm ${
                    busy === airport.code ? "border-teal/40 text-teal" : ""
                  }`}
                  // Pressed, not dimmed: the disabled attribute fades the whole
                  // pill including the ring turning inside it, which is the one
                  // part that has to stay legible. The press is refused in add
                  // instead.
                  aria-disabled={busy === airport.code}
                  onClick={() => add(airport)}
                >
                  {busy === airport.code ? (
                    <>
                      <Spinner className="h-4 w-4 text-teal" />
                      <span>
                        Adding{" "}
                        <span className="font-mono font-semibold">
                          {airport.code}
                        </span>
                      </span>
                    </>
                  ) : (
                    <>
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
                    </>
                  )}
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

      <div className="mt-3">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => setOpen(false)}
        >
          Done
        </button>
      </div>
    </div>
  );
}
