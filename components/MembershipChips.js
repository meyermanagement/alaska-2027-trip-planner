"use client";

// Tap-to-toggle chips, used for saying who is on a trip. Filled means yes,
// dashed outline means no.
export default function MembershipChips({
  items,
  activeIds,
  onToggle,
  busyId,
  emptyText = "Nothing to choose from yet.",
}) {
  if (!items.length) {
    return <p className="text-sm text-ink-soft">{emptyText}</p>;
  }

  return (
    <div className="no-print flex flex-wrap gap-1.5">
      {items.map((item) => {
        const active = activeIds.includes(item.id);
        return (
          <button
            key={item.id}
            type="button"
            onClick={() => onToggle(item, !active)}
            disabled={busyId === item.id}
            aria-pressed={active}
            className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition disabled:opacity-50 ${
              active
                ? "border-teal bg-teal text-white"
                : "border-dashed border-[var(--line)] bg-white text-ink-soft hover:border-teal/50 hover:text-teal"
            }`}
          >
            {item.color && (
              <span
                aria-hidden="true"
                className="h-2 w-2 shrink-0 rounded-full"
                style={{ background: active ? "#fff" : item.color }}
              />
            )}
            {item.emoji && <span aria-hidden="true">{item.emoji}</span>}
            {item.label}
          </button>
        );
      })}
    </div>
  );
}
