"use client";

// The description on a reminder, shut until asked for.
//
// A reminder's title is the thing to do; the description underneath is the
// why, the where, or the paragraph somebody pasted from a confirmation email.
// It is useful once in a while and rarely at a glance, and on a trip a year out
// with forty reminders it was most of the page. So each record shows one short
// control instead, and the paragraph appears only for the record that was
// opened. Nothing is open on arrival, the same rule the tips and the day packs
// follow.
//
// On paper the control is meaningless and the paragraph is not, so print gets
// every description and no button.

import { useState } from "react";

export function TaskDetail({ text, title }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;

  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label={`${open ? "Hide" : "Show"} details for ${title}`}
        className="no-print -ml-1.5 inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-lg px-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint transition hover:bg-sand hover:text-teal"
      >
        <svg
          aria-hidden="true"
          width="12"
          height="12"
          viewBox="0 0 16 16"
          fill="none"
          className={`transition-transform ${open ? "rotate-180" : ""}`}
        >
          <path
            d="M4 6.5L8 10.5L12 6.5"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
        {open ? "Hide details" : "Details"}
      </button>
      <p
        className={`text-sm leading-relaxed text-ink-soft print:block ${
          open ? "mt-0.5 block" : "hidden"
        }`}
      >
        {text}
      </p>
    </div>
  );
}
