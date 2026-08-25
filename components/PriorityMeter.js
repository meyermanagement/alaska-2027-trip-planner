import { priorityMeter } from "@/lib/format";

// Three bars, lit from the bottom up: one for low, two for normal, three for
// high. Small enough to sit in front of a task without competing with it, and
// the same shape wherever tasks are listed — inside a trip or on Reminders.
export default function PriorityMeter({ task, dim = false }) {
  const meter = priorityMeter(task);
  const heights = ["h-2", "h-3", "h-4"];
  return (
    <span
      title={meter.label}
      className={`mt-1 flex shrink-0 items-end gap-[2px] ${
        dim ? "opacity-40" : ""
      }`}
    >
      <span className="sr-only">{meter.label}</span>
      {heights.map((h, i) => (
        <span
          key={h}
          aria-hidden="true"
          className={`w-[4px] rounded-sm ${h} ${
            i < meter.lit ? meter.on : meter.off
          }`}
        />
      ))}
    </span>
  );
}
