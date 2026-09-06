"use client";

import { useState } from "react";
import LocationField from "@/components/LocationField";

/**
 * A short form for a home address, with the same suggestion list and geocoder
 * the Family screen's household home uses. Kept apart from HouseholdHome because
 * this one has no card of its own, no open/closed toggle and no database write:
 * it hands what the family typed and what the lookup found back to whoever
 * dropped it in, so the same box can be used on the welcome page (save to the
 * families row afterwards) and on the practice screen (keep it in memory only).
 *
 * The two pieces are given back separately on purpose: what the family typed is
 * the record they will recognise, and the coordinates are a convenience the app
 * derived. If the geocoder cannot place a house number, the words still stand.
 */
export default function HomePicker({
  value,
  onChange,
  onLocated,
  placeholder = "908 Windsor Ct, Webster Groves, MO",
  className = "",
}) {
  // The suggestion the family actually chose, kept whole. Picking one out of the
  // list already found the point, so saving it should not go and ask for the
  // same point a second time. Held here rather than in the parent to keep the
  // parent's API to two callbacks: the words as they type, and the location as
  // it is confirmed. The parent should call `locate(value)` on submit if the
  // family typed something instead of picking a suggestion.
  const [, setPicked] = useState(null);

  function handlePick(place) {
    setPicked(place);
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
