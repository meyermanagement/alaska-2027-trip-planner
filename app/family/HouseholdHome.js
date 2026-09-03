"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

/**
 * Where the household lives.
 *
 * Every trip starts from somewhere, and until now the app had no idea where that
 * was. It could tell you the drive from the hotel in Altoona to the fairgrounds
 * because both are itinerary rows with coordinates, but it could not tell you
 * what time to leave the house on the morning of day one, because the house was
 * not a thing it knew about. The only way to say where you were starting from was
 * to be standing there with a phone that would answer.
 *
 * So it is a household fact rather than a person's: two parents leaving the same
 * driveway should not each have to enter it, and it does not change when one of
 * them is the one holding the phone.
 *
 * The address is geocoded through the same lookup the location box on an
 * itinerary item uses, and the two halves are stored separately on purpose. If
 * the lookup does not recognize the address, the written address is still saved
 * and the card says outright that it could not be placed on a map -- an address
 * that reads correctly but silently measures nothing is worse than one that
 * admits it.
 *
 * Primary travelers only, which the page enforces by not rendering for anybody
 * else and the database enforces in its own words: the UPDATE policy on families
 * refuses a secondary traveler.
 */
export default function HouseholdHome({
  familyId,
  address,
  lat,
  lon,
  precise,
}) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(address || "");
  const [saved, setSaved] = useState({
    address: address || "",
    lat: Number.isFinite(lat) ? lat : null,
    lon: Number.isFinite(lon) ? lon : null,
    precise: precise === true,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function locate(text) {
    // The same signed-in geocoder the "say where you are" box uses. A failure
    // here is not a failure to save: the address is the thing the family typed
    // and the point is a convenience the app derived, so they are allowed to
    // part company.
    try {
      const res = await fetch(`/api/here?q=${encodeURIComponent(text)}`);
      if (!res.ok) return null;
      const json = await res.json();
      const here = json?.here;
      return Number.isFinite(here?.lat) && Number.isFinite(here?.lon)
        ? {
            lat: here.lat,
            lon: here.lon,
            label: here.label || "",
            exact: Boolean(json?.exact),
          }
        : null;
    } catch {
      return null;
    }
  }

  async function save() {
    const next = draft.trim().replace(/\s+/g, " ");
    setBusy(true);
    setError("");

    if (!next) {
      const { error: dbError } = await supabase
        .from("families")
        .update({
          home_address: null,
          home_lat: null,
          home_lon: null,
          home_precise: null,
          home_geo_at: null,
        })
        .eq("id", familyId);
      setBusy(false);
      if (dbError) {
        setError(dbError.message);
        return;
      }
      setSaved({ address: "", lat: null, lon: null, precise: false });
      setOpen(false);
      router.refresh();
      return;
    }

    // Only looked up when the words changed. Re-geocoding an unchanged address
    // on every save is a request that can only produce the answer already held,
    // or a worse one on a bad day.
    const point =
      next === saved.address && saved.lat !== null
        ? { lat: saved.lat, lon: saved.lon, exact: saved.precise, label: "" }
        : await locate(next);

    // When the lookup matched an actual building it also hands back a tidied
    // version of the address, and that is the better thing to keep: it is what
    // the coordinates are actually of, so the words and the point cannot drift
    // apart. A street-level match is not allowed to rewrite what was typed --
    // replacing "12 Windsor Court" with "Windsor Court" would quietly delete the
    // number the family cared about.
    const written = point?.exact && point.label ? point.label : next;

    const { error: dbError } = await supabase
      .from("families")
      .update({
        home_address: written,
        home_lat: point?.lat ?? null,
        home_lon: point?.lon ?? null,
        home_precise: point ? Boolean(point.exact) : null,
        home_geo_at: point ? new Date().toISOString() : null,
      })
      .eq("id", familyId);
    setBusy(false);
    if (dbError) {
      setError(dbError.message);
      return;
    }
    setSaved({
      address: written,
      lat: point?.lat ?? null,
      lon: point?.lon ?? null,
      precise: Boolean(point?.exact),
    });
    setDraft(written);
    setOpen(false);
    router.refresh();
  }

  if (!open) {
    return (
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink-soft">
        {saved.address ? (
          <span>
            Trips start from{" "}
            <span className="font-medium text-ink">{saved.address}</span>
            {saved.lat === null ? (
              <span className="text-amber">
                {" "}
                &mdash; not found on the map, so nothing is measured from it yet
              </span>
            ) : saved.precise ? null : (
              <span className="text-ink-faint">
                {" "}
                &mdash; placed on the street rather than at the house
              </span>
            )}
            .
          </span>
        ) : (
          <span>No home address, so day one has nothing to leave from.</span>
        )}
        <button
          type="button"
          className="text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal"
          onClick={() => {
            setDraft(saved.address);
            setError("");
            setOpen(true);
          }}
        >
          {saved.address ? "Change" : "Add one"}
        </button>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-xl border border-[var(--line)] bg-white p-3">
      <label className="section-label block" htmlFor="household-home">
        Where the household leaves from
      </label>
      <p className="mt-1 text-sm text-ink-soft">
        The starting point for the first thing on a trip, so the app can work
        out what time to leave the house. Used whenever nobody has said where
        they are, and never shown to anyone outside this household.
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          id="household-home"
          className="field w-full sm:w-96"
          value={draft}
          maxLength={160}
          placeholder="123 Windsor Court, Webster Groves, MO"
          autoComplete="street-address"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              save();
            }
            if (e.key === "Escape") {
              setOpen(false);
              setError("");
            }
          }}
        />
        <button
          type="button"
          className="btn btn-primary"
          disabled={busy}
          onClick={save}
        >
          {busy ? "Looking it up…" : "Save"}
        </button>
        <button
          type="button"
          className="btn btn-ghost"
          disabled={busy}
          onClick={() => {
            setOpen(false);
            setError("");
          }}
        >
          Cancel
        </button>
      </div>
      <p className="mt-2 text-xs text-ink-faint">
        The house is looked up when you save. If only the street can be found
        &mdash; which happens on plenty of residential roads, because the free
        map this app uses names streets far more completely than it numbers
        doors &mdash; the point lands in the middle of the block, and it says
        so. That is a few hundred feet out, which is nothing on the drive to an
        airport.
      </p>
      {error ? <p className="mt-2 text-sm text-rose">{error}</p> : null}
    </div>
  );
}
