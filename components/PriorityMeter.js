import { priorityMeter } from "@/lib/format";

// Three bars, lit from the bottom up: one for low, two for normal, three for
// high. Small enough to sit in front of a task without competing with it, and
// the same shape wherever tasks are listed — inside a trip or on Reminders.
// `className` is for the places the bars are not sitting in front of a row of
// text -- inside a filter chip, where the default top margin would push them off
// the baseline of the label beside them.
// `invert` is for a meter sitting on a filled accent chip -- the priority filter
// when that priority is the one chosen. Teal bars on a teal chip are no bars at
// all, so the lit ones go white and the rest go to a wash of it.
export default function PriorityMeter({
  task,
  dim = false,
  className = "",
  invert = false,
}) {
  const meter = priorityMeter(task);
  const heights = ["h-2", "h-3", "h-4"];
  return (
    <span
      title={meter.label}
      className={`flex shrink-0 items-end gap-[2px] ${
        className || "mt-1"
      } ${dim ? "opacity-40" : ""}`}
    >
      <span className="sr-only">{meter.label}</span>
      {heights.map((h, i) => (
        <span
          key={h}
          aria-hidden="true"
          className={`w-[4px] rounded-sm ${h} ${
            i < meter.lit
              ? invert
                ? "bg-white"
                : meter.on
              : invert
                ? "bg-white/30"
                : meter.off
          }`}
        />
      ))}
    </span>
  );
}
