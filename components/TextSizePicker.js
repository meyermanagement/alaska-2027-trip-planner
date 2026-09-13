"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_TEXT_SIZE,
  TEXT_SIZES,
  textSizeOr,
} from "@/lib/textsize";

/**
 * Choosing how big the words are, for one person.
 *
 * Built the same way the look is, and for the same reason: the choice is applied
 * the instant it is pressed, by writing the attribute on <html> that the whole
 * type ladder multiplies itself by, and saved afterwards. Size is a thing you
 * judge by reading it, so a round trip before the words move would mean pressing
 * a button and watching a spinner instead of seeing the page grow. If the save
 * fails the page says so and puts the old size back, so what is on the screen is
 * never a lie about what was remembered.
 *
 * The three buttons show their own size rather than describing it, which is why
 * the word Regular is drawn small and Largest is drawn large. Each one is only
 * roughly what it will do -- the buttons scale one word, the setting scales the
 * app -- but it is enough to choose by without pressing anything.
 *
 * It is per person, not per household, and it follows them to every device they
 * sign in on.
 */
export default function TextSizePicker({ size: saved }) {
  const [chosen, setChosen] = useState(() => textSizeOr(saved));
  const [busy, setBusy] = useState(null);
  const [failed, setFailed] = useState("");

  // Already right on arrival -- middleware and the script in the document head
  // see to that -- so this only matters after a press, here or in another tab of
  // the same browser.
  useEffect(() => {
    document.documentElement.dataset.text = chosen;
  }, [chosen]);

  async function choose(id) {
    if (id === chosen || busy) return;
    const was = chosen;
    setChosen(id);
    setBusy(id);
    setFailed("");
    try {
      const res = await fetch("/api/text-size", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ size: id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Could not save that.");
      }
    } catch (err) {
      setChosen(was);
      setFailed(
        err?.message === "Failed to fetch"
          ? "No connection, so that was not saved. The app is back to the size it was."
          : `That was not saved, so the app is back to the size it was. ${err?.message || ""}`.trim(),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section>
      <h2 className="font-display text-xl font-semibold">Text size</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Every word in the app, one step or two larger. Yours alone, on every
        device you sign in on.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {TEXT_SIZES.map((size, i) => {
          const on = size.id === chosen;
          return (
            <button
              key={size.id}
              type="button"
              onClick={() => choose(size.id)}
              aria-pressed={on}
              disabled={busy !== null}
              className={`card flex flex-col gap-2 p-4 text-left transition disabled:opacity-70 ${
                on ? "border-teal shadow-[0_0_0_2px_var(--ring-soft)]" : ""
              }`}
            >
              <span className="flex items-baseline gap-2">
                {/* The name at the size it stands for. Sized off the ladder's own
                    steps rather than a scale factor, so the three words step up
                    by about the same amount the setting does without being a
                    promise about exact pixels. */}
                <span
                  className={`font-semibold ${
                    i === 0 ? "text-base" : i === 1 ? "text-lg" : "text-xl"
                  }`}
                >
                  {size.name}
                </span>
                {on ? (
                  <span className="chip bg-teal-soft text-teal">
                    {busy === size.id ? "Saving" : "Yours"}
                  </span>
                ) : null}
              </span>
              <span className="text-sm leading-relaxed text-ink-soft">
                {size.note}
              </span>
            </button>
          );
        })}
      </div>

      {failed ? (
        <p role="alert" className="mt-3 text-sm font-semibold text-rose">
          {failed}
        </p>
      ) : null}

      {chosen !== DEFAULT_TEXT_SIZE ? (
        <p className="mt-3 text-xs text-ink-faint">
          If you need the words bigger than this, your browser&rsquo;s own zoom
          goes further and moves everything else with them.
        </p>
      ) : null}
    </section>
  );
}
