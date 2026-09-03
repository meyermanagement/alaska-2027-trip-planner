"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import LocationField from "@/components/LocationField";

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
  // The suggestion the family actually chose, kept whole. Picking one out of the
  // list has already found the point, so saving it should not go and ask for the
  // same point a second time -- and the answer to "12 Windsor Court" typed free
  // and "12 Windsor Court" chosen from a list are not always the same answer.
  const [picked, setPicked] = useState(null);
  // What the lookup said about why it could not place a house number. Shown as a
  // note rather than an error, because the address still saved.
  const [note, setNote] = useState("");
  // Asking the phone. Separate from the save spinner, because the two can happen
  // at once and mean different things.
  const [finding, setFinding] = useState(false);
  // Whether the phone will even be asked. Resolved once, on opening the form,
  // so a device with no location services never shows a button that cannot work.
  const [canAsk, setCanAsk] = useState(false);

  /**
   * The address the phone is standing at.
   *
   * Called two ways. Quietly, when the box is opened and the browser says
   * permission has already been given -- there is no prompt to spring in that
   * case, so asking is free and the family gets their own address handed to them.
   * And loudly, from the button, which is the only path allowed to raise a
   * permission prompt, because a prompt should follow something that was pressed.
   *
   * It fills the box rather than saving. A reverse lookup can name the house next
   * door, and the family reads the words before they become the place their trips
   * start from.
   */
  async function useThePhone({ quiet } = { quiet: false }) {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setError("");
    setNote("");
    setFinding(true);
    const position = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p),
        () => resolve(null),
        // A five minute old fix is still the same driveway, and reusing one means
        // no wait for a cold lock.
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 300000 },
      );
    });
    if (!position) {
      setFinding(false);
      if (!quiet) {
        setNote(
          "This device would not say where it is. Type the address instead.",
        );
      }
      return;
    }
    const { latitude, longitude } = position.coords || {};
    try {
      const res = await fetch(`/api/here?at=${latitude},${longitude}`);
      const json = await res.json();
      if (!res.ok || !json?.here) {
        if (!quiet) {
          setNote(
            json?.error || "No address was found where you are standing.",
          );
        }
        return;
      }
      const label = json.here.label || "";
      setDraft(label);
      // The point came back with the words, so a save does not need to look the
      // same address up again.
      setPicked({
        value: label,
        kind: json.exact ? "address" : "street",
        lat: json.here.lat,
        lon: json.here.lon,
      });
      setNote(
        json.exact
          ? "That is the address at your position. Check it, then save."
          : "That is the nearest address to your position, placed on the street rather than at the house. Check it, then save.",
      );
    } catch {
      if (!quiet) {
        setNote("The address lookup did not answer. Try again in a moment.");
      }
    } finally {
      setFinding(false);
    }
  }

  // Can the phone be asked, and has it already agreed? Read on opening the form.
  // A granted permission is acted on straight away; anything else waits for the
  // button, so nobody gets a browser prompt for opening a text field.
  useEffect(() => {
    if (!open) return;
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setCanAsk(false);
      return;
    }
    setCanAsk(true);
    let stop = false;
    navigator.permissions
      ?.query({ name: "geolocation" })
      .then((status) => {
        if (stop) return;
        if (status.state === "denied") setCanAsk(false);
        // Already allowed, and the box is empty: fill it in without being asked.
        if (status.state === "granted" && !draft.trim()) {
          useThePhone({ quiet: true });
        }
      })
      .catch(() => {
        // Safari without the permissions API. The button still works.
      });
    return () => {
      stop = true;
    };
    // Deliberately only on opening: re-running this while somebody types would
    // fight them for the box.
  }, [open]);

  async function locate(text) {
    // The same signed-in geocoder the "say where you are" box uses. A failure
    // here is not a failure to save: the address is the thing the family typed
    // and the point is a convenience the app derived, so they are allowed to
    // part company.
    try {
      const res = await fetch(`/api/here?q=${encodeURIComponent(text)}`);
      if (!res.ok) return null;
      const json = await res.json();
      setNote(typeof json?.trouble === "string" ? json.trouble : "");
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
    setNote("");

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
    const chosen =
      picked && picked.value === next
        ? {
            lat: picked.lat,
            lon: picked.lon,
            exact: picked.kind === "address",
            label: picked.value,
          }
        : null;
    const point =
      chosen ||
      (next === saved.address && saved.lat !== null
        ? { lat: saved.lat, lon: saved.lon, exact: saved.precise, label: "" }
        : await locate(next));

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
        <div className="w-full sm:w-[30rem]">
          <LocationField
            value={draft}
            onChange={(next) => {
              setDraft(next);
              // Typed over: the chosen answer no longer describes what is in the
              // box, so it stops counting and the save falls back to a lookup.
              setPicked((was) => (was && was.value === next ? was : null));
            }}
            onPick={(place) => setPicked(place)}
            placeholder="1234 Example Street, Springfield, MO 65801"
            className="field w-full"
            inputProps={{ id: "household-home", maxLength: 160 }}
            onEnter={save}
            onEscape={() => {
              setOpen(false);
              setError("");
            }}
          />
        </div>
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
      {canAsk && (
        <button
          type="button"
          className="mt-2 text-sm text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal disabled:no-underline disabled:opacity-60"
          disabled={finding || busy}
          onClick={() => useThePhone({ quiet: false })}
        >
          {finding ? "Asking this device…" : "Use where I am now"}
        </button>
      )}
      {error ? <p className="mt-2 text-sm text-rose">{error}</p> : null}
      {note ? <p className="mt-2 text-sm text-ink-soft">{note}</p> : null}
      <p className="mt-2 text-xs text-ink-faint">
        Suggestions appear as you type, and choosing one keeps the exact point
        it was found at. If this device has already been allowed to share its
        location, the box fills itself in when you open it. If only the street
        can be found &mdash; which happens on plenty of residential roads,
        because the free map this app uses names streets far more completely
        than it numbers doors &mdash; the point lands in the middle of the
        block, and it says so. That is a few hundred feet out, which is nothing
        on the drive to an airport.
      </p>
    </div>
  );
}
