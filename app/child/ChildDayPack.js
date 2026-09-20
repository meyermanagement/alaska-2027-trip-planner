"use client";
import { useState } from "react";
import ZoneBand, { SunIcon } from "@/components/ZoneBand";
import { dayPackLines, packedLabel } from "@/lib/daypack/pack";

export default function ChildDayPack({ trip, day, defaultOpen = false, busy = "", onToggle }) {
  const [open, setOpen] = useState(defaultOpen);
  if (!day || day === "Unscheduled") return null;
  // This is the regular app's pure presentation model, fed only the
  // server-authorized own-item projection. No adult database client or AI.
  const lines = dayPackLines({ rows: trip.day_pack || [], date: day });
  return <section className="no-print mb-3" aria-label="Your day pack">
    <ZoneBand icon={<SunIcon className="h-[15px] w-[15px]" />}
      name="Day pack" count={packedLabel(lines) || "Nothing in it yet"} level={3}
      open={open} onToggle={() => setOpen(value => !value)} />
    {open && <div className="zone-kids py-1">
      {!lines.length ? <p className="mt-2 text-sm text-ink-soft">No day-pack items assigned to you for this day.</p> :
        <ul className="mt-2 space-y-1.5">{lines.map(line => <li key={line.key} className="flex items-start gap-2.5">
          <input type="checkbox" checked={line.isPacked} disabled={!!busy}
            onChange={() => onToggle(line.rowId, !line.isPacked, line.item)}
            aria-label={`${line.isPacked ? "Take" : "Put"} “${line.item}” ${line.isPacked ? "out of" : "in"} the day pack`}
            className="mt-0.5 size-4 shrink-0 accent-teal" />
          <span className="min-w-0 flex-1 break-words">
            <span className={`text-sm ${line.isPacked ? "text-ink-soft line-through" : "text-ink"}`}>{line.item}</span>
            {line.everyDay && <span className="ml-2 whitespace-nowrap rounded-full bg-sand px-1.5 py-0.5 align-middle text-xs text-ink-soft">Every day</span>}
          </span>
          {busy === line.rowId && <span role="status" className="shrink-0 text-xs text-ink-soft">Saving…</span>}
        </li>)}</ul>}
    </div>}
  </section>;
}
