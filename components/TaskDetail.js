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
//
// The button and the paragraph are exported on their own because the same
// sentence-behind-a-title problem turned up in the dates band on the home
// screen, where the control has to sit on the title's own line rather than
// under it. Two copies of a control drift apart -- one keeps the small-caps and
// the other does not, one says Details and the other says Why -- so the shape
// lives here once and both screens compose it.

import { useState } from "react";

/** The control: a chevron that turns over, and the word for what it opens. */
export function DetailsToggle({ open, onToggle, title, className = "" }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-label={`${open ? "Hide" : "Show"} details for ${title}`}
      className={`no-print inline-flex min-h-9 items-center gap-1 whitespace-nowrap rounded-lg px-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint transition hover:bg-sand hover:text-teal ${className}`}
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
  );
}

/** What the control opens. Always on paper, whatever the screen is doing. */
export function DetailsText({ text, open, className = "text-sm" }) {
  return (
    <p
      className={`leading-relaxed text-ink-soft print:block ${className} ${
        open ? "mt-0.5 block" : "hidden"
      }`}
    >
      {text}
    </p>
  );
}

export function TaskDetail({ text, title }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;

  return (
    <div className="mt-1">
      <DetailsToggle
        open={open}
        onToggle={() => setOpen((v) => !v)}
        title={title}
        className="-ml-1.5"
      />
      <DetailsText text={text} open={open} />
    </div>
  );
}
