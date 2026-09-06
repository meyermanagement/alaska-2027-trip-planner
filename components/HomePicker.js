"use client";

import { useEffect, useState } from "react";
import LocationField from "@/components/LocationField";

/**
 * A short form for a home address, with the same suggestion list, geocoder and
 * "Use where I am now" the Family screen's household home uses.
 *
 * Kept apart from HouseholdHome because this one has no card of its own, no
 * open/closed toggle and no database write: it hands what the family typed and
 * what the lookup found back to whoever dropped it in, so the same box can be
 * used on the welcome page (save to the families row afterwards) and on the
 * practice screen (keep it in memory only).
 *
 * The two pieces are given back separately on purpose: the words are the
 * record the family will recognise, and the coordinates are a convenience the
 * app derived. If the geocoder cannot place a house number, the words still
 * stand.
 */
export default function HomePicker({
  value,
  onChange,
  onLocated,
  placeholder = "908 Windsor Ct, Webster Groves, MO",
  className = "",
}) {
  // Does the browser expose location at all, and has the family already given
  // permission for it once. Read on mount so the button and the quiet auto-fill
  // both know where they stand. Anything else waits for a press -- nobody gets
  // a permission prompt for opening a text field.
  const [canAsk, setCanAsk] = useState(false);
  const [finding, setFinding] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
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
        if (status.state === "granted" && !String(value || "").trim()) {
          askThePhone({ quiet: true });
        }
      })
      .catch(() => {
        // Safari without the permissions API. The button still works.
      });
    return () => {
      stop = true;
    };
    // Deliberately only on mount, and only when there is nothing typed yet:
    // re-running this later would fight the family for the box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handlePick(place) {
    onChange?.(place.value);
    if (onLocated && Number.isFinite(place.lat) && Number.isFinite(place.lon)) {
      onLocated({
        address: place.value,
        lat: place.lat,
        lon: place.lon,
        precise: place.kind === "address",
      });
    }
  }

  async function askThePhone({ quiet } = { quiet: false }) {
    if (typeof navigator === "undefined" || !navigator.geolocation) return;
    setNote("");
    setFinding(true);
    const position = await new Promise((resolve) => {
      navigator.geolocation.getCurrentPosition(
        (p) => resolve(p),
        () => resolve(null),
        // A five minute old fix is still the same driveway, and reusing one
        // means no wait for a cold lock.
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
      onChange?.(label);
      onLocated?.({
        address: label,
        lat: json.here.lat,
        lon: json.here.lon,
        precise: Boolean(json.exact),
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

  return (
    <div className={className}>
      <LocationField
        value={value || ""}
        onChange={onChange}
        onPick={handlePick}
        placeholder={placeholder}
        offerHome={false}
        inputProps={{ maxLength: 160, autoComplete: "off" }}
      />
      {canAsk && (
        <button
          type="button"
          className="mt-2 text-sm text-teal underline decoration-teal/30 underline-offset-2 hover:decoration-teal disabled:no-underline disabled:opacity-60"
          disabled={finding}
          onClick={() => askThePhone({ quiet: false })}
        >
          {finding ? "Asking this device…" : "Use where I am now"}
        </button>
      )}
      {note ? <p className="mt-2 text-xs text-ink-soft">{note}</p> : null}
    </div>
  );
}

/**
 * The same geocoder the Family screen uses, called by hand for a home address
 * that was typed rather than chosen from the list. Returns null when the lookup
 * cannot place it -- the words still count, only the point is missing.
 */
export async function locateHome(text) {
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
