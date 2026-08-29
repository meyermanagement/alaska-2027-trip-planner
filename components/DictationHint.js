"use client";

import { useEffect, useState } from "react";
import {
  browserPlatform,
  dictationGuide,
  dictationInvite,
  hasRealSteps,
} from "@/lib/dictation";

/**
 * "You can talk instead of typing", with the steps for the device in their hand.
 *
 * Sits under the two boxes in this app that want a paragraph rather than a field:
 * About You, and the trip builder. Both of them are only as good as the detail
 * they get, and detail is what nobody types with their thumbs. Spoken, the same
 * paragraph takes twenty seconds.
 *
 * Closed by default and one line tall. Most people either already dictate or are
 * not going to be talked into it by a wall of instructions, so the wall is behind
 * a disclosure and the invitation is the part that shows.
 *
 * The platform is only known after mount -- there is no user agent during a
 * server render and guessing one produces the classic bug where the page says
 * "press Fn twice" for half a second on an iPhone. So the invitation renders
 * immediately in device-neutral words and the steps appear with the device's name
 * on them once we know what it is.
 */
export default function DictationHint({ className = "" }) {
  const [platform, setPlatform] = useState(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    setPlatform(browserPlatform());
  }, []);

  const guide = dictationGuide(platform || "unknown");
  // Before mount the device is genuinely unknown, so the button says the neutral
  // thing rather than naming a device it is about to correct.
  const known = platform !== null && hasRealSteps(platform);
  const invite = dictationInvite(platform || "unknown");

  return (
    <div className={`no-print ${className}`}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="inline-flex items-center gap-1.5 rounded-full border border-sand-deep bg-sand/60 px-3 py-1.5 text-xs font-semibold text-ink-soft transition hover:border-teal/40 hover:text-ink"
      >
        <svg
          viewBox="0 0 24 24"
          aria-hidden="true"
          className="h-3.5 w-3.5 shrink-0"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
        >
          <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3Z" />
          <path d="M5 11a7 7 0 0 0 14 0" />
          <path d="M12 18v3" />
        </svg>
        {invite}
        {known ? ` on ${guide.label}` : ""}
        <span aria-hidden="true" className="text-ink-faint">
          {open ? "▴" : "▾"}
        </span>
      </button>

      {open && (
        <div className="mt-2 max-w-xl rounded-xl border border-[var(--line)] bg-white p-3">
          <p className="text-sm font-semibold text-ink">{guide.headline}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs leading-relaxed text-ink-soft">
            {guide.steps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
          {guide.turnOn && (
            <p className="mt-2 text-xs leading-relaxed text-ink-soft">
              {guide.turnOn}
            </p>
          )}
          {guide.note && (
            <p className="mt-2 text-xs leading-relaxed text-ink-faint">
              {guide.note}
            </p>
          )}
          {guide.source && (
            <p className="mt-2 text-xs text-ink-faint">
              Steps from{" "}
              <a
                className="underline decoration-ink-faint underline-offset-2 hover:text-teal"
                href={guide.source}
                target="_blank"
                rel="noreferrer"
              >
                {guide.sourceLabel}
              </a>
              .
            </p>
          )}
        </div>
      )}
    </div>
  );
}
