"use client";

import { useState } from "react";
import { catalogByKind } from "@/lib/rewards-catalog";
import WalletLogo from "@/components/WalletLogo";

export default function ProgramPicker({ onPick, onManual, onCancel }) {
  const [query, setQuery] = useState("");
  const [kind, setKind] = useState("all");
  const groups = catalogByKind();
  const words = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const matches = groups.filter((group) => kind === "all" || group.kind === kind)
    .map((group) => ({ ...group, items: group.items.filter((entry) =>
      words.every((word) => `${entry.brand} ${entry.program_name || ""}`.toLowerCase().includes(word))) }))
    .filter((group) => group.items.length);
  return (
    <section className="card space-y-4 p-4 sm:p-5" aria-label="Choose a card or program">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-display text-lg font-semibold">Add a card or program</h2>
        <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>
      </div>
      <label className="block">
        <span className="sr-only">Search cards or rewards programs</span>
        <input autoFocus type="search" className="field" value={query}
          placeholder="Search cards or rewards programs"
          onChange={(e) => setQuery(e.target.value)} />
      </label>
      <div className="flex flex-wrap gap-2" aria-label="Program categories">
        {[{ kind: "all", label: "All" }, ...groups].map((group) => (
          <button key={group.kind} type="button" aria-pressed={kind === group.kind}
            onClick={() => setKind(group.kind)}
            className={`rounded-full border px-3 py-2 text-xs font-semibold ${kind === group.kind
              ? "border-teal bg-teal text-on-accent" : "border-[var(--line)] bg-white text-ink-soft"}`}>
            {group.label}
          </button>
        ))}
      </div>
      <div className="max-h-80 overflow-y-auto space-y-4 pr-1" tabIndex={0} aria-label="Matching programs">
        {matches.length ? matches.map((group) => (
          <section key={group.kind}>
            <h3 className="mb-2 text-xs font-semibold text-ink-soft">{group.label}</h3>
            <div className="grid gap-2 sm:grid-cols-2">
              {group.items.map((entry) => (
                <button key={entry.brand} type="button" onClick={() => onPick(entry)}
                  className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--line)] bg-white p-3 text-left hover:border-teal focus-visible:outline-2 focus-visible:outline-teal">
                  <WalletLogo program={entry} />
                  <span className="min-w-0 break-words text-sm font-semibold">{entry.brand}</span>
                </button>
              ))}
            </div>
          </section>
        )) : <p className="py-4 text-sm text-ink-soft">No matching programs. Try another name or add yours manually.</p>}
      </div>
      <button type="button" className="btn btn-ghost" onClick={() => onManual(query.trim(), kind)}>
        Can’t find yours? Add it manually
      </button>
    </section>
  );
}
