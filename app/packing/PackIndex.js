"use client";

import PickBand from "@/components/PickBand";

/**
 * The index down the side of the packing screen.
 *
 * Seven lists, an animal and the house used to arrive as three stacked sections
 * with a row of chips buried in the middle of them, so the question "where is
 * Veda's Alaska list" was answered by scrolling. Here every list the family has
 * -- the family templates, each animal's own list, and the household's departure
 * list -- is one column of rows with its count beside it, and the panel to the
 * right is whichever row is on. On a phone the column lies down into a strip of
 * chips above the panel, because a sticky sidebar on a 390px screen is a sidebar
 * nobody can read.
 */
export default function PackIndex({ groups, picked, onPick }) {
  const rows = groups.flatMap((g) => g.rows);
  return (
    <>
      {/* Phone: the same order, lying down. A sticky sidebar on a 390px screen
          is a sidebar nobody can read. */}
      <div className="lg:hidden">
        <PickBand
          label="Which list"
          hint={`${rows.length} to choose from`}
          rows={rows}
          picked={picked}
          onPick={onPick}
        />
      </div>

      {/* Desktop: the column, sticky under the top bar. */}
      <nav
        aria-label="Packing lists"
        className="no-print hidden lg:sticky lg:top-6 lg:block"
      >
        {groups.map((g) => (
          <div key={g.label} className="mb-5 last:mb-0">
            <p className="section-label mb-1.5">{g.label}</p>
            <ul className="space-y-0.5">
              {g.rows.map((r) => {
                const on = r.key === picked;
                return (
                  <li key={r.key}>
                    <button
                      type="button"
                      onClick={() => onPick(r.key)}
                      aria-current={on ? "true" : undefined}
                      className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-sm transition ${
                        on
                          ? "bg-white font-semibold shadow-[var(--shadow-card)]"
                          : "text-ink-soft hover:bg-white/60 hover:text-ink"
                      }`}
                    >
                      {r.dot && (
                        <span
                          aria-hidden="true"
                          className="h-2 w-2 shrink-0 rounded-full"
                          style={{ background: r.dot }}
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">{r.label}</span>
                      <span className="shrink-0 text-xs tabular-nums opacity-70">
                        {r.count}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  );
}
