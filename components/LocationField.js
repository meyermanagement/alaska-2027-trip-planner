"use client";

// The location box, which now looks places up instead of just holding text.
//
// Two things make it worth the trouble. It leans on the trip's own destination,
// so "Simon and Seaforts" on an Alaska trip finds the restaurant in Anchorage
// rather than a street in England. And when the box is empty it searches for what
// you already wrote on the line above, because by the time you have typed
// "Dinner at Simon and Seafort's" you have said where you are going and should
// not have to say it again.
//
// It stays a plain text field underneath all of it. Anything can be typed and
// kept, nothing has to be chosen from the list, and if the geocoder is down the
// box behaves exactly as it did before this existed.

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { queryFromTitle } from "@/lib/places/intent";

// Long enough that a phrase gets typed before anything is asked for, short
// enough that the list is there when the thumb stops.
const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;

export default function LocationField({
  value,
  onChange,
  title = "",
  category = "",
  destination = "",
  placeholder = "Location",
  className = "field",
  onPick = null,
  inputProps = null,
  onEnter = null,
  onEscape = null,
}) {
  const [places, setPlaces] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [busy, setBusy] = useState(false);
  // What the current list is a list for, so a stale reply cannot repopulate it.
  const askedFor = useRef("");
  const box = useRef(null);
  const inputRef = useRef(null);
  const listId = useId();

  // What to search for: what is in the box, or failing that, the place named in
  // the title of the thing being planned.
  const fromTitle = useMemo(() => queryFromTitle(title), [title]);
  const typed = String(value || "").trim();
  const term = typed.length >= MIN_CHARS ? typed : "";

  const look = useCallback(
    async (q) => {
      if (!q || q.length < MIN_CHARS) {
        setPlaces([]);
        setBusy(false);
        return;
      }
      askedFor.current = q;
      setBusy(true);
      try {
        const params = new URLSearchParams({ q });
        if (destination) params.set("near", destination);
        if (category) params.set("category", category);
        const res = await fetch(`/api/places?${params.toString()}`);
        const json = res.ok ? await res.json() : null;
        // A reply for something the user has since typed past is not an answer.
        if (askedFor.current !== q) return;
        setPlaces(Array.isArray(json?.places) ? json.places : []);
        setActive(-1);
      } catch {
        if (askedFor.current === q) setPlaces([]);
      } finally {
        if (askedFor.current === q) setBusy(false);
      }
    },
    [destination, category],
  );

  // Typing. One request per pause, not one per keystroke.
  useEffect(() => {
    if (!open) return undefined;
    if (!term) {
      setPlaces([]);
      return undefined;
    }
    const timer = setTimeout(() => look(term), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [term, open, look]);

  // Clicking away puts the list away, and leaves whatever was typed alone.
  useEffect(() => {
    if (!open) return undefined;
    const away = (event) => {
      if (box.current && !box.current.contains(event.target)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  const choose = (place) => {
    onChange(place.value);
    // The whole answer, for callers that want more than the words -- the home
    // address wants the coordinates the lookup already found, rather than
    // throwing them away and asking a second time for the same point.
    onPick?.(place);
    setOpen(false);
    setPlaces([]);
    setActive(-1);
    inputRef.current?.focus();
  };

  const onFocus = () => {
    setOpen(true);
    // An empty box, on an item that already says where it is going: offer that
    // straight away rather than waiting to be told twice.
    if (!typed && fromTitle) look(fromTitle);
  };

  const onKeyDown = (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      if (!places.length) return;
      event.preventDefault();
      setOpen(true);
      const step = event.key === "ArrowDown" ? 1 : -1;
      setActive((i) => {
        const next = i + step;
        if (next < 0) return places.length - 1;
        if (next >= places.length) return 0;
        return next;
      });
      return;
    }
    if (event.key === "Enter") {
      if (open && active >= 0 && places[active]) {
        // Only swallow the key when it is actually choosing something, so Enter
        // still saves the form the rest of the time.
        event.preventDefault();
        choose(places[active]);
        return;
      }
      // Outside a form there is nothing for Enter to submit, so a caller that
      // has its own save can ask to be told.
      if (onEnter) {
        event.preventDefault();
        onEnter();
      }
      return;
    }
    if (event.key === "Escape") {
      if (open) {
        event.preventDefault();
        setOpen(false);
        setActive(-1);
        return;
      }
      if (onEscape) {
        event.preventDefault();
        onEscape();
      }
      return;
    }
    if (event.key === "Tab") setOpen(false);
  };

  const showing = open && places.length > 0;

  return (
    <div ref={box} className="relative">
      <input
        ref={inputRef}
        className={className}
        placeholder={placeholder}
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setActive(-1);
        }}
        onFocus={onFocus}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showing}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          showing && active >= 0 ? `${listId}-${active}` : undefined
        }
        autoComplete="off"
        {...(inputProps || {})}
      />
      {showing && (
        <ul
          id={listId}
          role="listbox"
          className="absolute left-0 right-0 z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-sand-deep bg-white py-1 shadow-lg"
        >
          {places.map((place, i) => (
            <li
              key={`${place.value}-${i}`}
              id={`${listId}-${i}`}
              role="option"
              aria-selected={i === active}
            >
              <button
                type="button"
                // Mouse-down rather than click: a click would land after the
                // input has already lost focus and closed the list.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(place);
                }}
                onMouseEnter={() => setActive(i)}
                // The highlight has to be obvious to somebody arrowing down a
                // list of four near-identical hotel names, so it is a tinted row
                // with a teal edge rather than the faintest possible wash.
                className={`block w-full border-l-2 px-3 py-2 text-left text-sm ${
                  i === active
                    ? "border-teal bg-sand-deep/60"
                    : "border-transparent bg-transparent"
                }`}
              >
                <span className="block font-medium text-ink">{place.name}</span>
                {place.detail && (
                  <span className="block text-xs text-ink-faint">
                    {place.detail}
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && busy && !places.length && (
        <p className="absolute left-0 right-0 z-30 mt-1 rounded-xl border border-sand-deep bg-white px-3 py-2 text-xs text-ink-faint shadow-lg">
          Looking…
        </p>
      )}
    </div>
  );
}
