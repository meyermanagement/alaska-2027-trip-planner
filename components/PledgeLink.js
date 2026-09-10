"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import PledgeBody from "@/components/PledgeBody";

/**
 * Our Pledge, opened over whatever screen asked for it.
 *
 * A panel rather than a link out to /pledge. Meet Aly is the one screen where a
 * family has not committed to anything yet, so it is exactly where the promises
 * are worth reading -- and it is the worst place to send somebody away, since the
 * pledge page requires a session and, on the practice run, there is not one. The
 * panel keeps the screen underneath and hands them straight back to it.
 *
 * Three ways out, because a panel a family cannot close on the first screen they
 * ever see is worse than no panel: the close control, the veil behind it, and
 * Escape.
 *
 * The panel is drawn into document.body through a portal. It has to be: the link
 * sits inside a paragraph that animates in, and an animated transform makes that
 * paragraph the containing block for anything positioned inside it, so a fixed
 * overlay left in place lands halfway down the screen with the veil covering only
 * the bottom corner. Measured, not guessed -- that is exactly what it did.
 */
export default function PledgeLink({ className = "" }) {
  const [open, setOpen] = useState(false);
  // The portal target only exists in the browser, so the first render on the
  // server draws the link alone and the panel becomes possible afterwards.
  const [mounted, setMounted] = useState(false);
  const closeRef = useRef(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;

    // Escape closes, and the page underneath stops scrolling so a phone does not
    // move the screen behind the panel while somebody reads it.
    const onKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // The close control takes focus so the panel is dismissable from the keyboard
    // the moment it appears.
    closeRef.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={`underline decoration-teal/40 underline-offset-4 transition-colors hover:text-ink hover:decoration-teal ${className}`}
      >
        Read our pledge
      </button>

      {open && mounted
        ? createPortal(
            <PledgePanel onClose={() => setOpen(false)} closeRef={closeRef} />,
            document.body,
          )
        : null}
    </>
  );
}

/** The panel itself, so the veil, the header and the close control share one onClose. */
function PledgePanel({ onClose, closeRef }) {
  return (
    <div
      className="no-print fixed inset-0 z-50 flex items-center justify-center px-4 py-6"
      role="dialog"
      aria-modal="true"
      aria-label="Our Pledge"
    >
      <button
        type="button"
        aria-label="Close the pledge"
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-ink/50"
      />
      {/* The card class, not a hand-picked background: it carries whichever
          surface the family's skin is wearing, so the panel is the same material
          as everything else on the screen behind it. */}
      <div className="card relative flex max-h-[88dvh] w-full max-w-2xl flex-col overflow-hidden shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-[var(--line)] px-5 py-4">
          <div>
            <p className="text-[0.65rem] font-semibold uppercase tracking-[0.09em] text-ink-soft">
              What we promise
            </p>
            <h2 className="mt-0.5 font-display text-2xl font-semibold text-ink">
              Our Pledge
            </h2>
          </div>
          {/* A real target, not a decorative glyph: the same 44 pixel square the
              rest of the app gives a control a thumb has to find. */}
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Close the pledge"
            className="-mr-1.5 -mt-1.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg text-ink-soft transition-colors hover:bg-ink/5 hover:text-ink"
          >
            &times;
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-5">
          <PledgeBody />
        </div>
      </div>
    </div>
  );
}
