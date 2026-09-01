"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";

/**
 * The heading an item goes under: pick one the list already uses, or type a new
 * one.
 *
 * This was a plain text input with a `datalist` attached, which is the right
 * idea and almost never works. A datalist gives no sign that it is there -- no
 * arrow, no border, nothing -- so on a phone, where there is no hover and the
 * keyboard covers the suggestions the moment it opens, the field reads as "type
 * the heading exactly as you typed it last time". Which is how a list ends up
 * with Toiletries and toiletries, or Snacks and Snack, sitting apart as two
 * headings for one drawer.
 *
 * So it is a real combobox: a visible arrow that opens the headings this list
 * already uses, typing filters them, and anything you type that matches nothing
 * is kept as it is -- offered back as "Use X" so it is clear the app heard a new
 * heading rather than a mistyped old one.
 */
export default function CategoryPicker({
  value,
  onChange,
  options = [],
  placeholder = "Category",
  required = false,
  autoFocus = false,
  label = "Category",
}) {
  const [open, setOpen] = useState(false);
  // Which row the arrow keys are sitting on. -1 means "nothing chosen yet", so
  // Enter falls through to the form rather than picking the first heading for
  // somebody who was only typing.
  const [cursor, setCursor] = useState(-1);
  const wrap = useRef(null);
  const field = useRef(null);
  const list = useRef(null);
  const listId = useId();
  // Where to draw the open list. It is drawn into the body rather than beside
  // the input because every card on the packing page is `overflow-hidden` to
  // keep its rounded corners, and a list hanging out of the bottom of the last
  // form on a card would simply be cut off at the card's edge. So it is
  // measured off the input and positioned against the window instead.
  const [box, setBox] = useState(null);

  const place = useCallback(() => {
    const el = field.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = window.innerHeight - r.bottom;
    const room = Math.max(120, Math.min(224, below - 12));
    // Not enough room under the field for a usable list: draw it above, which
    // is also what happens on a phone with the keyboard up.
    const up = below < 160 && r.top > below;
    setBox({
      left: r.left,
      width: r.width,
      top: up ? undefined : r.bottom + 4,
      bottom: up ? window.innerHeight - r.top + 4 : undefined,
      maxHeight: up ? Math.min(224, r.top - 12) : room,
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    place();
    window.addEventListener("scroll", place, true);
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place, true);
      window.removeEventListener("resize", place);
    };
  }, [open, place]);

  const typed = (value || "").trim();
  const matches = useMemo(() => {
    const all = options.filter(Boolean);
    if (!typed) return all;
    const needle = typed.toLowerCase();
    // A field holding a heading the list already uses is not somebody typing --
    // it is the answer the Add button filled in for them. So every heading is
    // still offered, with theirs at the top, because the reason to open the list
    // at that moment is to put the line somewhere else, and filtering down to
    // the one word already in the box would mean clearing the box to do it.
    const exact = all.filter((c) => c.toLowerCase() === needle);
    if (exact.length)
      return [...exact, ...all.filter((c) => c.toLowerCase() !== needle)];
    const starts = all.filter(
      (c) => c.toLowerCase() !== needle && c.toLowerCase().startsWith(needle),
    );
    const inside = all.filter(
      (c) =>
        !c.toLowerCase().startsWith(needle) && c.toLowerCase().includes(needle),
    );
    return [...exact, ...starts, ...inside];
  }, [options, typed]);

  const isNew =
    typed.length > 0 &&
    !options.some((c) => c.toLowerCase() === typed.toLowerCase());

  useEffect(() => {
    if (!open) return;
    function away(e) {
      // The list is drawn into the body, so "outside the field" is not enough:
      // a press on one of its own options is outside the wrapper, and closing
      // on that press would unmount the option before its click ever landed.
      if (wrap.current?.contains(e.target)) return;
      if (list.current?.contains(e.target)) return;
      setOpen(false);
    }
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  function choose(category) {
    onChange(category);
    setOpen(false);
    setCursor(-1);
  }

  function onKeyDown(e) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) {
        setOpen(true);
        setCursor(0);
      } else setCursor((c) => Math.min(matches.length - 1, c + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(-1, c - 1));
      return;
    }
    if (e.key === "Escape" && open) {
      // Only the list closes. Escape inside a form that is sitting on top of a
      // list nobody asked to leave should not throw away what was typed.
      e.preventDefault();
      e.stopPropagation();
      setOpen(false);
      setCursor(-1);
      return;
    }
    if (e.key === "Enter" && open && cursor >= 0 && matches[cursor]) {
      e.preventDefault();
      choose(matches[cursor]);
    }
  }

  return (
    <div className="relative" ref={wrap}>
      <input
        ref={field}
        className="field pr-8"
        placeholder={placeholder}
        value={value}
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-label={label}
        autoComplete="off"
        autoFocus={autoFocus}
        required={required}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
          setCursor(-1);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
      />
      <button
        type="button"
        tabIndex={-1}
        aria-label={
          open ? "Hide the headings" : "Show the headings this list uses"
        }
        onClick={() => setOpen((o) => !o)}
        className="absolute right-0 top-0 flex h-full w-8 items-center justify-center text-ink-soft"
      >
        <svg
          viewBox="0 0 20 20"
          className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          aria-hidden="true"
        >
          <path d="M5 8l5 5 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {open && box && (matches.length > 0 || isNew)
        ? createPortal(
            <ul
              ref={list}
              id={listId}
              role="listbox"
              style={{
                position: "fixed",
                left: box.left,
                width: box.width,
                top: box.top,
                bottom: box.bottom,
                maxHeight: box.maxHeight,
              }}
              className="z-50 overflow-auto rounded-xl border border-[var(--line)] bg-white py-1 shadow-lg"
            >
              {matches.map((category, i) => (
                <li key={category}>
                  <button
                    type="button"
                    role="option"
                    aria-selected={i === cursor}
                    onMouseEnter={() => setCursor(i)}
                    onClick={() => choose(category)}
                    className={`block w-full px-3 py-2 text-left text-sm ${
                      i === cursor ? "bg-teal/10 text-ink" : "text-ink"
                    }`}
                  >
                    {category}
                  </button>
                </li>
              ))}
              {isNew ? (
                <li className="border-t border-[var(--line)]">
                  <button
                    type="button"
                    onClick={() => choose(typed)}
                    className="block w-full px-3 py-2 text-left text-sm text-ink-soft"
                  >
                    Use “{typed}”{" "}
                    <span className="opacity-60">— new heading</span>
                  </button>
                </li>
              ) : null}
            </ul>,
            document.body,
          )
        : null}
    </div>
  );
}
