"use client";

import { useState } from "react";

/**
 * A quiet line that shows the family's inbox address and copies it on tap.
 *
 * Meant for surfaces where the address is not the point of the screen -- the
 * Trips index and the Family screen -- so an operator who has come to that
 * screen looking to hand the address out has the address to hand without
 * having to visit /inbox first. Smaller weight than an action button, and
 * without a border, so it does not steal attention from the primary content
 * of the page.
 */
export default function InboxAddressChip({ address, note }) {
  const [copied, setCopied] = useState(false);

  if (!address) return null;

  async function onCopy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // Nothing to do -- the address is visible on the chip, so the user
      // can select and copy it manually. Better than an alert dialog.
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-ink-soft">
      <span>{note || "Forward booking confirmations to"}</span>
      <button
        type="button"
        onClick={onCopy}
        className="inline-flex max-w-full flex-wrap items-center gap-1.5 rounded-full bg-sand px-2.5 py-1 text-left font-mono text-[0.72rem] text-ink transition hover:bg-sand-deep"
        aria-label={`Copy ${address} to clipboard`}
      >
        {/* A monospaced address plus the word Copy is wider than the column
            this chip sits in on a narrow phone, and it is narrower still on the
            next-steps rows, which are indented by a compass mark. Wrapping
            inside the pill keeps the whole address on screen. */}
        <span className="break-all">{address}</span>
        <span
          aria-hidden="true"
          className="text-[0.65rem] uppercase tracking-[0.08em] text-ink-faint"
        >
          {copied ? "Copied" : "Copy"}
        </span>
      </button>
    </div>
  );
}
