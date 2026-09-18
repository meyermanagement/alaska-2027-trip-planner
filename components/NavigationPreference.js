"use client";

import { useEffect, useState } from "react";

export const NAV_STYLE_EVENT = "alyeska-navigation-style";
const KEY = "alyeska.navigation-style";
export function readNavigationStyle() {
  try {
    return localStorage.getItem(KEY) === "quick" ? "quick" : "compass";
  } catch {
    return "compass";
  }
}

// A reversible, device-only beta experiment, not a change to permissions.
export default function NavigationPreference() {
  const [style, setStyle] = useState("compass");
  const [notice, setNotice] = useState("");
  useEffect(() => setStyle(readNavigationStyle()), []);
  function choose(value) {
    setStyle(value);
    try {
      localStorage.setItem(KEY, value);
      setNotice("");
    } catch {
      setNotice("This choice will last until you reload this page.");
    }
    window.dispatchEvent(new CustomEvent(NAV_STYLE_EVENT, { detail: value }));
  }
  return (
    <section>
      <h2 className="font-display text-xl font-semibold">Phone navigation</h2>
      <p className="mt-1 text-sm text-ink-soft">
        Try quick links, or keep the compass menu. This choice stays on this
        device and does not change the desktop menu.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {[
          ["compass", "Compass menu"],
          ["quick", "Quick links"],
        ].map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={`btn ${style === value ? "btn-primary" : "btn-ghost"}`}
            aria-pressed={style === value}
            onClick={() => choose(value)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-ink-soft">
        Quick links: Trips, Now, Inbox, and More. Ask Aly stays close by.
        Available links follow your access level.
      </p>
      {notice && (
        <p role="status" className="mt-2 text-sm">
          {notice}
        </p>
      )}
    </section>
  );
}
