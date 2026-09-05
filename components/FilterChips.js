"use client";

/**
 * A row of chips that narrows the list under it.
 *
 * Lifted out of Reminders because the trip's own task list had grown a row that
 * looked exactly like this one -- the word Priority, then low, normal and high
 * with their little bars -- and was only a legend. It said what the bars meant
 * and did nothing when pressed, on a screen where the identical row one level up
 * filters. Two rows that look the same should do the same thing, so now they are
 * the same component.
 *
 * `icon` is optional and sits before the label, which is how the priority chips
 * keep explaining the meter while also acting on it.
 */
export default function FilterChips({ legend, options, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="mr-1 text-[0.68rem] font-semibold uppercase tracking-[0.08em] text-ink-soft">
        {legend}
      </span>
      {options.map((option) => {
        const active = option.id === value;
        return (
          <button
            key={option.id}
            type="button"
            aria-pressed={active}
            onClick={() => onChange(option.id)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[0.7rem] font-semibold uppercase tracking-[0.06em] transition ${
              active
                ? "border-teal/80 bg-teal text-on-accent"
                : "border-[var(--line)] bg-white/70 text-ink-soft hover:border-teal/30 hover:text-teal"
            }`}
          >
            {option.icon}
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
