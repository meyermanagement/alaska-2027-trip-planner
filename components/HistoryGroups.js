"use client";

import { useState } from "react";
import { homeToday } from "@/lib/format";
import { groupHistory } from "@/lib/history/periods";

function Period({ group, initiallyOpen, renderItems, countItems }) {
  const [open, setOpen] = useState(initiallyOpen);
  const [shown, setShown] = useState(30);
  return <section className="min-w-0">
    <button type="button" className="flex min-h-11 w-full items-center gap-3 border-b border-[var(--line)] py-3 text-left"
      aria-expanded={open} onClick={() => setOpen(value => !value)}>
      <span aria-hidden="true" className={`text-xs text-teal transition-transform ${open ? "rotate-90" : ""}`}>▶</span>
      <span className="font-semibold">{group.label}</span>
      <span className="ml-auto text-sm text-ink-soft">{countItems ? countItems(group.items) : group.items.length}</span>
    </button>
    {open && <div className="mt-3">
      {renderItems(group.items.slice(0, shown))}
      {shown < group.items.length && <button type="button" className="btn btn-ghost mt-3"
        onClick={() => setShown(count => count + 30)}>Show more from {group.label.toLowerCase()}</button>}
    </div>}
  </section>;
}

export default function HistoryGroups({ items, getDate, renderItems, countItems, today = homeToday(), shortHistory = false }) {
  const groups = groupHistory(items, getDate, today, { shortHistory });
  return <div className="mt-3 space-y-4">{groups.map((group, index) =>
    <Period key={group.key} group={group} initiallyOpen={index === 0} renderItems={renderItems} countItems={countItems} />
  )}</div>;
}
