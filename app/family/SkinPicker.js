"use client";

import { useEffect, useState } from "react";
import { DEFAULT_SKIN, SKINS, paintChrome, skinOr } from "@/lib/skins";

/**
 * Choosing how the app looks, for one person.
 *
 * The choice is applied the moment it is pressed, by writing the attribute on
 * <html> that every color in the app hangs off, and saved afterwards. That order
 * is deliberate: a skin is a thing you judge by looking at it, so waiting on a
 * round trip before showing it would mean pressing a button and watching a
 * spinner instead of seeing the page turn. If the save fails the page says so and
 * puts the old skin back, so what is on the screen is never a lie about what was
 * remembered.
 *
 * It is per person, not per household. Nobody else's app changes.
 */
export default function SkinPicker({ skin: saved }) {
  const [chosen, setChosen] = useState(() => skinOr(saved));
  const [busy, setBusy] = useState(null);
  const [failed, setFailed] = useState("");

  // The attribute is already right on arrival -- middleware and the script in the
  // document head see to that -- so this only matters after a press, and after a
  // press somewhere else in the same browser.
  useEffect(() => {
    document.documentElement.dataset.skin = chosen;
    // The phone's own bar above the page. It is a meta tag rather than a custom
    // property, so it is the one surface that does not follow the attribute by
    // itself and has to be repainted by hand.
    paintChrome(chosen);
  }, [chosen]);

  async function choose(id) {
    if (id === chosen || busy) return;
    const was = chosen;
    setChosen(id);
    setBusy(id);
    setFailed("");
    try {
      const res = await fetch("/api/skin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ skin: id }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body?.error || "Could not save that.");
      }
    } catch (err) {
      setChosen(was);
      setFailed(
        err?.message === "Failed to fetch"
          ? "No connection, so that was not saved. The app is back to how it was."
          : `That was not saved, so the app is back to how it was. ${err?.message || ""}`.trim(),
      );
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="mt-10">
      <h2 className="font-display text-xl font-semibold">Your look</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Three looks, and the one you pick is yours alone — everyone else in the
        family keeps whichever they chose, on every device you sign in on.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {SKINS.map((skin) => {
          const on = skin.id === chosen;
          return (
            <button
              key={skin.id}
              type="button"
              onClick={() => choose(skin.id)}
              aria-pressed={on}
              disabled={busy !== null}
              className={`card flex flex-col gap-2 p-4 text-left transition disabled:opacity-70 ${
                on ? "border-teal shadow-[0_0_0_2px_var(--ring-soft)]" : ""
              }`}
            >
              <span className="flex items-center gap-2">
                {/* A paint chip: the ground, cut across the diagonal by the
                    accent. Painted from the skin's own values rather than from
                    the page, because the page is wearing one of the three and
                    the other two have to be honest about what they look like.

                    Square and cut on the diagonal on purpose. This was a pill
                    with a dot parked at one end, which is exactly what a switch
                    looks like -- and since every chip showed its own accent,
                    all three read as switched on at once. */}
                <span
                  aria-hidden="true"
                  className="h-7 w-7 shrink-0 rounded-md border border-[var(--line-strong)]"
                  style={{
                    background: `linear-gradient(135deg, ${skin.swatch[0]} 0 48%, ${skin.swatch[1]} 52% 100%)`,
                  }}
                />
                <span className="text-sm font-semibold">{skin.name}</span>
                {on ? (
                  <span className="chip bg-teal-soft text-teal">
                    {busy === skin.id ? "Saving" : "Yours"}
                  </span>
                ) : null}
              </span>
              <span className="text-xs font-semibold uppercase tracking-[0.08em] text-ink-faint">
                {skin.tag}
              </span>
              <span className="text-xs leading-relaxed text-ink-soft">
                {skin.blurb}
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

      {chosen !== DEFAULT_SKIN ? (
        <p className="mt-3 text-xs text-ink-faint">
          Printed pages stay on cream paper whichever look you are wearing.
        </p>
      ) : null}
    </section>
  );
}
